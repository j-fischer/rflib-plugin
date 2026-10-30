import type { Connection } from '@salesforce/core';
import { buildIdList, escapeSingleQuotes, ID_PATTERN } from './permissionAggregator.js';
import {
  loadContext,
  queryObjectPermissions,
  resolveUser,
  toUserSummary,
  type CheckContext,
  type UserSummary,
} from './permissionCheck.js';

// UserRecordAccess accepts at most 200 record IDs per query.
const MAX_RECORD_IDS = 200;

export type AccessLevel = 'None' | 'Read' | 'Edit' | 'Delete' | 'Transfer' | 'All';

export type RecordAccessArgs = {
  /** User ID (15 or 18 characters) or username. */
  user: string;
  recordIds: readonly string[];
};

export type ObjectRecordAccess = {
  read: boolean;
  edit: boolean;
  delete: boolean;
  viewAll: boolean;
  modifyAll: boolean;
};

export type RecordAccessEntry = {
  recordId: string;
  /** API name of the record's object, when it could be determined from the ID prefix. */
  sobjectType?: string;
  /** False when Salesforce returned no access information, e.g. because the record doesn't exist. */
  found: boolean;
  hasReadAccess: boolean;
  hasEditAccess: boolean;
  hasDeleteAccess: boolean;
  hasTransferAccess: boolean;
  hasAllAccess: boolean;
  maxAccessLevel: AccessLevel;
  /** The user's object permissions on the record's object. */
  objectAccess?: ObjectRecordAccess;
  notes: string[];
};

export type RecordAccessResult = {
  user: UserSummary;
  records: RecordAccessEntry[];
};

type UserRecordAccessRow = {
  RecordId: string;
  HasReadAccess?: boolean;
  HasEditAccess?: boolean;
  HasDeleteAccess?: boolean;
  HasTransferAccess?: boolean;
  HasAllAccess?: boolean;
};

type GlobalDescribe = { sobjects: Array<{ name: string; keyPrefix?: string | null }> };

function maxAccessLevel(row: UserRecordAccessRow | undefined): AccessLevel {
  if (row?.HasAllAccess) return 'All';
  if (row?.HasTransferAccess) return 'Transfer';
  if (row?.HasDeleteAccess) return 'Delete';
  if (row?.HasEditAccess) return 'Edit';
  if (row?.HasReadAccess) return 'Read';
  return 'None';
}

function validateRecordIds(recordIds: readonly string[]): string[] {
  const unique = [...new Set(recordIds)];
  if (unique.length === 0) {
    throw new Error('Specify at least one record ID.');
  }
  if (unique.length > MAX_RECORD_IDS) {
    throw new Error(`Specify at most ${MAX_RECORD_IDS} record IDs.`);
  }
  for (const id of unique) {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`Invalid record ID "${id}". Expected a 15 or 18 character Salesforce ID.`);
    }
  }
  return unique;
}

async function loadObjectAccess(ctx: CheckContext, sobjectType: string): Promise<ObjectRecordAccess> {
  const rows = await queryObjectPermissions(ctx, sobjectType);
  const has = (field: string): boolean => rows.some((row) => row[field] === true);
  return {
    read: has('PermissionsRead'),
    edit: has('PermissionsEdit'),
    delete: has('PermissionsDelete'),
    viewAll: has('PermissionsViewAllRecords'),
    modifyAll: has('PermissionsModifyAllRecords'),
  };
}

function explain(entry: RecordAccessEntry): string[] {
  if (!entry.found) {
    return ['Salesforce returned no access information. The record may not exist, or it may have been deleted.'];
  }
  const object = entry.sobjectType ?? 'the object';
  const access = entry.objectAccess;
  if (!access) return [];
  if (!entry.hasReadAccess) {
    return access.read
      ? [
          `The user has Read on ${object}, but sharing doesn't give them access to this record. ` +
            'Check the org-wide default, role hierarchy, sharing rules, teams, and manual shares.',
        ]
      : [
          `The user has no Read permission on ${object}, so sharing can't give them access. Grant Read on the object first.`,
        ];
  }
  if (!entry.hasEditAccess) {
    return access.edit
      ? [`The user has Edit on ${object}, but sharing only gives them Read access to this record.`]
      : [`The user can't edit this record because they have no Edit permission on ${object}.`];
  }
  return [];
}

/**
 * Checks a user's access to specific records, including sharing, with UserRecordAccess. For each
 * record, the result also contains the user's object permissions and notes that tell apart missing
 * object permissions from missing sharing.
 */
export async function getRecordAccess(conn: Connection, args: RecordAccessArgs): Promise<RecordAccessResult> {
  if (!args.user) {
    throw new Error('user is required');
  }
  const recordIds = validateRecordIds(args.recordIds);
  const user = await resolveUser(conn, args.user);
  const ctx = await loadContext(conn, user);

  const rows = (
    await conn.query<UserRecordAccessRow>(
      'SELECT RecordId, HasReadAccess, HasEditAccess, HasDeleteAccess, HasTransferAccess, HasAllAccess ' +
        `FROM UserRecordAccess WHERE UserId = '${escapeSingleQuotes(user.Id)}' AND RecordId IN ${buildIdList(recordIds)}`,
    )
  ).records;
  // Salesforce returns 18-character IDs; match them to 15-character input by prefix.
  const rowFor = (id: string): UserRecordAccessRow | undefined =>
    rows.find((row) => row.RecordId.slice(0, 15) === id.slice(0, 15));

  const global = (await conn.describeGlobal()) as unknown as GlobalDescribe;
  const objectsByPrefix = new Map(
    global.sobjects.filter((sobject) => sobject.keyPrefix).map((sobject) => [sobject.keyPrefix!, sobject.name]),
  );
  const objectAccess = new Map<string, ObjectRecordAccess>();

  const records: RecordAccessEntry[] = [];
  for (const recordId of recordIds) {
    const row = rowFor(recordId);
    const sobjectType = objectsByPrefix.get(recordId.slice(0, 3));
    if (sobjectType && !objectAccess.has(sobjectType)) {
      // eslint-disable-next-line no-await-in-loop
      objectAccess.set(sobjectType, await loadObjectAccess(ctx, sobjectType));
    }
    const entry: RecordAccessEntry = {
      recordId: row?.RecordId ?? recordId,
      ...(sobjectType ? { sobjectType } : {}),
      found: row !== undefined,
      hasReadAccess: row?.HasReadAccess === true,
      hasEditAccess: row?.HasEditAccess === true,
      hasDeleteAccess: row?.HasDeleteAccess === true,
      hasTransferAccess: row?.HasTransferAccess === true,
      hasAllAccess: row?.HasAllAccess === true,
      maxAccessLevel: maxAccessLevel(row),
      ...(sobjectType ? { objectAccess: objectAccess.get(sobjectType) } : {}),
      notes: [],
    };
    entry.notes = explain(entry);
    if (!user.IsActive) {
      entry.notes.unshift('The user is inactive and cannot log in, regardless of their access.');
    }
    records.push(entry);
  }

  return { user: toUserSummary(user), records };
}
