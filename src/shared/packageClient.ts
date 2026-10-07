import { setTimeout as sleep } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { SfError } from '@salesforce/core';

/** Human-facing location of the RFLIB source repository. */
export const RFLIB_REPOSITORY_URL = 'https://github.com/j-fischer/rflib';

/**
 * Raw sfdx-project.json of the RFLIB repository. Its packageAliases list every package version that
 * was created, including versions that haven't been promoted to released versions yet.
 */
export const RFLIB_PROJECT_URL = 'https://raw.githubusercontent.com/j-fischer/rflib/master/sfdx-project.json';

/**
 * Custom label holding the RFLIB version, e.g. `11.4.0`. RFLIB ships it with its source, so it also
 * exists in orgs where RFLIB was deployed as unpackaged source rather than installed as a package.
 */
export const RFLIB_VERSION_LABEL = 'RFLIB_Version';

const PACKAGE_VERSION_ALIAS = /^(?<name>.+)@(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)-(?<build>\d+)$/;
const PACKAGE_VERSION_ID = /^04t(?:[a-zA-Z0-9]{12}|[a-zA-Z0-9]{15})$/;
const VERSION_LABEL_VALUE = /^\s*v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[.-](?<build>\d+))?\s*$/i;
const DEFAULT_POLL_INTERVAL_MS = 5000;

const INSTALLED_PACKAGES_QUERY =
  'SELECT SubscriberPackageId, SubscriberPackage.Name, SubscriberPackageVersion.Id, ' +
  'SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, ' +
  'SubscriberPackageVersion.PatchVersion, SubscriberPackageVersion.BuildNumber ' +
  'FROM InstalledSubscriberPackage';

const RELEASE_STATE_QUERY = 'SELECT Id, ReleaseState FROM SubscriberPackageVersion WHERE Id = ';

const RFLIB_VERSION_LABEL_QUERY = `SELECT Value FROM ExternalString WHERE Name = '${RFLIB_VERSION_LABEL}'`;

export type PackageVersionNumber = {
  major: number;
  minor: number;
  patch: number;
  build: number;
};

export type PackageVersion = {
  name: string;
  version: PackageVersionNumber;
  versionId: string;
};

/** Every version of one package listed in the RFLIB project definition, newest first. */
export type PackageVersionHistory = {
  name: string;
  versions: PackageVersion[];
};

/**
 * Release state of a package version as reported by Salesforce. NotFound means the query returned
 * no record for the version.
 */
export type PackageReleaseState = 'Released' | 'Beta' | 'NotFound';

export type UnreleasedPackageVersion = PackageVersion & {
  releaseState: Exclude<PackageReleaseState, 'Released'>;
};

export type LatestReleasedPackageVersion = {
  name: string;
  /** The newest released version, or undefined if none of the listed versions is released. */
  latest?: PackageVersion;
  /** Versions newer than `latest` that were skipped because they aren't released, newest first. */
  unreleased: UnreleasedPackageVersion[];
  /** Every version ID the project lists for this package, used to recognize the package once installed. */
  knownVersionIds: string[];
};

export type InstalledPackage = {
  name: string;
  subscriberPackageId: string;
  version: PackageVersionNumber;
  versionId: string;
};

export type PackageComparisonStatus = 'NotInstalled' | 'UpToDate' | 'UpgradeAvailable' | 'NoReleasedVersion';

export type UnreleasedVersionInfo = {
  version: string;
  versionId: string;
  releaseState: UnreleasedPackageVersion['releaseState'];
};

export type PackageComparison = {
  name: string;
  status: PackageComparisonStatus;
  /** The newest released version. Missing only if no released version of the package exists. */
  latestVersion?: string;
  latestVersionId?: string;
  installedVersion?: string;
  installedVersionId?: string;
  /** Newer versions that were skipped because they aren't released. Missing if there are none. */
  unreleasedVersions?: UnreleasedVersionInfo[];
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

type SubscriberPackageVersionRow = {
  Id: string;
  ReleaseState?: string;
};

type ExternalStringRow = {
  Value?: string | null;
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
 * Extracts every version of every package from an sfdx-project.json definition, newest first.
 * Packages are returned in packageDirectories order, which RFLIB keeps in dependency order
 * (RFLIB before RFLIB-FS before RFLIB-TF), so upgrades can be installed sequentially.
 *
 * The aliases don't say whether a version is released: RFLIB adds the alias when the version is
 * created and promotes it later. Use findLatestReleasedVersions() to pick the versions to install.
 */
export function parsePackageVersions(project: unknown): PackageVersionHistory[] {
  const aliases = (project as SfdxProjectLite | null)?.packageAliases;
  if (!aliases || typeof aliases !== 'object') {
    throw new SfError('The RFLIB project definition does not contain any package aliases.', 'InvalidProjectDefinition');
  }

  const versionsByName = new Map<string, PackageVersion[]>();
  for (const [alias, versionId] of Object.entries(aliases)) {
    const candidate = toPackageVersion(alias, versionId);
    if (!candidate) continue;
    const versions = versionsByName.get(candidate.name) ?? [];
    versions.push(candidate);
    versionsByName.set(candidate.name, versions);
  }

  const histories = [...versionsByName].map(([name, versions]) => ({
    name,
    versions: versions.sort((a, b) => compareVersions(b.version, a.version)),
  }));
  return sortByDependencyOrder(histories, project as SfdxProjectLite);
}

/**
 * Downloads the RFLIB sfdx-project.json and returns every version of each package, newest first.
 * The result includes versions that aren't released yet; see parsePackageVersions().
 */
export async function fetchPackageVersions(url: string = RFLIB_PROJECT_URL): Promise<PackageVersionHistory[]> {
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
  return parsePackageVersions(project);
}

/**
 * Asks Salesforce, through the Tooling API of the given org, whether a package version is released.
 * Salesforce is the authority here: `sf package version promote` is what turns a beta version into
 * a released one, and Salesforce refuses to install beta versions in production orgs.
 *
 * @throws ReleaseStateCheckFailed if the query fails, which is also what Salesforce does for an ID
 * it doesn't know.
 */
export async function getPackageVersionReleaseState(conn: Connection, versionId: string): Promise<PackageReleaseState> {
  assertPackageVersionId(versionId);

  let rows: SubscriberPackageVersionRow[];
  try {
    rows = (await conn.tooling.query<SubscriberPackageVersionRow>(`${RELEASE_STATE_QUERY}'${versionId}'`)).records;
  } catch (error) {
    throw new SfError(
      `Unable to check whether package version ${versionId} is released: ${errorMessage(error)}`,
      'ReleaseStateCheckFailed',
    );
  }

  const row = rows[0];
  if (!row) return 'NotFound';
  return row.ReleaseState === 'Released' ? 'Released' : 'Beta';
}

/**
 * Finds the newest released version of each package. Versions are checked newest first, so usually
 * only the newest one is queried; unreleased versions are skipped and returned in `unreleased`.
 * Packages keep their order, so the dependency order of parsePackageVersions() is preserved.
 */
export async function findLatestReleasedVersions(
  conn: Connection,
  histories: PackageVersionHistory[],
): Promise<LatestReleasedPackageVersion[]> {
  return Promise.all(histories.map((history) => findLatestReleasedVersion(conn, history)));
}

/**
 * Retrieves the packages installed in an org together with their current versions, using the
 * Tooling API. Commands that need to know what is installed (for example, to check that RFLIB is
 * present before running) should reuse this function rather than querying the org themselves.
 *
 * @param conn connection to the org to inspect.
 * @param packageNames optional package names to limit the result to, such as the names returned by
 * fetchPackageVersions(). Names are compared with packageNamesMatch(). Every installed package is
 * returned when omitted.
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
 * Reads the RFLIB version from the RFLIB_Version custom label deployed to an org, using the Tooling
 * API. Use it as a fallback for orgs where RFLIB is not installed as a package, such as development
 * orgs that RFLIB was deployed to as source.
 *
 * @returns the version, with build number 0 unless the label includes one, or undefined if the label
 * does not exist or does not contain a version number.
 */
export async function getRflibVersionFromLabel(conn: Connection): Promise<PackageVersionNumber | undefined> {
  const result = await conn.tooling.query<ExternalStringRow>(RFLIB_VERSION_LABEL_QUERY);
  return result.records.map((row) => parseVersionLabel(row.Value ?? '')).find((version) => version !== undefined);
}

/**
 * Parses a version label such as `11.4.0`, `v11.4.0`, or `11.4.0.1`.
 */
export function parseVersionLabel(value: string): PackageVersionNumber | undefined {
  const groups = VERSION_LABEL_VALUE.exec(value)?.groups;
  if (!groups) return undefined;

  return {
    major: Number(groups.major),
    minor: Number(groups.minor),
    patch: Number(groups.patch),
    build: Number(groups.build ?? 0),
  };
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
 * Matches the latest released version of each package to its installed package. An installed version
 * whose ID the project lists for the package identifies it reliably; otherwise the package names are
 * compared with packageNamesMatch().
 */
export function comparePackages(
  latest: LatestReleasedPackageVersion[],
  installed: InstalledPackage[],
): PackageComparison[] {
  return latest.map((pkg): PackageComparison => {
    const current = findInstalledPackage(pkg, installed);
    const comparison: PackageComparison = { name: pkg.name, status: comparisonStatus(pkg.latest, current) };
    if (pkg.latest) {
      comparison.latestVersion = formatVersion(pkg.latest.version);
      comparison.latestVersionId = pkg.latest.versionId;
    }
    if (current) {
      comparison.installedVersion = formatVersion(current.version);
      comparison.installedVersionId = current.versionId;
    }
    if (pkg.unreleased.length > 0) {
      comparison.unreleasedVersions = pkg.unreleased.map((version) => ({
        version: formatVersion(version.version),
        versionId: version.versionId,
        releaseState: version.releaseState,
      }));
    }
    return comparison;
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
  assertPackageVersionId(versionId);

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

async function findLatestReleasedVersion(
  conn: Connection,
  history: PackageVersionHistory,
): Promise<LatestReleasedPackageVersion> {
  const unreleased: UnreleasedPackageVersion[] = [];
  const knownVersionIds = history.versions.map((version) => version.versionId);
  for (const version of history.versions) {
    // eslint-disable-next-line no-await-in-loop
    const releaseState = await getPackageVersionReleaseState(conn, version.versionId);
    if (releaseState === 'Released') return { name: history.name, latest: version, unreleased, knownVersionIds };
    unreleased.push({ ...version, releaseState });
  }
  return { name: history.name, unreleased, knownVersionIds };
}

function findInstalledPackage(
  pkg: LatestReleasedPackageVersion,
  installed: InstalledPackage[],
): InstalledPackage | undefined {
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

function comparisonStatus(
  latest: PackageVersion | undefined,
  current: InstalledPackage | undefined,
): PackageComparisonStatus {
  if (!current) return 'NotInstalled';
  if (!latest) return 'NoReleasedVersion';
  return compareVersions(current.version, latest.version) < 0 ? 'UpgradeAvailable' : 'UpToDate';
}

/** Rejects anything but a package version ID before it is used in SOQL or an install request. */
function assertPackageVersionId(versionId: string): void {
  if (!PACKAGE_VERSION_ID.test(versionId)) {
    throw new SfError(`Invalid package version ID "${versionId}".`, 'InvalidPackageVersionId');
  }
}

function toPackageVersion(alias: string, versionId: unknown): PackageVersion | undefined {
  const groups = PACKAGE_VERSION_ALIAS.exec(alias)?.groups;
  if (!groups || typeof versionId !== 'string' || !PACKAGE_VERSION_ID.test(versionId)) return undefined;

  return {
    name: groups.name,
    versionId,
    version: {
      major: Number(groups.major),
      minor: Number(groups.minor),
      patch: Number(groups.patch),
      build: Number(groups.build),
    },
  };
}

function sortByDependencyOrder(packages: PackageVersionHistory[], project: SfdxProjectLite): PackageVersionHistory[] {
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
