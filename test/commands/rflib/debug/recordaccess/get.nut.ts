import { expect } from 'chai';
import RflibDebugRecordAccessGet from '../../../../../src/commands/rflib/debug/recordaccess/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const ACCOUNT = '001000000000001AAA';
const MISSING = '001000000000009AAA';

describe('rflib debug recordaccess get NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.includes(' FROM User ')) {
        return [
          {
            Id: '0057000000JANE1',
            Username: 'jane@example.com',
            Name: 'Jane',
            IsActive: true,
            ProfileId: '00e0000000PRF01',
            Profile: { Name: 'Standard User' },
          },
        ];
      }
      if (soql.includes('FROM UserRecordAccess')) {
        return [{ RecordId: ACCOUNT, HasReadAccess: true, HasEditAccess: false }];
      }
      if (soql.includes('FROM ObjectPermissions')) {
        return [{ SobjectType: 'Account', PermissionsRead: true, PermissionsEdit: true }];
      }
      return [];
    },
    describeGlobal: () => ({ sobjects: [{ name: 'Account', keyPrefix: '001' }] }),
  });

  it('reports the access to each record and explains it', async () => {
    const result = await RflibDebugRecordAccessGet.run([
      '--target-org',
      harness.testOrg.username,
      '--user',
      'jane@example.com',
      '--record-id',
      ACCOUNT,
      '--record-id',
      MISSING,
    ]);

    expect(result.user.username).to.equal('jane@example.com');
    expect(result.records).to.have.lengthOf(2);
    expect(result.records[0]).to.deep.include({ sobjectType: 'Account', maxAccessLevel: 'Read', found: true });
    expect(result.records[0].notes).to.deep.equal([
      'The user has Edit on Account, but sharing only gives them Read access to this record.',
    ]);
    expect(result.records[1].found).to.equal(false);

    const query = harness.queries.find((q) => q.includes('FROM UserRecordAccess'))!;
    expect(query).to.include(`RecordId IN ('${ACCOUNT}','${MISSING}')`);
  });

  it('rejects malformed record IDs before querying the record access', async () => {
    try {
      await RflibDebugRecordAccessGet.run([
        '--target-org',
        harness.testOrg.username,
        '--user',
        'jane@example.com',
        '--record-id',
        'nope',
      ]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid record ID "nope"');
    }
    expect(harness.queries).to.have.lengthOf(0);
  });
});
