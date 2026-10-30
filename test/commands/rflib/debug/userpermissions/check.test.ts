import { expect } from 'chai';
import { checkUserPermission, type CheckUserPermissionArgs } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection, type MockConnectionOptions } from '../../../../helpers/mockConnection.js';

const USER_ID = '005000000000001';
const PROFILE_ID = '00e000000ProfA1';
const PS_ID = '0PS00000000000A';
const GROUP_ID = '0PG00000000000G';

const userRow = {
  Id: USER_ID,
  Username: 'jane@example.com',
  Name: 'Jane Doe',
  IsActive: true,
  ProfileId: PROFILE_ID,
  Profile: { Name: 'Standard User' },
};

const psaRows = [
  { PermissionSetId: '0PS0000000000PR', PermissionSetGroupId: null, PermissionSet: { IsOwnedByProfile: true } },
  { PermissionSetId: PS_ID, PermissionSetGroupId: null, PermissionSet: { IsOwnedByProfile: false } },
  {
    PermissionSetId: '0PS0000000000GR',
    PermissionSetGroupId: GROUP_ID,
    PermissionSet: { IsOwnedByProfile: false },
    PermissionSetGroup: { MasterLabel: 'Sales Ops', DeveloperName: 'Sales_Ops' },
  },
];

const PROFILE_PARENT = {
  Name: 'X00e000000ProfA1',
  Label: '00e000000ProfA1',
  IsOwnedByProfile: true,
  Profile: { Name: 'Standard User' },
  PermissionSetGroupId: null,
};
const PS_PARENT = {
  Name: 'Sales_Reports',
  Label: 'Sales Reports',
  IsOwnedByProfile: false,
  Profile: null,
  PermissionSetGroupId: null,
};
const GROUP_PARENT = {
  Name: 'Sales_Ops_Aggregate',
  Label: 'Sales Ops Aggregate',
  IsOwnedByProfile: false,
  Profile: null,
  PermissionSetGroupId: GROUP_ID,
};

type Handlers = {
  user?: unknown[];
  objectPermissions?: unknown[];
  fieldPermissions?: unknown[];
  setupEntityAccess?: unknown[];
  entities?: unknown[];
  permissionSets?: unknown[];
};

function buildConn(
  handlers: Handlers,
  describe?: MockConnectionOptions['describe'],
): ReturnType<typeof buildMockConnection> {
  return buildMockConnection({
    query: (soql: string) => {
      if (soql.includes(' FROM User ')) return handlers.user ?? [userRow];
      if (soql.includes('FROM PermissionSetAssignment')) return psaRows;
      if (soql.includes('FROM ObjectPermissions')) return handlers.objectPermissions ?? [];
      if (soql.includes('FROM FieldPermissions')) return handlers.fieldPermissions ?? [];
      if (soql.includes('FROM SetupEntityAccess')) return handlers.setupEntityAccess ?? [];
      if (soql.includes('FROM PermissionSet WHERE')) return handlers.permissionSets ?? [];
      if (/FROM (ApexClass|ApexPage|CustomPermission) /.test(soql)) return handlers.entities ?? [];
      return [];
    },
    describe,
  });
}

const accountDescribe = (): unknown => ({
  name: 'Account',
  fields: [
    { name: 'Id', type: 'id', permissionable: false },
    { name: 'AnnualRevenue', type: 'currency', permissionable: true },
    { name: 'Score__c', type: 'double', permissionable: true, calculated: true },
  ],
});

const permissionSetDescribe = (): unknown => ({
  name: 'PermissionSet',
  fields: [
    { name: 'Name', type: 'string' },
    { name: 'PermissionsModifyAllData', type: 'boolean' },
    { name: 'PermissionsViewSetup', type: 'boolean' },
  ],
});

async function expectError(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail('expected an error');
  } catch (err) {
    expect((err as Error).message).to.include(message);
  }
}

describe('orgClient.checkUserPermission', () => {
  describe('object permissions', () => {
    it('reports every profile, permission set, and group that grants the access', async () => {
      const { conn, calls } = buildConn(
        {
          objectPermissions: [
            { Parent: PROFILE_PARENT, SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true },
            { Parent: PS_PARENT, SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: false },
            { Parent: GROUP_PARENT, SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true },
          ],
        },
        accountDescribe,
      );

      const result = await checkUserPermission(conn, { user: USER_ID, object: 'account', access: 'edit' });

      expect(result.granted).to.equal(true);
      expect(result.check).to.deep.equal({ type: 'object', target: 'Account', access: 'edit' });
      expect(result.summary).to.equal('jane@example.com has Edit access on Account.');
      expect(result.sources).to.deep.equal([
        { type: 'Profile', name: 'Standard User', permission: 'PermissionsEdit' },
        { type: 'PermissionSetGroup', name: 'Sales Ops', permission: 'PermissionsEdit' },
      ]);
      expect(result.user).to.deep.equal({
        id: USER_ID,
        username: 'jane@example.com',
        name: 'Jane Doe',
        isActive: true,
        profileName: 'Standard User',
      });

      const olsQuery = calls.queries.find((q) => q.includes('FROM ObjectPermissions'))!;
      expect(olsQuery).to.include(`Parent.ProfileId = '${PROFILE_ID}'`);
      expect(olsQuery).to.include(`ParentId IN ('${PS_ID}')`);
      expect(olsQuery).to.include(`Parent.PermissionSetGroupId IN ('${GROUP_ID}')`);
      expect(olsQuery).to.include("SobjectType = 'Account'");
      // The profile-owned assignment is covered by the ProfileId clause, not listed as a permission set.
      expect(olsQuery).to.not.include('0PS0000000000PR');
      expect(calls.describes).to.deep.equal(['account']);
    });

    it('defaults to read access and reports a missing grant', async () => {
      const { conn } = buildConn({ objectPermissions: [] }, accountDescribe);
      const result = await checkUserPermission(conn, { user: USER_ID, object: 'Account' });

      expect(result.granted).to.equal(false);
      expect(result.check.access).to.equal('read');
      expect(result.sources).to.deep.equal([]);
      expect(result.summary).to.equal("jane@example.com doesn't have Read access on Account.");
    });

    it('maps the object-only access levels to their permission fields', async () => {
      const { conn } = buildConn(
        { objectPermissions: [{ Parent: PS_PARENT, PermissionsModifyAllRecords: true }] },
        accountDescribe,
      );
      const result = await checkUserPermission(conn, { user: USER_ID, object: 'Account', access: 'MODIFYALL' });

      expect(result.granted).to.equal(true);
      expect(result.sources).to.deep.equal([
        {
          type: 'PermissionSet',
          name: 'Sales Reports',
          apiName: 'Sales_Reports',
          permission: 'PermissionsModifyAllRecords',
        },
      ]);
      expect(result.summary).to.include('Modify All Records access on Account');
    });

    it('wraps describe failures for unknown objects', async () => {
      const { conn } = buildConn({}, () => {
        throw new Error('The requested resource does not exist');
      });
      await expectError(
        checkUserPermission(conn, { user: USER_ID, object: 'Nope__c' }),
        'Could not describe SObject "Nope__c": The requested resource does not exist',
      );
    });
  });

  describe('field permissions', () => {
    it('combines field-level security with View All Fields for read checks', async () => {
      const { conn, calls } = buildConn(
        {
          objectPermissions: [
            { Parent: PROFILE_PARENT, PermissionsRead: true, PermissionsEdit: false, PermissionsViewAllFields: false },
            { Parent: GROUP_PARENT, PermissionsRead: true, PermissionsEdit: true, PermissionsViewAllFields: true },
          ],
          fieldPermissions: [{ Parent: PS_PARENT, Field: 'Account.AnnualRevenue', PermissionsRead: true }],
        },
        accountDescribe,
      );

      const result = await checkUserPermission(conn, { user: USER_ID, field: 'account.annualrevenue' });

      expect(result.granted).to.equal(true);
      expect(result.fieldPermissionGranted).to.equal(true);
      expect(result.objectAccess).to.deep.equal({ read: true, edit: true });
      expect(result.check).to.deep.equal({ type: 'field', target: 'Account.AnnualRevenue', access: 'read' });
      expect(result.sources).to.deep.equal([
        { type: 'PermissionSet', name: 'Sales Reports', apiName: 'Sales_Reports', permission: 'PermissionsRead' },
        { type: 'PermissionSetGroup', name: 'Sales Ops', permission: 'PermissionsViewAllFields' },
      ]);

      const flsQuery = calls.queries.find((q) => q.includes('FROM FieldPermissions'))!;
      expect(flsQuery).to.include("SobjectType = 'Account'");
      expect(flsQuery).to.include("Field = 'Account.AnnualRevenue'");
    });

    it('denies edit access when the user lacks Edit on the object', async () => {
      const { conn } = buildConn(
        {
          objectPermissions: [{ Parent: PROFILE_PARENT, PermissionsRead: true, PermissionsEdit: false }],
          fieldPermissions: [{ Parent: PS_PARENT, PermissionsRead: true, PermissionsEdit: true }],
        },
        accountDescribe,
      );

      const result = await checkUserPermission(conn, { user: USER_ID, field: 'Account.AnnualRevenue', access: 'edit' });

      expect(result.granted).to.equal(false);
      expect(result.fieldPermissionGranted).to.equal(true);
      expect(result.notes).to.deep.equal([
        "The user has field-level access, but no Edit permission on Account, so the field isn't accessible.",
      ]);
      expect(result.summary).to.equal("jane@example.com doesn't have Edit access on Account.AnnualRevenue.");
    });

    it('does not count View All Fields toward edit access', async () => {
      const { conn } = buildConn(
        {
          objectPermissions: [
            { Parent: PS_PARENT, PermissionsRead: true, PermissionsEdit: true, PermissionsViewAllFields: true },
          ],
        },
        accountDescribe,
      );
      const result = await checkUserPermission(conn, { user: USER_ID, field: 'Account.AnnualRevenue', access: 'edit' });
      expect(result.granted).to.equal(false);
      expect(result.sources).to.deep.equal([]);
    });

    it('uses the object permission for fields without field-level security', async () => {
      const { conn, calls } = buildConn(
        { objectPermissions: [{ Parent: PROFILE_PARENT, PermissionsRead: true }] },
        accountDescribe,
      );

      const result = await checkUserPermission(conn, { user: USER_ID, field: 'Account.Id' });

      expect(result.granted).to.equal(true);
      expect(result.sources).to.deep.equal([{ type: 'Profile', name: 'Standard User', permission: 'PermissionsRead' }]);
      expect(result.notes[0]).to.include("isn't controlled by field-level security");
      expect(calls.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(false);
    });

    it('never grants edit access to formula fields', async () => {
      const { conn } = buildConn(
        {
          objectPermissions: [{ Parent: PROFILE_PARENT, PermissionsRead: true, PermissionsEdit: true }],
          fieldPermissions: [{ Parent: PROFILE_PARENT, PermissionsRead: true, PermissionsEdit: true }],
        },
        accountDescribe,
      );
      const result = await checkUserPermission(conn, { user: USER_ID, field: 'Account.Score__c', access: 'edit' });

      expect(result.granted).to.equal(false);
      expect(result.fieldPermissionGranted).to.equal(false);
      expect(result.notes).to.deep.equal([
        'Account.Score__c is a formula or auto-number field, so no user can edit it.',
      ]);
    });

    it('rejects fields that do not exist on the object', async () => {
      const { conn } = buildConn({}, accountDescribe);
      await expectError(
        checkUserPermission(conn, { user: USER_ID, field: 'Account.Missing__c' }),
        'Field "Missing__c" was not found on Account.',
      );
    });
  });

  describe('Apex, Visualforce, and custom permissions', () => {
    it('resolves the Apex class and includes access implied by Author Apex', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '01p000000000001', Name: 'OrderController', NamespacePrefix: null }],
        setupEntityAccess: [{ Parent: PS_PARENT, SetupEntityId: '01p000000000001' }],
        permissionSets: [{ ...PROFILE_PARENT, Id: '0PS0000000000PR' }],
      });

      const result = await checkUserPermission(conn, { user: USER_ID, apexClass: 'OrderController' });

      expect(result.granted).to.equal(true);
      expect(result.check).to.deep.equal({ type: 'apexClass', target: 'OrderController' });
      expect(result.summary).to.equal('jane@example.com has access to the Apex class OrderController.');
      expect(result.sources).to.deep.equal([
        { type: 'PermissionSet', name: 'Sales Reports', apiName: 'Sales_Reports', permission: 'SetupEntityAccess' },
        { type: 'Profile', name: 'Standard User', permission: 'PermissionsAuthorApex' },
      ]);
      expect(result.notes).to.deep.equal(['Users with the Author Apex permission can access all Apex classes.']);

      expect(calls.queries.find((q) => q.includes('FROM ApexClass'))).to.include("WHERE Name = 'OrderController'");
      expect(calls.queries.find((q) => q.includes('FROM SetupEntityAccess'))).to.include(
        "SetupEntityId = '01p000000000001'",
      );
      const psQuery = calls.queries.find((q) => q.includes('FROM PermissionSet WHERE'))!;
      expect(psQuery).to.include(`ProfileId = '${PROFILE_ID}'`);
      expect(psQuery).to.include(`Id IN ('${PS_ID}')`);
      expect(psQuery).to.include(`PermissionSetGroupId IN ('${GROUP_ID}')`);
      expect(psQuery).to.include('PermissionsAuthorApex = true');
    });

    it('filters by namespace and reports a class nobody grants', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '01p000000000002', Name: 'Logger', NamespacePrefix: 'rflib' }],
      });

      const result = await checkUserPermission(conn, { user: USER_ID, apexClass: 'rflib.Logger' });

      expect(result.granted).to.equal(false);
      expect(result.check.target).to.equal('rflib__Logger');
      expect(result.notes).to.deep.equal([]);
      expect(calls.queries.find((q) => q.includes('FROM ApexClass'))).to.include("AND NamespacePrefix = 'rflib'");
    });

    it("prefers the org's own class over managed classes with the same name", async () => {
      const { conn, calls } = buildConn({
        entities: [
          { Id: '01p000000000003', Name: 'Logger', NamespacePrefix: 'rflib' },
          { Id: '01p000000000004', Name: 'Logger', NamespacePrefix: null },
        ],
      });

      const result = await checkUserPermission(conn, { user: USER_ID, apexClass: 'Logger' });

      expect(result.check.target).to.equal('Logger');
      expect(calls.queries.find((q) => q.includes('FROM SetupEntityAccess'))).to.include('01p000000000004');
    });

    it('asks for a namespace when the name is ambiguous', async () => {
      const { conn } = buildConn({
        entities: [
          { Id: '01p000000000003', Name: 'Logger', NamespacePrefix: 'rflib' },
          { Id: '01p000000000005', Name: 'Logger', NamespacePrefix: 'other' },
        ],
      });
      await expectError(
        checkUserPermission(conn, { user: USER_ID, apexClass: 'Logger' }),
        'More than one Apex class is named "Logger" (namespaces: rflib, other)',
      );
    });

    it('reports Apex classes that do not exist', async () => {
      const { conn } = buildConn({ entities: [] });
      await expectError(
        checkUserPermission(conn, { user: USER_ID, apexClass: 'ns__Missing' }),
        'The Apex class "ns__Missing" was not found.',
      );
    });

    it('includes Visualforce access implied by Customize Application', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '066000000000001', Name: 'OrderPage', NamespacePrefix: null }],
        permissionSets: [{ ...GROUP_PARENT, Id: '0PS0000000000GR' }],
      });

      const result = await checkUserPermission(conn, { user: USER_ID, apexPage: 'OrderPage' });

      expect(result.granted).to.equal(true);
      expect(result.sources).to.deep.equal([
        { type: 'PermissionSetGroup', name: 'Sales Ops', permission: 'PermissionsCustomizeApplication' },
      ]);
      expect(calls.queries.some((q) => q.includes('FROM ApexPage'))).to.equal(true);
    });

    it('checks custom permissions by developer name', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '0CP000000000001', DeveloperName: 'Approve_Discounts', NamespacePrefix: null }],
        setupEntityAccess: [{ Parent: GROUP_PARENT, SetupEntityId: '0CP000000000001' }],
      });

      const result = await checkUserPermission(conn, { user: USER_ID, customPermission: 'Approve_Discounts' });

      expect(result.granted).to.equal(true);
      expect(result.summary).to.equal('jane@example.com has access to the custom permission Approve_Discounts.');
      expect(calls.queries.find((q) => q.includes('FROM CustomPermission'))).to.include(
        "WHERE DeveloperName = 'Approve_Discounts'",
      );
      // No system permission grants every custom permission.
      expect(calls.queries.some((q) => q.includes('FROM PermissionSet WHERE'))).to.equal(false);
    });
  });

  describe('system permissions', () => {
    it('finds the permission sets that enable the system permission', async () => {
      const { conn, calls } = buildConn({ permissionSets: [{ ...PS_PARENT, Id: PS_ID }] }, permissionSetDescribe);

      const result = await checkUserPermission(conn, { user: USER_ID, systemPermission: 'modifyalldata' });

      expect(result.granted).to.equal(true);
      expect(result.check).to.deep.equal({ type: 'systemPermission', target: 'ModifyAllData' });
      expect(result.summary).to.equal('jane@example.com has the ModifyAllData system permission.');
      expect(result.sources).to.deep.equal([
        {
          type: 'PermissionSet',
          name: 'Sales Reports',
          apiName: 'Sales_Reports',
          permission: 'PermissionsModifyAllData',
        },
      ]);
      expect(calls.describes).to.deep.equal(['PermissionSet']);
      expect(calls.queries.find((q) => q.includes('FROM PermissionSet WHERE'))).to.include(
        'PermissionsModifyAllData = true',
      );
    });

    it('accepts the Permissions prefix', async () => {
      const { conn } = buildConn({ permissionSets: [] }, permissionSetDescribe);
      const result = await checkUserPermission(conn, { user: USER_ID, systemPermission: 'PermissionsViewSetup' });
      expect(result.granted).to.equal(false);
      expect(result.check.target).to.equal('ViewSetup');
    });

    it('rejects unknown system permissions', async () => {
      const { conn } = buildConn({}, permissionSetDescribe);
      await expectError(
        checkUserPermission(conn, { user: USER_ID, systemPermission: 'Name' }),
        'Unknown system permission "Name"',
      );
    });
  });

  describe('users', () => {
    it('looks users up by username', async () => {
      const { conn, calls } = buildConn({}, accountDescribe);
      await checkUserPermission(conn, { user: "o'brien@example.com", object: 'Account' });
      expect(calls.queries[0]).to.include("WHERE Username = 'o\\'brien@example.com'");
    });

    it('notes that inactive users cannot log in', async () => {
      const { conn } = buildConn({ user: [{ ...userRow, IsActive: false }] }, accountDescribe);
      const result = await checkUserPermission(conn, { user: USER_ID, object: 'Account' });
      expect(result.user.isActive).to.equal(false);
      expect(result.notes[0]).to.include('The user is inactive');
    });

    it('reports users that do not exist', async () => {
      const { conn } = buildConn({ user: [] });
      await expectError(
        checkUserPermission(conn, { user: USER_ID, object: 'Account' }),
        `User "${USER_ID}" was not found.`,
      );
    });
  });

  describe('argument validation', () => {
    const invalid: Array<[string, CheckUserPermissionArgs, string]> = [
      ['a missing user', { user: '', object: 'Account' }, 'user is required'],
      ['an invalid user', { user: 'not-a-user', object: 'Account' }, 'Invalid user "not-a-user"'],
      ['no check', { user: USER_ID }, 'Specify exactly one of'],
      ['two checks', { user: USER_ID, object: 'Account', apexClass: 'Foo' }, 'Specify exactly one of'],
      ['access for an Apex check', { user: USER_ID, apexClass: 'Foo', access: 'read' }, 'access only applies'],
      ['an unknown access level', { user: USER_ID, object: 'Account', access: 'own' }, 'Invalid access "own"'],
      [
        'an object-only access level for a field',
        { user: USER_ID, field: 'Account.Name', access: 'delete' },
        'for a field',
      ],
      ['a field without an object', { user: USER_ID, field: 'AnnualRevenue' }, 'Use the form Object.Field'],
      ['an object name with SOQL', { user: USER_ID, object: "Account' OR Name != '" }, 'Invalid object'],
      ['an invalid namespace', { user: USER_ID, apexClass: "x'.Foo" }, 'Invalid Apex class namespace'],
      ['an invalid custom permission', { user: USER_ID, customPermission: 'a b' }, 'Invalid custom permission'],
      ['an invalid system permission', { user: USER_ID, systemPermission: '1=1' }, 'Invalid system permission'],
    ];

    for (const [label, args, message] of invalid) {
      it(`rejects ${label} without querying the org`, async () => {
        const { conn, calls } = buildConn({});
        await expectError(checkUserPermission(conn, args), message);
        expect(calls.queries).to.have.lengthOf(0);
      });
    }
  });
});
