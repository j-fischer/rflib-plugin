import { expect } from 'chai';
import RflibDebugUserPermissionsGet from '../../../../../src/commands/rflib/debug/userpermissions/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

type UserPermissionsPayload = {
  userId: string;
  profileName: string;
  permissionSetNames: string;
  permissionType: 'FLS' | 'OLS' | 'APEX' | 'ALL';
  flsPermissions?: unknown[];
  olsPermissions?: unknown[];
  apexPermissions?: unknown[];
};

const userRow = {
  Id: '0057000000ABCDE',
  ProfileId: '00e000000000001',
  Profile: { Name: 'System Administrator' },
};

const psaRow = {
  PermissionSetId: '0PS000000000001',
  PermissionSetGroupId: null,
  PermissionSet: { Name: 'Custom_PS', Label: 'Custom Permission Set', IsOwnedByProfile: false },
};

describe('rflib debug userpermissions get NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.startsWith('SELECT Id, ProfileId')) return [userRow];
      if (soql.startsWith('SELECT PermissionSetId')) return [psaRow];
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
    const result = (await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'FLS',
    ]));

    const payload = JSON.parse(result.result) as UserPermissionsPayload;
    expect(payload.profileName).to.equal('System Administrator');
    expect(payload.permissionSetNames).to.equal('Custom Permission Set');
    expect(payload.flsPermissions).to.have.lengthOf(1);
    expect(payload.olsPermissions).to.be.undefined;
    expect(payload.apexPermissions).to.be.undefined;

    expect(harness.queries.some((q) => q.includes('FROM FieldPermissions'))).to.equal(true);
    expect(harness.queries.some((q) => q.includes('FROM ObjectPermissions'))).to.equal(false);
  });

  it('queries all three permission types for --permission-type ALL', async () => {
    const result = (await RflibDebugUserPermissionsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user-id',
      '0057000000ABCDE',
      '--permission-type',
      'ALL',
    ]));

    const payload = JSON.parse(result.result) as UserPermissionsPayload;
    expect(payload.flsPermissions).to.have.lengthOf(1);
    expect(payload.olsPermissions).to.have.lengthOf(1);
    expect(payload.apexPermissions).to.have.lengthOf(1);
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
