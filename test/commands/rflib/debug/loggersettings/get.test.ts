/* eslint-disable camelcase -- Salesforce field API names */
import { expect } from 'chai';
import { getLoggerSettings } from '../../../../../src/shared/orgClient.js';
import { buildMockConnection } from '../../../../helpers/mockConnection.js';

const describeFields = {
  fields: [
    { name: 'Id', custom: false },
    { name: 'SetupOwnerId', custom: false },
    { name: 'General_Log_Level__c', custom: true },
    { name: 'Log_Event_Reporting_Level__c', custom: true },
  ],
};

describe('orgClient.getLoggerSettings', () => {
  it('describes the settings sobject and queries every custom field', async () => {
    const { conn, calls } = buildMockConnection({
      describe: () => describeFields,
      query: (soql) => {
        if (soql.startsWith('SELECT Id, Name FROM Profile')) return [];
        return [];
      },
    });

    await getLoggerSettings(conn);
    expect(calls.describes).to.deep.equal(['rflib_Logger_Settings__c']);
    const settingsQuery = calls.queries.find((q) => q.includes('FROM rflib_Logger_Settings__c'));
    expect(settingsQuery).to.exist;
    expect(settingsQuery).to.include('General_Log_Level__c');
    expect(settingsQuery).to.include('Log_Event_Reporting_Level__c');
  });

  it('classifies records by scope (Org / Profile / User) and resolves profile names', async () => {
    const { conn } = buildMockConnection({
      describe: () => describeFields,
      query: (soql) => {
        if (soql.startsWith('SELECT Id, Name FROM Profile')) {
          return [{ Id: '00E000000Profile1', Name: 'System Administrator' }];
        }
        return [
          {
            Id: 'a01OrgScope01',
            SetupOwnerId: '00DOrgOrgOrg001',
            SetupOwner: { Type: 'Organization', Name: 'Org' },
            General_Log_Level__c: 'INFO',
          },
          {
            Id: 'a01ProfScope01',
            SetupOwnerId: '00E000000Profile1',
            SetupOwner: { Type: 'Profile', Name: '00E000000Profile1' },
            General_Log_Level__c: 'DEBUG',
          },
          {
            Id: 'a01UserScope01',
            SetupOwnerId: '0050000000User01',
            SetupOwner: { Type: 'User', Name: 'Jane Doe' },
            General_Log_Level__c: 'TRACE',
          },
        ];
      },
    });

    const result = await getLoggerSettings(conn);

    expect(result.settingCount).to.equal(3);
    expect(result.settings[0]).to.include({ scopeType: 'Organization', scopeName: 'Organization' });
    expect(result.settings[1]).to.include({ scopeType: 'Profile', scopeName: 'System Administrator' });
    expect(result.settings[2]).to.include({ scopeType: 'User', scopeName: 'Jane Doe' });
    expect(result.settings[2].fields).to.have.property('General_Log_Level__c', 'TRACE');
  });

  it('omits null/undefined custom field values from the per-record fields map', async () => {
    const { conn } = buildMockConnection({
      describe: () => describeFields,
      query: (soql) => {
        if (soql.startsWith('SELECT Id, Name FROM Profile')) return [];
        return [
          {
            Id: 'a01',
            SetupOwnerId: '00D000000000001',
            SetupOwner: { Type: 'Organization', Name: 'Org' },
            General_Log_Level__c: 'INFO',
            Log_Event_Reporting_Level__c: null,
          },
        ];
      },
    });

    const result = await getLoggerSettings(conn);
    expect(result.settings[0].fields).to.have.property('General_Log_Level__c');
    expect(result.settings[0].fields).to.not.have.property('Log_Event_Reporting_Level__c');
  });

  it('follows nextRecordsUrl to return every settings record across multiple query batches', async () => {
    const page1 = [
      {
        Id: 'a01000000000001',
        SetupOwnerId: '00D000000000001',
        SetupOwner: { Type: 'Organization', Name: 'Acme' },
        General_Log_Level__c: 'INFO',
      },
    ];
    const page2 = [
      {
        Id: 'a01000000000002',
        SetupOwnerId: '005000000000001',
        SetupOwner: { Type: 'User', Name: 'Alice' },
        General_Log_Level__c: 'DEBUG',
      },
    ];
    const { conn, calls } = buildMockConnection({
      describe: () => describeFields,
      query: (soql) => {
        if (soql.startsWith('SELECT Id, Name FROM Profile')) return [];
        return { records: page1, done: false, totalSize: 2, nextRecordsUrl: '/services/data/v60.0/query/01g000-2000' };
      },
      queryMore: () => ({ records: page2, done: true, totalSize: 2 }),
    });

    const result = await getLoggerSettings(conn);
    expect(result.settingCount).to.equal(2);
    expect(result.settings.map((s) => s.id)).to.deep.equal(['a01000000000001', 'a01000000000002']);
    expect(calls.queryMoreUrls).to.deep.equal(['/services/data/v60.0/query/01g000-2000']);
  });

  it('returns best practices and notes alongside the settings', async () => {
    const { conn } = buildMockConnection({ describe: () => describeFields, query: () => [] });
    const result = await getLoggerSettings(conn);
    expect(result.bestPractices).to.have.property('General_Log_Level__c');
    expect(result.bestPractices).to.have.property('Log_Aggregation_Log_Level__c');
    expect(result.notes).to.have.lengthOf(5);
  });
});
