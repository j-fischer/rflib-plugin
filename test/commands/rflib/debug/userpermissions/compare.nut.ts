import { expect } from 'chai';
import RflibDebugUserPermissionsCompare from '../../../../../src/commands/rflib/debug/userpermissions/compare.js';
import RflibDebugUserPermissionsGet from '../../../../../src/commands/rflib/debug/userpermissions/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const users: Record<string, Record<string, unknown>> = {
  'jane@example.com': {
    Id: '0057000000JANE1',
    Username: 'jane@example.com',
    Name: 'Jane',
    IsActive: true,
    ProfileId: '00e0000000PRF01',
    Profile: { Name: 'Standard User' },
  },
  'bob@example.com': {
    Id: '0057000000BOB01',
    Username: 'bob@example.com',
    Name: 'Bob',
    IsActive: true,
    ProfileId: '00e0000000PRF02',
    Profile: { Name: 'System Administrator' },
  },
};

const isAdmin = (soql: string): boolean => soql.includes('00e0000000PRF02');

const adminClasses = Array.from({ length: 25 }, (_, i) => ({
  Id: `01p0000000000${String(i).padStart(2, '0')}`,
  Name: `Class${String(i).padStart(2, '0')}`,
}));

describe('rflib debug userpermissions compare and get --effective NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.includes(' FROM User ')) {
        return Object.values(users).filter(
          (user) => soql.includes(String(user.Username)) || soql.includes(String(user.Id)),
        );
      }
      if (soql.includes('FROM ObjectPermissions')) {
        return [
          { SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true, PermissionsDelete: isAdmin(soql) },
        ];
      }
      if (soql.includes('FROM FieldPermissions')) {
        return [
          {
            SobjectType: 'Account',
            Field: 'Account.AnnualRevenue',
            PermissionsRead: true,
            PermissionsEdit: isAdmin(soql),
          },
        ];
      }
      if (soql.includes('FROM SetupEntityAccess')) {
        return isAdmin(soql)
          ? adminClasses.map((cls) => ({ SetupEntityType: 'ApexClass', SetupEntityId: cls.Id }))
          : [];
      }
      if (soql.includes('FROM ApexClass WHERE Id IN')) return adminClasses;
      if (soql.includes('FROM PermissionSet WHERE') && !soql.includes('= true')) {
        return [{ PermissionsApiEnabled: true, PermissionsModifyAllData: isAdmin(soql) }];
      }
      return [];
    },
    describe: {
      PermissionSet: () => ({
        name: 'PermissionSet',
        fields: [
          { name: 'PermissionsApiEnabled', type: 'boolean' },
          { name: 'PermissionsModifyAllData', type: 'boolean' },
        ],
      }),
    },
  });

  it('shows the differences between two users', async () => {
    const result = await RflibDebugUserPermissionsCompare.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      'jane@example.com',
      '--other-user',
      'bob@example.com',
    ]);

    expect(result.permissionType).to.equal('ALL');
    expect(result.identical).to.equal(false);
    expect(result.objects).to.deep.equal({ Account: { onlyUser: [], onlyOtherUser: ['delete'] } });
    expect(result.fields).to.deep.equal({ 'Account.AnnualRevenue': { onlyUser: [], onlyOtherUser: ['edit'] } });
    expect(result.apexClasses!.onlyOtherUser).to.have.lengthOf(25);
    expect(result.systemPermissions).to.deep.equal({ onlyUser: [], onlyOtherUser: ['ModifyAllData'] });
  });

  it('caps long lists in the text output', async () => {
    const log = harness.$$.SANDBOX.stub(RflibDebugUserPermissionsCompare.prototype, 'log');
    await RflibDebugUserPermissionsCompare.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      'bob@example.com',
      '--other-user',
      'jane@example.com',
    ]);

    const lines = log.getCalls().map((call) => String(call.args[0]));
    expect(lines).to.include('  Account: only bob@example.com has delete');
    expect(lines).to.include('  only bob@example.com has ModifyAllData');
    const classes = lines.find((line) => line.includes('Class00'))!;
    expect(classes).to.include('Class19, and 5 more (see --json for the full list)');
    expect(classes).to.not.include('Class20');
  });

  it('limits the comparison to one object and permission type', async () => {
    const result = await RflibDebugUserPermissionsCompare.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      'jane@example.com',
      '--other-user',
      'jane@example.com',
      '--permission-type',
      'OLS',
      '--sobject-type',
      'Account',
    ]);

    expect(result.identical).to.equal(true);
    expect(result.fields).to.be.undefined;
    expect(harness.queries.find((q) => q.includes('FROM ObjectPermissions'))).to.include("SobjectType = 'Account'");
  });

  it('returns combined permissions with get --effective', async () => {
    const result = await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000BOB01',
      '--permission-type',
      'ALL',
      '--effective',
    ]);

    expect(result).to.deep.include({
      objects: { Account: ['read', 'edit', 'delete'] },
      fields: { 'Account.AnnualRevenue': ['read', 'edit'] },
    });
    expect((result.apexClasses as string[])[0]).to.equal('Class00');
    expect(result).to.deep.include({
      systemPermissions: ['ApiEnabled', 'ModifyAllData'],
    });
  });
});
