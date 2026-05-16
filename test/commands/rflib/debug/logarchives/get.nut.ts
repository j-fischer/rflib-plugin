/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import RflibDebugLogArchivesGet from '../../../../../src/commands/rflib/debug/logarchives/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const sampleRecord = {
  CreatedDate__c: '2024-06-01T12:00:00.000Z',
  CreatedById__c: '005000000000ABC',
  Context__c: 'OrderService',
  Log_Level__c: 'ERROR',
  Request_ID__c: 'req-1',
  Log_Messages__c: 'failed',
  Platform_Info__c: 'apex',
};

describe('rflib debug logarchives get NUTs', () => {
  const harness = setupNut({
    query: () => [sampleRecord],
  });

  it('runs end-to-end and returns a structured payload with records and truncated=false', async () => {
    const result = await RflibDebugLogArchivesGet.run([
      '--target-org',
      harness.testOrg.username,
      '--start-date',
      '2024-06-01T00:00:00Z',
      '--end-date',
      '2024-06-02T00:00:00Z',
    ]);

    expect(result.recordCount).to.equal(1);
    expect(result.queryLimit).to.equal(1000);
    expect(result.truncated).to.equal(false);
    expect(result.records).to.have.lengthOf(1);
    expect(result.records[0]).to.deep.equal(sampleRecord);

    expect(harness.queries).to.have.lengthOf(1);
    expect(harness.queries[0]).to.include('FROM rflib_Logs_Archive__b');
    expect(harness.queries[0]).to.include('CreatedDate__c >= 2024-06-01T00:00:00Z');
    expect(harness.queries[0]).to.include('CreatedDate__c <= 2024-06-02T00:00:00Z');
    // SOQL asks for cap + 1 so we can detect overflow vs. an exact-cap result.
    expect(harness.queries[0]).to.include('LIMIT 1001');
  });

  it('defaults to a 24-hour window when no dates are given', async () => {
    const before = Date.now();
    const result = await RflibDebugLogArchivesGet.run(['--target-org', harness.testOrg.username]);
    const after = Date.now();

    const startMs = new Date(result.startDate).getTime();
    const endMs = new Date(result.endDate).getTime();

    expect(after - startMs).to.be.greaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(endMs).to.be.greaterThanOrEqual(before);
    expect(endMs).to.be.lessThanOrEqual(after);
  });
});

describe('rflib debug logarchives get NUTs - truncated', () => {
  // Return cap + 1 rows so the sentinel signals overflow; the trimmed result should
  // expose exactly 1000 records with truncated=true.
  const filled = Array.from({ length: 1001 }, () => sampleRecord);
  const harness = setupNut({
    query: () => filled,
  });

  it('reports truncated=true when the cap is exceeded', async () => {
    const result = await RflibDebugLogArchivesGet.run(['--target-org', harness.testOrg.username]);

    expect(result.recordCount).to.equal(1000);
    expect(result.records).to.have.lengthOf(1000);
    expect(result.truncated).to.equal(true);
  });
});
