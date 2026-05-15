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
    expect(calls.queries[0]).to.include('CreatedDate__c > 2024-06-01T00:00:00Z');
    expect(calls.queries[0]).to.include('CreatedDate__c < 2024-06-02T00:00:00Z');
    expect(result.recordCount).to.equal(1);
    expect(result.records[0]).to.deep.equal(sampleRecord);
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
