import type { Connection } from '@salesforce/core';

const QUERY_LIMIT = 24_995;

const FLS_FIELDS =
  'SELECT Parent.Label, Parent.Profile.Name, Parent.IsOwnedByProfile, Parent.PermissionSetGroupId, ' +
  'SobjectType, Field, PermissionsEdit, PermissionsRead';
const OBJ_FIELDS =
  'SELECT Parent.Label, Parent.Profile.Name, Parent.IsOwnedByProfile, Parent.PermissionSetGroupId, ' +
  'SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, ' +
  'PermissionsViewAllFields, PermissionsViewAllRecords, PermissionsModifyAllRecords';
const APEX_FIELDS =
  'SELECT Parent.Label, Parent.Profile.Name, Parent.IsOwnedByProfile, Parent.PermissionSetGroupId, ' +
  'SetupEntityType, SetupEntityId';

const FLS_TABLE = ' FROM FieldPermissions';
const OBJ_TABLE = ' FROM ObjectPermissions';
const APEX_TABLE = ' FROM SetupEntityAccess';

const FLS_ORDER = ' ORDER BY Parent.Profile.Name, Parent.Label, SobjectType, Field';
const OBJ_ORDER = ' ORDER BY Parent.Profile.Name, Parent.Label, SobjectType';
const APEX_ORDER = ' ORDER BY Parent.Profile.Name, Parent.Label';

const APEX_CONDITIONS = " AND (SetupEntityType = 'ApexClass' OR SetupEntityType = 'ApexPage')";

const ID_PATTERN = /^[a-zA-Z0-9]{15,18}$/;
const SOBJECT_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export type PermissionType = 'FLS' | 'OLS' | 'APEX' | 'ALL';

export type GetUserPermissionsArgs = {
  userId: string;
  permissionType: PermissionType;
  sobjectType?: string;
};

type UserPermDetails = {
  profileId: string;
  profileName: string;
  permissionSetNames: string;
  permissionSetIds: string[];
  permissionSetGroupIds: string[];
};

type UserRow = { Id: string; ProfileId: string; Profile?: { Name?: string } } & Record<string, unknown>;
type PsaRow = {
  PermissionSetId: string | null;
  PermissionSetGroupId: string | null;
  PermissionSet?: { Name?: string; Label?: string; IsOwnedByProfile?: boolean };
} & Record<string, unknown>;

function validateId(value: string, label: string): void {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} "${value}". Expected a 15 or 18 character Salesforce ID.`);
  }
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function queryAll<T extends Record<string, unknown>>(conn: Connection, soql: string): Promise<T[]> {
  const first = await conn.query<T>(soql);
  let records: T[] = [...first.records];
  let done = first.done;
  let nextUrl = first.nextRecordsUrl;
  while (!done && nextUrl && records.length < QUERY_LIMIT) {
    // eslint-disable-next-line no-await-in-loop
    const more = await conn.queryMore<T>(nextUrl);
    records = records.concat(more.records);
    done = more.done;
    nextUrl = more.nextRecordsUrl;
  }
  return records.slice(0, QUERY_LIMIT);
}

async function getUserPermDetails(conn: Connection, userId: string): Promise<UserPermDetails> {
  const userRows = await conn.query<UserRow>(
    `SELECT Id, ProfileId, Profile.Name FROM User WHERE Id = '${escapeSingleQuotes(userId)}' LIMIT 1`,
  );
  if (userRows.records.length === 0) {
    throw new Error(`User with Id "${userId}" was not found.`);
  }
  const userRow = userRows.records[0];

  const assignmentRows = await queryAll<PsaRow>(
    conn,
    'SELECT PermissionSetId, PermissionSet.Name, PermissionSet.IsOwnedByProfile, ' +
      'PermissionSetGroupId, PermissionSet.Label ' +
      `FROM PermissionSetAssignment WHERE AssigneeId = '${escapeSingleQuotes(userId)}'`,
  );

  const permissionSetIds: string[] = [];
  const permissionSetGroupIds: string[] = [];
  const permSetLabels: string[] = [];

  for (const psa of assignmentRows) {
    if (psa.PermissionSet?.IsOwnedByProfile) continue;
    if (psa.PermissionSetGroupId) {
      permissionSetGroupIds.push(psa.PermissionSetGroupId);
    } else if (psa.PermissionSetId) {
      permissionSetIds.push(psa.PermissionSetId);
      if (psa.PermissionSet?.Label) permSetLabels.push(psa.PermissionSet.Label);
    }
  }

  return {
    profileId: userRow.ProfileId,
    profileName: userRow.Profile?.Name ?? '',
    permissionSetNames: permSetLabels.join(', '),
    permissionSetIds,
    permissionSetGroupIds,
  };
}

function buildIdList(ids: readonly string[]): string {
  return "('" + ids.map(escapeSingleQuotes).join("','") + "')";
}

function buildUserCondition(details: UserPermDetails): string {
  // FieldPermissions / ObjectPermissions / SetupEntityAccess rows are always keyed by
  // ParentId = PermissionSet. Permission Set Groups don't show up under ParentId — the
  // group's effective grants live on an auto-generated PermissionSet whose
  // Parent.PermissionSetGroupId points back at the group. Filter accordingly.
  const clauses: string[] = [`Parent.ProfileId = '${escapeSingleQuotes(details.profileId)}'`];
  if (details.permissionSetIds.length > 0) {
    clauses.push(`ParentId IN ${buildIdList(details.permissionSetIds)}`);
  }
  if (details.permissionSetGroupIds.length > 0) {
    clauses.push(`Parent.PermissionSetGroupId IN ${buildIdList(details.permissionSetGroupIds)}`);
  }
  return ` WHERE (${clauses.join(' OR ')})`;
}

function buildSObjectFilter(sobjectType: string | undefined): string {
  if (!sobjectType) return '';
  if (!SOBJECT_PATTERN.test(sobjectType)) {
    throw new Error(`Invalid sobjectType "${sobjectType}". Use a standard SObject API name (e.g. Account, Order__c).`);
  }
  return ` AND SobjectType = '${escapeSingleQuotes(sobjectType)}'`;
}

export async function getUserPermissions(
  conn: Connection,
  args: GetUserPermissionsArgs,
): Promise<Record<string, unknown>> {
  if (!args.userId) {
    throw new Error('userId is required');
  }
  validateId(args.userId, 'userId');
  const validTypes: PermissionType[] = ['FLS', 'OLS', 'APEX', 'ALL'];
  if (!validTypes.includes(args.permissionType)) {
    throw new Error('permissionType must be one of: FLS, OLS, APEX, ALL');
  }

  const details = await getUserPermDetails(conn, args.userId);
  const condition = buildUserCondition(details);

  const result: Record<string, unknown> = {
    userId: args.userId,
    profileName: details.profileName,
    permissionSetNames: details.permissionSetNames,
    permissionType: args.permissionType,
  };

  if (args.permissionType === 'FLS' || args.permissionType === 'ALL') {
    const objectFilter = buildSObjectFilter(args.sobjectType);
    result.flsPermissions = await queryAll(
      conn,
      `${FLS_FIELDS}${FLS_TABLE}${condition}${objectFilter}${FLS_ORDER} LIMIT ${QUERY_LIMIT}`,
    );
  }
  if (args.permissionType === 'OLS' || args.permissionType === 'ALL') {
    const objectFilter = buildSObjectFilter(args.sobjectType);
    result.olsPermissions = await queryAll(
      conn,
      `${OBJ_FIELDS}${OBJ_TABLE}${condition}${objectFilter}${OBJ_ORDER} LIMIT ${QUERY_LIMIT}`,
    );
  }
  if (args.permissionType === 'APEX' || args.permissionType === 'ALL') {
    result.apexPermissions = await queryAll(
      conn,
      `${APEX_FIELDS}${APEX_TABLE}${condition}${APEX_CONDITIONS}${APEX_ORDER} LIMIT ${QUERY_LIMIT}`,
    );
  }

  return result;
}
