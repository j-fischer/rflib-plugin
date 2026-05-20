/* eslint-disable camelcase -- Salesforce field API names */
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
    // SOQL asks for recordLimit + 1 so overflow vs. an exact-cap result is distinguishable.
    expect(calls.queries[0]).to.include('LIMIT 201');
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
    expect(calls.queries[0]).to.include('LIMIT 2001');
  });

  it('falls back to the default of 200 when recordLimit is non-positive', async () => {
    const { conn } = buildMockConnection({ query: () => [] });
    const result = await getApplicationEvents(conn, { recordLimit: 0 });
    expect(result.recordLimit).to.equal(200);
  });

  it('sets truncated=true when the org returns more rows than the requested limit', async () => {
    // SOQL asks for recordLimit + 1 (51). The mock returns 51 rows, which signals overflow.
    const filled = Array.from({ length: 51 }, (_, i) => ({ Id: `id-${i}`, Event_Name__c: 'evt' }));
    const { conn } = buildMockConnection({ query: () => filled });
    const result = await getApplicationEvents(conn, { recordLimit: 50 });
    expect(result.recordCount).to.equal(50);
    expect(result.events).to.have.lengthOf(50);
    expect(result.recordLimit).to.equal(50);
    expect(result.truncated).to.equal(true);
  });

  it('does NOT report truncation when the org returns exactly the requested limit', async () => {
    // Returning 50 rows under a LIMIT 51 SOQL means the org has exactly 50 matching
    // events; no truncation. Previously this was a false-positive case.
    const filled = Array.from({ length: 50 }, (_, i) => ({ Id: `id-${i}`, Event_Name__c: 'evt' }));
    const { conn } = buildMockConnection({ query: () => filled });
    const result = await getApplicationEvents(conn, { recordLimit: 50 });
    expect(result.recordCount).to.equal(50);
    expect(result.truncated).to.equal(false);
  });

  it('sets truncated=false when fewer records than the limit are returned', async () => {
    const { conn } = buildMockConnection({ query: () => [{ Id: '1', Event_Name__c: 'evt' }] });
    const result = await getApplicationEvents(conn);
    expect(result.truncated).to.equal(false);
  });

  it('paginates the query when Salesforce splits results across batches', async () => {
    // Application Event payloads with large Additional_Details__c can cause Salesforce
    // to chunk a LIMIT query across multiple batches with done:false. Walk the rest.
    const page1 = Array.from({ length: 100 }, (_, i) => ({ Id: `id-${i}`, Event_Name__c: 'evt' }));
    const page2 = Array.from({ length: 30 }, (_, i) => ({ Id: `id-${i + 100}`, Event_Name__c: 'evt' }));
    const { conn, calls } = buildMockConnection({
      query: () => ({ records: page1, done: false, totalSize: 130, nextRecordsUrl: '/q/events-page-2' }),
      queryMore: () => ({ records: page2, done: true, totalSize: 130 }),
    });

    const result = await getApplicationEvents(conn, { recordLimit: 200 });
    expect(result.recordCount).to.equal(130);
    expect(result.truncated).to.equal(false);
    expect(calls.queryMoreUrls).to.deep.equal(['/q/events-page-2']);
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
