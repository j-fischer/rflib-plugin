import { expect } from 'chai';
import {
  ALL_LOG_LEVELS,
  collectWarnings,
  detectScope,
  getBestPractices,
  LOG_LEVEL_FIELDS,
  RESTRICTED_LEVEL_FIELDS,
  SETTINGS_NOTES,
  validateFieldName,
  validateFieldValue,
} from '../../src/shared/loggerSettingsRules.js';

describe('loggerSettingsRules', () => {
  describe('validateFieldName', () => {
    const known = new Set(['id', 'setupownerid', 'general_log_level__c']);

    it('accepts a known field (case-insensitive)', () => {
      expect(() => validateFieldName('General_Log_Level__c', known)).to.not.throw();
      expect(() => validateFieldName('general_log_level__c', known)).to.not.throw();
    });

    it('rejects an unknown field with a helpful message', () => {
      expect(() => validateFieldName('Bogus_Field__c', known))
        .to.throw(/does not exist on rflib_Logger_Settings__c/)
        .with.property('message')
        .that.includes("Run 'sf rflib debug loggersettings get'");
    });
  });

  describe('validateFieldValue', () => {
    it('passes through non-log-level fields untouched', () => {
      expect(() => validateFieldValue('Client_Log_Size__c', '100')).to.not.throw();
      expect(() => validateFieldValue('Client_Log_Size__c', 'BANANAS')).to.not.throw();
    });

    it('accepts every valid log level on standard log-level fields', () => {
      for (const level of ALL_LOG_LEVELS) {
        expect(() => validateFieldValue('General_Log_Level__c', level)).to.not.throw(`level: ${level}`);
        expect(() => validateFieldValue('General_Log_Level__c', level.toLowerCase())).to.not.throw();
      }
    });

    it('rejects nonsense values on log-level fields', () => {
      expect(() => validateFieldValue('General_Log_Level__c', 'BANANAS')).to.throw(/Invalid log level/);
      expect(() => validateFieldValue('General_Log_Level__c', '')).to.throw(/Invalid log level/);
    });

    it('applies log-level guardrails regardless of field-name casing', () => {
      // Salesforce field API names are case-insensitive, so the value validation
      // must trigger whether the user passes the canonical name or a lowercased one.
      expect(() => validateFieldValue('general_log_level__c', 'BANANAS')).to.throw(/Invalid log level/);
      expect(() => validateFieldValue('GENERAL_LOG_LEVEL__C', 'BANANAS')).to.throw(/Invalid log level/);
      expect(() => validateFieldValue('log_aggregation_log_level__c', 'DEBUG')).to.throw(
        /only accepts: NONE, WARN, ERROR, FATAL/,
      );
    });

    it('restricts Log_Aggregation_Log_Level__c to NONE/WARN/ERROR/FATAL', () => {
      for (const restrictedField of RESTRICTED_LEVEL_FIELDS) {
        expect(() => validateFieldValue(restrictedField, 'NONE')).to.not.throw();
        expect(() => validateFieldValue(restrictedField, 'WARN')).to.not.throw();
        expect(() => validateFieldValue(restrictedField, 'ERROR')).to.not.throw();
        expect(() => validateFieldValue(restrictedField, 'FATAL')).to.not.throw();
        expect(() => validateFieldValue(restrictedField, 'DEBUG')).to.throw(
          /only accepts: NONE, WARN, ERROR, FATAL/,
        );
        expect(() => validateFieldValue(restrictedField, 'INFO')).to.throw(
          /only accepts: NONE, WARN, ERROR, FATAL/,
        );
      }
    });
  });

  describe('collectWarnings', () => {
    it('returns no warnings for fields not in the danger list', () => {
      const warnings = collectWarnings({
        fieldName: 'General_Log_Level__c',
        fieldValue: 'DEBUG',
        setupOwnerId: '00D000000000001',
      });
      expect(warnings).to.deep.equal([]);
    });

    it('warns when org-scope Log_Event_Reporting_Level__c is set below WARN', () => {
      for (const value of ['TRACE', 'DEBUG', 'INFO']) {
        const warnings = collectWarnings({
          fieldName: 'Log_Event_Reporting_Level__c',
          fieldValue: value,
          setupOwnerId: '00D000000000001',
        });
        expect(warnings).to.have.lengthOf(1);
        expect(warnings[0]).to.include('flood the platform event bus');
        expect(warnings[0]).to.include(value);
      }
    });

    it('emits the warning regardless of field-name casing', () => {
      const warnings = collectWarnings({
        fieldName: 'log_event_reporting_level__c',
        fieldValue: 'DEBUG',
        setupOwnerId: '00D000000000001',
      });
      expect(warnings).to.have.lengthOf(1);
      expect(warnings[0]).to.include('flood the platform event bus');
    });

    it('warns when org-scope Client_Server_Log_Level__c is set below WARN', () => {
      const warnings = collectWarnings({
        fieldName: 'Client_Server_Log_Level__c',
        fieldValue: 'DEBUG',
        setupOwnerId: '00D000000000001',
      });
      expect(warnings).to.have.lengthOf(1);
    });

    it('does not warn when value is WARN or higher at org scope', () => {
      for (const value of ['WARN', 'ERROR', 'FATAL', 'NONE']) {
        const warnings = collectWarnings({
          fieldName: 'Log_Event_Reporting_Level__c',
          fieldValue: value,
          setupOwnerId: '00D000000000001',
        });
        expect(warnings).to.deep.equal([], `value ${value} should not warn`);
      }
    });

    it('does not warn when scope is profile or user', () => {
      expect(
        collectWarnings({
          fieldName: 'Log_Event_Reporting_Level__c',
          fieldValue: 'DEBUG',
          setupOwnerId: '00E0000000Profile',
        }),
      ).to.deep.equal([]);
      expect(
        collectWarnings({
          fieldName: 'Log_Event_Reporting_Level__c',
          fieldValue: 'DEBUG',
          setupOwnerId: '0050000000User01',
        }),
      ).to.deep.equal([]);
    });

    it('falls back to existingSetupOwnerId when setupOwnerId is absent', () => {
      const warnings = collectWarnings({
        fieldName: 'Log_Event_Reporting_Level__c',
        fieldValue: 'DEBUG',
        existingSetupOwnerId: '00D000000000001',
      });
      expect(warnings).to.have.lengthOf(1);
    });
  });

  describe('detectScope', () => {
    it('returns Organization for 00D-prefixed owners', () => {
      const scope = detectScope('00DXXXXXXXXXXXX', () => undefined, undefined);
      expect(scope).to.deep.equal({ scopeType: 'Organization', scopeName: 'Organization' });
    });

    it('returns Profile and resolves the profile name from the lookup', () => {
      const scope = detectScope('00E000000Profile1', (id) => (id === '00E000000Profile1' ? 'System Administrator' : undefined), undefined);
      expect(scope.scopeType).to.equal('Profile');
      expect(scope.scopeName).to.equal('System Administrator');
    });

    it('falls back to the owner id when the profile name is unknown', () => {
      const scope = detectScope('00E000000Unknown', () => undefined, undefined);
      expect(scope.scopeType).to.equal('Profile');
      expect(scope.scopeName).to.equal('00E000000Unknown');
    });

    it('returns User for non-org/non-profile owners', () => {
      const scope = detectScope('005000000000001', () => undefined, 'Jane Doe');
      expect(scope).to.deep.equal({ scopeType: 'User', scopeName: 'Jane Doe' });
    });

    it('returns Organization for blank owner', () => {
      const scope = detectScope(undefined, () => undefined, undefined);
      expect(scope).to.deep.equal({ scopeType: 'Organization', scopeName: 'Organization' });
    });
  });

  describe('static data', () => {
    it('declares every standard log-level field', () => {
      expect(LOG_LEVEL_FIELDS).to.include('General_Log_Level__c');
      expect(LOG_LEVEL_FIELDS).to.include('Log_Event_Reporting_Level__c');
      expect(LOG_LEVEL_FIELDS).to.include('Log_Aggregation_Log_Level__c');
    });

    it('exposes best practices keyed by field API name', () => {
      const bp = getBestPractices();
      expect(bp).to.have.property('General_Log_Level__c');
      expect(bp.Log_Event_Reporting_Level__c).to.have.property('warning');
      expect(bp.Log_Aggregation_Log_Level__c.validValues).to.deep.equal(['NONE', 'WARN', 'ERROR', 'FATAL']);
    });

    it('exposes hierarchy notes', () => {
      expect(SETTINGS_NOTES).to.have.lengthOf(5);
      expect(SETTINGS_NOTES[0]).to.include('hierarchy order');
    });
  });
});
