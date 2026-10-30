import type { Connection } from '@salesforce/core';
import { escapeSingleQuotes, queryAll, queryByIds } from './permissionAggregator.js';
import {
  describeSObject,
  OBJECT_ACCESS,
  PARENT_FIELDS,
  PERMISSION_SET_FIELDS,
  parseTarget,
  resolveField,
  resolveSetupEntity,
  resolveSystemPermission,
  toSource,
  type PermissionCheckType,
  type PermissionSetRecord,
  type PermissionSource,
  type PermissionTarget,
  type PermissionTargetArgs,
  type UserSummary,
} from './permissionCheck.js';

const DEFAULT_USER_LIMIT = 200;
const MAX_USER_LIMIT = 2000;

const SOURCE_LABELS: Record<PermissionSource['type'], string> = {
  Profile: 'Profile',
  PermissionSet: 'Permission Set',
  PermissionSetGroup: 'Permission Set Group',
};

export type WhoHasPermissionArgs = PermissionTargetArgs & {
  /** Include inactive users. Default: false. */
  includeInactive?: boolean;
  /** Maximum number of users to return. Default: 200, maximum: 2000. */
  limit?: number;
};

export type WhoHasSource = PermissionSource & {
  /** Number of matching users who get the access from this source. */
  userCount: number;
};

export type WhoHasUser = UserSummary & {
  /** The sources that give this user the access, e.g. `Permission Set "Sales Reports"`. */
  sources: string[];
};

export type WhoHasPermissionResult = {
  check: { type: PermissionCheckType; target: string; access?: string };
  summary: string;
  /** Total number of matching users, including those beyond the limit. */
  userCount: number;
  users: WhoHasUser[];
  /** True when more users have the access than were returned. */
  usersTruncated: boolean;
  /** The profiles, permission sets, and permission set groups that give matching users the access. */
  sources: WhoHasSource[];
  /** Number of profiles, permission sets, and groups that grant the access but have no matching users. */
  unassignedSourceCount: number;
  notes: string[];
};

/** A permission set (or a profile's or group's permission set) that grants the access. */
type Grant = { permissionSetId: string; record: PermissionSetRecord; permission: string };

type GrantRow = { ParentId: string; Parent?: PermissionSetRecord } & Record<string, unknown>;
type PermissionSetRow = PermissionSetRecord & { Id: string } & Record<string, unknown>;

type AssignmentRow = {
  AssigneeId: string;
  PermissionSetId: string | null;
  PermissionSetGroupId: string | null;
  Assignee?: { Username?: string; Name?: string; IsActive?: boolean; Profile?: { Name?: string } | null } | null;
};

type GrantSet = { grants: Grant[]; truncated: boolean; description: string; target: string; notes: string[] };

function grantsFromRows(rows: readonly GrantRow[], permission: string): Grant[] {
  return rows
    .filter((row) => row[permission] === true)
    .map((row) => ({ permissionSetId: row.ParentId, record: row.Parent ?? {}, permission }));
}

function grantsFromPermissionSets(rows: readonly PermissionSetRow[], permission: string): Grant[] {
  return rows.map((row) => ({ permissionSetId: row.Id, record: row, permission }));
}

async function objectGrants(
  conn: Connection,
  objectName: string,
  permission: string,
): Promise<{ grants: Grant[]; truncated: boolean }> {
  const { records, truncated } = await queryAll<GrantRow>(
    conn,
    `SELECT ParentId, ${PARENT_FIELDS}, ${permission} FROM ObjectPermissions` +
      ` WHERE SobjectType = '${escapeSingleQuotes(objectName)}' AND ${permission} = true`,
  );
  return { grants: grantsFromRows(records, permission), truncated };
}

async function permissionSetGrants(
  conn: Connection,
  permissionField: string,
): Promise<{ grants: Grant[]; truncated: boolean }> {
  const { records, truncated } = await queryAll<PermissionSetRow>(
    conn,
    `SELECT ${PERMISSION_SET_FIELDS} FROM PermissionSet WHERE ${permissionField} = true`,
  );
  return { grants: grantsFromPermissionSets(records, permissionField), truncated };
}

/**
 * Finds the permission sets that grant the access. For field checks, `required` holds the object
 * permission a user also needs for the field to be accessible.
 */
async function findGrants(
  conn: Connection,
  target: PermissionTarget,
): Promise<GrantSet & { required?: { grants: Grant[]; truncated: boolean } }> {
  switch (target.type) {
    case 'object': {
      const describe = await describeSObject(conn, target.object);
      const objectName = describe.name ?? target.object;
      const { field, label } = OBJECT_ACCESS[target.access];
      const found = await objectGrants(conn, objectName, field);
      return { ...found, target: objectName, description: `${label} access on ${objectName}`, notes: [] };
    }
    case 'field': {
      const { objectName, field, fieldName } = await resolveField(conn, target);
      const { field: permission, label } = OBJECT_ACCESS[target.access];
      const description = `${label} access on ${fieldName}`;
      const notes: string[] = [];
      if (target.access === 'edit' && (field.calculated === true || field.autoNumber === true)) {
        notes.push(`${fieldName} is a formula or auto-number field, so no user can edit it.`);
        return { grants: [], truncated: false, target: fieldName, description, notes };
      }
      if (field.permissionable === false) {
        notes.push(
          `${fieldName} isn't controlled by field-level security, so access follows the ${label} permission on ${objectName}.`,
        );
        const found = await objectGrants(conn, objectName, permission);
        return { ...found, target: fieldName, description, notes };
      }
      const fls = await queryAll<GrantRow>(
        conn,
        `SELECT ParentId, ${PARENT_FIELDS}, PermissionsRead, PermissionsEdit FROM FieldPermissions` +
          ` WHERE SobjectType = '${escapeSingleQuotes(objectName)}' AND Field = '${escapeSingleQuotes(fieldName)}'` +
          ` AND ${permission} = true`,
      );
      const grants = grantsFromRows(fls.records, permission);
      let truncated = fls.truncated;
      if (target.access === 'read') {
        // View All Fields on the object grants Read on every field, regardless of field-level security.
        const viewAllFields = await objectGrants(conn, objectName, OBJECT_ACCESS.viewallfields.field);
        grants.push(...viewAllFields.grants);
        truncated = truncated || viewAllFields.truncated;
      }
      const required = await objectGrants(conn, objectName, permission);
      return { grants, truncated, required, target: fieldName, description, notes };
    }
    case 'systemPermission': {
      const { field, name } = await resolveSystemPermission(conn, target);
      const found = await permissionSetGrants(conn, field);
      return { ...found, target: name, description: `the ${name} system permission`, notes: [] };
    }
    case 'apexClass':
    case 'apexPage':
    case 'customPermission': {
      const { id, targetName, config } = await resolveSetupEntity(conn, target);
      const access = await queryAll<GrantRow>(
        conn,
        `SELECT ParentId, ${PARENT_FIELDS} FROM SetupEntityAccess WHERE SetupEntityId = '${escapeSingleQuotes(id)}'`,
      );
      const grants: Grant[] = access.records.map((row) => ({
        permissionSetId: row.ParentId,
        record: row.Parent ?? {},
        permission: 'SetupEntityAccess',
      }));
      let truncated = access.truncated;
      const notes: string[] = [];
      if (config.impliedBy) {
        const implied = await permissionSetGrants(conn, config.impliedBy.field);
        if (implied.grants.length > 0) notes.push(config.impliedBy.note);
        grants.push(...implied.grants);
        truncated = truncated || implied.truncated;
      }
      return {
        grants,
        truncated,
        target: targetName,
        description: `access to the ${config.label} ${targetName}`,
        notes,
      };
    }
  }
}

async function loadGroupLabels(conn: Connection, grants: readonly Grant[]): Promise<Map<string, string>> {
  const groupIds = [
    ...new Set(grants.map((grant) => grant.record.PermissionSetGroupId).filter((id): id is string => !!id)),
  ];
  const { records } = await queryByIds<{ Id: string; MasterLabel?: string; DeveloperName?: string }>(
    conn,
    groupIds,
    (idList) => `SELECT Id, MasterLabel, DeveloperName FROM PermissionSetGroup WHERE Id IN ${idList}`,
  );
  return new Map(records.map((group) => [group.Id, group.MasterLabel ?? group.DeveloperName ?? group.Id]));
}

/**
 * Returns the assignments that give users the granted permission sets. Permission set group
 * assignments are matched by group, because a group's permissions live on its own permission set.
 */
async function loadAssignments(
  conn: Connection,
  grants: readonly Grant[],
  includeInactive: boolean,
): Promise<{ byGrant: Map<Grant, AssignmentRow[]>; truncated: boolean }> {
  const activeFilter = includeInactive ? '' : ' AND Assignee.IsActive = true';
  const fields =
    'SELECT AssigneeId, PermissionSetId, PermissionSetGroupId, Assignee.Username, Assignee.Name, ' +
    'Assignee.IsActive, Assignee.Profile.Name FROM PermissionSetAssignment';
  const groupGrants = grants.filter((grant) => grant.record.PermissionSetGroupId);
  const directGrants = grants.filter((grant) => !grant.record.PermissionSetGroupId);

  const direct = await queryByIds<AssignmentRow>(
    conn,
    [...new Set(directGrants.map((grant) => grant.permissionSetId))],
    (idList) => `${fields} WHERE PermissionSetId IN ${idList} AND PermissionSetGroupId = null${activeFilter}`,
  );
  const grouped = await queryByIds<AssignmentRow>(
    conn,
    [...new Set(groupGrants.map((grant) => grant.record.PermissionSetGroupId!))],
    (idList) => `${fields} WHERE PermissionSetGroupId IN ${idList}${activeFilter}`,
  );

  const byGrant = new Map<Grant, AssignmentRow[]>();
  for (const grant of directGrants) {
    byGrant.set(
      grant,
      direct.records.filter((row) => row.PermissionSetId === grant.permissionSetId),
    );
  }
  for (const grant of groupGrants) {
    byGrant.set(
      grant,
      grouped.records.filter((row) => row.PermissionSetGroupId === grant.record.PermissionSetGroupId),
    );
  }
  return { byGrant, truncated: direct.truncated || grouped.truncated };
}

function toUser(row: AssignmentRow): UserSummary {
  return {
    id: row.AssigneeId,
    username: row.Assignee?.Username ?? '',
    name: row.Assignee?.Name ?? '',
    isActive: row.Assignee?.IsActive ?? false,
    profileName: row.Assignee?.Profile?.Name ?? '',
  };
}

function parseLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_USER_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_USER_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_USER_LIMIT}.`);
  }
  return value;
}

/**
 * Reverse permission lookup: finds the users who have a specific permission, and the profiles,
 * permission sets, and permission set groups that grant it. Answers questions such as "who can
 * edit Account.AnnualRevenue?" or "who has Modify All Data?".
 */
export async function whoHasPermission(conn: Connection, args: WhoHasPermissionArgs): Promise<WhoHasPermissionResult> {
  const target = parseTarget(args);
  const limit = parseLimit(args.limit);
  const includeInactive = args.includeInactive === true;

  const found = await findGrants(conn, target);
  const allGrants = [...found.grants, ...(found.required?.grants ?? [])];
  const groupLabels = await loadGroupLabels(conn, allGrants);
  const assignments = await loadAssignments(conn, allGrants, includeInactive);

  // For field checks, users also need the object permission, which can come from another source.
  const requiredUsers = found.required
    ? new Set(
        found.required.grants.flatMap((grant) => (assignments.byGrant.get(grant) ?? []).map((row) => row.AssigneeId)),
      )
    : undefined;
  const collected = collectUsers(found.grants, assignments.byGrant, groupLabels, requiredUsers);
  const users = collected.users;
  // Sources nobody matching is assigned to would bury the relevant ones, so only count them.
  const sources = collected.sources.filter((source) => source.userCount > 0);
  const unassignedSources = collected.sources.length - sources.length;

  const truncated = found.truncated || (found.required?.truncated ?? false) || assignments.truncated;
  const notes = buildNotes(found, { unassignedSources, includeInactive, truncated });

  const count = users.length;
  const access = target.type === 'object' || target.type === 'field' ? target.access : undefined;
  return {
    check: { type: target.type, target: found.target, ...(access ? { access } : {}) },
    summary: `${count} ${includeInactive ? '' : 'active '}${count === 1 ? 'user has' : 'users have'} ${found.description}.`,
    userCount: count,
    users: users.slice(0, limit),
    usersTruncated: count > limit || truncated,
    sources,
    unassignedSourceCount: unassignedSources,
    notes,
  };
}

function buildNotes(
  found: GrantSet & { required?: unknown },
  options: { unassignedSources: number; includeInactive: boolean; truncated: boolean },
): string[] {
  const notes = [...found.notes];
  const unassigned = options.unassignedSources;
  if (unassigned > 0) {
    notes.push(
      unassigned === 1
        ? '1 other profile or permission set grants the access, but no matching user is assigned to it.'
        : `${unassigned} other profiles or permission sets grant the access, but no matching user is assigned to them.`,
    );
  }
  if (found.required && found.grants.length > 0) {
    notes.push('Only users who also have the matching permission on the object are included.');
  }
  if (!options.includeInactive) notes.push('Inactive users are excluded.');
  if (options.truncated) notes.push('Some queries hit the row limit, so the user list may be incomplete.');
  return notes;
}

/**
 * Groups the assigned users by grant. `requiredUsers`, when given, limits the result to users who
 * also have the required object permission.
 */
function collectUsers(
  grants: readonly Grant[],
  byGrant: ReadonlyMap<Grant, AssignmentRow[]>,
  groupLabels: ReadonlyMap<string, string>,
  requiredUsers: ReadonlySet<string> | undefined,
): { users: WhoHasUser[]; sources: WhoHasSource[] } {
  const users = new Map<string, WhoHasUser>();
  const sources: WhoHasSource[] = [];
  const sourceIndex = new Map<string, { source: WhoHasSource; userIds: Set<string> }>();
  for (const grant of grants) {
    const source = toSource(grant.record, grant.permission, groupLabels);
    const key = `${source.type}|${source.name}|${source.permission}`;
    let entry = sourceIndex.get(key);
    if (!entry) {
      entry = { source: { ...source, userCount: 0 }, userIds: new Set() };
      sourceIndex.set(key, entry);
      sources.push(entry.source);
    }
    const sourceLabel = `${SOURCE_LABELS[source.type]} "${source.name}"`;
    for (const row of byGrant.get(grant) ?? []) {
      if (requiredUsers && !requiredUsers.has(row.AssigneeId)) continue;
      entry.userIds.add(row.AssigneeId);
      const user = users.get(row.AssigneeId) ?? { ...toUser(row), sources: [] };
      if (!user.sources.includes(sourceLabel)) user.sources.push(sourceLabel);
      users.set(row.AssigneeId, user);
    }
    entry.source.userCount = entry.userIds.size;
  }

  sources.sort((a, b) => b.userCount - a.userCount || a.name.localeCompare(b.name));
  return { users: [...users.values()].sort((a, b) => a.username.localeCompare(b.username)), sources };
}
