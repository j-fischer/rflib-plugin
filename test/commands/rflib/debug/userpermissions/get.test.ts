import { expect } from 'chai';
import { getUserPermissions } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

const VALID_USER_ID = '005000000000001';
const PROFILE_ID = '00e000000ProfA1';

const userRows = [{ Id: VALID_USER_ID, ProfileId: PROFILE_ID, Profile: { Name: 'System Administrator' } }];

const psaRows = [
  {
    PermissionSetId: '0PS00000000000A',
    PermissionSetGroupId: null,
    PermissionSet: { Name: 'CustomSet1', Label: 'Custom Set 1', IsOwnedByProfile: false },
  },
  {
    PermissionSetId: '0PS00000000000B',
    PermissionSetGroupId: null,
    PermissionSet: { Name: 'OwnedByProfileSet', Label: 'Profile Set', IsOwnedByProfile: true },
  },
  {
    PermissionSetId: null,
    PermissionSetGroupId: '0PG00000000000G',
    PermissionSet: { Name: 'GroupAssignment', Label: 'Group', IsOwnedByProfile: false },
  },
];

const FLS_ROW = {
  Parent: { Label: 'Custom Set 1', Profile: { Name: 'System Administrator' }, IsOwnedByProfile: false, PermissionSetGroupId: null },
  SobjectType: 'Account',
  Field: 'Account.Name',
  PermissionsRead: true,
  PermissionsEdit: false,
};

function makeQueryHandler(): (soql: string) => unknown[] {
  return (soql: string): unknown[] => {
    if (soql.startsWith('SELECT Id, ProfileId')) return userRows;
    if (soql.includes('FROM PermissionSetAssignment')) return psaRows;
    if (soql.includes('FROM FieldPermissions')) return [FLS_ROW];
    if (soql.includes('FROM ObjectPermissions')) return [];
    if (soql.includes('FROM SetupEntityAccess')) return [];
    return [];
  };
}

describe('orgClient.getUserPermissions', () => {
  it('aggregates profile + permission sets and queries FLS for FLS type', async () => {
    const { conn, calls } = buildMockConnection({ query: makeQueryHandler() });

    const result = await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'FLS' });

    expect(result.profileName).to.equal('System Administrator');
    expect(result.permissionSetNames).to.equal('Custom Set 1');
    expect(result.flsPermissions).to.have.lengthOf(1);
    // Truncation flag is surfaced alongside the records so callers can detect
    // when results were silently capped. Under the normal case it is false.
    expect(result.flsTruncated).to.equal(false);
    const flsQuery = calls.queries.find((q) => q.includes('FROM FieldPermissions'));
    expect(flsQuery).to.exist;
    expect(flsQuery).to.include(`Parent.ProfileId = '${PROFILE_ID}'`);
    expect(flsQuery).to.include("ParentId IN ('0PS00000000000A')");
    expect(flsQuery).to.include("Parent.PermissionSetGroupId IN ('0PG00000000000G')");
    // Permission Set Group IDs must NOT be merged into the ParentId clause —
    // FieldPermissions.ParentId is always a PermissionSet, never a group.
    expect(flsQuery).to.not.match(/ParentId IN \([^)]*0PG/);
  });

  it('omits the permission-set clause when the user has no direct permission set assignments', async () => {
    const groupOnlyPsa = [
      {
        PermissionSetId: null,
        PermissionSetGroupId: '0PG00000000000G',
        PermissionSet: { Name: 'GroupAssignment', Label: 'Group', IsOwnedByProfile: false },
      },
    ];
    const { conn, calls } = buildMockConnection({
      query: (soql) => {
        if (soql.startsWith('SELECT Id, ProfileId')) return userRows;
        if (soql.includes('FROM PermissionSetAssignment')) return groupOnlyPsa;
        return [];
      },
    });

    await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'FLS' });
    const flsQuery = calls.queries.find((q) => q.includes('FROM FieldPermissions'));
    expect(flsQuery).to.exist;
    expect(flsQuery).to.not.include('ParentId IN');
    expect(flsQuery).to.include("Parent.PermissionSetGroupId IN ('0PG00000000000G')");
  });

  it('queries OLS only when permissionType=OLS', async () => {
    const { conn, calls } = buildMockConnection({ query: makeQueryHandler() });
    const result = await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'OLS' });

    expect(result).to.have.property('olsPermissions');
    expect(result).to.not.have.property('flsPermissions');
    expect(result).to.not.have.property('apexPermissions');
    expect(calls.queries.some((q) => q.includes('FROM ObjectPermissions'))).to.equal(true);
    expect(calls.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(false);
  });

  it('queries APEX with the SetupEntityType filter and skips object filtering', async () => {
    const { conn, calls } = buildMockConnection({ query: makeQueryHandler() });
    await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'APEX', sobjectType: 'Account' });
    const apexQuery = calls.queries.find((q) => q.includes('FROM SetupEntityAccess'));
    expect(apexQuery).to.exist;
    expect(apexQuery).to.include("SetupEntityType = 'ApexClass'");
    expect(apexQuery).to.include("SetupEntityType = 'ApexPage'");
    expect(apexQuery).to.not.include('SobjectType');
  });

  it('runs all three queries when permissionType=ALL', async () => {
    const { conn, calls } = buildMockConnection({ query: makeQueryHandler() });
    const result = await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'ALL' });

    expect(result).to.have.property('flsPermissions');
    expect(result).to.have.property('olsPermissions');
    expect(result).to.have.property('apexPermissions');

    expect(calls.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(true);
    expect(calls.queries.some((q) => q.includes('FROM ObjectPermissions'))).to.equal(true);
    expect(calls.queries.some((q) => q.includes('FROM SetupEntityAccess'))).to.equal(true);
  });

  it('applies sobjectType filter to FLS/OLS queries', async () => {
    const { conn, calls } = buildMockConnection({ query: makeQueryHandler() });
    await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'ALL', sobjectType: 'Account' });

    const flsQuery = calls.queries.find((q) => q.includes('FROM FieldPermissions'));
    const olsQuery = calls.queries.find((q) => q.includes('FROM ObjectPermissions'));
    expect(flsQuery).to.include("SobjectType = 'Account'");
    expect(olsQuery).to.include("SobjectType = 'Account'");
  });

  it('rejects malformed userId without hitting the org', async () => {
    const { conn, calls } = buildMockConnection({});
    try {
      await getUserPermissions(conn, { userId: 'not-an-id', permissionType: 'FLS' });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid userId');
      expect(calls.queries).to.have.lengthOf(0);
    }
  });

  it('rejects 16- and 17-character user IDs (only 15 or 18 are valid)', async () => {
    const sixteenChars = '0057000000ABCDE1';
    const seventeenChars = '0057000000ABCDE12';
    for (const badId of [sixteenChars, seventeenChars]) {
      const { conn, calls } = buildMockConnection({});
      try {
        // eslint-disable-next-line no-await-in-loop
        await getUserPermissions(conn, { userId: badId, permissionType: 'FLS' });
        expect.fail(`expected an error for "${badId}"`);
      } catch (err) {
        expect((err as Error).message).to.include('Invalid userId');
        expect(calls.queries).to.have.lengthOf(0);
      }
    }
  });

  it('rejects unknown permission types', async () => {
    const { conn } = buildMockConnection({});
    try {
      await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'WHATEVER' as 'ALL' });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('permissionType must be one of');
    }
  });

  it('throws a clear error when the user is not found', async () => {
    const { conn } = buildMockConnection({
      query: (soql: string) => {
        if (soql.startsWith('SELECT Id, ProfileId')) return [];
        return [];
      },
    });
    try {
      await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'FLS' });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include(`User with Id "${VALID_USER_ID}" was not found`);
    }
  });

  it('surfaces flsTruncated=true when the FLS query exceeds the 24,995 cap', async () => {
    // Need to push more than QUERY_LIMIT rows through queryAll. Use a paginated
    // response: a first batch of 24,000 records with done:false followed by a
    // queryMore that returns 1,000 more (total 25,000 > cap of 24,995).
    const flsPage1 = Array.from({ length: 24_000 }, (_, i) => ({
      SobjectType: 'Account',
      Field: `Account.F${i}`,
      PermissionsRead: true,
      PermissionsEdit: false,
    }));
    const flsPage2 = Array.from({ length: 1000 }, (_, i) => ({
      SobjectType: 'Account',
      Field: `Account.G${i}`,
      PermissionsRead: true,
      PermissionsEdit: false,
    }));
    const { conn } = buildMockConnection({
      query: (soql: string) => {
        if (soql.startsWith('SELECT Id, ProfileId')) return userRows;
        if (soql.includes('FROM PermissionSetAssignment')) return psaRows;
        if (soql.includes('FROM FieldPermissions')) {
          return { records: flsPage1, done: false, totalSize: 25_000, nextRecordsUrl: '/q/fls-page-2' };
        }
        return [];
      },
      queryMore: () => ({ records: flsPage2, done: true, totalSize: 25_000 }),
    });

    const result = await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'FLS' });
    expect((result.flsPermissions as unknown[]).length).to.equal(24_995);
    expect(result.flsTruncated).to.equal(true);
  });

  it('rejects malformed sobjectType to avoid SOQL injection', async () => {
    const { conn } = buildMockConnection({ query: makeQueryHandler() });
    try {
      await getUserPermissions(conn, { userId: VALID_USER_ID, permissionType: 'FLS', sobjectType: "evil' OR 1=1" });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid sobjectType');
    }
  });
});
