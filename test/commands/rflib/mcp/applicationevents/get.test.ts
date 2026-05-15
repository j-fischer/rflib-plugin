import { expect } from 'chai';
import { getApplicationEvents } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

describe('orgClient.getApplicationEvents', () => {
  it('emits no WHERE clause when no filters are given', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    await getApplicationEvents(conn);
    expect(calls.queries[0]).to.not.include(' WHERE ');
    expect(calls.queries[0]).to.include('FROM rflib_Application_Event__c');
    expect(calls.queries[0]).to.include('ORDER BY Occurred_On__c DESC');
    expect(calls.queries[0]).to.include('LIMIT 200');
  });

  it('uses an exact-match equality predicate when eventName has no wildcard', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    await getApplicationEvents(conn, { eventName: 'order-created' });
    expect(calls.queries[0]).to.include("Event_Name__c = 'order-created'");
  });

  it('uses LIKE when eventName contains a percent wildcard', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    await getApplicationEvents(conn, { eventName: 'order-%' });
    expect(calls.queries[0]).to.include("Event_Name__c LIKE 'order-%'");
  });

  it('escapes single quotes in eventName to prevent SOQL injection', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    await getApplicationEvents(conn, { eventName: "evil' OR '1' = '1" });
    expect(calls.queries[0]).to.include("evil\\' OR \\'1\\' = \\'1");
  });

  it('clamps recordLimit to the maximum of 2000', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    const result = await getApplicationEvents(conn, { recordLimit: 9999 });
    expect(result.recordLimit).to.equal(2000);
    expect(calls.queries[0]).to.include('LIMIT 2000');
  });

  it('falls back to the default of 200 when recordLimit is non-positive', async () => {
    const { conn } = buildMockConnection({ query: () => [] });
    const result = await getApplicationEvents(conn, { recordLimit: 0 });
    expect(result.recordLimit).to.equal(200);
  });

  it('combines multiple filters with AND', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    await getApplicationEvents(conn, {
      eventName: 'order-%',
      startDate: '2024-06-01T00:00:00Z',
      endDate: '2024-06-30T00:00:00Z',
      relatedRecordId: '001000000000ABC',
    });
    const soql = calls.queries[0];
    expect(soql).to.include("Event_Name__c LIKE 'order-%'");
    expect(soql).to.include('Occurred_On__c >= 2024-06-01T00:00:00Z');
    expect(soql).to.include('Occurred_On__c <= 2024-06-30T00:00:00Z');
    expect(soql).to.include("Related_Record_ID__c = '001000000000ABC'");
    const andCount = (soql.match(/ AND /g) ?? []).length;
    expect(andCount).to.equal(3);
  });
});
