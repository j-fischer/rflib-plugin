/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import RflibDebugApplicationEventsGet from '../../../../../src/commands/rflib/debug/applicationevents/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const sampleEvent = {
  Id: '0017000000ABCDE',
  Name: 'AE-001',
  Event_Name__c: 'order-created',
  Occurred_On__c: '2024-06-01T12:00:00.000Z',
  Related_Record_ID__c: '001000000000ABC',
  Additional_Details__c: '{}',
  Created_By_ID__c: '005000000000ABC',
  CreatedDate: '2024-06-01T12:00:00.000Z',
};

describe('rflib debug applicationevents get NUTs', () => {
  const harness = setupNut({
    query: () => [sampleEvent],
  });

  it('runs end-to-end with no filters and returns the event payload', async () => {
    const result = await RflibDebugApplicationEventsGet.run(['--target-org', harness.testOrg.username]);

    expect(result.recordCount).to.equal(1);
    expect(result.recordLimit).to.equal(200);
    expect(result.truncated).to.equal(false);
    expect(result.events[0]).to.deep.equal(sampleEvent);

    expect(harness.queries[0]).to.include('FROM rflib_Application_Event__c');
    expect(harness.queries[0]).to.not.include(' WHERE ');
    expect(harness.queries[0]).to.include('LIMIT 200');
  });

  it('builds the WHERE clause from event-name, date range, and related-record-id flags', async () => {
    await RflibDebugApplicationEventsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--event-name',
      'order-%',
      '--start-date',
      '2024-06-01T00:00:00Z',
      '--end-date',
      '2024-06-30T00:00:00Z',
      '--related-record-id',
      '001000000000ABC',
      '--record-limit',
      '50',
    ]);

    const soql = harness.queries[harness.queries.length - 1];
    expect(soql).to.include("Event_Name__c LIKE 'order-%'");
    expect(soql).to.include('Occurred_On__c >= 2024-06-01T00:00:00Z');
    expect(soql).to.include('Occurred_On__c <= 2024-06-30T00:00:00Z');
    expect(soql).to.include("Related_Record_ID__c = '001000000000ABC'");
    expect(soql).to.include('LIMIT 50');
  });
});

describe('rflib debug applicationevents get NUTs - truncation', () => {
  const filled = Array.from({ length: 50 }, (_, i) => ({ ...sampleEvent, Id: `id-${i}` }));
  const harness = setupNut({
    query: () => filled,
  });

  it('flags truncated=true when the record count reaches the requested limit', async () => {
    const result = await RflibDebugApplicationEventsGet.run([
      '--target-org',
      harness.testOrg.username,
      '--record-limit',
      '50',
    ]);

    expect(result.recordCount).to.equal(50);
    expect(result.recordLimit).to.equal(50);
    expect(result.truncated).to.equal(true);
  });
});
