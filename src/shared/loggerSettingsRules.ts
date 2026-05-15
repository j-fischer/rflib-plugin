/* eslint-disable camelcase -- Salesforce field API names use snake_case suffix (__c) by platform convention */
export const ALL_LOG_LEVELS: readonly string[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'NONE'];

export const RESTRICTED_LEVELS: readonly string[] = ['NONE', 'WARN', 'ERROR', 'FATAL'];

export const RESTRICTED_LEVEL_FIELDS: readonly string[] = ['Log_Aggregation_Log_Level__c'];

export const LOG_LEVEL_FIELDS: readonly string[] = [
  'General_Log_Level__c',
  'Archive_Log_Level__c',
  'Client_Console_Log_Level__c',
  'Client_Server_Log_Level__c',
  'System_Debug_Log_Level__c',
  'HTTP_Callout_Log_Level__c',
  'Email_Log_Level__c',
  'Log_Event_Reporting_Level__c',
  'Batched_Log_Event_Reporting_Level__c',
  'Flush_Log_Cache_Level__c',
  'Log_Aggregation_Log_Level__c',
  'Functions_Server_Log_Level__c',
  'Functions_Compute_Log_Level__c',
];

export const WARN_IF_BELOW_WARN_AT_ORG: readonly string[] = [
  'Log_Event_Reporting_Level__c',
  'Client_Server_Log_Level__c',
];

export const LEVELS_BELOW_WARN: readonly string[] = ['TRACE', 'DEBUG', 'INFO'];

export const SETTINGS_NOTES: readonly string[] = [
  'Settings are evaluated in hierarchy order: User overrides Profile overrides Organization.',
  'Changes take effect on the next Apex transaction or browser refresh — no deployment needed.',
  'Log_Aggregation_Log_Level__c only accepts: NONE, WARN, ERROR, FATAL.',
  'When Batched_Log_Event_Reporting_Level__c is set, you must call rflib_Logger.publishBatchedLogEvents() explicitly to flush the queue.',
  'Community/Experience Cloud users cannot have custom settings created via standard UI — use this tool instead.',
];

export type ScopeInfo = {
  scopeType: 'Organization' | 'Profile' | 'User';
  scopeName: string;
};

export function detectScope(
  setupOwnerId: string | undefined | null,
  profileNameLookup: (id: string) => string | undefined,
  userOwnerName: string | undefined,
): ScopeInfo {
  if (!setupOwnerId) {
    return { scopeType: 'Organization', scopeName: 'Organization' };
  }
  const prefix = setupOwnerId.substring(0, 3).toUpperCase();
  if (prefix === '00D') {
    return { scopeType: 'Organization', scopeName: 'Organization' };
  }
  if (prefix === '00E') {
    return { scopeType: 'Profile', scopeName: profileNameLookup(setupOwnerId) ?? setupOwnerId };
  }
  return { scopeType: 'User', scopeName: userOwnerName ?? setupOwnerId };
}

export function validateFieldName(fieldName: string, knownFieldNamesLowercased: ReadonlySet<string>): void {
  if (!knownFieldNamesLowercased.has(fieldName.toLowerCase())) {
    throw new Error(
      `Field "${fieldName}" does not exist on rflib_Logger_Settings__c. ` +
        "Run 'sf rflib debug loggersettings get' to see available fields.",
    );
  }
}

// Salesforce field API names are case-insensitive. Build lowercase lookup sets so
// `general_log_level__c` triggers the same guardrails as `General_Log_Level__c`.
const LOG_LEVEL_FIELDS_LC = new Set(LOG_LEVEL_FIELDS.map((f) => f.toLowerCase()));
const RESTRICTED_LEVEL_FIELDS_LC = new Set(RESTRICTED_LEVEL_FIELDS.map((f) => f.toLowerCase()));
const WARN_IF_BELOW_WARN_AT_ORG_LC = new Set(WARN_IF_BELOW_WARN_AT_ORG.map((f) => f.toLowerCase()));

export function validateFieldValue(fieldName: string, fieldValue: string): void {
  const lcField = fieldName.toLowerCase();
  if (!LOG_LEVEL_FIELDS_LC.has(lcField)) {
    return;
  }
  const upperVal = fieldValue.toUpperCase();
  if (RESTRICTED_LEVEL_FIELDS_LC.has(lcField)) {
    if (!RESTRICTED_LEVELS.includes(upperVal)) {
      throw new Error(`Field "${fieldName}" only accepts: NONE, WARN, ERROR, FATAL. Got: "${fieldValue}"`);
    }
    return;
  }
  if (!ALL_LOG_LEVELS.includes(upperVal)) {
    throw new Error(`Invalid log level "${fieldValue}". Valid values: TRACE, DEBUG, INFO, WARN, ERROR, FATAL, NONE`);
  }
}

export function collectWarnings(args: {
  fieldName: string;
  fieldValue: string;
  setupOwnerId?: string | null;
  existingSetupOwnerId?: string | null;
}): string[] {
  const warnings: string[] = [];
  if (!WARN_IF_BELOW_WARN_AT_ORG_LC.has(args.fieldName.toLowerCase())) {
    return warnings;
  }
  const ownerForScope = args.setupOwnerId ?? args.existingSetupOwnerId ?? '';
  const isOrgScope = ownerForScope.toUpperCase().startsWith('00D');
  if (isOrgScope && LEVELS_BELOW_WARN.includes(args.fieldValue.toUpperCase())) {
    warnings.push(
      `WARNING: Setting ${args.fieldName} to "${args.fieldValue}" at org scope can flood the ` +
        'platform event bus and cause governor limit issues in high-volume orgs. ' +
        'Recommended: WARN or higher for org-wide settings.',
    );
  }
  return warnings;
}

export function getBestPractices(): Record<string, Record<string, unknown>> {
  return {
    General_Log_Level__c: {
      production: 'INFO',
      sandbox: 'INFO',
      description:
        'Minimum level for messages to be stored in the log cache. INFO recommended to balance detail and performance.',
    },
    Log_Event_Reporting_Level__c: {
      production: 'WARN',
      sandbox: 'WARN',
      description:
        'Minimum level to publish a platform event and make logs visible in the dashboard. Never set below WARN at org scope. Minimum allowed value: INFO.',
      warning: 'Setting below WARN at org scope can flood the event bus and cause governor limit issues.',
    },
    Client_Server_Log_Level__c: {
      production: 'WARN',
      sandbox: 'WARN',
      description: 'Triggers server-side log events from LWC/Aura. Never set below WARN at org scope.',
      warning: 'Setting below WARN at org scope bypasses the reporting level threshold from client code.',
    },
    System_Debug_Log_Level__c: {
      production: 'INFO',
      sandbox: 'DEBUG',
      description:
        'Controls output to Salesforce system debug logs. Use DEBUG only for targeted troubleshooting in production.',
    },
    Archive_Log_Level__c: {
      production: 'ERROR',
      sandbox_dev: 'NONE',
      sandbox_uat: 'WARN',
      description:
        'Level at which logs are persisted to the rflib_Logs_Archive__b big object for long-term audit trail.',
    },
    Email_Log_Level__c: {
      production: 'FATAL',
      sandbox: 'NONE',
      description:
        'Level at which email notifications are sent to the Apex Exception Email list. FATAL prevents alert fatigue.',
    },
    Log_Aggregation_Log_Level__c: {
      production: 'WARN',
      sandbox: 'WARN',
      validValues: ['NONE', 'WARN', 'ERROR', 'FATAL'],
      description: 'Level at which Application Events are created. Only NONE, WARN, ERROR, FATAL are accepted.',
    },
    Batched_Log_Event_Reporting_Level__c: {
      production: 'NONE',
      sandbox: 'NONE',
      description:
        'Collects log events for batch publication to avoid DML governor limits. Requires explicit call to rflib_Logger.publishBatchedLogEvents().',
    },
    Client_Log_Size__c: {
      production: 100,
      sandbox: 100,
      description: 'Number of log messages cached in the browser. Default 100 has negligible performance impact.',
    },
    Log_Size__c: {
      production: 100,
      sandbox: 100,
      description: 'Number of server-side log messages cached per transaction.',
    },
  };
}
