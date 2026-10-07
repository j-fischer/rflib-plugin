import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError, type Connection } from '@salesforce/core';
import {
  comparePackages,
  fetchPackageVersions,
  findLatestReleasedVersions,
  getInstalledPackages,
  installPackageVersion,
  RFLIB_REPOSITORY_URL,
  type PackageComparison,
  type PackageComparisonStatus,
  type PackageInstallResult,
} from '../../../shared/packageClient.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.packages.upgrade');

const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

const STATUS_LABELS: Record<PackageComparisonStatus, string> = {
  NotInstalled: 'Not installed',
  UpToDate: 'Up to date',
  UpgradeAvailable: 'Upgrade available',
  NoReleasedVersion: 'No released version',
};

export type PackageUpgradeStatus =
  | PackageComparisonStatus
  | 'Declined'
  | 'Upgraded'
  | 'Failed'
  | 'InProgress'
  | 'Skipped';

export type PackageUpgradeInfo = Omit<PackageComparison, 'status'> & {
  status: PackageUpgradeStatus;
  message?: string;
  installRequestId?: string;
};

export type RflibPackagesUpgradeResult = {
  source: string;
  packages: PackageUpgradeInfo[];
};

/** How available upgrades are handled: install them, ask first, or only report them. */
type UpgradeMode = 'install' | 'prompt' | 'report';

/** A package with an available upgrade, which always has a latest released version. */
type UpgradeCandidate = PackageComparison & { latestVersion: string; latestVersionId: string };

function isUpgradeCandidate(pkg: PackageComparison): pkg is UpgradeCandidate {
  return pkg.status === 'UpgradeAvailable' && pkg.latestVersion !== undefined && pkg.latestVersionId !== undefined;
}

export default class RflibPackagesUpgrade extends SfCommand<RflibPackagesUpgradeResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg({
      summary: messages.getMessage('flags.target-org.summary'),
      description: messages.getMessage('flags.target-org.description'),
      char: 'o',
      required: true,
    }),
    dryrun: Flags.boolean({
      summary: messages.getMessage('flags.dryrun.summary'),
      description: messages.getMessage('flags.dryrun.description'),
      char: 'd',
      default: false,
      exclusive: ['no-prompt'],
    }),
    'no-prompt': Flags.boolean({
      summary: messages.getMessage('flags.no-prompt.summary'),
      description: messages.getMessage('flags.no-prompt.description'),
      char: 'r',
      default: false,
    }),
    wait: Flags.integer({
      summary: messages.getMessage('flags.wait.summary'),
      description: messages.getMessage('flags.wait.description'),
      char: 'w',
      min: 0,
      default: 30,
    }),
  };

  public async run(): Promise<RflibPackagesUpgradeResult> {
    const { flags } = await this.parse(RflibPackagesUpgrade);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start(messages.getMessage('spinner.retrieve'));
    // Package aliases are added to sfdx-project.json before the versions are promoted, so only
    // versions that Salesforce reports as released are offered.
    const [latest, installed] = await Promise.all([
      fetchPackageVersions().then((versions) => findLatestReleasedVersions(conn, versions)),
      getInstalledPackages(conn),
    ]);
    this.spinner.stop();

    const comparisons = comparePackages(latest, installed);
    this.reportComparisons(comparisons);

    const mode = this.resolveMode(flags.dryrun, flags['no-prompt']);
    const packages = await this.processUpgrades(conn, comparisons, mode, flags.wait);
    const result: RflibPackagesUpgradeResult = { source: RFLIB_REPOSITORY_URL, packages };

    const failed = packages.find((pkg) => pkg.status === 'Failed');
    if (failed) {
      const error = new SfError(
        messages.getMessage('error.upgradeFailed', [failed.name, failed.message ?? '']),
        'PackageUpgradeFailed',
      );
      error.setData(result);
      throw error;
    }
    return result;
  }

  private resolveMode(dryrun: boolean, noPrompt: boolean): UpgradeMode {
    if (dryrun) return 'report';
    if (noPrompt) return 'install';
    // Prompts can't be answered when the output is consumed as JSON.
    return this.jsonEnabled() ? 'report' : 'prompt';
  }

  private reportComparisons(comparisons: PackageComparison[]): void {
    this.log(messages.getMessage('info.source', [RFLIB_REPOSITORY_URL]));

    const installed = comparisons.filter((pkg) => pkg.status !== 'NotInstalled');
    if (installed.length > 0) {
      this.table({
        data: installed.map((pkg) => ({
          name: pkg.name,
          installedVersion: pkg.installedVersion ?? '',
          latestVersion: pkg.latestVersion ?? '',
          status: STATUS_LABELS[pkg.status],
        })),
        columns: [
          { key: 'name', name: 'Package' },
          { key: 'installedVersion', name: 'Installed Version' },
          { key: 'latestVersion', name: 'Latest Released Version' },
          { key: 'status', name: 'Status' },
        ],
      });
    }

    for (const pkg of comparisons) {
      if (!pkg.unreleasedVersions) continue;
      const versions = pkg.unreleasedVersions.map((unreleased) => unreleased.version).join(', ');
      this.log(
        pkg.latestVersion
          ? messages.getMessage('info.unreleased', [pkg.name, versions, pkg.latestVersion])
          : messages.getMessage('info.noReleasedVersion', [pkg.name, versions]),
      );
    }

    for (const pkg of comparisons.filter((p) => p.status === 'NotInstalled' && p.latestVersion)) {
      this.log(messages.getMessage('info.notInstalled', [pkg.name, pkg.latestVersion, pkg.latestVersionId]));
    }

    if (installed.length === 0) {
      this.log(messages.getMessage('info.noInstalledPackages'));
    } else if (installed.every((pkg) => pkg.status === 'UpToDate')) {
      this.log(messages.getMessage('info.upToDate'));
    }
  }

  /**
   * Walks the packages in dependency order and handles each available upgrade. Once an
   * installation does not complete, the remaining upgrades are skipped because they may
   * depend on it.
   */
  private async processUpgrades(
    conn: Connection,
    comparisons: PackageComparison[],
    mode: UpgradeMode,
    waitMinutes: number,
  ): Promise<PackageUpgradeInfo[]> {
    const results: PackageUpgradeInfo[] = [];
    let blockedBy: string | undefined;

    for (const pkg of comparisons) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await this.processPackage(conn, pkg, mode, waitMinutes, blockedBy);
      results.push(outcome);
      if (outcome.status === 'Failed' || outcome.status === 'InProgress') blockedBy ??= pkg.name;
    }

    if (mode === 'report' && results.some((pkg) => pkg.status === 'UpgradeAvailable')) {
      this.log(messages.getMessage(this.jsonEnabled() ? 'info.jsonWithoutNoPrompt' : 'info.dryrun'));
    }
    return results;
  }

  private async processPackage(
    conn: Connection,
    pkg: PackageComparison,
    mode: UpgradeMode,
    waitMinutes: number,
    blockedBy: string | undefined,
  ): Promise<PackageUpgradeInfo> {
    if (!isUpgradeCandidate(pkg)) return pkg;
    if (mode === 'report') return { ...pkg, message: messages.getMessage('status.notRequested') };

    let outcome: PackageUpgradeInfo;
    if (blockedBy) {
      outcome = { ...pkg, status: 'Skipped', message: messages.getMessage('status.skipped', [blockedBy]) };
    } else if (mode === 'prompt' && !(await this.confirmUpgrade(pkg))) {
      outcome = { ...pkg, status: 'Declined', message: messages.getMessage('status.declined') };
    } else {
      outcome = await this.installUpgrade(conn, pkg, waitMinutes);
    }

    this.log(`${pkg.name}: ${outcome.message ?? ''}`);
    return outcome;
  }

  private async confirmUpgrade(pkg: UpgradeCandidate): Promise<boolean> {
    return this.confirm({
      message: messages.getMessage('prompt.upgrade', [pkg.name, pkg.installedVersion ?? '', pkg.latestVersion]),
      ms: PROMPT_TIMEOUT_MS,
      defaultAnswer: false,
    });
  }

  private async installUpgrade(
    conn: Connection,
    pkg: UpgradeCandidate,
    waitMinutes: number,
  ): Promise<PackageUpgradeInfo> {
    this.spinner.start(messages.getMessage('spinner.install', [pkg.name, pkg.latestVersion]));

    let install: PackageInstallResult;
    try {
      install = await installPackageVersion(conn, pkg.latestVersionId, {
        waitMinutes,
        onStatus: (status) => {
          this.spinner.status = status;
        },
      });
    } catch (error) {
      this.spinner.stop('failed');
      const reason = error instanceof Error ? error.message : String(error);
      return { ...pkg, status: 'Failed', message: messages.getMessage('status.failed', [reason]) };
    }

    const installRequestId = install.requestId;
    if (install.status === 'SUCCESS') {
      this.spinner.stop('done');
      return {
        ...pkg,
        status: 'Upgraded',
        installedVersion: pkg.latestVersion,
        installedVersionId: pkg.latestVersionId,
        installRequestId,
        message: messages.getMessage('status.upgraded', [pkg.latestVersion]),
      };
    }
    if (install.status === 'IN_PROGRESS') {
      this.spinner.stop('in progress');
      return {
        ...pkg,
        status: 'InProgress',
        installRequestId,
        message: messages.getMessage('status.inProgress', [installRequestId]),
      };
    }

    this.spinner.stop('failed');
    const reason = install.errors.join('; ') || `Installation request ended with status ${install.status}`;
    return { ...pkg, status: 'Failed', installRequestId, message: messages.getMessage('status.failed', [reason]) };
  }
}
