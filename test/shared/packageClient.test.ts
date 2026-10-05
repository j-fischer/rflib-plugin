import { expect } from 'chai';
import sinon from 'sinon';
import {
  compareVersions,
  comparePackages,
  fetchLatestPackageVersions,
  formatVersion,
  getInstalledPackages,
  installPackageVersion,
  packageNamesMatch,
  parseLatestPackageVersions,
  RFLIB_PROJECT_URL,
  type InstalledPackage,
  type LatestPackageVersion,
} from '../../src/shared/packageClient.js';
import { buildMockConnection } from '../helpers/mockConnection.js';

const sampleProject = {
  packageDirectories: [
    { path: 'rflib', package: 'RFLIB' },
    { path: 'rflib-fs', package: 'RFLIB-FS' },
    { path: 'rflib-tf', package: 'RFLIB-TF' },
  ],
  packageAliases: {
    RFLIB: '0Ho3h000000Kz8aCAC',
    'RFLIB-FS': '0Ho3h000000KzKOCA0',
    'RFLIB-TF@4.0.0-1': '04tKY0000005SfjYAE',
    'RFLIB@9.4.0-1': '04tKY000000xX6HYAU',
    'RFLIB@11.3.1-1': '04tKY0000005Sv1YAE',
    'RFLIB@11.3.0-1': '04tKY0000005SuhYAE',
    'RFLIB-TF@4.0.0-2': '04tKY0000005SoJYAU',
    'RFLIB-FS@4.0.0-1': '04tKY0000005SfyYAE',
    'RFLIB-PHAROS@1.0.0-5': '04tKY000000xhxmYAA',
  },
};

function installed(name: string, major: number, minor: number, patch: number, build: number): InstalledPackage {
  return {
    name,
    subscriberPackageId: '033000000000001',
    versionId: '04t000000000001',
    version: { major, minor, patch, build },
  };
}

function latest(name: string, major: number, minor: number, patch: number, build: number): LatestPackageVersion {
  return {
    name,
    versionId: '04tKY0000005Sv1YAE',
    knownVersionIds: ['04tKY0000005Sv1YAE'],
    version: { major, minor, patch, build },
  };
}

describe('packageClient', () => {
  describe('formatVersion / compareVersions', () => {
    it('formats versions like RFLIB package aliases', () => {
      expect(formatVersion({ major: 11, minor: 3, patch: 1, build: 2 })).to.equal('11.3.1-2');
    });

    it('compares every version segment numerically', () => {
      const base = { major: 10, minor: 2, patch: 3, build: 4 };
      expect(compareVersions(base, { ...base })).to.equal(0);
      expect(compareVersions(base, { ...base, major: 9 })).to.be.greaterThan(0);
      expect(compareVersions(base, { ...base, minor: 10 })).to.be.lessThan(0);
      expect(compareVersions(base, { ...base, patch: 2 })).to.be.greaterThan(0);
      expect(compareVersions(base, { ...base, build: 5 })).to.be.lessThan(0);
    });
  });

  describe('parseLatestPackageVersions', () => {
    it('returns the newest version of each package in packageDirectories order', () => {
      const result = parseLatestPackageVersions(sampleProject);

      expect(result.map((pkg) => `${pkg.name}@${formatVersion(pkg.version)}=${pkg.versionId}`)).to.deep.equal([
        'RFLIB@11.3.1-1=04tKY0000005Sv1YAE',
        'RFLIB-FS@4.0.0-1=04tKY0000005SfyYAE',
        'RFLIB-TF@4.0.0-2=04tKY0000005SoJYAU',
        // Packages without a package directory entry come last.
        'RFLIB-PHAROS@1.0.0-5=04tKY000000xhxmYAA',
      ]);
    });

    it('lists every version ID of a package as known version IDs', () => {
      const result = parseLatestPackageVersions(sampleProject);

      expect(result.map((pkg) => [pkg.name, pkg.knownVersionIds])).to.deep.equal([
        ['RFLIB', ['04tKY000000xX6HYAU', '04tKY0000005Sv1YAE', '04tKY0000005SuhYAE']],
        ['RFLIB-FS', ['04tKY0000005SfyYAE']],
        ['RFLIB-TF', ['04tKY0000005SfjYAE', '04tKY0000005SoJYAU']],
        ['RFLIB-PHAROS', ['04tKY000000xhxmYAA']],
      ]);
    });

    it('compares versions numerically rather than alphabetically', () => {
      const result = parseLatestPackageVersions({
        packageAliases: { 'RFLIB@9.4.0-1': '04tKY000000xX6HYAU', 'RFLIB@10.0.0-1': '04tKY000000xdPOYAY' },
      });

      expect(result).to.have.lengthOf(1);
      expect(result[0].versionId).to.equal('04tKY000000xdPOYAY');
    });

    it('ignores package IDs, malformed aliases, and non-04t values', () => {
      const result = parseLatestPackageVersions({
        packageAliases: {
          RFLIB: '0Ho3h000000Kz8aCAC',
          'RFLIB@1.0': '04tKY000000xdPOYAY',
          'RFLIB@2.0.0-1': '0Ho3h000000Kz8aCAC',
          'RFLIB@3.0.0-1': 42,
          'RFLIB@1.0.0-1': '04t3h000002rTGPAA2',
        },
      });

      expect(result).to.deep.equal([
        {
          name: 'RFLIB',
          versionId: '04t3h000002rTGPAA2',
          knownVersionIds: ['04t3h000002rTGPAA2'],
          version: { major: 1, minor: 0, patch: 0, build: 1 },
        },
      ]);
    });

    it('sorts packages without a package directory alphabetically', () => {
      const result = parseLatestPackageVersions({
        packageAliases: { 'ZETA@1.0.0-1': '04tKY000000xdPOYAY', 'ALPHA@1.0.0-1': '04tKY000000xX6HYAU' },
      });

      expect(result.map((pkg) => pkg.name)).to.deep.equal(['ALPHA', 'ZETA']);
    });

    it('throws when the project has no packageAliases', () => {
      expect(() => parseLatestPackageVersions({ packageDirectories: [] })).to.throw(
        'does not contain any package aliases',
      );
      expect(() => parseLatestPackageVersions(null)).to.throw('does not contain any package aliases');
    });
  });

  describe('fetchLatestPackageVersions', () => {
    afterEach(() => sinon.restore());

    it('downloads and parses the RFLIB project definition', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify(sampleProject)));

      const result = await fetchLatestPackageVersions();

      expect(fetchStub.calledOnceWith(RFLIB_PROJECT_URL)).to.equal(true);
      expect(result.map((pkg) => pkg.name)).to.deep.equal(['RFLIB', 'RFLIB-FS', 'RFLIB-TF', 'RFLIB-PHAROS']);
    });

    it('reports HTTP errors', async () => {
      sinon.stub(globalThis, 'fetch').resolves(new Response('missing', { status: 404, statusText: 'Not Found' }));

      try {
        await fetchLatestPackageVersions('https://example.com/sfdx-project.json');
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('ProjectDownloadFailed');
        expect((err as Error).message).to.include('HTTP 404 Not Found');
      }
    });

    it('reports network errors', async () => {
      sinon.stub(globalThis, 'fetch').rejects(new Error('getaddrinfo ENOTFOUND'));

      try {
        await fetchLatestPackageVersions();
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('ProjectDownloadFailed');
        expect((err as Error).message).to.include('ENOTFOUND');
      }
    });

    it('reports invalid JSON', async () => {
      sinon.stub(globalThis, 'fetch').resolves(new Response('<html>'));

      try {
        await fetchLatestPackageVersions();
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('InvalidProjectDefinition');
      }
    });
  });

  describe('getInstalledPackages', () => {
    it('queries InstalledSubscriberPackage through the Tooling API and maps the rows', async () => {
      const { conn, calls } = buildMockConnection({
        tooling: {
          query: () => [
            {
              SubscriberPackageId: '033000000000001',
              SubscriberPackage: { Name: 'RFLIB' },
              SubscriberPackageVersion: {
                Id: '04tKY0000005SuhYAE',
                MajorVersion: 11,
                MinorVersion: 3,
                PatchVersion: 0,
                BuildNumber: 1,
              },
            },
            { SubscriberPackageId: '033000000000002', SubscriberPackage: null, SubscriberPackageVersion: null },
          ],
        },
      });

      const result = await getInstalledPackages(conn);

      expect(calls.toolingQueries).to.have.lengthOf(1);
      expect(calls.toolingQueries[0]).to.include('FROM InstalledSubscriberPackage');
      expect(calls.queries).to.deep.equal([]);
      expect(result).to.deep.equal([
        {
          name: 'RFLIB',
          subscriberPackageId: '033000000000001',
          versionId: '04tKY0000005SuhYAE',
          version: { major: 11, minor: 3, patch: 0, build: 1 },
        },
        {
          name: '',
          subscriberPackageId: '033000000000002',
          versionId: '',
          version: { major: 0, minor: 0, patch: 0, build: 0 },
        },
      ]);
    });
  });

  describe('getInstalledPackages with a package name filter', () => {
    const row = (name: string): Record<string, unknown> => ({
      SubscriberPackageId: '033000000000001',
      SubscriberPackage: { Name: name },
      SubscriberPackageVersion: {
        Id: '04t000000000001',
        MajorVersion: 1,
        MinorVersion: 0,
        PatchVersion: 0,
        BuildNumber: 1,
      },
    });

    it('returns only the requested packages, matching names case-insensitively', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: () => [row('RFLIB'), row('rflib-fs'), row('Other Package')] },
      });

      const result = await getInstalledPackages(conn, ['RFLIB-FS', 'rflib', 'RFLIB-TF']);

      expect(result.map((pkg) => pkg.name)).to.deep.equal(['RFLIB', 'rflib-fs']);
    });

    it('matches subscriber package names that use underscores instead of hyphens', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: () => [row('RFLIB'), row('RFLIB_FS'), row('RFLIB_TF')] },
      });

      expect((await getInstalledPackages(conn, ['RFLIB-TF'])).map((pkg) => pkg.name)).to.deep.equal(['RFLIB_TF']);
      // A plain RFLIB filter, as used by flow instrument, must not pick up the RFLIB extensions.
      expect((await getInstalledPackages(conn, ['RFLIB'])).map((pkg) => pkg.name)).to.deep.equal(['RFLIB']);
    });

    it('returns an empty list when the filter is empty', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: () => [{ SubscriberPackageId: '033000000000001', SubscriberPackage: { Name: 'RFLIB' } }] },
      });

      expect(await getInstalledPackages(conn, [])).to.deep.equal([]);
    });
  });

  describe('packageNamesMatch', () => {
    it('ignores case and treats hyphens, underscores, and whitespace as equivalent', () => {
      expect(packageNamesMatch('RFLIB-TF', 'RFLIB_TF')).to.equal(true);
      expect(packageNamesMatch('rflib-tf', 'RFLIB TF')).to.equal(true);
      expect(packageNamesMatch('RFLIB', 'rflib')).to.equal(true);
    });

    it('does not match different packages', () => {
      expect(packageNamesMatch('RFLIB', 'RFLIB-TF')).to.equal(false);
      expect(packageNamesMatch('RFLIB-FS', 'RFLIB-TF')).to.equal(false);
      expect(packageNamesMatch('RFLIBTF', 'RFLIB-TF')).to.equal(false);
    });
  });

  describe('comparePackages', () => {
    it('classifies each latest package as not installed, up to date, or upgradeable', () => {
      const result = comparePackages(
        [latest('RFLIB', 11, 3, 1, 1), latest('RFLIB-FS', 4, 0, 0, 1), latest('RFLIB-TF', 4, 0, 0, 2)],
        [installed('rflib', 11, 2, 0, 1), installed('RFLIB-FS', 4, 0, 0, 1), installed('Other Package', 1, 0, 0, 1)],
      );

      expect(result).to.deep.equal([
        {
          name: 'RFLIB',
          status: 'UpgradeAvailable',
          latestVersion: '11.3.1-1',
          latestVersionId: '04tKY0000005Sv1YAE',
          installedVersion: '11.2.0-1',
          installedVersionId: '04t000000000001',
        },
        {
          name: 'RFLIB-FS',
          status: 'UpToDate',
          latestVersion: '4.0.0-1',
          latestVersionId: '04tKY0000005Sv1YAE',
          installedVersion: '4.0.0-1',
          installedVersionId: '04t000000000001',
        },
        { name: 'RFLIB-TF', status: 'NotInstalled', latestVersion: '4.0.0-2', latestVersionId: '04tKY0000005Sv1YAE' },
      ]);
    });

    it('matches an installed RFLIB_TF package to the RFLIB-TF alias', () => {
      const [result] = comparePackages([latest('RFLIB-TF', 4, 0, 0, 2)], [installed('RFLIB_TF', 4, 0, 0, 1)]);

      expect(result).to.include({
        name: 'RFLIB-TF',
        status: 'UpgradeAvailable',
        installedVersion: '4.0.0-1',
        latestVersion: '4.0.0-2',
      });
    });

    it('matches an installed package by a known version ID regardless of its name', () => {
      const tf: LatestPackageVersion = {
        ...latest('RFLIB-TF', 4, 0, 0, 2),
        versionId: '04tKY0000005SoJYAU',
        knownVersionIds: ['04tKY0000005SfjYAE', '04tKY0000005SoJYAU'],
      };
      // The org returns the 18-character ID; the project may list the 15-character form, or vice versa.
      const renamed = { ...installed('RFLIB Trigger Framework', 4, 0, 0, 1), versionId: '04tKY0000005Sfj' };

      const [result] = comparePackages([tf], [installed('Other Package', 1, 0, 0, 1), renamed]);

      expect(result).to.include({
        status: 'UpgradeAvailable',
        installedVersion: '4.0.0-1',
        installedVersionId: '04tKY0000005Sfj',
      });
    });

    it('prefers a version ID match over a name match', () => {
      const rflib: LatestPackageVersion = { ...latest('RFLIB', 11, 3, 1, 1), knownVersionIds: ['04tKY0000005SuhYAE'] };
      const byId = { ...installed('Renamed RFLIB', 11, 3, 0, 1), versionId: '04tKY0000005SuhYAE' };

      const [result] = comparePackages([rflib], [installed('RFLIB', 1, 0, 0, 1), byId]);

      expect(result).to.include({ installedVersion: '11.3.0-1', installedVersionId: '04tKY0000005SuhYAE' });
    });

    it('treats an installed version newer than the repository version as up to date', () => {
      const [result] = comparePackages([latest('RFLIB', 11, 3, 1, 1)], [installed('RFLIB', 11, 3, 1, 2)]);
      expect(result.status).to.equal('UpToDate');
    });
  });

  describe('installPackageVersion', () => {
    it('creates a PackageInstallRequest with the sf package install defaults and waits for success', async () => {
      const statuses = ['IN_PROGRESS', 'IN_PROGRESS', 'SUCCESS'];
      const { conn, calls } = buildMockConnection({
        tooling: {
          create: () => ({ success: true, id: '0Hf000000000001' }),
          retrieve: () => ({ Status: statuses.shift() }),
        },
      });
      const reported: string[] = [];

      const result = await installPackageVersion(conn, '04tKY0000005Sv1YAE', {
        waitMinutes: 1,
        pollIntervalMs: 1,
        onStatus: (status) => reported.push(status),
      });

      expect(result).to.deep.equal({ requestId: '0Hf000000000001', status: 'SUCCESS', errors: [] });
      expect(calls.toolingCreates).to.deep.equal([
        {
          object: 'PackageInstallRequest',
          record: {
            SubscriberPackageVersionKey: '04tKY0000005Sv1YAE',
            ApexCompileType: 'all',
            EnableRss: false,
            NameConflictResolution: 'Block',
            PackageInstallSource: 'U',
            SecurityType: 'None',
            UpgradeType: 'mixed-mode',
          },
        },
      ]);
      expect(calls.toolingRetrieves).to.have.lengthOf(3);
      expect(calls.toolingRetrieves[0]).to.deep.equal({ object: 'PackageInstallRequest', id: '0Hf000000000001' });
      expect(reported).to.deep.equal(['IN_PROGRESS', 'IN_PROGRESS', 'SUCCESS']);
    });

    it('returns the installation errors when the request fails', async () => {
      const { conn } = buildMockConnection({
        tooling: {
          create: () => ({ success: true, id: '0Hf000000000001' }),
          retrieve: () => ({
            Status: 'ERROR',
            Errors: { errors: [{ message: 'Missing dependency RFLIB-FS' }, { message: 'Apex compile failure' }] },
          }),
        },
      });

      const result = await installPackageVersion(conn, '04tKY0000005SoJYAU', { waitMinutes: 1, pollIntervalMs: 1 });

      expect(result.status).to.equal('ERROR');
      expect(result.errors).to.deep.equal(['Missing dependency RFLIB-FS', 'Apex compile failure']);
    });

    it('stops waiting and reports IN_PROGRESS once the wait time elapses', async () => {
      const { conn, calls } = buildMockConnection({
        tooling: {
          create: () => ({ success: true, id: '0Hf000000000001' }),
          retrieve: () => ({ Status: 'IN_PROGRESS' }),
        },
      });

      const result = await installPackageVersion(conn, '04tKY0000005Sv1YAE', { waitMinutes: 0, pollIntervalMs: 1 });

      expect(result).to.deep.equal({ requestId: '0Hf000000000001', status: 'IN_PROGRESS', errors: [] });
      expect(calls.toolingRetrieves).to.have.lengthOf(1);
    });

    it('throws when the install request cannot be created', async () => {
      const { conn } = buildMockConnection({
        tooling: {
          create: () => ({ success: false, errors: [{ message: 'INSUFFICIENT_ACCESS' }, 'second error'] }),
        },
      });

      try {
        await installPackageVersion(conn, '04tKY0000005Sv1YAE', { waitMinutes: 1 });
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('PackageInstallRequestFailed');
        expect((err as Error).message).to.include('INSUFFICIENT_ACCESS; second error');
      }
    });

    it('rejects values that are not package version IDs before calling the org', async () => {
      const { conn, calls } = buildMockConnection({});

      try {
        await installPackageVersion(conn, "04t' OR Id != '", { waitMinutes: 1 });
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('InvalidPackageVersionId');
      }
      expect(calls.toolingCreates).to.deep.equal([]);
    });
  });
});
