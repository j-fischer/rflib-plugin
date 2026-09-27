import { expect } from 'chai';
import { SfCommand, stubSfCommandUx } from '@salesforce/sf-plugins-core';
import type { SinonStub } from 'sinon';
import RflibPackagesUpgrade from '../../../../src/commands/rflib/packages/upgrade.js';
import { setupNut } from '../../../helpers/nutTestContext.js';

const rflibProject = {
  packageDirectories: [{ package: 'RFLIB' }, { package: 'RFLIB-FS' }],
  packageAliases: {
    'RFLIB@11.3.1-1': '04tKY0000005Sv1YAE',
    'RFLIB-FS@4.0.0-1': '04tKY0000005SfyYAE',
  },
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

  const harness = setupNut({
    tooling: {
      query: () => [installedRflib],
      create: () => Promise.resolve(createResult),
      retrieve: () => Promise.resolve({ Status: 'SUCCESS' }),
    },
  });

  let uxStubs: ReturnType<typeof stubSfCommandUx>;
  let confirmStub: SinonStub;
  let fetchStub: SinonStub;

  beforeEach(() => {
    createResult = { success: true, id: '0Hf000000000001' };
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
      'RFLIB-FS is not installed in the target org. The latest version is 4.0.0-1 (04tKY0000005SfyYAE).',
    );
    expect(uxStubs.table.firstCall.args[0].data).to.deep.equal([
      { name: 'RFLIB', installedVersion: '11.0.0-1', latestVersion: '11.3.1-1', status: 'Upgrade available' },
    ]);
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
