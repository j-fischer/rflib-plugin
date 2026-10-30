import { expect } from 'chai';
import { whoHasPermission, type WhoHasPermissionArgs } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection, type MockConnectionOptions } from '../../../../helpers/mockConnection.js';

const PROFILE_PS = '0PS0000000000P1';
const SALES_PS = '0PS0000000000S1';
const GROUP_PS = '0PS0000000000G1';
const UNUSED_PS = '0PS0000000000U1';
const GROUP_ID = '0PG0000000000G1';

const PARENTS: Record<string, Record<string, unknown>> = {
  [PROFILE_PS]: { Name: 'X00e', Label: '00e', IsOwnedByProfile: true, Profile: { Name: 'Standard User' } },
  [SALES_PS]: { Name: 'Sales_Reports', Label: 'Sales Reports', IsOwnedByProfile: false, PermissionSetGroupId: null },
  [GROUP_PS]: { Name: 'Group_Aggregate', Label: '', IsOwnedByProfile: false, PermissionSetGroupId: GROUP_ID },
  [UNUSED_PS]: { Name: 'Unused', Label: 'Unused', IsOwnedByProfile: false, PermissionSetGroupId: null },
};

type Assignee = {
  AssigneeId: string;
  Assignee: { Username: string; Name: string; IsActive: boolean; Profile: { Name: string } };
};

function assignee(id: string, username: string, isActive = true): Assignee {
  return {
    AssigneeId: id,
    Assignee: { Username: username, Name: username, IsActive: isActive, Profile: { Name: 'Standard User' } },
  };
}

const ASSIGNMENTS = [
  { ...assignee('005000000000001', 'jane@example.com'), PermissionSetId: PROFILE_PS, PermissionSetGroupId: null },
  { ...assignee('005000000000001', 'jane@example.com'), PermissionSetId: SALES_PS, PermissionSetGroupId: null },
  { ...assignee('005000000000002', 'bob@example.com', false), PermissionSetId: PROFILE_PS, PermissionSetGroupId: null },
  { ...assignee('005000000000003', 'carl@example.com'), PermissionSetId: GROUP_PS, PermissionSetGroupId: GROUP_ID },
  { ...assignee('005000000000004', 'dana@example.com'), PermissionSetId: SALES_PS, PermissionSetGroupId: null },
];

/** Grant rows for the given permission set IDs, as ObjectPermissions/FieldPermissions/SetupEntityAccess return them. */
function grantRows(ids: readonly string[], permission?: string): unknown[] {
  return ids.map((id) => ({ ParentId: id, Parent: PARENTS[id], ...(permission ? { [permission]: true } : {}) }));
}

type Grants = {
  /** Object permission field (e.g. PermissionsEdit) to the permission sets that have it. */
  object?: Record<string, string[]>;
  field?: Record<string, string[]>;
  setupEntity?: string[];
  /** PermissionSet field (e.g. PermissionsModifyAllData) to the permission sets that have it. */
  permissionSet?: Record<string, string[]>;
  entities?: unknown[];
};

function buildConn(
  grants: Grants,
  describe?: MockConnectionOptions['describe'],
): ReturnType<typeof buildMockConnection> {
  return buildMockConnection({
    query: (soql: string) => {
      const permission = /AND (Permissions\w+) = true/.exec(soql)?.[1];
      if (soql.includes('FROM ObjectPermissions')) return grantRows(grants.object?.[permission!] ?? [], permission);
      if (soql.includes('FROM FieldPermissions')) return grantRows(grants.field?.[permission!] ?? [], permission);
      if (soql.includes('FROM SetupEntityAccess')) return grantRows(grants.setupEntity ?? []);
      if (soql.includes('FROM PermissionSet WHERE')) {
        const field = /WHERE (Permissions\w+) = true/.exec(soql)![1];
        return (grants.permissionSet?.[field] ?? []).map((id) => ({ Id: id, ...PARENTS[id] }));
      }
      if (soql.includes('FROM PermissionSetGroup WHERE')) return [{ Id: GROUP_ID, MasterLabel: 'Sales Ops' }];
      if (soql.includes('FROM PermissionSetAssignment')) {
        const activeOnly = soql.includes('Assignee.IsActive = true');
        const byGroup = soql.includes('WHERE PermissionSetGroupId IN');
        return ASSIGNMENTS.filter((row) => {
          if (activeOnly && !row.Assignee.IsActive) return false;
          return byGroup
            ? row.PermissionSetGroupId !== null && soql.includes(row.PermissionSetGroupId)
            : row.PermissionSetGroupId === null && soql.includes(row.PermissionSetId);
        });
      }
      if (/FROM (ApexClass|ApexPage|CustomPermission) WHERE/.test(soql)) return grants.entities ?? [];
      return [];
    },
    describe,
  });
}

const accountDescribe = (): unknown => ({
  name: 'Account',
  fields: [
    { name: 'Name', type: 'string', permissionable: false },
    { name: 'AnnualRevenue', type: 'currency', permissionable: true },
    { name: 'Score__c', type: 'double', permissionable: true, calculated: true },
  ],
});

const usernames = (result: Awaited<ReturnType<typeof whoHasPermission>>): string[] =>
  result.users.map((user) => user.username);

describe('orgClient.whoHasPermission', () => {
  describe('object permissions', () => {
    const grants: Grants = { object: { PermissionsEdit: [PROFILE_PS, SALES_PS, GROUP_PS, UNUSED_PS] } };

    it('finds the active users and the sources that give them the access', async () => {
      const { conn, calls } = buildConn(grants, accountDescribe);

      const result = await whoHasPermission(conn, { object: 'account', access: 'edit' });

      expect(result.summary).to.equal('3 active users have Edit access on Account.');
      expect(result.check).to.deep.equal({ type: 'object', target: 'Account', access: 'edit' });
      expect(result.userCount).to.equal(3);
      expect(usernames(result)).to.deep.equal(['carl@example.com', 'dana@example.com', 'jane@example.com']);
      expect(result.users[2].sources).to.deep.equal(['Profile "Standard User"', 'Permission Set "Sales Reports"']);
      expect(result.users[0].sources).to.deep.equal(['Permission Set Group "Sales Ops"']);
      expect(result.sources).to.deep.equal([
        {
          type: 'PermissionSet',
          name: 'Sales Reports',
          apiName: 'Sales_Reports',
          permission: 'PermissionsEdit',
          userCount: 2,
        },
        { type: 'PermissionSetGroup', name: 'Sales Ops', permission: 'PermissionsEdit', userCount: 1 },
        { type: 'Profile', name: 'Standard User', permission: 'PermissionsEdit', userCount: 1 },
      ]);
      expect(result.unassignedSourceCount).to.equal(1);
      expect(result.usersTruncated).to.equal(false);
      expect(result.notes).to.deep.equal([
        '1 other profile or permission set grants the access, but no matching user is assigned to it.',
        'Inactive users are excluded.',
      ]);

      const olsQuery = calls.queries.find((q) => q.includes('FROM ObjectPermissions'))!;
      expect(olsQuery).to.include("WHERE SobjectType = 'Account' AND PermissionsEdit = true");
      const direct = calls.queries.find((q) => q.includes('FROM PermissionSetAssignment WHERE PermissionSetId IN'))!;
      expect(direct).to.include(`'${PROFILE_PS}'`);
      expect(direct).to.not.include(GROUP_PS);
      expect(direct).to.include('PermissionSetGroupId = null AND Assignee.IsActive = true');
      expect(calls.queries.find((q) => q.includes('WHERE PermissionSetGroupId IN'))).to.include(`('${GROUP_ID}')`);
    });

    it('includes inactive users on request', async () => {
      const { conn, calls } = buildConn(grants, accountDescribe);

      const result = await whoHasPermission(conn, { object: 'Account', access: 'edit', includeInactive: true });

      expect(result.summary).to.equal('4 users have Edit access on Account.');
      expect(usernames(result)).to.include('bob@example.com');
      expect(result.notes).to.not.include('Inactive users are excluded.');
      expect(calls.queries.some((q) => q.includes('Assignee.IsActive = true'))).to.equal(false);
    });

    it('limits the number of users but reports the total', async () => {
      const { conn } = buildConn(grants, accountDescribe);

      const result = await whoHasPermission(conn, { object: 'Account', access: 'edit', limit: 2 });

      expect(result.userCount).to.equal(3);
      expect(usernames(result)).to.deep.equal(['carl@example.com', 'dana@example.com']);
      expect(result.usersTruncated).to.equal(true);
    });

    it('reports when nobody has the access', async () => {
      const { conn, calls } = buildConn({}, accountDescribe);

      const result = await whoHasPermission(conn, { object: 'Account', access: 'modifyall' });

      expect(result.summary).to.equal('0 active users have Modify All Records access on Account.');
      expect(result.users).to.deep.equal([]);
      expect(result.sources).to.deep.equal([]);
      expect(calls.queries.some((q) => q.includes('FROM PermissionSetAssignment'))).to.equal(false);
    });
  });

  describe('field permissions', () => {
    it('only includes users who also have the object permission', async () => {
      const { conn, calls } = buildConn(
        { field: { PermissionsEdit: [SALES_PS] }, object: { PermissionsEdit: [PROFILE_PS] } },
        accountDescribe,
      );

      const result = await whoHasPermission(conn, { field: 'Account.AnnualRevenue', access: 'edit' });

      // Dana has field-level security from Sales Reports, but no Edit on Account.
      expect(usernames(result)).to.deep.equal(['jane@example.com']);
      expect(result.users[0].sources).to.deep.equal(['Permission Set "Sales Reports"']);
      expect(result.sources[0]).to.include({ name: 'Sales Reports', userCount: 1 });
      expect(result.notes).to.include('Only users who also have the matching permission on the object are included.');
      expect(calls.queries.find((q) => q.includes('FROM FieldPermissions'))).to.include(
        "Field = 'Account.AnnualRevenue' AND PermissionsEdit = true",
      );
    });

    it('counts View All Fields toward read access', async () => {
      const { conn } = buildConn(
        {
          field: { PermissionsRead: [SALES_PS] },
          object: { PermissionsViewAllFields: [GROUP_PS], PermissionsRead: [PROFILE_PS, GROUP_PS] },
        },
        accountDescribe,
      );

      const result = await whoHasPermission(conn, { field: 'Account.AnnualRevenue' });

      expect(usernames(result)).to.deep.equal(['carl@example.com', 'jane@example.com']);
      expect(result.users[0].sources).to.deep.equal(['Permission Set Group "Sales Ops"']);
      expect(result.sources.map((source) => source.permission)).to.have.members([
        'PermissionsRead',
        'PermissionsViewAllFields',
      ]);
    });

    it('uses the object permission for fields without field-level security', async () => {
      const { conn, calls } = buildConn({ object: { PermissionsRead: [PROFILE_PS] } }, accountDescribe);

      const result = await whoHasPermission(conn, { field: 'Account.Name' });

      expect(usernames(result)).to.deep.equal(['jane@example.com']);
      expect(result.notes[0]).to.include("isn't controlled by field-level security");
      expect(calls.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(false);
    });

    it('returns nobody for edit access to formula fields', async () => {
      const { conn, calls } = buildConn({ field: { PermissionsEdit: [SALES_PS] } }, accountDescribe);

      const result = await whoHasPermission(conn, { field: 'Account.Score__c', access: 'edit' });

      expect(result.users).to.deep.equal([]);
      expect(result.notes[0]).to.equal('Account.Score__c is a formula or auto-number field, so no user can edit it.');
      expect(calls.queries).to.have.lengthOf(0);
    });
  });

  describe('Apex, custom, and system permissions', () => {
    it('includes users with access implied by Author Apex', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '01p000000000001', Name: 'OrderController', NamespacePrefix: null }],
        setupEntity: [SALES_PS],
        permissionSet: { PermissionsAuthorApex: [PROFILE_PS] },
      });

      const result = await whoHasPermission(conn, { apexClass: 'OrderController', includeInactive: true });

      // Jane and Dana through Sales Reports; Jane and the inactive Bob through Author Apex on their profile.
      expect(result.summary).to.equal('3 users have access to the Apex class OrderController.');
      expect(usernames(result)).to.deep.equal(['bob@example.com', 'dana@example.com', 'jane@example.com']);
      expect(result.sources).to.deep.equal([
        {
          type: 'PermissionSet',
          name: 'Sales Reports',
          apiName: 'Sales_Reports',
          permission: 'SetupEntityAccess',
          userCount: 2,
        },
        { type: 'Profile', name: 'Standard User', permission: 'PermissionsAuthorApex', userCount: 2 },
      ]);
      expect(result.notes).to.deep.equal(['Users with the Author Apex permission can access all Apex classes.']);
      expect(calls.queries.find((q) => q.includes('FROM SetupEntityAccess'))).to.include(
        "WHERE SetupEntityId = '01p000000000001'",
      );
    });

    it('checks custom permissions without implied access', async () => {
      const { conn, calls } = buildConn({
        entities: [{ Id: '0CP000000000001', DeveloperName: 'Approve', NamespacePrefix: null }],
        setupEntity: [GROUP_PS],
      });

      const result = await whoHasPermission(conn, { customPermission: 'Approve' });

      expect(usernames(result)).to.deep.equal(['carl@example.com']);
      expect(calls.queries.some((q) => q.includes('FROM PermissionSet WHERE'))).to.equal(false);
    });

    it('finds users with a system permission', async () => {
      const { conn } = buildConn({ permissionSet: { PermissionsModifyAllData: [SALES_PS] } }, () => ({
        name: 'PermissionSet',
        fields: [{ name: 'PermissionsModifyAllData', type: 'boolean' }],
      }));

      const result = await whoHasPermission(conn, { systemPermission: 'ModifyAllData' });

      expect(result.summary).to.equal('2 active users have the ModifyAllData system permission.');
      expect(result.check).to.deep.equal({ type: 'systemPermission', target: 'ModifyAllData' });
    });

    it('uses singular wording for a single user', async () => {
      const { conn } = buildConn({ permissionSet: { PermissionsModifyAllData: [GROUP_PS] } }, () => ({
        name: 'PermissionSet',
        fields: [{ name: 'PermissionsModifyAllData', type: 'boolean' }],
      }));
      const result = await whoHasPermission(conn, { systemPermission: 'ModifyAllData' });
      expect(result.summary).to.equal('1 active user has the ModifyAllData system permission.');
    });
  });

  describe('argument validation', () => {
    const invalid: Array<[string, WhoHasPermissionArgs, string]> = [
      ['no check', {}, 'Specify exactly one of'],
      ['a limit of 0', { object: 'Account', limit: 0 }, 'limit must be an integer between 1 and 2000'],
      ['a limit above 2000', { object: 'Account', limit: 2001 }, 'limit must be an integer between 1 and 2000'],
      ['an invalid object', { object: 'Account; DELETE' }, 'Invalid object'],
    ];

    for (const [label, args, message] of invalid) {
      it(`rejects ${label} without querying the org`, async () => {
        const { conn, calls } = buildConn({});
        try {
          await whoHasPermission(conn, args);
          expect.fail('expected an error');
        } catch (err) {
          expect((err as Error).message).to.include(message);
        }
        expect(calls.queries).to.have.lengthOf(0);
      });
    }
  });
});
