import { expect } from 'chai';
import { SfCommand, stubSfCommandUx } from '@salesforce/sf-plugins-core';
import type { SinonStub } from 'sinon';
import RflibPackagesUpgrade from '../../../../src/commands/rflib/packages/upgrade.js';
import { setupNut } from '../../../helpers/nutTestContext.js';

const RFLIB_11_3_1 = '04tKY0000005Sv1YAE';
const RFLIB_11_4_0 = '04tKY0000005SvfYAE';
const RFLIB_FS_4_0_0 = '04tKY0000005SfyYAE';

const rflibProject = {
  packageDirectories: [{ package: 'RFLIB' }, { package: 'RFLIB-FS' }],
  packageAliases: {
    'RFLIB@11.3.1-1': RFLIB_11_3_1,
    'RFLIB-FS@4.0.0-1': RFLIB_FS_4_0_0,
  },
};

/** The project after RFLIB 11.4.0-1 was created, but before it was promoted. */
const projectWithBeta = {
  ...rflibProject,
  packageAliases: { ...rflibProject.packageAliases, 'RFLIB@11.4.0-1': RFLIB_11_4_0 },
};

const installedRflib = {
  SubscriberPackageId: '033000000000001',
  SubscriberPackage: { Name: 'RFLIB' },
  SubscriberPackageVersion: {
    Id: '04t000000000001',
    MajorVersion: 11,
    MinorVersion: 0,
    PatchVersion: 0,
    BuildNumber: 1,
  },
};

describe('rflib packages upgrade', () => {
  let createResult: { success: boolean; id?: string; errors?: Array<{ message?: string }> };
  let releaseStates: Record<string, string>;
  let releaseStateError: Error | undefined;

  const harness = setupNut({
    tooling: {
      query: (soql) => {
        if (!soql.includes('FROM SubscriberPackageVersion')) return [installedRflib];
        if (releaseStateError) throw releaseStateError;
        const id = /'(?<id>04t\w+)'/.exec(soql)?.groups?.id ?? '';
        return id in releaseStates ? [{ Id: id, ReleaseState: releaseStates[id] }] : [];
      },
      create: () => Promise.resolve(createResult),
      retrieve: () => Promise.resolve({ Status: 'SUCCESS' }),
    },
  });

  let uxStubs: ReturnType<typeof stubSfCommandUx>;
  let confirmStub: SinonStub;
  let fetchStub: SinonStub;

  beforeEach(() => {
    createResult = { success: true, id: '0Hf000000000001' };
    releaseStates = { [RFLIB_11_3_1]: 'Released', [RFLIB_11_4_0]: 'Beta', [RFLIB_FS_4_0_0]: 'Released' };
    releaseStateError = undefined;
    uxStubs = stubSfCommandUx(harness.$$.SANDBOX);
    confirmStub = harness.$$.SANDBOX.stub(SfCommand.prototype, 'confirm').resolves(true);
    fetchStub = harness.$$.SANDBOX.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify(rflibProject)));
  });

  it('asks for confirmation with a generous timeout and a default answer of no', async () => {
    await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

    expect(confirmStub.calledOnce).to.equal(true);
    expect(confirmStub.firstCall.args[0]).to.deep.equal({
      message: 'Upgrade RFLIB from 11.0.0-1 to 11.3.1-1',
      ms: 5 * 60 * 1000,
      defaultAnswer: false,
    });
  });

  it('prints the repository the versions come from and lists only installed packages in the table', async () => {
    await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--dryrun']);

    const logs = uxStubs.log.args.flat().join('\n');
    expect(logs).to.include('Latest RFLIB package versions are published in https://github.com/j-fischer/rflib.');
    expect(logs).to.include(
      'RFLIB-FS is not installed in the target org. The latest released version is 4.0.0-1 (04tKY0000005SfyYAE).',
    );
    expect(uxStubs.table.firstCall.args[0].data).to.deep.equal([
      { name: 'RFLIB', installedVersion: '11.0.0-1', latestVersion: '11.3.1-1', status: 'Upgrade available' },
    ]);
  });

  it('checks the release state of the newest version of each package', async () => {
    await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--dryrun']);

    const releaseStateQueries = harness.toolingQueries.filter((soql) => soql.includes('FROM SubscriberPackageVersion'));
    expect(releaseStateQueries).to.have.members([
      `SELECT Id, ReleaseState FROM SubscriberPackageVersion WHERE Id = '${RFLIB_11_3_1}'`,
      `SELECT Id, ReleaseState FROM SubscriberPackageVersion WHERE Id = '${RFLIB_FS_4_0_0}'`,
    ]);
  });

  describe('when the newest version is not released yet', () => {
    beforeEach(() => {
      fetchStub.resolves(new Response(JSON.stringify(projectWithBeta)));
    });

    it('offers and installs the newest released version instead', async () => {
      const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);

      expect(harness.toolingCreates.map((create) => create.record.SubscriberPackageVersionKey)).to.deep.equal([
        RFLIB_11_3_1,
      ]);
      expect(result.packages[0]).to.deep.include({
        status: 'Upgraded',
        latestVersion: '11.3.1-1',
        latestVersionId: RFLIB_11_3_1,
        unreleasedVersions: [{ version: '11.4.0-1', versionId: RFLIB_11_4_0, releaseState: 'Beta' }],
      });
    });

    it('reports the skipped version in the prompt, table, and messages', async () => {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);

      expect(confirmStub.firstCall.args[0]).to.include({ message: 'Upgrade RFLIB from 11.0.0-1 to 11.3.1-1' });
      expect(uxStubs.table.firstCall.args[0].data).to.deep.equal([
        { name: 'RFLIB', installedVersion: '11.0.0-1', latestVersion: '11.3.1-1', status: 'Upgrade available' },
      ]);
      expect(uxStubs.log.args.flat().join('\n')).to.include(
        "RFLIB: skipped version(s) 11.4.0-1 because they aren't released yet. The latest released version is 11.3.1-1.",
      );
    });

    it('reports the skipped version under --json without installing anything', async () => {
      const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--json']);

      expect(confirmStub.called).to.equal(false);
      expect(harness.toolingCreates).to.deep.equal([]);
      expect(result.packages[0]).to.deep.include({
        status: 'UpgradeAvailable',
        latestVersion: '11.3.1-1',
        unreleasedVersions: [{ version: '11.4.0-1', versionId: RFLIB_11_4_0, releaseState: 'Beta' }],
      });
    });

    it('installs the version once it is released', async () => {
      releaseStates[RFLIB_11_4_0] = 'Released';

      const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);

      expect(harness.toolingCreates.map((create) => create.record.SubscriberPackageVersionKey)).to.deep.equal([
        RFLIB_11_4_0,
      ]);
      expect(result.packages[0]).to.not.have.property('unreleasedVersions');
    });
  });

  it('does not offer an upgrade for a package without any released version', async () => {
    releaseStates = {};

    const result = await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);

    expect(harness.toolingCreates).to.deep.equal([]);
    expect(result.packages.map((pkg) => pkg.status)).to.deep.equal(['NoReleasedVersion', 'NotInstalled']);
    expect(uxStubs.table.firstCall.args[0].data).to.deep.equal([
      { name: 'RFLIB', installedVersion: '11.0.0-1', latestVersion: '', status: 'No released version' },
    ]);
    const logs = uxStubs.log.args.flat().join('\n');
    expect(logs).to.include(
      "RFLIB: skipped version(s) 11.3.1-1 because they aren't released yet. No released version is available.",
    );
    expect(logs).to.include(
      "RFLIB-FS: skipped version(s) 4.0.0-1 because they aren't released yet. No released version is available.",
    );
    expect(logs).to.not.include('RFLIB-FS is not installed');
  });

  it('fails without installing anything when the release state cannot be checked', async () => {
    releaseStateError = new Error('invalid parameter value');

    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).name).to.equal('ReleaseStateCheckFailed');
      expect((err as Error).message).to.include('invalid parameter value');
    }
    expect(confirmStub.called).to.equal(false);
    expect(harness.toolingCreates).to.deep.equal([]);
  });

  it('reports a rejected install request as a failed upgrade', async () => {
    createResult = { success: false, errors: [{ message: 'INSUFFICIENT_ACCESS' }] };

    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--no-prompt']);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).name).to.equal('PackageUpgradeFailed');
      expect((err as Error).message).to.include(
        'Failed to request the installation of package version 04tKY0000005Sv1YAE',
      );
      expect((err as Error).message).to.include('INSUFFICIENT_ACCESS');
    }
    expect(harness.toolingRetrieves).to.deep.equal([]);
  });

  it('fails without touching the org when the latest versions cannot be downloaded', async () => {
    fetchStub.resolves(new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }));

    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username]);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).name).to.equal('ProjectDownloadFailed');
      expect((err as Error).message).to.include('HTTP 429 Too Many Requests');
    }
    expect(confirmStub.called).to.equal(false);
    expect(harness.toolingCreates).to.deep.equal([]);
  });

  it('rejects a negative --wait value', async () => {
    try {
      await RflibPackagesUpgrade.run(['--target-org', harness.testOrg.username, '--wait', '-1']);
      expect.fail('expected an error');
    } catch (err) {
      expect((err as Error).message).to.match(/greater than or equal to 0/i);
    }
  });
});
