import { expect } from 'chai';
import RflibDebugUserPermissionsCheck from '../../../../../src/commands/rflib/debug/userpermissions/check.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const userRow = {
  Id: '0057000000ABCDE',
  Username: 'jane@example.com',
  Name: 'Jane Doe',
  IsActive: true,
  ProfileId: '00e000000000001',
  Profile: { Name: 'Standard User' },
};

const psaRows = [
  { PermissionSetId: '0PS000000000001', PermissionSetGroupId: null, PermissionSet: { IsOwnedByProfile: false } },
  {
    PermissionSetId: '0PS000000000002',
    PermissionSetGroupId: '0PG000000000001',
    PermissionSet: { IsOwnedByProfile: false },
    PermissionSetGroup: { MasterLabel: 'Sales Ops', DeveloperName: 'Sales_Ops' },
  },
];

const PS_PARENT = {
  Name: 'Sales_Reports',
  Label: 'Sales Reports',
  IsOwnedByProfile: false,
  PermissionSetGroupId: null,
};
const GROUP_PARENT = {
  Name: 'Group_Aggregate',
  Label: 'Group',
  IsOwnedByProfile: false,
  PermissionSetGroupId: '0PG000000000001',
};

describe('rflib debug userpermissions check NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.includes(' FROM User ')) return [userRow];
      if (soql.includes('FROM PermissionSetAssignment')) return psaRows;
      if (soql.includes('FROM ObjectPermissions')) {
        return [{ Parent: GROUP_PARENT, SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true }];
      }
      if (soql.includes('FROM FieldPermissions')) {
        return [{ Parent: PS_PARENT, Field: 'Account.AnnualRevenue', PermissionsRead: true, PermissionsEdit: true }];
      }
      if (soql.includes('FROM PermissionSet WHERE')) return [{ ...PS_PARENT, Id: '0PS000000000001' }];
      return [];
    },
    describe: {
      Account: () => ({ name: 'Account', fields: [{ name: 'AnnualRevenue', type: 'currency', permissionable: true }] }),
      PermissionSet: () => ({ name: 'PermissionSet', fields: [{ name: 'PermissionsModifyAllData', type: 'boolean' }] }),
    },
  });

  it('checks field edit access for a username', async () => {
    const result = await RflibDebugUserPermissionsCheck.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      'jane@example.com',
      '--field',
      'Account.AnnualRevenue',
      '--access',
      'edit',
    ]);

    expect(result.granted).to.equal(true);
    expect(result.summary).to.equal('jane@example.com has Edit access on Account.AnnualRevenue.');
    expect(result.objectAccess).to.deep.equal({ read: true, edit: true });
    expect(result.sources).to.deep.equal([
      { type: 'PermissionSet', name: 'Sales Reports', apiName: 'Sales_Reports', permission: 'PermissionsEdit' },
    ]);
    expect(harness.queries[0]).to.include("WHERE Username = 'jane@example.com'");
  });

  it('checks object access and names the permission set group', async () => {
    const result = await RflibDebugUserPermissionsCheck.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      '0057000000ABCDE',
      '--object',
      'Account',
      '--access',
      'delete',
    ]);

    expect(result.granted).to.equal(false);
    expect(result.check).to.deep.equal({ type: 'object', target: 'Account', access: 'delete' });

    const olsQuery = harness.queries.find((q) => q.includes('FROM ObjectPermissions'))!;
    expect(olsQuery).to.include("ParentId IN ('0PS000000000001')");
    expect(olsQuery).to.include("Parent.PermissionSetGroupId IN ('0PG000000000001')");
  });

  it('checks a system permission', async () => {
    const result = await RflibDebugUserPermissionsCheck.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      '0057000000ABCDE',
      '--system-permission',
      'ModifyAllData',
    ]);

    expect(result.granted).to.equal(true);
    expect(result.sources[0]).to.include({ type: 'PermissionSet', permission: 'PermissionsModifyAllData' });
  });

  it('requires exactly one permission to check', async () => {
    try {
      await RflibDebugUserPermissionsCheck.run([
        '--target-org',
        harness.testOrg.username,
        '--user',
        '0057000000ABCDE',
        '--object',
        'Account',
        '--apex-class',
        'OrderController',
      ]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.match(/cannot also be provided|exactly one/i);
    }
    expect(harness.queries).to.have.lengthOf(0);
  });

  it('rejects an access level that does not exist', async () => {
    try {
      await RflibDebugUserPermissionsCheck.run([
        '--target-org',
        harness.testOrg.username,
        '--user',
        '0057000000ABCDE',
        '--object',
        'Account',
        '--access',
        'own',
      ]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.include('Expected --access=own to be one of');
    }
  });
});
