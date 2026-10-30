import type { Connection } from '@salesforce/core';
import {
  buildSObjectFilter,
  buildUserCondition,
  queryAll,
  queryByIds,
  type PermissionType,
} from './permissionAggregator.js';
import {
  ACCESS_LEVELS,
  buildPermissionSetCondition,
  describeSObject,
  loadContext,
  OBJECT_ACCESS,
  OBJECT_PERMISSION_FIELDS,
  queryPermissionSets,
  resolveUser,
  toUserSummary,
  type CheckContext,
  type FieldAccess,
  type ObjectAccess,
  type UserSummary,
} from './permissionCheck.js';

const PERMISSION_TYPES: PermissionType[] = ['FLS', 'OLS', 'APEX', 'ALL'];
const SYSTEM_PERMISSION_PREFIX = 'Permissions';
const FIELDS_NOTE =
  'fields only lists fields with field-level security. Fields without it, such as Id or required fields, follow the object permission.';

type SetupEntityKey = 'apexClasses' | 'apexPages' | 'customPermissions';

const SETUP_ENTITY_TABLES: Record<string, { key: SetupEntityKey; table: string; nameField: string }> = {
  ApexClass: { key: 'apexClasses', table: 'ApexClass', nameField: 'Name' },
  ApexPage: { key: 'apexPages', table: 'ApexPage', nameField: 'Name' },
  CustomPermission: { key: 'customPermissions', table: 'CustomPermission', nameField: 'DeveloperName' },
};

export type EffectivePermissionsArgs = {
  /** User ID (15 or 18 characters) or username. */
  user: string;
  permissionType: PermissionType;
  sobjectType?: string;
};

/**
 * A user's combined permissions across their profile, permission sets, and permission set groups.
 * Each section is only present when the permission type includes it.
 */
export type EffectivePermissions = {
  user: UserSummary;
  permissionType: PermissionType;
  sobjectType?: string;
  /** Object API name to the access levels the user has on it. */
  objects?: Record<string, ObjectAccess[]>;
  /** `Object.Field` to the access levels the user has on it, taking object permissions into account. */
  fields?: Record<string, FieldAccess[]>;
  apexClasses?: string[];
  apexPages?: string[];
  /** Only included for permission type ALL. */
  customPermissions?: string[];
  /** System permission names, e.g. ModifyAllData. Only included for permission type ALL. */
  systemPermissions?: string[];
  truncated: boolean;
  notes: string[];
};

type ObjectRow = { SobjectType: string } & Record<string, unknown>;
type FieldRow = { SobjectType: string; Field: string; PermissionsRead?: boolean; PermissionsEdit?: boolean };
type SetupEntityRow = { SetupEntityType: string; SetupEntityId: string };
type EntityNameRow = { Id: string; NamespacePrefix?: string | null } & Record<string, unknown>;

function sortedRecord<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function loadObjectAccess(
  ctx: CheckContext,
  sobjectType: string | undefined,
): Promise<{ objects: Map<string, ObjectAccess[]>; truncated: boolean }> {
  const { records, truncated } = await queryAll<ObjectRow>(
    ctx.conn,
    `SELECT SobjectType, ${OBJECT_PERMISSION_FIELDS} FROM ObjectPermissions` +
      `${buildUserCondition(ctx.sourceIds)}${buildSObjectFilter(sobjectType)}`,
  );
  const granted = new Map<string, Set<ObjectAccess>>();
  for (const row of records) {
    const levels = granted.get(row.SobjectType) ?? new Set<ObjectAccess>();
    for (const level of ACCESS_LEVELS) {
      if (row[OBJECT_ACCESS[level].field] === true) levels.add(level);
    }
    granted.set(row.SobjectType, levels);
  }
  const objects = new Map<string, ObjectAccess[]>();
  for (const [object, levels] of granted) {
    if (levels.size > 0)
      objects.set(
        object,
        ACCESS_LEVELS.filter((level) => levels.has(level)),
      );
  }
  return { objects, truncated };
}

async function loadFieldAccess(
  ctx: CheckContext,
  sobjectType: string | undefined,
  objects: ReadonlyMap<string, ObjectAccess[]>,
): Promise<{ fields: Map<string, FieldAccess[]>; truncated: boolean }> {
  const { records, truncated } = await queryAll<FieldRow>(
    ctx.conn,
    `SELECT SobjectType, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions` +
      `${buildUserCondition(ctx.sourceIds)}${buildSObjectFilter(sobjectType)}`,
  );
  const granted = new Map<string, { read: boolean; edit: boolean; object: string }>();
  for (const row of records) {
    const access = granted.get(row.Field) ?? { read: false, edit: false, object: row.SobjectType };
    access.read = access.read || row.PermissionsRead === true;
    access.edit = access.edit || row.PermissionsEdit === true;
    granted.set(row.Field, access);
  }
  // Field-level security only counts when the user has the same access on the object.
  const fields = new Map<string, FieldAccess[]>();
  for (const [field, access] of granted) {
    const objectLevels = objects.get(access.object) ?? [];
    const levels: FieldAccess[] = [];
    if (access.read && objectLevels.includes('read')) levels.push('read');
    if (access.edit && objectLevels.includes('edit')) levels.push('edit');
    if (levels.length > 0) fields.set(field, levels);
  }
  return { fields, truncated };
}

async function loadSetupEntities(
  ctx: CheckContext,
  entityTypes: readonly string[],
): Promise<{ names: Partial<Record<SetupEntityKey, string[]>>; truncated: boolean }> {
  const typeFilter = entityTypes.map((type) => `SetupEntityType = '${type}'`).join(' OR ');
  const access = await queryAll<SetupEntityRow>(
    ctx.conn,
    `SELECT SetupEntityType, SetupEntityId FROM SetupEntityAccess${buildUserCondition(ctx.sourceIds)} AND (${typeFilter})`,
  );
  let truncated = access.truncated;
  const names: Partial<Record<SetupEntityKey, string[]>> = {};

  for (const type of entityTypes) {
    const config = SETUP_ENTITY_TABLES[type];
    const ids = [
      ...new Set(access.records.filter((row) => row.SetupEntityType === type).map((row) => row.SetupEntityId)),
    ];
    // eslint-disable-next-line no-await-in-loop
    const entities = await queryByIds<EntityNameRow>(
      ctx.conn,
      ids,
      (idList) => `SELECT Id, ${config.nameField}, NamespacePrefix FROM ${config.table} WHERE Id IN ${idList}`,
    );
    truncated = truncated || entities.truncated;
    names[config.key] = entities.records
      .map((entity) => {
        const name = String(entity[config.nameField]);
        return entity.NamespacePrefix ? `${entity.NamespacePrefix}__${name}` : name;
      })
      .sort((a, b) => a.localeCompare(b));
  }
  return { names, truncated };
}

async function loadSystemPermissions(ctx: CheckContext): Promise<{ permissions: string[]; truncated: boolean }> {
  const describe = await describeSObject(ctx.conn, 'PermissionSet');
  const fields = describe.fields
    .filter((field) => field.type === 'boolean' && field.name.startsWith(SYSTEM_PERMISSION_PREFIX))
    .map((field) => field.name);
  if (fields.length === 0) return { permissions: [], truncated: false };

  const { records, truncated } = await queryAll<Record<string, unknown>>(
    ctx.conn,
    `SELECT ${fields.join(', ')} FROM PermissionSet${buildPermissionSetCondition(ctx.sourceIds)}`,
  );
  const permissions = fields
    .filter((field) => records.some((row) => row[field] === true))
    .map((field) => field.slice(SYSTEM_PERMISSION_PREFIX.length))
    .sort((a, b) => a.localeCompare(b));
  return { permissions, truncated };
}

/**
 * Returns a user's combined permissions: object access, field access (only where the user also
 * has the object permission), Apex classes and Visualforce pages, and for permission type ALL
 * also custom and system permissions. Each grant is merged across the user's profile,
 * permission sets, and permission set groups.
 */
export async function getEffectivePermissions(
  conn: Connection,
  args: EffectivePermissionsArgs,
): Promise<EffectivePermissions> {
  if (!PERMISSION_TYPES.includes(args.permissionType)) {
    throw new Error('permissionType must be one of: FLS, OLS, APEX, ALL');
  }
  // Validate before querying the org.
  buildSObjectFilter(args.sobjectType);

  const user = await resolveUser(conn, args.user);
  const ctx = await loadContext(conn, user);
  const type = args.permissionType;
  const includes = (wanted: PermissionType): boolean => type === wanted || type === 'ALL';

  const result: EffectivePermissions = {
    user: toUserSummary(user),
    permissionType: type,
    ...(args.sobjectType ? { sobjectType: args.sobjectType } : {}),
    truncated: false,
    notes: [],
  };

  if (includes('OLS') || includes('FLS')) {
    const { objects, truncated } = await loadObjectAccess(ctx, args.sobjectType);
    result.truncated = result.truncated || truncated;
    if (includes('OLS')) result.objects = sortedRecord(objects);
    if (includes('FLS')) {
      const fieldAccess = await loadFieldAccess(ctx, args.sobjectType, objects);
      result.truncated = result.truncated || fieldAccess.truncated;
      result.fields = sortedRecord(fieldAccess.fields);
      const viewAllFields = [...objects].filter(([, levels]) => levels.includes('viewallfields')).map(([name]) => name);
      if (viewAllFields.length > 0) {
        result.notes.push(
          `View All Fields grants Read on every field of: ${viewAllFields.sort((a, b) => a.localeCompare(b)).join(', ')}.`,
        );
      }
      result.notes.push(FIELDS_NOTE);
    }
  }

  if (includes('APEX')) {
    const entityTypes = type === 'ALL' ? ['ApexClass', 'ApexPage', 'CustomPermission'] : ['ApexClass', 'ApexPage'];
    const { names, truncated } = await loadSetupEntities(ctx, entityTypes);
    result.truncated = result.truncated || truncated;
    Object.assign(result, names);
    if ((await queryPermissionSets(ctx, 'PermissionsAuthorApex')).length > 0) {
      result.notes.push('The user has Author Apex, which grants access to all Apex classes.');
    }
    if ((await queryPermissionSets(ctx, 'PermissionsCustomizeApplication')).length > 0) {
      result.notes.push('The user has Customize Application, which grants access to all Visualforce pages.');
    }
  }

  if (type === 'ALL') {
    const { permissions, truncated } = await loadSystemPermissions(ctx);
    result.truncated = result.truncated || truncated;
    result.systemPermissions = permissions;
  }

  if (!user.IsActive) {
    result.notes.unshift('The user is inactive and cannot log in, regardless of their permissions.');
  }
  return result;
}

export type PermissionListDiff = { onlyUser: string[]; onlyOtherUser: string[] };
export type AccessDiff<T extends string> = { onlyUser: T[]; onlyOtherUser: T[] };

export type ComparePermissionsArgs = {
  user: string;
  otherUser: string;
  permissionType: PermissionType;
  sobjectType?: string;
};

export type ComparePermissionsResult = {
  user: UserSummary;
  otherUser: UserSummary;
  permissionType: PermissionType;
  sobjectType?: string;
  /** True when no section has a difference. */
  identical: boolean;
  objects?: Record<string, AccessDiff<ObjectAccess>>;
  fields?: Record<string, AccessDiff<FieldAccess>>;
  apexClasses?: PermissionListDiff;
  apexPages?: PermissionListDiff;
  customPermissions?: PermissionListDiff;
  systemPermissions?: PermissionListDiff;
  truncated: boolean;
  notes: string[];
};

function diffLists(left: readonly string[] | undefined, right: readonly string[] | undefined): PermissionListDiff {
  const leftSet = new Set(left ?? []);
  const rightSet = new Set(right ?? []);
  return {
    onlyUser: [...leftSet].filter((value) => !rightSet.has(value)),
    onlyOtherUser: [...rightSet].filter((value) => !leftSet.has(value)),
  };
}

function diffAccess<T extends string>(
  left: Record<string, T[]> | undefined,
  right: Record<string, T[]> | undefined,
): Record<string, AccessDiff<T>> {
  const keys = [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].sort((a, b) =>
    a.localeCompare(b),
  );
  const diff: Record<string, AccessDiff<T>> = {};
  for (const key of keys) {
    const { onlyUser, onlyOtherUser } = diffLists(left?.[key], right?.[key]);
    if (onlyUser.length > 0 || onlyOtherUser.length > 0) {
      diff[key] = { onlyUser: onlyUser as T[], onlyOtherUser: onlyOtherUser as T[] };
    }
  }
  return diff;
}

/**
 * Compares the combined permissions of two users and returns only the differences, for example
 * to find out why something works for one user but not for another.
 */
export async function comparePermissions(
  conn: Connection,
  args: ComparePermissionsArgs,
): Promise<ComparePermissionsResult> {
  const options = { permissionType: args.permissionType, sobjectType: args.sobjectType };
  const left = await getEffectivePermissions(conn, { ...options, user: args.user });
  const right = await getEffectivePermissions(conn, { ...options, user: args.otherUser });

  const result: ComparePermissionsResult = {
    user: left.user,
    otherUser: right.user,
    permissionType: args.permissionType,
    ...(args.sobjectType ? { sobjectType: args.sobjectType } : {}),
    identical: true,
    truncated: left.truncated || right.truncated,
    notes: [],
  };

  if (left.objects !== undefined) result.objects = diffAccess(left.objects, right.objects);
  if (left.fields !== undefined) result.fields = diffAccess(left.fields, right.fields);
  for (const key of ['apexClasses', 'apexPages', 'customPermissions', 'systemPermissions'] as const) {
    if (left[key] !== undefined) result[key] = diffLists(left[key], right[key]);
  }

  result.identical =
    Object.keys(result.objects ?? {}).length === 0 &&
    Object.keys(result.fields ?? {}).length === 0 &&
    (['apexClasses', 'apexPages', 'customPermissions', 'systemPermissions'] as const).every(
      (key) => !result[key] || (result[key].onlyUser.length === 0 && result[key].onlyOtherUser.length === 0),
    );

  // Only notes that apply to one of the users explain a difference.
  for (const [label, effective, other] of [
    [left.user.username, left, right],
    [right.user.username, right, left],
  ] as const) {
    for (const note of effective.notes) {
      if (note === FIELDS_NOTE || other.notes.includes(note)) continue;
      result.notes.push(`${label}: ${note}`);
    }
  }
  if (result.truncated) {
    result.notes.push('Some permission queries hit the row limit; narrow the comparison to one object.');
  }
  return result;
}
