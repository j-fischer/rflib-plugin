/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import RflibDebugLoggerSettingsUpdate from '../../../../../src/commands/rflib/debug/loggersettings/update.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

type UpdatePayload = {
  success: boolean;
  recordId: string;
  message: string;
  warnings: string[];
};

const describeFields = {
  fields: [
    { name: 'Id', custom: false },
    { name: 'SetupOwnerId', custom: false },
    { name: 'Log_Event_Reporting_Level__c', custom: true },
    { name: 'Log_Aggregation_Log_Level__c', custom: true },
  ],
};

describe('rflib debug loggersettings update NUTs', () => {
  const harness = setupNut({
    query: () => [{ SetupOwnerId: '00D000000000001' }],
    describe: {
      rflib_Logger_Settings__c: () => describeFields,
    },
    create: {
      rflib_Logger_Settings__c: (record) =>
        Promise.resolve({ success: true, id: `a01NEWID${(record.SetupOwnerId as string).slice(-4)}` }),
    },
    update: {
      rflib_Logger_Settings__c: (record) => Promise.resolve({ success: true, id: record.Id as string }),
    },
  });

  it('creates a new record when only setup-owner-id is provided', async () => {
    const result = (await RflibDebugLoggerSettingsUpdate.run([
      '--target-org',
      harness.testOrg.username,
      '--setup-owner-id',
      '00D000000000001',
      '--field-name',
      'Log_Event_Reporting_Level__c',
      '--field-value',
      'WARN',
    ]));

    const payload = JSON.parse(result.result) as UpdatePayload;
    expect(payload.success).to.equal(true);
    expect(payload.recordId).to.match(/^a01NEWID/);
    expect(payload.warnings).to.be.an('array').that.is.empty;

    expect(harness.creates).to.have.lengthOf(1);
    expect(harness.creates[0].object).to.equal('rflib_Logger_Settings__c');
    expect(harness.creates[0].record).to.deep.equal({
      SetupOwnerId: '00D000000000001',
      Log_Event_Reporting_Level__c: 'WARN',
    });
  });

  it('updates an existing record when record-id is provided', async () => {
    const result = (await RflibDebugLoggerSettingsUpdate.run([
      '--target-org',
      harness.testOrg.username,
      '--record-id',
      'a01000000000ABC',
      '--field-name',
      'Log_Event_Reporting_Level__c',
      '--field-value',
      'INFO',
    ]));

    const payload = JSON.parse(result.result) as UpdatePayload;
    expect(payload.success).to.equal(true);
    expect(harness.updates).to.have.lengthOf(1);
    expect(harness.updates[0].record).to.deep.equal({
      Id: 'a01000000000ABC',
      Log_Event_Reporting_Level__c: 'INFO',
    });
  });

  it('emits a warning when setting an org-scope reporting level below WARN', async () => {
    const result = (await RflibDebugLoggerSettingsUpdate.run([
      '--target-org',
      harness.testOrg.username,
      '--setup-owner-id',
      '00D000000000001',
      '--field-name',
      'Log_Event_Reporting_Level__c',
      '--field-value',
      'DEBUG',
    ]));

    const payload = JSON.parse(result.result) as UpdatePayload;
    expect(payload.success).to.equal(true);
    expect(payload.warnings).to.have.lengthOf(1);
    expect(payload.warnings[0]).to.include('flood the platform event bus');
  });

  it('rejects an invalid log level before the DML round-trip', async () => {
    try {
      await RflibDebugLoggerSettingsUpdate.run([
        '--target-org',
        harness.testOrg.username,
        '--setup-owner-id',
        '00D000000000001',
        '--field-name',
        'Log_Event_Reporting_Level__c',
        '--field-value',
        'BANANAS',
      ]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid log level');
    }
    expect(harness.creates).to.have.lengthOf(0);
    expect(harness.updates).to.have.lengthOf(0);
  });
});
