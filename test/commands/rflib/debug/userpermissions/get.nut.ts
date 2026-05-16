import { expect } from 'chai';
import RflibDebugUserPermissionsGet from '../../../../../src/commands/rflib/debug/userpermissions/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const userRow = {
  Id: '0057000000ABCDE',
  ProfileId: '00e000000000001',
  Profile: { Name: 'System Administrator' },
};

const psaRows = [
  {
    PermissionSetId: '0PS000000000001',
    PermissionSetGroupId: null,
    PermissionSet: { Name: 'Custom_PS', Label: 'Custom Permission Set', IsOwnedByProfile: false },
  },
  {
    PermissionSetId: null,
    PermissionSetGroupId: '0PG000000000001',
    PermissionSet: { Name: 'Group_PS', Label: 'Group Assignment', IsOwnedByProfile: false },
  },
];

describe('rflib debug userpermissions get NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.startsWith('SELECT Id, ProfileId')) return [userRow];
      if (soql.startsWith('SELECT PermissionSetId')) return psaRows;
      if (soql.includes('FROM FieldPermissions')) {
        return [{ SobjectType: 'Account', Field: 'Account.Name', PermissionsRead: true, PermissionsEdit: false }];
      }
      if (soql.includes('FROM ObjectPermissions')) {
        return [{ SobjectType: 'Account', PermissionsRead: true, PermissionsCreate: false }];
      }
      if (soql.includes('FROM SetupEntityAccess')) {
        return [{ SetupEntityType: 'ApexClass', SetupEntityId: '01p000000000001' }];
      }
      return [];
    },
  });

  it('queries only FLS for --permission-type FLS', async () => {
    const result = await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'FLS',
    ]);

    expect(result.profileName).to.equal('System Administrator');
    expect(result.permissionSetNames).to.equal('Custom Permission Set');
    expect(result.flsPermissions).to.have.lengthOf(1);
    expect(result.olsPermissions).to.be.undefined;
    expect(result.apexPermissions).to.be.undefined;

    expect(harness.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(true);
    expect(harness.queries.some((q) => q.includes('FROM ObjectPermissions'))).to.equal(false);

    // Permission set group grants are filtered via Parent.PermissionSetGroupId,
    // not by stuffing 0PG ids into ParentId.
    const flsQuery = harness.queries.find((q) => q.includes('FROM FieldPermissions'))!;
    expect(flsQuery).to.include("ParentId IN ('0PS000000000001')");
    expect(flsQuery).to.include("Parent.PermissionSetGroupId IN ('0PG000000000001')");
  });

  it('queries all three permission types for --permission-type ALL', async () => {
    const result = await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'ALL',
    ]);

    expect(result.flsPermissions).to.have.lengthOf(1);
    expect(result.olsPermissions).to.have.lengthOf(1);
    expect(result.apexPermissions).to.have.lengthOf(1);
  });

  it('applies --sobject-type as a SOQL filter on FLS/OLS queries', async () => {
    await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'OLS',
      '--sobject-type',
      'Account',
    ]);

    const olsQuery = harness.queries.find((q) => q.includes('FROM ObjectPermissions'));
    expect(olsQuery).to.exist;
    expect(olsQuery!).to.include("SobjectType = 'Account'");
  });

  it('rejects a malformed user id before any SOQL is issued', async () => {
    harness.reset();
    try {
      await RflibDebugUserPermissionsGet.run([
        '--target-org',
        harness.testOrg.username,
        '--user-id',
        'not-a-real-id',
        '--permission-type',
        'FLS',
      ]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid userId');
    }
    expect(harness.queries).to.have.lengthOf(0);
  });
});

describe('rflib debug userpermissions get NUTs - truncation', () => {
  // Need > QUERY_LIMIT (24,995) records to trigger truncation. Use a paginated mock:
  // first page returns 24,000 records with done:false, queryMore returns 1,000 more
  // (total 25,000 > cap), so queryAll's truncation flag should fire.
  const page1 = Array.from({ length: 24_000 }, (_, i) => ({ SobjectType: 'Account', Field: `Account.F${i}` }));
  const page2 = Array.from({ length: 1000 }, (_, i) => ({ SobjectType: 'Account', Field: `Account.G${i}` }));

  const harness = setupNut({
    query: (soql) => {
      if (soql.startsWith('SELECT Id, ProfileId')) return [userRow];
      if (soql.startsWith('SELECT PermissionSetId')) return [psaRows[0]];
      if (soql.includes('FROM FieldPermissions')) {
        return { records: page1, done: false, totalSize: 25_000, nextRecordsUrl: '/q/page-2' };
      }
      return [];
    },
    queryMore: () => ({ records: page2, done: true, totalSize: 25_000 }),
  });

  it('reports flsTruncated=true when FLS results exceed the 24,995 cap', async () => {
    const result = await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'FLS',
    ]);

    expect((result.flsPermissions as unknown[]).length).to.equal(24_995);
    expect(result.flsTruncated).to.equal(true);
  });
});
