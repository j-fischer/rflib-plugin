import { setTimeout as sleep } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { SfError } from '@salesforce/core';

/** Human-facing location of the RFLIB source repository. */
export const RFLIB_REPOSITORY_URL = 'https://github.com/j-fischer/rflib';

/** Raw sfdx-project.json of the RFLIB repository; its packageAliases list every released package version. */
export const RFLIB_PROJECT_URL = 'https://raw.githubusercontent.com/j-fischer/rflib/master/sfdx-project.json';

const PACKAGE_VERSION_ALIAS = /^(?<name>.+)@(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)-(?<build>\d+)$/;
const PACKAGE_VERSION_ID = /^04t(?:[a-zA-Z0-9]{12}|[a-zA-Z0-9]{15})$/;
const DEFAULT_POLL_INTERVAL_MS = 5000;

const INSTALLED_PACKAGES_QUERY =
  'SELECT SubscriberPackageId, SubscriberPackage.Name, SubscriberPackageVersion.Id, ' +
  'SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, ' +
  'SubscriberPackageVersion.PatchVersion, SubscriberPackageVersion.BuildNumber ' +
  'FROM InstalledSubscriberPackage';

export type PackageVersionNumber = {
  major: number;
  minor: number;
  patch: number;
  build: number;
};

export type LatestPackageVersion = {
  name: string;
  version: PackageVersionNumber;
  versionId: string;
  /** Every version ID the project lists for this package, used to recognize the package once installed. */
  knownVersionIds: string[];
};

export type InstalledPackage = {
  name: string;
  subscriberPackageId: string;
  version: PackageVersionNumber;
  versionId: string;
};

export type PackageComparisonStatus = 'NotInstalled' | 'UpToDate' | 'UpgradeAvailable';

export type PackageComparison = {
  name: string;
  status: PackageComparisonStatus;
  latestVersion: string;
  latestVersionId: string;
  installedVersion?: string;
  installedVersionId?: string;
};

export type PackageInstallStatus = 'SUCCESS' | 'ERROR' | 'IN_PROGRESS' | 'UNKNOWN';

export type PackageInstallResult = {
  requestId: string;
  status: PackageInstallStatus;
  errors: string[];
};

export type InstallPackageOptions = {
  /** Minutes to wait for the installation to finish. 0 submits the request without waiting. */
  waitMinutes: number;
  /** Milliseconds between status checks while waiting. */
  pollIntervalMs?: number;
  /** Invoked with the request status after every status check. */
  onStatus?: (status: PackageInstallStatus) => void;
};

type SfdxProjectLite = {
  packageDirectories?: Array<{ package?: unknown }>;
  packageAliases?: Record<string, unknown>;
};

type InstalledSubscriberPackageRow = {
  SubscriberPackageId: string;
  SubscriberPackage?: { Name?: string } | null;
  SubscriberPackageVersion?: {
    Id?: string;
    MajorVersion?: number;
    MinorVersion?: number;
    PatchVersion?: number;
    BuildNumber?: number;
  } | null;
};

type ToolingSaveResult = {
  success: boolean;
  id?: string;
  errors?: Array<string | { message?: string }>;
};

type PackageInstallRequestRow = {
  Status?: PackageInstallStatus;
  Errors?: { errors?: Array<{ message?: string }> } | null;
};

/**
 * Formats a package version the way RFLIB package aliases do, e.g. `11.3.1-1`.
 */
export function formatVersion(version: PackageVersionNumber): string {
  return `${version.major}.${version.minor}.${version.patch}-${version.build}`;
}

/**
 * Orders two package versions by major, minor, patch, and build number.
 *
 * @returns a negative number if `a` is older, a positive number if `a` is newer, 0 if equal.
 */
export function compareVersions(a: PackageVersionNumber, b: PackageVersionNumber): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || a.build - b.build;
}

/**
 * Extracts the newest version of every package from an sfdx-project.json definition.
 * Packages are returned in packageDirectories order, which RFLIB keeps in dependency order
 * (RFLIB before RFLIB-FS before RFLIB-TF), so upgrades can be installed sequentially.
 */
export function parseLatestPackageVersions(project: unknown): LatestPackageVersion[] {
  const aliases = (project as SfdxProjectLite | null)?.packageAliases;
  if (!aliases || typeof aliases !== 'object') {
    throw new SfError('The RFLIB project definition does not contain any package aliases.', 'InvalidProjectDefinition');
  }

  const latestByName = new Map<string, LatestPackageVersion>();
  const versionIdsByName = new Map<string, string[]>();
  for (const [alias, versionId] of Object.entries(aliases)) {
    const candidate = toLatestPackageVersion(alias, versionId);
    if (!candidate) continue;

    versionIdsByName.set(candidate.name, [...(versionIdsByName.get(candidate.name) ?? []), candidate.versionId]);
    if (isNewer(candidate, latestByName.get(candidate.name))) {
      latestByName.set(candidate.name, candidate);
    }
  }
  for (const pkg of latestByName.values()) {
    pkg.knownVersionIds = versionIdsByName.get(pkg.name) ?? [pkg.versionId];
  }

  return sortByDependencyOrder([...latestByName.values()], project as SfdxProjectLite);
}

/**
 * Downloads the RFLIB sfdx-project.json and returns the latest version of each package.
 */
export async function fetchLatestPackageVersions(url: string = RFLIB_PROJECT_URL): Promise<LatestPackageVersion[]> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new SfError(
      `Unable to download the RFLIB project definition from ${url}: ${errorMessage(error)}`,
      'ProjectDownloadFailed',
      ['Check your network connection and proxy settings.'],
    );
  }
  if (!response.ok) {
    throw new SfError(
      `Unable to download the RFLIB project definition from ${url}: HTTP ${response.status} ${response.statusText}`,
      'ProjectDownloadFailed',
    );
  }

  let project: unknown;
  try {
    project = await response.json();
  } catch (error) {
    throw new SfError(
      `The RFLIB project definition at ${url} is not valid JSON: ${errorMessage(error)}`,
      'InvalidProjectDefinition',
    );
  }
  return parseLatestPackageVersions(project);
}

/**
 * Retrieves the packages installed in an org together with their current versions, using the
 * Tooling API. Commands that need to know what is installed (for example, to check that RFLIB is
 * present before running) should reuse this function rather than querying the org themselves.
 *
 * @param conn connection to the org to inspect.
 * @param packageNames optional package names to limit the result to, such as the names returned by
 * fetchLatestPackageVersions(). Names are compared with packageNamesMatch(). Every installed package
 * is returned when omitted.
 */
export async function getInstalledPackages(
  conn: Connection,
  packageNames?: readonly string[],
): Promise<InstalledPackage[]> {
  const result = await conn.tooling.query<InstalledSubscriberPackageRow>(INSTALLED_PACKAGES_QUERY, {
    autoFetch: true,
  });
  const packages = result.records.map(toInstalledPackage);
  if (!packageNames) return packages;

  const wanted = new Set(packageNames.map(normalizePackageName));
  return packages.filter((pkg) => wanted.has(normalizePackageName(pkg.name)));
}

/**
 * Tells whether two package names refer to the same package. The comparison ignores case and treats
 * hyphens, underscores, and whitespace as the same separator, because the subscriber package name in
 * an org does not always match the package alias in sfdx-project.json (RFLIB-TF installs as RFLIB_TF).
 */
export function packageNamesMatch(a: string, b: string): boolean {
  return normalizePackageName(a) === normalizePackageName(b);
}

/**
 * Matches each latest package version to its installed package. An installed version whose ID the
 * project lists for the package identifies it reliably; otherwise the package names are compared
 * with packageNamesMatch().
 */
export function comparePackages(latest: LatestPackageVersion[], installed: InstalledPackage[]): PackageComparison[] {
  return latest.map((pkg): PackageComparison => {
    const base = {
      name: pkg.name,
      latestVersion: formatVersion(pkg.version),
      latestVersionId: pkg.versionId,
    };
    const current = findInstalledPackage(pkg, installed);
    if (!current) return { ...base, status: 'NotInstalled' };

    return {
      ...base,
      status: compareVersions(current.version, pkg.version) < 0 ? 'UpgradeAvailable' : 'UpToDate',
      installedVersion: formatVersion(current.version),
      installedVersionId: current.versionId,
    };
  });
}

/**
 * Installs a package version by creating a PackageInstallRequest through the Tooling API,
 * using the same defaults as `sf package install`, and waits for it to finish.
 *
 * @returns the final request status, or IN_PROGRESS if the wait time elapsed first.
 */
export async function installPackageVersion(
  conn: Connection,
  versionId: string,
  options: InstallPackageOptions,
): Promise<PackageInstallResult> {
  if (!PACKAGE_VERSION_ID.test(versionId)) {
    throw new SfError(`Invalid package version ID "${versionId}".`, 'InvalidPackageVersionId');
  }

  const saveResult = (await conn.tooling.create('PackageInstallRequest', {
    SubscriberPackageVersionKey: versionId,
    ApexCompileType: 'all',
    EnableRss: false,
    NameConflictResolution: 'Block',
    PackageInstallSource: 'U',
    SecurityType: 'None',
    UpgradeType: 'mixed-mode',
  })) as ToolingSaveResult;

  if (!saveResult.success || !saveResult.id) {
    const reasons = (saveResult.errors ?? []).map((e) => (typeof e === 'string' ? e : (e.message ?? ''))).join('; ');
    throw new SfError(
      `Failed to request the installation of package version ${versionId}: ${reasons || 'Unknown error'}`,
      'PackageInstallRequestFailed',
    );
  }

  return waitForInstall(conn, saveResult.id, options);
}

async function waitForInstall(
  conn: Connection,
  requestId: string,
  options: InstallPackageOptions,
): Promise<PackageInstallResult> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + Math.max(0, options.waitMinutes) * 60 * 1000;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const request = (await conn.tooling.retrieve('PackageInstallRequest', requestId)) as PackageInstallRequestRow;
    const status = request.Status ?? 'UNKNOWN';
    options.onStatus?.(status);

    if (status === 'SUCCESS' || status === 'ERROR') {
      const errors = (request.Errors?.errors ?? []).map((e) => e.message ?? '').filter(Boolean);
      return { requestId, status, errors };
    }
    if (Date.now() >= deadline) {
      return { requestId, status: 'IN_PROGRESS', errors: [] };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(pollIntervalMs);
  }
}

function findInstalledPackage(pkg: LatestPackageVersion, installed: InstalledPackage[]): InstalledPackage | undefined {
  const knownVersionIds = new Set(pkg.knownVersionIds.map(toShortId));
  return (
    installed.find((candidate) => knownVersionIds.has(toShortId(candidate.versionId))) ??
    installed.find((candidate) => packageNamesMatch(candidate.name, pkg.name))
  );
}

function normalizePackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
}

/** Salesforce IDs are case-sensitive in their 15-character form; the 18-character form only adds a checksum. */
function toShortId(id: string): string {
  return id.slice(0, 15);
}

function toInstalledPackage(row: InstalledSubscriberPackageRow): InstalledPackage {
  const version = row.SubscriberPackageVersion;
  return {
    name: row.SubscriberPackage?.Name ?? '',
    subscriberPackageId: row.SubscriberPackageId,
    versionId: version?.Id ?? '',
    version: {
      major: version?.MajorVersion ?? 0,
      minor: version?.MinorVersion ?? 0,
      patch: version?.PatchVersion ?? 0,
      build: version?.BuildNumber ?? 0,
    },
  };
}

function toLatestPackageVersion(alias: string, versionId: unknown): LatestPackageVersion | undefined {
  const groups = PACKAGE_VERSION_ALIAS.exec(alias)?.groups;
  if (!groups || typeof versionId !== 'string' || !PACKAGE_VERSION_ID.test(versionId)) return undefined;

  return {
    name: groups.name,
    versionId,
    knownVersionIds: [versionId],
    version: {
      major: Number(groups.major),
      minor: Number(groups.minor),
      patch: Number(groups.patch),
      build: Number(groups.build),
    },
  };
}

function isNewer(candidate: LatestPackageVersion, current: LatestPackageVersion | undefined): boolean {
  return !current || compareVersions(candidate.version, current.version) > 0;
}

function sortByDependencyOrder(packages: LatestPackageVersion[], project: SfdxProjectLite): LatestPackageVersion[] {
  const directoryOrder = (project.packageDirectories ?? [])
    .map((dir) => dir.package)
    .filter((name): name is string => typeof name === 'string');
  const rank = (name: string): number => {
    const index = directoryOrder.indexOf(name);
    return index === -1 ? directoryOrder.length : index;
  };

  return packages.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
