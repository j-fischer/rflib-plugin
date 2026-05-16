/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import { queryLogArchives } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

describe('orgClient.queryLogArchives', () => {
  const sampleRecord = {
    CreatedDate__c: '2024-06-01T12:00:00.000Z',
    CreatedById__c: '005000000000ABC',
    Context__c: 'Test',
    Log_Level__c: 'INFO',
    Request_ID__c: 'req-1',
    Log_Messages__c: 'msg',
    Platform_Info__c: 'platform',
  };

  it('queries rflib_Logs_Archive__b with the expected fields', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [sampleRecord] });

    const result = await queryLogArchives(conn, {
      startDate: '2024-06-01T00:00:00Z',
      endDate: '2024-06-02T00:00:00Z',
    });

    expect(calls.queries).to.have.lengthOf(1);
    expect(calls.queries[0]).to.include('FROM rflib_Logs_Archive__b');
    expect(calls.queries[0]).to.include('CreatedDate__c');
    expect(calls.queries[0]).to.include('Log_Messages__c');
    expect(calls.queries[0]).to.include('CreatedDate__c >= 2024-06-01T00:00:00Z');
    expect(calls.queries[0]).to.include('CreatedDate__c <= 2024-06-02T00:00:00Z');
    expect(result.recordCount).to.equal(1);
    expect(result.records[0]).to.deep.equal(sampleRecord);
    expect(result.truncated).to.equal(false);
  });

  it('sets truncated=true when the org returns more rows than the cap', async () => {
    // SOQL asks for cap + 1; getting back 1001 means we have overflow. Trim to 1000.
    const filled = Array.from({ length: 1001 }, () => sampleRecord);
    const { conn } = buildMockConnection({ query: () => filled });
    const result = await queryLogArchives(conn);
    expect(result.recordCount).to.equal(1000);
    expect(result.records).to.have.lengthOf(1000);
    expect(result.queryLimit).to.equal(1000);
    expect(result.truncated).to.equal(true);
  });

  it('does NOT report truncation when the org returns exactly cap rows', async () => {
    // Returning 1000 rows under a LIMIT 1001 SOQL means the org has exactly 1000 rows
    // in the window; no truncation. (Pre-FETCH_LIMIT this was a false-positive case.)
    const filled = Array.from({ length: 1000 }, () => sampleRecord);
    const { conn } = buildMockConnection({ query: () => filled });
    const result = await queryLogArchives(conn);
    expect(result.recordCount).to.equal(1000);
    expect(result.truncated).to.equal(false);
  });

  it('paginates the query when Salesforce splits results across batches', async () => {
    // Large Log_Messages__c rows can cause Salesforce to chunk a single LIMIT query
    // across multiple batches with done:false. The implementation must walk the rest.
    const page1 = Array.from({ length: 200 }, (_, i) => ({ ...sampleRecord, Request_ID__c: `req-${i}` }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({ ...sampleRecord, Request_ID__c: `req-${i + 200}` }));
    const { conn, calls } = buildMockConnection({
      query: () => ({ records: page1, done: false, totalSize: 300, nextRecordsUrl: '/q/archives-page-2' }),
      queryMore: () => ({ records: page2, done: true, totalSize: 300 }),
    });

    const result = await queryLogArchives(conn);
    expect(result.recordCount).to.equal(300);
    expect(result.truncated).to.equal(false);
    expect(calls.queryMoreUrls).to.deep.equal(['/q/archives-page-2']);
  });

  it('defaults to a 24 hour window when no dates are supplied', async () => {
    const { conn, calls } = buildMockConnection({ query: () => [] });
    const before = Date.now();
    const result = await queryLogArchives(conn);
    const after = Date.now();

    const startDate = new Date(result.startDate).getTime();
    const endDate = new Date(result.endDate).getTime();

    expect(after - startDate).to.be.greaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(endDate).to.be.greaterThanOrEqual(before);
    expect(endDate).to.be.lessThanOrEqual(after);
    expect(calls.queries[0]).to.include('rflib_Logs_Archive__b');
  });

  it('rejects malformed datetime strings', async () => {
    const { conn } = buildMockConnection({});
    try {
      await queryLogArchives(conn, { startDate: 'not-a-date' });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid datetime');
    }
  });

  it('translates "sobject not found" errors into an actionable RFLIB-not-installed error', async () => {
    const { conn } = buildMockConnection({
      query: () => {
        const err = new Error("sObject type 'rflib_Logs_Archive__b' is not supported");
        (err as Error & { errorCode: string }).errorCode = 'INVALID_TYPE';
        throw err;
      },
    });

    try {
      await queryLogArchives(conn);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('rflib_Logs_Archive__b was not found');
      expect((err as Error).message).to.include('RFLIB package');
    }
  });
});
