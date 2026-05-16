/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import RflibDebugLoggerSettingsGet from '../../../../../src/commands/rflib/debug/loggersettings/get.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const describeFields = {
  fields: [
    { name: 'Id', custom: false },
    { name: 'SetupOwnerId', custom: false },
    { name: 'General_Log_Level__c', custom: true },
    { name: 'Log_Event_Reporting_Level__c', custom: true },
  ],
};

const orgRow = {
  Id: 'a01000000000001',
  SetupOwnerId: '00D000000000001',
  SetupOwner: { Type: 'Organization', Name: 'Acme' },
  General_Log_Level__c: 'INFO',
  Log_Event_Reporting_Level__c: 'WARN',
};

const profileRow = {
  Id: '00ePROFILEID000',
  Name: 'System Administrator',
};

describe('rflib debug loggersettings get NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.startsWith('SELECT Id, Name FROM Profile')) {
        return [profileRow];
      }
      if (soql.includes('FROM rflib_Logger_Settings__c')) {
        return [orgRow];
      }
      return [];
    },
    describe: {
      rflib_Logger_Settings__c: () => describeFields,
    },
  });

  it('returns settings, best-practice metadata, and hierarchy notes', async () => {
    const result = await RflibDebugLoggerSettingsGet.run(['--target-org', harness.testOrg.username]);

    expect(result.settingCount).to.equal(1);
    expect(result.settings[0].scopeType).to.equal('Organization');
    expect(result.settings[0].fields).to.deep.equal({
      General_Log_Level__c: 'INFO',
      Log_Event_Reporting_Level__c: 'WARN',
    });
    expect(result.bestPractices).to.have.property('Log_Event_Reporting_Level__c');
    expect(result.notes).to.be.an('array').that.is.not.empty;
  });

  it('describes the settings sobject and queries every custom field', async () => {
    await RflibDebugLoggerSettingsGet.run(['--target-org', harness.testOrg.username]);

    const settingsQuery = harness.queries.find((q) => q.includes('FROM rflib_Logger_Settings__c'));
    expect(settingsQuery).to.exist;
    expect(settingsQuery!).to.include('General_Log_Level__c');
    expect(settingsQuery!).to.include('Log_Event_Reporting_Level__c');
  });
});
