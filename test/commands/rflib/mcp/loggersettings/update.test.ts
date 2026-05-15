/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import { updateLoggerSetting } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

const describeFields = {
  fields: [
    { name: 'Id', custom: false },
    { name: 'SetupOwnerId', custom: false },
    { name: 'Log_Event_Reporting_Level__c', custom: true },
    { name: 'General_Log_Level__c', custom: true },
    { name: 'Log_Aggregation_Log_Level__c', custom: true },
    { name: 'Client_Log_Size__c', custom: true },
  ],
};

describe('orgClient.updateLoggerSetting', () => {
  it('creates a new record when only setupOwnerId is provided', async () => {
    const { conn, calls } = buildMockConnection({
      describe: () => describeFields,
      create: () => ({ success: true, id: 'a01NEWRECORD0001' }),
    });

    const result = await updateLoggerSetting(conn, {
      setupOwnerId: '00D000000000001',
      fieldName: 'General_Log_Level__c',
      fieldValue: 'INFO',
    });

    expect(calls.creates).to.have.lengthOf(1);
    expect(calls.creates[0]).to.deep.equal({
      object: 'rflib_Logger_Settings__c',
      record: { SetupOwnerId: '00D000000000001', General_Log_Level__c: 'INFO' },
    });
    expect(result.success).to.equal(true);
    expect(result.recordId).to.equal('a01NEWRECORD0001');
    expect(result.warnings).to.deep.equal([]);
  });

  it('updates an existing record when recordId is provided', async () => {
    const { conn, calls } = buildMockConnection({
      describe: () => describeFields,
      query: () => [{ SetupOwnerId: '0050000000User01' }],
      update: () => ({ success: true, id: 'a01EXISTING00001' }),
    });

    const result = await updateLoggerSetting(conn, {
      recordId: 'a01EXISTING00001',
      fieldName: 'General_Log_Level__c',
      fieldValue: 'DEBUG',
    });

    expect(calls.updates).to.have.lengthOf(1);
    expect(calls.updates[0].record).to.deep.equal({
      Id: 'a01EXISTING00001',
      General_Log_Level__c: 'DEBUG',
    });
    expect(result.recordId).to.equal('a01EXISTING00001');
  });

  it('rejects unknown field names with the schema error', async () => {
    const { conn } = buildMockConnection({ describe: () => describeFields });
    try {
      await updateLoggerSetting(conn, {
        setupOwnerId: '00D000000000001',
        fieldName: 'Bogus_Field__c',
        fieldValue: 'INFO',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('does not exist on rflib_Logger_Settings__c');
    }
  });

  it('rejects invalid log levels', async () => {
    const { conn } = buildMockConnection({ describe: () => describeFields });
    try {
      await updateLoggerSetting(conn, {
        setupOwnerId: '00D000000000001',
        fieldName: 'General_Log_Level__c',
        fieldValue: 'BANANAS',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid log level');
    }
  });

  it('rejects DEBUG on the restricted Log_Aggregation_Log_Level__c field', async () => {
    const { conn } = buildMockConnection({ describe: () => describeFields });
    try {
      await updateLoggerSetting(conn, {
        setupOwnerId: '00D000000000001',
        fieldName: 'Log_Aggregation_Log_Level__c',
        fieldValue: 'DEBUG',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('only accepts: NONE, WARN, ERROR, FATAL');
    }
  });

  it('emits the org-scope flooding warning when setting Log_Event_Reporting_Level__c to DEBUG at org scope', async () => {
    const { conn } = buildMockConnection({
      describe: () => describeFields,
      create: () => ({ success: true, id: 'a01' }),
    });

    const result = await updateLoggerSetting(conn, {
      setupOwnerId: '00D000000000001',
      fieldName: 'Log_Event_Reporting_Level__c',
      fieldValue: 'DEBUG',
    });

    expect(result.warnings).to.have.lengthOf(1);
    expect(result.warnings[0]).to.include('flood the platform event bus');
  });

  it('looks up the existing record SetupOwnerId when only recordId is provided to determine scope', async () => {
    const { conn, calls } = buildMockConnection({
      describe: () => describeFields,
      query: () => [{ SetupOwnerId: '00D000000000001' }],
      update: () => ({ success: true, id: 'a01EXISTING00001' }),
    });

    const result = await updateLoggerSetting(conn, {
      recordId: 'a01EXISTING00001',
      fieldName: 'Log_Event_Reporting_Level__c',
      fieldValue: 'DEBUG',
    });

    expect(calls.queries.some((q) => q.includes('SELECT SetupOwnerId FROM rflib_Logger_Settings__c'))).to.equal(true);
    expect(result.warnings).to.have.lengthOf(1);
  });

  it('requires either recordId or setupOwnerId', async () => {
    const { conn } = buildMockConnection({ describe: () => describeFields });
    try {
      await updateLoggerSetting(conn, {
        fieldName: 'General_Log_Level__c',
        fieldValue: 'INFO',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('setupOwnerId is required');
    }
  });

  it('rejects invalid recordId / setupOwnerId formats before hitting the org', async () => {
    const { conn } = buildMockConnection({});
    try {
      await updateLoggerSetting(conn, {
        recordId: 'not-an-id',
        fieldName: 'General_Log_Level__c',
        fieldValue: 'INFO',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Invalid recordId');
    }
  });

  it('throws when DML returns success=false', async () => {
    const { conn } = buildMockConnection({
      describe: () => describeFields,
      create: () => ({ success: false, errors: [{ message: 'FIELD_CUSTOM_VALIDATION_EXCEPTION' }] }),
    });
    try {
      await updateLoggerSetting(conn, {
        setupOwnerId: '00D000000000001',
        fieldName: 'General_Log_Level__c',
        fieldValue: 'INFO',
      });
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('Failed to save setting');
      expect((err as Error).message).to.include('FIELD_CUSTOM_VALIDATION_EXCEPTION');
    }
  });
});
