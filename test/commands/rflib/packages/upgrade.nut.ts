import { expect } from 'chai';
import { SfCommand, stubSfCommandUx } from '@salesforce/sf-plugins-core';
import type { SinonStub } from 'sinon';
import RflibPackagesUpgrade from '../../../../src/commands/rflib/packages/upgrade.js';
import { RFLIB_PROJECT_URL } from '../../../../src/shared/packageClient.js';
import { setupNut } from '../../../helpers/nutTestContext.js';

const LATEST_RFLIB_ID = '04tKY0000005Sv1YAE';
const LATEST_FS_ID = '04tKY0000005SfyYAE';
const LATEST_TF_ID = '04tKY0000005SoJYAU';

const rflibProject = {
  packageDirectories: [
    { package: 'RFLIB' },
    { package: 'RFLIB-FS' },
    { package: 'RFLIB-TF' },
    { package: 'RFLIB-PHAROS' },
  ],
  packageAliases: {
    RFLIB: '0Ho3h000000Kz8aCAC',
    'RFLIB@11.2.0-1': '04tKY0000005SpvYAE',
    'RFLIB@11.3.1-1': LATEST_RFLIB_ID,
    'RFLIB-FS@4.0.0-1': LATEST_FS_ID,
    'RFLIB-TF@4.0.0-1': '04tKY0000005SfjYAE',
    'RFLIB-TF@4.0.0-2': LATEST_TF_ID,
    'RFLIB-PHAROS@1.0.0-5': '04tKY000000xhxmYAA',
  },
};

type InstalledRow = {
  SubscriberPackageId: string;
  SubscriberPackage: { Name: string };
  SubscriberPackageVersion: {
    Id: string;
    MajorVersion: number;
    MinorVersion: number;
    PatchVersion: number;
    BuildNumber: number;
  };
};

function installedRow(name: string, version: string): InstalledRow {
  const [major, minor, patch, build] = version.split(/[.-]/).map(Number);
  return {
    SubscriberPackageId: `033${name.padEnd(12, '0').slice(0, 12)}`,
    SubscriberPackage: { Name: name },
    SubscriberPackageVersion: {
      Id: '04t000000000001',
      MajorVersion: major,
      MinorVersion: minor,
      PatchVersion: patch,
      BuildNumber: build,
    },
  };
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('rflib packages upgrade NUTs', () => {
  let installedRows: InstalledRow[] = [];
  let installStatusByVersion: Record<string, { Status: string; Errors?: { errors: Array<{ message: string }> } }> = {};

  const harness = setupNut({
    tooling: {
      // Every package version in rflibProject is released.
      query: (soql) =>
        soql.includes('FROM SubscriberPackageVersion')
          ? [{ Id: /'(?<id>04t\w+)'/.exec(soql)?.groups?.id, ReleaseState: 'Released' }]
          : installedRows,
      create: (object, record) =>
        Promise.resolve({ success: true, id: `0Hf${String(record.SubscriberPackageVersionKey).slice(3, 15)}` }),
      retrieve: (object, id) => {
        const versionId = Object.keys(installStatusByVersion).find((key) => id === `0Hf${key.slice(3, 15)}`);
        return Promise.resolve(installStatusByVersion[versionId ?? ''] ?? { Status: 'SUCCESS' });
      },
    },
  });

  let uxStubs: ReturnType<typeof stubSfCommandUx>;
  let confirmStub: SinonStub;
  let fetchStub: SinonStub;

  beforeEach(() => {
    installedRows = [
      installedRow('RFLIB', '11.2.0-1'),
      installedRow('RFLIB-FS', '4.0.0-1'),
      installedRow('RFLIB-TF', '4.0.0-1'),
    ];
    installStatusByVersion = {};
    uxStubs = stubSfCommandUx(harness.$$.SANDBOX);
    confirmStub = harness.$$.SANDBOX.stub(SfCommand.prototype, 'confirm').resolves(true);
    fetchStub = harness.$$.SANDBOX.stub(globalThis, 'fetch').callsFake((input) =>
      Promise.resolve(
        requestUrl(input) === RFLIB_PROJECT_URL
          ? new Response(JSON.stringify(rflibProject))
          : new Response('not found', { status: 404, statusText: 'Not Found' }),
      ),
    );
  });

  const logged = (): string => uxStubs.log.args.flat().join('\n');
  const installedVersionKeys = (): unknown[] =>
    harness.toolingCreates.map((create) => create.record.SubscriberPackageVersionKey);

  it('reports available upgrades and not installed packages without installing on --dryrun', async () => {
    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--dryrun']);

    expect(fetchStub.calledWith(RFLIB_PROJECT_URL)).to.equal(true);
    expect(harness.toolingQueries[0]).to.include('FROM InstalledSubscriberPackage');
    expect(result.source).to.equal('https://github.com/j-fischer/rflib');
    expect(result.packages.map((pkg) => [pkg.name, pkg.status])).to.deep.equal([
      ['RFLIB', 'UpgradeAvailable'],
      ['RFLIB-FS', 'UpToDate'],
      ['RFLIB-TF', 'UpgradeAvailable'],
      ['RFLIB-PHAROS', 'NotInstalled'],
    ]);
    expect(result.packages[0]).to.include({ installedVersion: '11.2.0-1', latestVersion: '11.3.1-1' });

    expect(confirmStub.called).to.equal(false);
    expect(harness.toolingCreates).to.deep.equal([]);

    const table = uxStubs.table.firstCall.args[0];
    expect(table.data.map((row) => row.name)).to.deep.equal(['RFLIB', 'RFLIB-FS', 'RFLIB-TF']);
    expect(logged()).to.include(
      'RFLIB-PHAROS is not installed in the target org. The latest released version is 1.0.0-5',
    );
    expect(logged()).to.include('Dry run: no upgrades were installed.');
  });

  it('prompts for each available upgrade and installs the confirmed ones in dependency order', async () => {
    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

    expect(confirmStub.callCount).to.equal(2);
    expect(confirmStub.firstCall.args[0]).to.include({ message: 'Upgrade RFLIB from 11.2.0-1 to 11.3.1-1' });
    expect(confirmStub.secondCall.args[0]).to.include({ message: 'Upgrade RFLIB-TF from 4.0.0-1 to 4.0.0-2' });

    expect(harness.toolingCreates.map((create) => create.object)).to.deep.equal([
      'PackageInstallRequest',
      'PackageInstallRequest',
    ]);
    expect(installedVersionKeys()).to.deep.equal([LATEST_RFLIB_ID, LATEST_TF_ID]);

    const rflib = result.packages[0];
    expect(rflib).to.include({
      status: 'Upgraded',
      installedVersion: '11.3.1-1',
      installedVersionId: LATEST_RFLIB_ID,
      message: 'Upgraded to 11.3.1-1.',
    });
    expect(rflib.installRequestId).to.match(/^0Hf/);
    expect(result.packages[3].status).to.equal('NotInstalled');
    expect(logged()).to.include('RFLIB-TF: Upgraded to 4.0.0-2.');
  });

  it('does not install upgrades the user declines', async () => {
    confirmStub.onFirstCall().resolves(false);

    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

    expect(result.packages[0]).to.include({ status: 'Declined', installedVersion: '11.2.0-1' });
    expect(result.packages[2].status).to.equal('Upgraded');
    expect(installedVersionKeys()).to.deep.equal([LATEST_TF_ID]);
  });

  it('installs every available upgrade without prompting when --no-prompt is set', async () => {
    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);

    expect(confirmStub.called).to.equal(false);
    expect(installedVersionKeys()).to.deep.equal([LATEST_RFLIB_ID, LATEST_TF_ID]);
    expect(result.packages.filter((pkg) => pkg.status === 'Upgraded')).to.have.lengthOf(2);
  });

  it('never prompts or installs under --json unless --no-prompt is set', async () => {
    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--json']);

    expect(confirmStub.called).to.equal(false);
    expect(harness.toolingCreates).to.deep.equal([]);
    expect(result.packages[0]).to.include({
      status: 'UpgradeAvailable',
      message: 'Upgrade available but not installed.',
    });
  });

  it('fails with the installation errors and skips the remaining upgrades', async () => {
    installStatusByVersion[LATEST_RFLIB_ID] = {
      Status: 'ERROR',
      Errors: { errors: [{ message: 'Apex compile failure' }] },
    };

    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);
      expect.fail('expected an error');
    } catch (err) {
      const error = err as Error & { data?: { packages: Array<{ name: string; status: string; message?: string }> } };
      expect(error.name).to.equal('PackageUpgradeFailed');
      expect(error.message).to.include(
        'The upgrade of RFLIB did not succeed. Installation failed: Apex compile failure',
      );
      expect(error.data?.packages.map((pkg) => [pkg.name, pkg.status])).to.deep.equal([
        ['RFLIB', 'Failed'],
        ['RFLIB-FS', 'UpToDate'],
        ['RFLIB-TF', 'Skipped'],
        ['RFLIB-PHAROS', 'NotInstalled'],
      ]);
      expect(error.data?.packages[2].message).to.equal('Skipped because the upgrade of RFLIB did not complete.');
    }
    expect(installedVersionKeys()).to.deep.equal([LATEST_RFLIB_ID]);
  });

  it('reports an installation that is still running after the wait time and skips the rest', async () => {
    installStatusByVersion[LATEST_RFLIB_ID] = { Status: 'IN_PROGRESS' };

    const result = await RflibPackagesUpgrade.run([
      '--target-org',
      harness.testOrg.username,
      '--no-prompt',
      '--wait',
      '0',
    ]);

    expect(result.packages[0].status).to.equal('InProgress');
    expect(result.packages[0].message).to.include('sf package install report --request-id 0Hf');
    expect(result.packages[2].status).to.equal('Skipped');
    expect(installedVersionKeys()).to.deep.equal([LATEST_RFLIB_ID]);
  });

  it('only prints messages when no RFLIB packages are installed', async () => {
    installedRows = [installedRow('Some Other Package', '1.0.0-1')];

    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

    expect(result.packages.every((pkg) => pkg.status === 'NotInstalled')).to.equal(true);
    expect(confirmStub.called).to.equal(false);
    expect(harness.toolingCreates).to.deep.equal([]);
    expect(uxStubs.table.called).to.equal(false);
    expect(logged()).to.include('RFLIB is not installed in the target org. The latest released version is 11.3.1-1');
    expect(logged()).to.include('No RFLIB packages are installed in the target org.');
  });

  it('reports when all installed packages are up to date', async () => {
    installedRows = [installedRow('RFLIB', '11.3.1-1'), installedRow('RFLIB-FS', '4.0.0-1')];

    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

    expect(result.packages.map((pkg) => pkg.status)).to.deep.equal([
      'UpToDate',
      'UpToDate',
      'NotInstalled',
      'NotInstalled',
    ]);
    expect(confirmStub.called).to.equal(false);
    expect(logged()).to.include('All installed RFLIB packages are up to date.');
  });

  it('rejects --dryrun combined with --no-prompt', async () => {
    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--dryrun', '--no-prompt']);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.include('--no-prompt');
    }
  });
});
