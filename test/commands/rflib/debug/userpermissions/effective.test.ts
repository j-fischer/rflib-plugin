import { expect } from 'chai';
import { comparePermissions, getEffectivePermissions } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

const JANE = '005000000000001';
const BOB = '005000000000002';

const users: Record<string, Record<string, unknown>> = {
  [JANE]: {
    Id: JANE,
    Username: 'jane@example.com',
    Name: 'Jane',
    IsActive: true,
    ProfileId: '00e00000000PRF1',
    Profile: { Name: 'Standard User' },
  },
  [BOB]: {
    Id: BOB,
    Username: 'bob@example.com',
    Name: 'Bob',
    IsActive: false,
    ProfileId: '00e00000000PRF2',
    Profile: { Name: 'Admin' },
  },
};

type OrgData = {
  objects?: unknown[];
  fields?: unknown[];
  setupEntities?: unknown[];
  entityNames?: Record<string, unknown[]>;
  /** Rows returned for `PermissionsAuthorApex = true` / `PermissionsCustomizeApplication = true`. */
  implied?: Record<string, unknown[]>;
  permissionSets?: unknown[];
};

const permissionSetDescribe = (): unknown => ({
  name: 'PermissionSet',
  fields: [
    { name: 'Name', type: 'string' },
    { name: 'PermissionsApiEnabled', type: 'boolean' },
    { name: 'PermissionsModifyAllData', type: 'boolean' },
    { name: 'PermissionsViewSetup', type: 'boolean' },
    { name: 'IsOwnedByProfile', type: 'boolean' },
  ],
});

/** Routes each query to the data of the user whose profile appears in it. */
function buildConn(data: Record<string, OrgData>): ReturnType<typeof buildMockConnection> {
  const forQuery = (soql: string): OrgData => {
    const userId = Object.keys(users).find((id) => soql.includes(String(users[id].ProfileId)));
    return userId ? (data[userId] ?? {}) : {};
  };
  return buildMockConnection({
    query: (soql: string) => {
      if (soql.includes(' FROM User ')) {
        const id = Object.keys(users).find((candidate) => soql.includes(candidate));
        return id ? [users[id]] : [];
      }
      if (soql.includes('FROM PermissionSetAssignment')) return [];
      if (soql.includes('FROM ObjectPermissions')) return forQuery(soql).objects ?? [];
      if (soql.includes('FROM FieldPermissions')) return forQuery(soql).fields ?? [];
      if (soql.includes('FROM SetupEntityAccess')) return forQuery(soql).setupEntities ?? [];
      if (soql.includes('FROM PermissionSet WHERE')) {
        const implied = /AND (Permissions\w+) = true/.exec(soql);
        return implied ? (forQuery(soql).implied?.[implied[1]] ?? []) : (forQuery(soql).permissionSets ?? []);
      }
      const entity = /FROM (ApexClass|ApexPage|CustomPermission) WHERE Id IN/.exec(soql);
      if (entity) {
        return Object.values(data).flatMap((org) => org.entityNames?.[entity[1]] ?? []);
      }
      return [];
    },
    describe: permissionSetDescribe,
  });
}

describe('orgClient.getEffectivePermissions', () => {
  it('merges object access across sources in a fixed order', async () => {
    const { conn, calls } = buildConn({
      [JANE]: {
        objects: [
          { SobjectType: 'Contact', PermissionsRead: true },
          { SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: false },
          { SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true, PermissionsDelete: true },
          { SobjectType: 'Lead', PermissionsRead: false },
        ],
      },
    });

    const result = await getEffectivePermissions(conn, { user: JANE, permissionType: 'OLS' });

    expect(result.objects).to.deep.equal({ Account: ['read', 'edit', 'delete'], Contact: ['read'] });
    expect(Object.keys(result.objects!)).to.deep.equal(['Account', 'Contact']);
    expect(result.fields).to.be.undefined;
    expect(result.apexClasses).to.be.undefined;
    expect(result.user.username).to.equal('jane@example.com');
    expect(calls.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(false);
  });

  it('only counts field access where the user has the same access on the object', async () => {
    const { conn, calls } = buildConn({
      [JANE]: {
        objects: [
          { SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: false, PermissionsViewAllFields: true },
        ],
        fields: [
          { SobjectType: 'Account', Field: 'Account.AnnualRevenue', PermissionsRead: true, PermissionsEdit: true },
          { SobjectType: 'Account', Field: 'Account.Rating', PermissionsRead: true, PermissionsEdit: false },
          { SobjectType: 'Account', Field: 'Account.Rating', PermissionsRead: false, PermissionsEdit: false },
          { SobjectType: 'Case', Field: 'Case.Reason', PermissionsRead: true, PermissionsEdit: true },
        ],
      },
    });

    const result = await getEffectivePermissions(conn, { user: JANE, permissionType: 'FLS', sobjectType: 'Account' });

    expect(result.fields).to.deep.equal({ 'Account.AnnualRevenue': ['read'], 'Account.Rating': ['read'] });
    expect(result.objects).to.be.undefined;
    expect(result.sobjectType).to.equal('Account');
    expect(result.notes[0]).to.equal('View All Fields grants Read on every field of: Account.');
    expect(result.notes[1]).to.include('fields only lists fields with field-level security');
    expect(calls.queries.find((q) => q.includes('FROM FieldPermissions'))).to.include("SobjectType = 'Account'");
  });

  it('resolves Apex class and Visualforce page names and notes implied access', async () => {
    const { conn, calls } = buildConn({
      [JANE]: {
        setupEntities: [
          { SetupEntityType: 'ApexClass', SetupEntityId: '01p000000000001' },
          { SetupEntityType: 'ApexClass', SetupEntityId: '01p000000000001' },
          { SetupEntityType: 'ApexClass', SetupEntityId: '01p000000000002' },
          { SetupEntityType: 'ApexPage', SetupEntityId: '066000000000001' },
        ],
        entityNames: {
          ApexClass: [
            { Id: '01p000000000002', Name: 'Zeta', NamespacePrefix: null },
            { Id: '01p000000000001', Name: 'Logger', NamespacePrefix: 'rflib' },
          ],
          ApexPage: [{ Id: '066000000000001', Name: 'OrderPage', NamespacePrefix: null }],
        },
        implied: { PermissionsAuthorApex: [{ Id: '0PS000000000001' }] },
      },
    });

    const result = await getEffectivePermissions(conn, { user: JANE, permissionType: 'APEX' });

    expect(result.apexClasses).to.deep.equal(['rflib__Logger', 'Zeta']);
    expect(result.apexPages).to.deep.equal(['OrderPage']);
    expect(result.customPermissions).to.be.undefined;
    expect(result.systemPermissions).to.be.undefined;
    expect(result.notes).to.deep.equal(['The user has Author Apex, which grants access to all Apex classes.']);

    const accessQuery = calls.queries.find((q) => q.includes('FROM SetupEntityAccess'))!;
    expect(accessQuery).to.include("SetupEntityType = 'ApexClass' OR SetupEntityType = 'ApexPage'");
    expect(accessQuery).to.not.include('CustomPermission');
    // Each Apex class is looked up once, even when several sources grant it.
    expect(calls.queries.find((q) => q.includes('FROM ApexClass WHERE Id IN'))).to.include(
      "('01p000000000001','01p000000000002')",
    );
    expect(calls.queries.some((q) => q.includes('FROM ApexPage WHERE Id IN'))).to.equal(true);
  });

  it('skips the name lookup when the user has no access of that type', async () => {
    const { conn, calls } = buildConn({ [JANE]: { setupEntities: [] } });
    const result = await getEffectivePermissions(conn, { user: JANE, permissionType: 'APEX' });

    expect(result.apexClasses).to.deep.equal([]);
    expect(calls.queries.some((q) => q.includes('WHERE Id IN'))).to.equal(false);
  });

  it('includes custom and system permissions for ALL', async () => {
    const { conn, calls } = buildConn({
      [JANE]: {
        objects: [{ SobjectType: 'Account', PermissionsRead: true }],
        setupEntities: [{ SetupEntityType: 'CustomPermission', SetupEntityId: '0CP000000000001' }],
        entityNames: { CustomPermission: [{ Id: '0CP000000000001', DeveloperName: 'Approve', NamespacePrefix: null }] },
        permissionSets: [
          { PermissionsApiEnabled: true, PermissionsModifyAllData: false, PermissionsViewSetup: false },
          { PermissionsApiEnabled: false, PermissionsModifyAllData: false, PermissionsViewSetup: true },
        ],
        implied: { PermissionsCustomizeApplication: [{ Id: '0PS000000000001' }] },
      },
    });

    const result = await getEffectivePermissions(conn, { user: JANE, permissionType: 'ALL' });

    expect(result.objects).to.deep.equal({ Account: ['read'] });
    expect(result.fields).to.deep.equal({});
    expect(result.customPermissions).to.deep.equal(['Approve']);
    expect(result.systemPermissions).to.deep.equal(['ApiEnabled', 'ViewSetup']);
    expect(result.notes).to.include(
      'The user has Customize Application, which grants access to all Visualforce pages.',
    );
    expect(result.truncated).to.equal(false);

    expect(calls.queries.find((q) => q.includes('FROM SetupEntityAccess'))).to.include(
      "SetupEntityType = 'CustomPermission'",
    );
    const systemQuery = calls.queries.find((q) => q.includes('PermissionsApiEnabled, '))!;
    expect(systemQuery).to.include('PermissionsModifyAllData');
    expect(systemQuery).to.not.include('IsOwnedByProfile,');
    expect(systemQuery).to.include("ProfileId = '00e00000000PRF1'");
  });

  it('notes that inactive users cannot log in', async () => {
    const { conn } = buildConn({});
    const result = await getEffectivePermissions(conn, { user: BOB, permissionType: 'OLS' });
    expect(result.notes[0]).to.include('The user is inactive');
  });

  it('rejects invalid arguments without querying the org', async () => {
    for (const [args, message] of [
      [{ user: JANE, permissionType: 'NOPE' as 'ALL' }, 'permissionType must be one of'],
      [{ user: JANE, permissionType: 'FLS' as const, sobjectType: "Account' OR 1=1" }, 'Invalid sobjectType'],
    ] as const) {
      const { conn, calls } = buildConn({});
      try {
        // eslint-disable-next-line no-await-in-loop
        await getEffectivePermissions(conn, args);
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).message).to.include(message);
      }
      expect(calls.queries).to.have.lengthOf(0);
    }
  });
});

describe('orgClient.comparePermissions', () => {
  it('returns only the differences between two users', async () => {
    const { conn } = buildConn({
      [JANE]: {
        objects: [
          { SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true },
          { SobjectType: 'Contact', PermissionsRead: true },
        ],
        fields: [
          { SobjectType: 'Account', Field: 'Account.AnnualRevenue', PermissionsRead: true, PermissionsEdit: true },
        ],
        permissionSets: [{ PermissionsApiEnabled: true }],
      },
      [BOB]: {
        objects: [
          { SobjectType: 'Account', PermissionsRead: true, PermissionsDelete: true },
          { SobjectType: 'Contact', PermissionsRead: true },
        ],
        fields: [{ SobjectType: 'Account', Field: 'Account.AnnualRevenue', PermissionsRead: true }],
        permissionSets: [{ PermissionsApiEnabled: true, PermissionsModifyAllData: true }],
      },
    });

    const result = await comparePermissions(conn, { user: JANE, otherUser: BOB, permissionType: 'ALL' });

    expect(result.identical).to.equal(false);
    expect(result.user.username).to.equal('jane@example.com');
    expect(result.otherUser.username).to.equal('bob@example.com');
    expect(result.objects).to.deep.equal({ Account: { onlyUser: ['edit'], onlyOtherUser: ['delete'] } });
    expect(result.fields).to.deep.equal({ 'Account.AnnualRevenue': { onlyUser: ['edit'], onlyOtherUser: [] } });
    expect(result.systemPermissions).to.deep.equal({ onlyUser: [], onlyOtherUser: ['ModifyAllData'] });
    expect(result.apexClasses).to.deep.equal({ onlyUser: [], onlyOtherUser: [] });
    // Bob is inactive; the shared field-level security note is left out.
    expect(result.notes).to.deep.equal([
      'bob@example.com: The user is inactive and cannot log in, regardless of their permissions.',
    ]);
  });

  it('reports identical permissions and only compares the requested type', async () => {
    const shared = { objects: [{ SobjectType: 'Account', PermissionsRead: true, PermissionsViewAllFields: true }] };
    const { conn } = buildConn({ [JANE]: shared, [BOB]: shared });

    const result = await comparePermissions(conn, { user: JANE, otherUser: BOB, permissionType: 'OLS' });

    expect(result.identical).to.equal(true);
    expect(result.objects).to.deep.equal({});
    expect(result.fields).to.be.undefined;
    expect(result.systemPermissions).to.be.undefined;
  });

  it('warns when a comparison was truncated', async () => {
    const page = Array.from({ length: 24_996 }, (_, i) => ({ SobjectType: `Obj${i}__c`, PermissionsRead: true }));
    const { conn } = buildConn({ [JANE]: { objects: page }, [BOB]: {} });

    const result = await comparePermissions(conn, { user: JANE, otherUser: BOB, permissionType: 'OLS' });

    expect(result.truncated).to.equal(true);
    expect(result.notes).to.include('Some permission queries hit the row limit; narrow the comparison to one object.');
  });
});
