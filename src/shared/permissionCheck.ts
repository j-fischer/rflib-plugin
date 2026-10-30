import type { Connection } from '@salesforce/core';
import {
  buildIdList,
  buildUserCondition,
  escapeSingleQuotes,
  ID_PATTERN,
  queryAll,
  type PermissionSourceIds,
} from './permissionAggregator.js';

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const FIELD_PATTERN = /^([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)$/;

export const PARENT_FIELDS =
  'Parent.Name, Parent.Label, Parent.IsOwnedByProfile, Parent.Profile.Name, Parent.PermissionSetGroupId';
export const PERMISSION_SET_FIELDS = 'Id, Name, Label, IsOwnedByProfile, Profile.Name, PermissionSetGroupId';

export type ObjectAccess = 'read' | 'create' | 'edit' | 'delete' | 'viewall' | 'modifyall' | 'viewallfields';
export type FieldAccess = 'read' | 'edit';

export const OBJECT_ACCESS: Record<ObjectAccess, { field: string; label: string }> = {
  read: { field: 'PermissionsRead', label: 'Read' },
  create: { field: 'PermissionsCreate', label: 'Create' },
  edit: { field: 'PermissionsEdit', label: 'Edit' },
  delete: { field: 'PermissionsDelete', label: 'Delete' },
  viewall: { field: 'PermissionsViewAllRecords', label: 'View All Records' },
  modifyall: { field: 'PermissionsModifyAllRecords', label: 'Modify All Records' },
  viewallfields: { field: 'PermissionsViewAllFields', label: 'View All Fields' },
};
export const OBJECT_PERMISSION_FIELDS = Object.values(OBJECT_ACCESS)
  .map((access) => access.field)
  .join(', ');

/** Access levels accepted by `checkUserPermission`. Field checks only accept read and edit. */
export const ACCESS_LEVELS = Object.keys(OBJECT_ACCESS) as ObjectAccess[];
const FIELD_ACCESS_LEVELS: FieldAccess[] = ['read', 'edit'];

export type SetupEntityType = 'apexClass' | 'apexPage' | 'customPermission';

export type SetupEntityConfig = {
  table: string;
  nameField: string;
  label: string;
  /** System permission that grants access to every entity of this type. */
  impliedBy?: { field: string; note: string };
};

export const SETUP_ENTITIES: Record<SetupEntityType, SetupEntityConfig> = {
  apexClass: {
    table: 'ApexClass',
    nameField: 'Name',
    label: 'Apex class',
    impliedBy: {
      field: 'PermissionsAuthorApex',
      note: 'Users with the Author Apex permission can access all Apex classes.',
    },
  },
  apexPage: {
    table: 'ApexPage',
    nameField: 'Name',
    label: 'Visualforce page',
    impliedBy: {
      field: 'PermissionsCustomizeApplication',
      note: 'Users with the Customize Application permission can access all Visualforce pages.',
    },
  },
  customPermission: { table: 'CustomPermission', nameField: 'DeveloperName', label: 'custom permission' },
};

/** Exactly one of these identifies the permission to check. */
export type PermissionTargetArgs = {
  object?: string;
  /** Field in the form `Object.Field`. */
  field?: string;
  access?: string;
  apexClass?: string;
  apexPage?: string;
  customPermission?: string;
  systemPermission?: string;
};

export type CheckUserPermissionArgs = PermissionTargetArgs & {
  /** User ID (15 or 18 characters) or username. */
  user: string;
};

export type PermissionCheckType = 'object' | 'field' | SetupEntityType | 'systemPermission';

export type PermissionSource = {
  type: 'Profile' | 'PermissionSet' | 'PermissionSetGroup';
  name: string;
  apiName?: string;
  /** The permission on the source that grants the access, e.g. PermissionsEdit or SetupEntityAccess. */
  permission: string;
};

export type UserSummary = { id: string; username: string; name: string; isActive: boolean; profileName: string };

export type CheckUserPermissionResult = {
  user: UserSummary;
  check: { type: PermissionCheckType; target: string; access?: string };
  granted: boolean;
  summary: string;
  sources: PermissionSource[];
  notes: string[];
  /** Field checks only: whether field-level security alone grants the access, ignoring object permissions. */
  fieldPermissionGranted?: boolean;
  /** Field checks only: the user's Read and Edit permissions on the field's object. */
  objectAccess?: { read: boolean; edit: boolean };
};

export type PermissionTarget =
  | { type: 'object'; object: string; access: ObjectAccess }
  | { type: 'field'; object: string; field: string; access: FieldAccess }
  | { type: SetupEntityType; namespace?: string; name: string }
  | { type: 'systemPermission'; name: string };

type CheckOutcome = Pick<CheckUserPermissionResult, 'granted' | 'sources' | 'notes'> &
  Partial<Pick<CheckUserPermissionResult, 'fieldPermissionGranted' | 'objectAccess'>> & {
    target: string;
    description: string;
  };

export type PermissionSetRecord = {
  Name?: string;
  Label?: string;
  IsOwnedByProfile?: boolean;
  Profile?: { Name?: string } | null;
  PermissionSetGroupId?: string | null;
};

export type GrantRow = { Parent?: PermissionSetRecord } & Record<string, unknown>;

export type UserRow = {
  Id: string;
  Username: string;
  Name: string;
  IsActive: boolean;
  ProfileId: string;
  Profile?: { Name?: string } | null;
};

type AssignmentRow = {
  PermissionSetId: string | null;
  PermissionSetGroupId: string | null;
  PermissionSet?: { IsOwnedByProfile?: boolean } | null;
  PermissionSetGroup?: { MasterLabel?: string; DeveloperName?: string } | null;
};

export type DescribeField = {
  name: string;
  type?: string;
  permissionable?: boolean;
  calculated?: boolean;
  autoNumber?: boolean;
};
export type DescribeResult = { name?: string; fields: DescribeField[] };

export type CheckContext = {
  conn: Connection;
  sourceIds: PermissionSourceIds;
  groupLabels: Map<string, string>;
};

function validateName(value: string, label: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} "${value}". Use the API name, e.g. Account or My_Class.`);
  }
}

function parseObjectAccess(access: string | undefined): ObjectAccess {
  const value = (access ?? 'read').toLowerCase();
  if (!ACCESS_LEVELS.includes(value as ObjectAccess)) {
    throw new Error(`Invalid access "${access ?? ''}". Use one of: ${ACCESS_LEVELS.join(', ')}.`);
  }
  return value as ObjectAccess;
}

/** Splits `ns__Name` or `ns.Name` into its namespace and name. */
function parseQualifiedName(value: string, label: string): { namespace?: string; name: string } {
  const separator = value.includes('.') ? '.' : value.includes('__') ? '__' : undefined;
  if (!separator) {
    validateName(value, label);
    return { name: value };
  }
  const index = value.indexOf(separator);
  const namespace = value.slice(0, index);
  const name = value.slice(index + separator.length);
  validateName(namespace, `${label} namespace`);
  validateName(name, label);
  return { namespace, name };
}

/** Validates the arguments and works out which permission to check, before any query is sent. */
export function parseTarget(args: PermissionTargetArgs): PermissionTarget {
  const given = [
    args.object,
    args.field,
    args.apexClass,
    args.apexPage,
    args.customPermission,
    args.systemPermission,
  ].filter((value) => value !== undefined);
  if (given.length !== 1) {
    throw new Error(
      'Specify exactly one of: object, field, apexClass, apexPage, customPermission, or systemPermission.',
    );
  }
  if (args.access !== undefined && args.object === undefined && args.field === undefined) {
    throw new Error('access only applies to object and field checks.');
  }

  if (args.object !== undefined) {
    validateName(args.object, 'object');
    return { type: 'object', object: args.object, access: parseObjectAccess(args.access) };
  }
  if (args.field !== undefined) {
    const match = FIELD_PATTERN.exec(args.field);
    if (!match) {
      throw new Error(`Invalid field "${args.field}". Use the form Object.Field, e.g. Account.AnnualRevenue.`);
    }
    const access = parseObjectAccess(args.access);
    if (!FIELD_ACCESS_LEVELS.includes(access as FieldAccess)) {
      throw new Error(`Invalid access "${access}" for a field. Use one of: ${FIELD_ACCESS_LEVELS.join(', ')}.`);
    }
    return { type: 'field', object: match[1], field: match[2], access: access as FieldAccess };
  }
  if (args.systemPermission !== undefined) {
    const name = args.systemPermission.replace(/^Permissions/i, '');
    validateName(name, 'system permission');
    return { type: 'systemPermission', name };
  }
  if (args.apexClass !== undefined) {
    return { type: 'apexClass', ...parseQualifiedName(args.apexClass, SETUP_ENTITIES.apexClass.label) };
  }
  if (args.apexPage !== undefined) {
    return { type: 'apexPage', ...parseQualifiedName(args.apexPage, SETUP_ENTITIES.apexPage.label) };
  }
  return {
    type: 'customPermission',
    ...parseQualifiedName(args.customPermission!, SETUP_ENTITIES.customPermission.label),
  };
}

export async function resolveUser(conn: Connection, user: string): Promise<UserRow> {
  const isId = ID_PATTERN.test(user);
  if (!isId && !user.includes('@')) {
    throw new Error(`Invalid user "${user}". Expected a 15 or 18 character User ID or a username.`);
  }
  const condition = isId ? `Id = '${escapeSingleQuotes(user)}'` : `Username = '${escapeSingleQuotes(user)}'`;
  const rows = await conn.query<UserRow>(
    `SELECT Id, Username, Name, IsActive, ProfileId, Profile.Name FROM User WHERE ${condition} LIMIT 1`,
  );
  if (rows.records.length === 0) {
    throw new Error(`User "${user}" was not found.`);
  }
  return rows.records[0];
}

export function toUserSummary(user: UserRow): UserSummary {
  return {
    id: user.Id,
    username: user.Username,
    name: user.Name,
    isActive: user.IsActive,
    profileName: user.Profile?.Name ?? '',
  };
}

export async function loadContext(conn: Connection, user: UserRow): Promise<CheckContext> {
  const assignments = (
    await queryAll<AssignmentRow>(
      conn,
      'SELECT PermissionSetId, PermissionSetGroupId, PermissionSet.IsOwnedByProfile, ' +
        'PermissionSetGroup.MasterLabel, PermissionSetGroup.DeveloperName ' +
        `FROM PermissionSetAssignment WHERE AssigneeId = '${escapeSingleQuotes(user.Id)}'`,
    )
  ).records;

  const sourceIds: PermissionSourceIds = { profileId: user.ProfileId, permissionSetIds: [], permissionSetGroupIds: [] };
  const groupLabels = new Map<string, string>();
  for (const assignment of assignments) {
    if (assignment.PermissionSet?.IsOwnedByProfile) continue;
    if (assignment.PermissionSetGroupId) {
      sourceIds.permissionSetGroupIds.push(assignment.PermissionSetGroupId);
      groupLabels.set(
        assignment.PermissionSetGroupId,
        assignment.PermissionSetGroup?.MasterLabel ??
          assignment.PermissionSetGroup?.DeveloperName ??
          assignment.PermissionSetGroupId,
      );
    } else if (assignment.PermissionSetId) {
      sourceIds.permissionSetIds.push(assignment.PermissionSetId);
    }
  }
  return { conn, sourceIds, groupLabels };
}

export function toSource(
  ps: PermissionSetRecord | undefined,
  permission: string,
  groupLabels: ReadonlyMap<string, string>,
): PermissionSource {
  if (ps?.IsOwnedByProfile) {
    return { type: 'Profile', name: ps.Profile?.Name ?? ps.Label ?? '', permission };
  }
  if (ps?.PermissionSetGroupId) {
    const name = groupLabels.get(ps.PermissionSetGroupId) ?? ps.PermissionSetGroupId;
    return { type: 'PermissionSetGroup', name, permission };
  }
  // Some system permission sets have an empty label.
  const name = ps?.Label ? ps.Label : (ps?.Name ?? '');
  return { type: 'PermissionSet', name, apiName: ps?.Name, permission };
}

/** Returns a source for every row whose `permission` field is true. */
function grantsFrom(rows: readonly GrantRow[], permission: string, ctx: CheckContext): PermissionSource[] {
  return rows.filter((row) => row[permission] === true).map((row) => toSource(row.Parent, permission, ctx.groupLabels));
}

export function uniqueSources(sources: readonly PermissionSource[]): PermissionSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.type}|${source.name}|${source.permission}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function describeSObject(conn: Connection, name: string): Promise<DescribeResult> {
  try {
    return await conn.sobject(name).describe();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not describe SObject "${name}": ${message}`, { cause: error });
  }
}

export async function queryObjectPermissions(ctx: CheckContext, sobjectType: string): Promise<GrantRow[]> {
  const soql =
    `SELECT ${PARENT_FIELDS}, SobjectType, ${OBJECT_PERMISSION_FIELDS} FROM ObjectPermissions` +
    `${buildUserCondition(ctx.sourceIds)} AND SobjectType = '${escapeSingleQuotes(sobjectType)}'`;
  return (await queryAll<GrantRow>(ctx.conn, soql)).records;
}

/** Builds a PermissionSet WHERE clause that matches the user's profile, permission sets, and groups. */
export function buildPermissionSetCondition(sourceIds: PermissionSourceIds): string {
  const { profileId, permissionSetIds, permissionSetGroupIds } = sourceIds;
  const clauses = [`ProfileId = '${escapeSingleQuotes(profileId)}'`];
  if (permissionSetIds.length > 0) clauses.push(`Id IN ${buildIdList(permissionSetIds)}`);
  if (permissionSetGroupIds.length > 0) clauses.push(`PermissionSetGroupId IN ${buildIdList(permissionSetGroupIds)}`);
  return ` WHERE (${clauses.join(' OR ')})`;
}

/** Returns the user's permission sets (including their profile's) that have `permissionField` enabled. */
export async function queryPermissionSets(ctx: CheckContext, permissionField: string): Promise<PermissionSetRecord[]> {
  const soql = `SELECT ${PERMISSION_SET_FIELDS} FROM PermissionSet${buildPermissionSetCondition(ctx.sourceIds)} AND ${permissionField} = true`;
  return (await queryAll<PermissionSetRecord & Record<string, unknown>>(ctx.conn, soql)).records;
}

async function checkObject(ctx: CheckContext, target: { object: string; access: ObjectAccess }): Promise<CheckOutcome> {
  const describe = await describeSObject(ctx.conn, target.object);
  const objectName = describe.name ?? target.object;
  const { field, label } = OBJECT_ACCESS[target.access];
  const sources = grantsFrom(await queryObjectPermissions(ctx, objectName), field, ctx);
  return {
    target: objectName,
    description: `${label} access on ${objectName}`,
    granted: sources.length > 0,
    sources: uniqueSources(sources),
    notes: [],
  };
}

export type ResolvedField = { objectName: string; field: DescribeField; fieldName: string };

/** Describes the field's object and returns the field with its canonical `Object.Field` name. */
export async function resolveField(
  conn: Connection,
  target: { object: string; field: string },
): Promise<ResolvedField> {
  const describe = await describeSObject(conn, target.object);
  const objectName = describe.name ?? target.object;
  const field = describe.fields.find((candidate) => candidate.name.toLowerCase() === target.field.toLowerCase());
  if (!field) {
    throw new Error(`Field "${target.field}" was not found on ${objectName}.`);
  }
  return { objectName, field, fieldName: `${objectName}.${field.name}` };
}

async function checkField(
  ctx: CheckContext,
  target: { object: string; field: string; access: FieldAccess },
): Promise<CheckOutcome> {
  const { objectName, field, fieldName } = await resolveField(ctx.conn, target);
  const { field: permission, label } = OBJECT_ACCESS[target.access];
  const notes: string[] = [];

  const objectRows = await queryObjectPermissions(ctx, objectName);
  const objectAccess = {
    read: objectRows.some((row) => row.PermissionsRead === true),
    edit: objectRows.some((row) => row.PermissionsEdit === true),
  };

  let sources: PermissionSource[];
  if (field.permissionable === false) {
    // Fields such as Id, Name or CreatedDate have no field-level security; the object permission decides.
    notes.push(
      `${fieldName} isn't controlled by field-level security, so access follows the ${label} permission on ${objectName}.`,
    );
    sources = grantsFrom(objectRows, permission, ctx);
  } else {
    const flsRows = (
      await queryAll<GrantRow>(
        ctx.conn,
        `SELECT ${PARENT_FIELDS}, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions` +
          `${buildUserCondition(ctx.sourceIds)} AND SobjectType = '${escapeSingleQuotes(objectName)}'` +
          ` AND Field = '${escapeSingleQuotes(fieldName)}'`,
      )
    ).records;
    sources = grantsFrom(flsRows, permission, ctx);
    if (target.access === 'read') {
      // View All Fields on the object grants Read on every field, regardless of field-level security.
      sources.push(...grantsFrom(objectRows, OBJECT_ACCESS.viewallfields.field, ctx));
    }
  }

  const readOnly = target.access === 'edit' && (field.calculated === true || field.autoNumber === true);
  if (readOnly) {
    notes.push(`${fieldName} is a formula or auto-number field, so no user can edit it.`);
  }
  const fieldPermissionGranted = sources.length > 0 && !readOnly;
  if (fieldPermissionGranted && !objectAccess[target.access]) {
    notes.push(
      `The user has field-level access, but no ${label} permission on ${objectName}, so the field isn't accessible.`,
    );
  }

  return {
    target: fieldName,
    description: `${label} access on ${fieldName}`,
    granted: fieldPermissionGranted && objectAccess[target.access],
    sources: uniqueSources(sources),
    notes,
    fieldPermissionGranted,
    objectAccess,
  };
}

export type ResolvedSetupEntity = { id: string; targetName: string; config: SetupEntityConfig };

/** Finds the Apex class, Visualforce page, or custom permission by name. */
export async function resolveSetupEntity(
  conn: Connection,
  target: { type: SetupEntityType; namespace?: string; name: string },
): Promise<ResolvedSetupEntity> {
  const config = SETUP_ENTITIES[target.type];
  const namespaceFilter =
    target.namespace === undefined ? '' : ` AND NamespacePrefix = '${escapeSingleQuotes(target.namespace)}'`;
  const matches = (
    await conn.query<{ Id: string; NamespacePrefix?: string | null }>(
      `SELECT Id, ${config.nameField}, NamespacePrefix FROM ${config.table}` +
        ` WHERE ${config.nameField} = '${escapeSingleQuotes(target.name)}'${namespaceFilter}`,
    )
  ).records;
  const displayName = target.namespace ? `${target.namespace}__${target.name}` : target.name;
  if (matches.length === 0) {
    throw new Error(`The ${config.label} "${displayName}" was not found.`);
  }
  // Without a namespace, prefer the org's own entity over managed ones, like Apex name resolution does.
  const local = matches.filter((match) => !match.NamespacePrefix);
  const candidates = matches.length > 1 && local.length === 1 ? local : matches;
  if (candidates.length > 1) {
    const namespaces = candidates.map((match) => match.NamespacePrefix ?? '(none)').join(', ');
    throw new Error(
      `More than one ${config.label} is named "${target.name}" (namespaces: ${namespaces}). Specify one as namespace__${target.name}.`,
    );
  }
  const entity = candidates[0];
  const targetName = entity.NamespacePrefix ? `${entity.NamespacePrefix}__${target.name}` : target.name;
  return { id: entity.Id, targetName, config };
}

async function checkSetupEntity(
  ctx: CheckContext,
  target: { type: SetupEntityType; namespace?: string; name: string },
): Promise<CheckOutcome> {
  const { id, targetName, config } = await resolveSetupEntity(ctx.conn, target);
  const rows = (
    await queryAll<GrantRow>(
      ctx.conn,
      `SELECT ${PARENT_FIELDS}, SetupEntityId FROM SetupEntityAccess${buildUserCondition(ctx.sourceIds)}` +
        ` AND SetupEntityId = '${escapeSingleQuotes(id)}'`,
    )
  ).records;
  const sources = rows.map((row) => toSource(row.Parent, 'SetupEntityAccess', ctx.groupLabels));
  const notes: string[] = [];

  if (config.impliedBy) {
    const implied = (await queryPermissionSets(ctx, config.impliedBy.field)).map((ps) =>
      toSource(ps, config.impliedBy!.field, ctx.groupLabels),
    );
    if (implied.length > 0) {
      sources.push(...implied);
      notes.push(config.impliedBy.note);
    }
  }

  return {
    target: targetName,
    description: `access to the ${config.label} ${targetName}`,
    granted: sources.length > 0,
    sources: uniqueSources(sources),
    notes,
  };
}

/** Returns the PermissionSet field of a system permission, e.g. PermissionsModifyAllData for ModifyAllData. */
export async function resolveSystemPermission(
  conn: Connection,
  target: { name: string },
): Promise<{ field: string; name: string }> {
  const describe = await describeSObject(conn, 'PermissionSet');
  const expected = `permissions${target.name}`.toLowerCase();
  const field = describe.fields.find(
    (candidate) => candidate.name.toLowerCase() === expected && candidate.type === 'boolean',
  );
  if (!field) {
    throw new Error(
      `Unknown system permission "${target.name}". Use the API name without the "Permissions" prefix, e.g. ModifyAllData or ViewSetup.`,
    );
  }
  return { field: field.name, name: field.name.slice('Permissions'.length) };
}

async function checkSystemPermission(ctx: CheckContext, target: { name: string }): Promise<CheckOutcome> {
  const { field, name } = await resolveSystemPermission(ctx.conn, target);
  const sources = (await queryPermissionSets(ctx, field)).map((ps) => toSource(ps, field, ctx.groupLabels));
  return {
    target: name,
    description: `the ${name} system permission`,
    granted: sources.length > 0,
    sources: uniqueSources(sources),
    notes: [],
  };
}

async function runCheck(ctx: CheckContext, target: PermissionTarget): Promise<CheckOutcome> {
  switch (target.type) {
    case 'object':
      return checkObject(ctx, target);
    case 'field':
      return checkField(ctx, target);
    case 'systemPermission':
      return checkSystemPermission(ctx, target);
    case 'apexClass':
    case 'apexPage':
    case 'customPermission':
      return checkSetupEntity(ctx, target);
  }
}

/**
 * Checks whether a user has one specific permission, and which profile, permission sets, and
 * permission set groups grant it. Answers questions such as "can this user edit
 * Account.AnnualRevenue?" with a verdict instead of the raw permission rows.
 */
export async function checkUserPermission(
  conn: Connection,
  args: CheckUserPermissionArgs,
): Promise<CheckUserPermissionResult> {
  if (!args.user) {
    throw new Error('user is required');
  }
  const target = parseTarget(args);
  const user = await resolveUser(conn, args.user);
  const ctx = await loadContext(conn, user);
  const outcome = await runCheck(ctx, target);

  const notes = [...outcome.notes];
  if (!user.IsActive) {
    notes.unshift('The user is inactive and cannot log in, regardless of their permissions.');
  }
  const access = target.type === 'object' || target.type === 'field' ? target.access : undefined;

  const result: CheckUserPermissionResult = {
    user: toUserSummary(user),
    check: { type: target.type, target: outcome.target, ...(access ? { access } : {}) },
    granted: outcome.granted,
    summary: `${user.Username} ${outcome.granted ? 'has' : "doesn't have"} ${outcome.description}.`,
    sources: outcome.sources,
    notes,
  };
  if (outcome.fieldPermissionGranted !== undefined) result.fieldPermissionGranted = outcome.fieldPermissionGranted;
  if (outcome.objectAccess) result.objectAccess = outcome.objectAccess;
  return result;
}
