import { expect } from 'chai';
import { getRecordAccess } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

const USER_ID = '005000000000001';

const userRow = {
  Id: USER_ID,
  Username: 'jane@example.com',
  Name: 'Jane',
  IsActive: true,
  ProfileId: '00e00000000PRF1',
  Profile: { Name: 'Standard User' },
};

const ACCOUNT_1 = '001000000000001AAA';
const ACCOUNT_2 = '001000000000002AAA';
const OPPORTUNITY = '006000000000001AAA';
const CASE = '500000000000001AAA';
const UNKNOWN_PREFIX = 'a0Z000000000001AAA';

type Options = {
  user?: Record<string, unknown>;
  access?: unknown[];
  objects?: Record<string, Record<string, boolean>>;
};

function buildConn(options: Options): ReturnType<typeof buildMockConnection> {
  return buildMockConnection({
    query: (soql: string) => {
      if (soql.includes(' FROM User ')) return [options.user ?? userRow];
      if (soql.includes('FROM PermissionSetAssignment')) return [];
      if (soql.includes('FROM UserRecordAccess')) return options.access ?? [];
      if (soql.includes('FROM ObjectPermissions')) {
        const object = /SobjectType = '(\w+)'/.exec(soql)![1];
        const access = options.objects?.[object];
        return access ? [{ SobjectType: object, ...access }] : [];
      }
      return [];
    },
    describeGlobal: () => ({
      sobjects: [
        { name: 'Account', keyPrefix: '001' },
        { name: 'Opportunity', keyPrefix: '006' },
        { name: 'Case', keyPrefix: '500' },
        { name: 'AccountShare', keyPrefix: null },
      ],
    }),
  });
}

function accessRow(recordId: string, levels: Record<string, boolean>): Record<string, unknown> {
  return {
    RecordId: recordId,
    HasReadAccess: false,
    HasEditAccess: false,
    HasDeleteAccess: false,
    HasTransferAccess: false,
    HasAllAccess: false,
    ...levels,
  };
}

describe('orgClient.getRecordAccess', () => {
  it('returns the access level and explains missing access', async () => {
    const { conn, calls } = buildConn({
      access: [
        accessRow(ACCOUNT_1, { HasReadAccess: true, HasEditAccess: true, HasDeleteAccess: true }),
        accessRow(ACCOUNT_2, {}),
        accessRow(OPPORTUNITY, { HasReadAccess: true }),
        accessRow(CASE, {}),
      ],
      objects: {
        Account: { PermissionsRead: true, PermissionsEdit: true, PermissionsDelete: true },
        Opportunity: { PermissionsRead: true, PermissionsEdit: true },
      },
    });

    const result = await getRecordAccess(conn, {
      user: 'jane@example.com',
      recordIds: [ACCOUNT_1, ACCOUNT_2, OPPORTUNITY, CASE],
    });

    expect(result.user.username).to.equal('jane@example.com');
    const [first, second, third, fourth] = result.records;

    expect(first).to.deep.include({
      recordId: ACCOUNT_1,
      sobjectType: 'Account',
      found: true,
      hasReadAccess: true,
      hasEditAccess: true,
      hasDeleteAccess: true,
      maxAccessLevel: 'Delete',
      notes: [],
    });
    expect(first.objectAccess).to.deep.equal({
      read: true,
      edit: true,
      delete: true,
      viewAll: false,
      modifyAll: false,
    });

    expect(second.maxAccessLevel).to.equal('None');
    expect(second.notes[0]).to.include("The user has Read on Account, but sharing doesn't give them access");

    expect(third.maxAccessLevel).to.equal('Read');
    expect(third.notes).to.deep.equal([
      'The user has Edit on Opportunity, but sharing only gives them Read access to this record.',
    ]);

    expect(fourth.notes).to.deep.equal([
      "The user has no Read permission on Case, so sharing can't give them access. Grant Read on the object first.",
    ]);

    const query = calls.queries.find((q) => q.includes('FROM UserRecordAccess'))!;
    expect(query).to.include(`WHERE UserId = '${USER_ID}'`);
    expect(query).to.include(`RecordId IN ('${ACCOUNT_1}','${ACCOUNT_2}','${OPPORTUNITY}','${CASE}')`);
    // Object permissions are loaded once per object.
    expect(calls.queries.filter((q) => q.includes("SobjectType = 'Account'"))).to.have.lengthOf(1);
  });

  it('explains read-only access without the Edit object permission', async () => {
    const { conn } = buildConn({
      access: [accessRow(OPPORTUNITY, { HasReadAccess: true })],
      objects: { Opportunity: { PermissionsRead: true } },
    });

    const result = await getRecordAccess(conn, { user: USER_ID, recordIds: [OPPORTUNITY] });

    expect(result.records[0].notes).to.deep.equal([
      "The user can't edit this record because they have no Edit permission on Opportunity.",
    ]);
  });

  it('derives the highest access level', async () => {
    const { conn } = buildConn({
      access: [
        accessRow(ACCOUNT_1, {
          HasReadAccess: true,
          HasEditAccess: true,
          HasDeleteAccess: true,
          HasTransferAccess: true,
          HasAllAccess: true,
        }),
        accessRow(ACCOUNT_2, { HasReadAccess: true, HasEditAccess: true, HasTransferAccess: true }),
        accessRow(OPPORTUNITY, { HasReadAccess: true, HasEditAccess: true }),
      ],
      objects: {
        Account: { PermissionsRead: true, PermissionsEdit: true },
        Opportunity: { PermissionsRead: true, PermissionsEdit: true },
      },
    });

    const result = await getRecordAccess(conn, { user: USER_ID, recordIds: [ACCOUNT_1, ACCOUNT_2, OPPORTUNITY] });

    expect(result.records.map((record) => record.maxAccessLevel)).to.deep.equal(['All', 'Transfer', 'Edit']);
  });

  it('matches 15-character IDs and reports records without access information', async () => {
    const { conn } = buildConn({ access: [accessRow(ACCOUNT_1, { HasReadAccess: true, HasEditAccess: true })] });

    const result = await getRecordAccess(conn, {
      user: USER_ID,
      recordIds: [ACCOUNT_1.slice(0, 15), UNKNOWN_PREFIX, UNKNOWN_PREFIX],
    });

    expect(result.records).to.have.lengthOf(2);
    expect(result.records[0].recordId).to.equal(ACCOUNT_1);
    expect(result.records[0].found).to.equal(true);
    expect(result.records[1]).to.deep.include({ recordId: UNKNOWN_PREFIX, found: false, maxAccessLevel: 'None' });
    expect(result.records[1].sobjectType).to.be.undefined;
    expect(result.records[1].objectAccess).to.be.undefined;
    expect(result.records[1].notes[0]).to.include('Salesforce returned no access information');
  });

  it('notes that inactive users cannot log in', async () => {
    const { conn } = buildConn({
      user: { ...userRow, IsActive: false },
      access: [accessRow(ACCOUNT_1, { HasReadAccess: true, HasEditAccess: true })],
      objects: { Account: { PermissionsRead: true, PermissionsEdit: true } },
    });

    const result = await getRecordAccess(conn, { user: USER_ID, recordIds: [ACCOUNT_1] });

    expect(result.records[0].notes).to.deep.equal([
      'The user is inactive and cannot log in, regardless of their access.',
    ]);
  });

  it('rejects invalid arguments without querying the org', async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => `001${String(i).padStart(12, '0')}`);
    for (const [args, message] of [
      [{ user: '', recordIds: [ACCOUNT_1] }, 'user is required'],
      [{ user: USER_ID, recordIds: [] }, 'Specify at least one record ID.'],
      [{ user: USER_ID, recordIds: tooMany }, 'Specify at most 200 record IDs.'],
      [{ user: USER_ID, recordIds: ["001' OR Id != '"] }, 'Invalid record ID'],
    ] as const) {
      const { conn, calls } = buildConn({});
      try {
        // eslint-disable-next-line no-await-in-loop
        await getRecordAccess(conn, args);
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).message).to.include(message);
      }
      expect(calls.queries).to.have.lengthOf(0);
    }
  });
});
