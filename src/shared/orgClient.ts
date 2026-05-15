import type { Connection } from '@salesforce/core';
import { SfError } from '@salesforce/core';
import {
  collectWarnings,
  detectScope,
  getBestPractices,
  SETTINGS_NOTES,
  validateFieldName,
  validateFieldValue,
  type ScopeInfo,
} from './loggerSettingsRules.js';
import { getUserPermissions } from './permissionAggregator.js';

const ARCHIVE_QUERY_LIMIT = 1000;
const APP_EVENTS_DEFAULT_LIMIT = 200;
const APP_EVENTS_MAX_LIMIT = 2000;

const SETTINGS_OBJECT = 'rflib_Logger_Settings__c';
const ARCHIVE_OBJECT = 'rflib_Logs_Archive__b';
const APP_EVENT_OBJECT = 'rflib_Application_Event__c';
const ID_PATTERN = /^[a-zA-Z0-9]{15,18}$/;

export type QueryLogArchivesArgs = {
  startDate?: string;
  endDate?: string;
};

export type LogArchiveRecord = {
  CreatedDate__c: string;
  CreatedById__c?: string | null;
  Context__c?: string | null;
  Log_Level__c?: string | null;
  Request_ID__c?: string | null;
  Log_Messages__c?: string | null;
  Platform_Info__c?: string | null;
};

export type LogArchivesResult = {
  recordCount: number;
  queryLimit: number;
  truncated: boolean;
  startDate: string;
  endDate: string;
  records: LogArchiveRecord[];
};

export type GetApplicationEventsArgs = {
  eventName?: string;
  startDate?: string;
  endDate?: string;
  relatedRecordId?: string;
  recordLimit?: number;
};

export type ApplicationEventRecord = {
  Id: string;
  Name?: string;
  Event_Name__c?: string;
  Occurred_On__c?: string;
  Related_Record_ID__c?: string | null;
  Additional_Details__c?: string | null;
  Created_By_ID__c?: string | null;
  CreatedDate?: string;
};

export type ApplicationEventsResult = {
  recordCount: number;
  recordLimit: number;
  truncated: boolean;
  events: ApplicationEventRecord[];
};

export type LoggerSettingRecord = {
  id: string;
  setupOwnerId: string;
  scopeType: ScopeInfo['scopeType'];
  scopeName: string;
  fields: Record<string, unknown>;
};

export type LoggerSettingsResult = {
  settings: LoggerSettingRecord[];
  settingCount: number;
  bestPractices: Record<string, Record<string, unknown>>;
  notes: string[];
};

export type UpdateLoggerSettingArgs = {
  recordId?: string;
  setupOwnerId?: string;
  fieldName: string;
  fieldValue: string;
};

export type UpdateLoggerSettingResult = {
  success: boolean;
  recordId: string;
  message: string;
  warnings: string[];
};

export { getUserPermissions };
export type { GetUserPermissionsArgs, PermissionType } from './permissionAggregator.js';

function escapeSingleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseDateTime(value: string | undefined, fallback: Date | null): Date | null {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SfError(
      `Invalid datetime value "${value}". Use ISO 8601 format, e.g. 2024-01-01T00:00:00Z`,
      'InvalidDateTime',
    );
  }
  return parsed;
}

function formatSoqlDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const code = (error as { errorCode?: string }).errorCode;
  if (code === 'INVALID_TYPE' || code === 'NOT_FOUND') return true;
  return message.includes("sobject type 'rflib_") || message.includes('does not support query');
}

function wrapMissingObject<T>(error: unknown, objectName: string): T {
  if (isMissingObjectError(error)) {
    throw new SfError(
      `The object ${objectName} was not found in the target org. ` +
        'Confirm the RFLIB package is installed and the running user has read access.',
      'RflibNotInstalled',
    );
  }
  if (error instanceof Error) throw error;
  throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

export async function queryLogArchives(
  conn: Connection,
  args: QueryLogArchivesArgs = {},
): Promise<LogArchivesResult> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDate = parseDateTime(args.startDate, oneDayAgo)!;
  const endDate = parseDateTime(args.endDate, now)!;

  const soql =
    'SELECT CreatedDate__c, CreatedById__c, Context__c, Log_Level__c, Request_ID__c, Log_Messages__c, Platform_Info__c ' +
    `FROM ${ARCHIVE_OBJECT} ` +
    `WHERE CreatedDate__c > ${formatSoqlDateTime(startDate)} ` +
    `AND CreatedDate__c < ${formatSoqlDateTime(endDate)} ` +
    `LIMIT ${ARCHIVE_QUERY_LIMIT}`;

  let records: LogArchiveRecord[];
  try {
    const result = await conn.query<LogArchiveRecord>(soql);
    records = result.records;
  } catch (error) {
    return wrapMissingObject<LogArchivesResult>(error, ARCHIVE_OBJECT);
  }

  return {
    recordCount: records.length,
    queryLimit: ARCHIVE_QUERY_LIMIT,
    truncated: records.length >= ARCHIVE_QUERY_LIMIT,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    records,
  };
}

export async function getApplicationEvents(
  conn: Connection,
  args: GetApplicationEventsArgs = {},
): Promise<ApplicationEventsResult> {
  let recordLimit = args.recordLimit ?? APP_EVENTS_DEFAULT_LIMIT;
  if (!Number.isFinite(recordLimit) || recordLimit <= 0) recordLimit = APP_EVENTS_DEFAULT_LIMIT;
  if (recordLimit > APP_EVENTS_MAX_LIMIT) recordLimit = APP_EVENTS_MAX_LIMIT;

  const conditions: string[] = [];
  if (args.eventName) {
    const escaped = escapeSingleQuotes(args.eventName);
    conditions.push(args.eventName.includes('%') ? `Event_Name__c LIKE '${escaped}'` : `Event_Name__c = '${escaped}'`);
  }
  const startDate = parseDateTime(args.startDate, null);
  if (startDate) conditions.push(`Occurred_On__c >= ${formatSoqlDateTime(startDate)}`);
  const endDate = parseDateTime(args.endDate, null);
  if (endDate) conditions.push(`Occurred_On__c <= ${formatSoqlDateTime(endDate)}`);
  if (args.relatedRecordId) {
    conditions.push(`Related_Record_ID__c = '${escapeSingleQuotes(args.relatedRecordId)}'`);
  }

  const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  const soql =
    'SELECT Id, Name, Event_Name__c, Occurred_On__c, Related_Record_ID__c, ' +
    'Additional_Details__c, Created_By_ID__c, CreatedDate ' +
    `FROM ${APP_EVENT_OBJECT}${where} ORDER BY Occurred_On__c DESC LIMIT ${recordLimit}`;

  let events: ApplicationEventRecord[];
  try {
    const result = await conn.query<ApplicationEventRecord>(soql);
    events = result.records;
  } catch (error) {
    return wrapMissingObject<ApplicationEventsResult>(error, APP_EVENT_OBJECT);
  }

  return { recordCount: events.length, recordLimit, truncated: events.length >= recordLimit, events };
}

type DescribeFieldLite = { name: string; custom: boolean };
type DescribeResultLite = { fields: DescribeFieldLite[] };
type SettingRow = {
  [field: string]: unknown;
  Id: string;
  SetupOwnerId: string;
  SetupOwner?: { Type?: string; Name?: string };
};
type ProfileRow = { Id: string; Name: string };

async function describeSettingsObject(conn: Connection): Promise<DescribeFieldLite[]> {
  try {
    const describe = (await conn.sobject(SETTINGS_OBJECT).describe()) as unknown as DescribeResultLite;
    return describe.fields;
  } catch (error) {
    return wrapMissingObject<DescribeFieldLite[]>(error, SETTINGS_OBJECT);
  }
}

export async function getLoggerSettings(conn: Connection): Promise<LoggerSettingsResult> {
  const fields = await describeSettingsObject(conn);
  const customFieldNames = fields.filter((f) => f.custom).map((f) => f.name);

  const profileResult = await conn.query<ProfileRow>('SELECT Id, Name FROM Profile');
  const profileMap = new Map<string, string>();
  for (const profile of profileResult.records) profileMap.set(profile.Id, profile.Name);

  const fieldList = ['Id', 'SetupOwnerId', 'SetupOwner.Type', 'SetupOwner.Name', ...customFieldNames].join(', ');
  const soql = `SELECT ${fieldList} FROM ${SETTINGS_OBJECT}`;

  let rawRecords: SettingRow[];
  try {
    const result = await conn.query<SettingRow>(soql);
    rawRecords = result.records;
  } catch (error) {
    return wrapMissingObject<LoggerSettingsResult>(error, SETTINGS_OBJECT);
  }

  const settings: LoggerSettingRecord[] = rawRecords.map((row) => {
    const scope = detectScope(
      row.SetupOwnerId,
      (id) => profileMap.get(id),
      row.SetupOwner?.Name,
    );
    const fieldValues: Record<string, unknown> = {};
    for (const fieldName of customFieldNames) {
      const value = row[fieldName];
      if (value !== null && value !== undefined) fieldValues[fieldName] = value;
    }
    return {
      id: row.Id,
      setupOwnerId: row.SetupOwnerId,
      scopeType: scope.scopeType,
      scopeName: scope.scopeName,
      fields: fieldValues,
    };
  });

  return {
    settings,
    settingCount: settings.length,
    bestPractices: getBestPractices(),
    notes: [...SETTINGS_NOTES],
  };
}

type SaveResult = { success: boolean; id?: string; errors?: Array<{ message?: string; statusCode?: string }> };

export async function updateLoggerSetting(
  conn: Connection,
  args: UpdateLoggerSettingArgs,
): Promise<UpdateLoggerSettingResult> {
  if (!args.fieldName) throw new SfError('fieldName is required', 'MissingArgument');
  if (args.fieldValue === undefined || args.fieldValue === null) {
    throw new SfError('fieldValue is required', 'MissingArgument');
  }
  if (!args.recordId && !args.setupOwnerId) {
    throw new SfError('setupOwnerId is required when creating a new record', 'MissingArgument');
  }
  if (args.recordId && !ID_PATTERN.test(args.recordId)) {
    throw new SfError(`Invalid recordId "${args.recordId}".`, 'InvalidId');
  }
  if (args.setupOwnerId && !ID_PATTERN.test(args.setupOwnerId)) {
    throw new SfError(`Invalid setupOwnerId "${args.setupOwnerId}".`, 'InvalidId');
  }

  const fields = await describeSettingsObject(conn);
  const knownFields = new Set(fields.map((f) => f.name.toLowerCase()));
  validateFieldName(args.fieldName, knownFields);
  validateFieldValue(args.fieldName, args.fieldValue);

  let existingSetupOwnerId: string | undefined;
  if (args.recordId && !args.setupOwnerId) {
    const existing = await conn.query<{ SetupOwnerId: string }>(
      `SELECT SetupOwnerId FROM ${SETTINGS_OBJECT} WHERE Id = '${escapeSingleQuotes(args.recordId)}' LIMIT 1`,
    );
    existingSetupOwnerId = existing.records[0]?.SetupOwnerId;
  }

  const warnings = collectWarnings({
    fieldName: args.fieldName,
    fieldValue: args.fieldValue,
    setupOwnerId: args.setupOwnerId,
    existingSetupOwnerId,
  });

  const sobject = conn.sobject(SETTINGS_OBJECT);
  const payload: Record<string, unknown> = { [args.fieldName]: args.fieldValue };
  let saveResult: SaveResult;
  try {
    if (args.recordId) {
      saveResult = (await sobject.update({ Id: args.recordId, ...payload })) as unknown as SaveResult;
    } else {
      saveResult = (await sobject.create({ SetupOwnerId: args.setupOwnerId, ...payload })) as unknown as SaveResult;
    }
  } catch (error) {
    return wrapMissingObject<UpdateLoggerSettingResult>(error, SETTINGS_OBJECT);
  }

  if (!saveResult.success) {
    const message = saveResult.errors?.map((e) => e.message ?? '').join('; ') ?? 'Unknown error';
    throw new SfError(`Failed to save setting: ${message}`, 'DmlError');
  }

  const recordId = saveResult.id ?? args.recordId ?? '';
  return {
    success: true,
    recordId,
    message: `Logger setting ${args.fieldName} updated to "${args.fieldValue}" successfully.`,
    warnings,
  };
}
