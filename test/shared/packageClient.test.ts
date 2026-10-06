import { expect } from 'chai';
import sinon from 'sinon';
import {
  compareVersions,
  comparePackages,
  fetchPackageVersions,
  findLatestReleasedVersions,
  formatVersion,
  getInstalledPackages,
  getPackageVersionReleaseState,
  installPackageVersion,
  parsePackageVersions,
  RFLIB_PROJECT_URL,
  type InstalledPackage,
  type LatestReleasedPackageVersion,
  type PackageVersion,
  type PackageVersionHistory,
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

function latest(
  name: string,
  major: number,
  minor: number,
  patch: number,
  build: number,
): LatestReleasedPackageVersion {
  return {
    name,
    latest: { name, versionId: '04tKY0000005Sv1YAE', version: { major, minor, patch, build } },
    unreleased: [],
  };
}

function version(name: string, alias: string, versionId: string): PackageVersion {
  const [major, minor, patch, build] = alias.split(/[.-]/).map(Number);
  return { name, versionId, version: { major, minor, patch, build } };
}

/** Answers SubscriberPackageVersion queries with the release state configured for each 04t ID. */
function releaseStateQuery(states: Record<string, string>): (soql: string) => unknown[] {
  return (soql) => {
    const id = /WHERE Id = '(?<id>04t\w+)'/.exec(soql)?.groups?.id ?? '';
    return id in states ? [{ Id: id, ReleaseState: states[id] }] : [];
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

  describe('parsePackageVersions', () => {
    it('returns every version of each package, newest first, in packageDirectories order', () => {
      const result = parsePackageVersions(sampleProject);

      expect(
        result.map((pkg) => [pkg.name, pkg.versions.map((v) => `${formatVersion(v.version)}=${v.versionId}`)]),
      ).to.deep.equal([
        ['RFLIB', ['11.3.1-1=04tKY0000005Sv1YAE', '11.3.0-1=04tKY0000005SuhYAE', '9.4.0-1=04tKY000000xX6HYAU']],
        ['RFLIB-FS', ['4.0.0-1=04tKY0000005SfyYAE']],
        ['RFLIB-TF', ['4.0.0-2=04tKY0000005SoJYAU', '4.0.0-1=04tKY0000005SfjYAE']],
        // Packages without a package directory entry come last.
        ['RFLIB-PHAROS', ['1.0.0-5=04tKY000000xhxmYAA']],
      ]);
      expect(result[0].versions[0].name).to.equal('RFLIB');
    });

    it('compares versions numerically rather than alphabetically', () => {
      const result = parsePackageVersions({
        packageAliases: { 'RFLIB@9.4.0-1': '04tKY000000xX6HYAU', 'RFLIB@10.0.0-1': '04tKY000000xdPOYAY' },
      });

      expect(result).to.have.lengthOf(1);
      expect(result[0].versions.map((v) => v.versionId)).to.deep.equal(['04tKY000000xdPOYAY', '04tKY000000xX6HYAU']);
    });

    it('ignores package IDs, malformed aliases, and non-04t values', () => {
      const result = parsePackageVersions({
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
          versions: [
            { name: 'RFLIB', versionId: '04t3h000002rTGPAA2', version: { major: 1, minor: 0, patch: 0, build: 1 } },
          ],
        },
      ]);
    });

    it('sorts packages without a package directory alphabetically', () => {
      const result = parsePackageVersions({
        packageAliases: { 'ZETA@1.0.0-1': '04tKY000000xdPOYAY', 'ALPHA@1.0.0-1': '04tKY000000xX6HYAU' },
      });

      expect(result.map((pkg) => pkg.name)).to.deep.equal(['ALPHA', 'ZETA']);
    });

    it('throws when the project has no packageAliases', () => {
      expect(() => parsePackageVersions({ packageDirectories: [] })).to.throw('does not contain any package aliases');
      expect(() => parsePackageVersions(null)).to.throw('does not contain any package aliases');
    });
  });

  describe('fetchPackageVersions', () => {
    afterEach(() => sinon.restore());

    it('downloads and parses the RFLIB project definition', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify(sampleProject)));

      const result = await fetchPackageVersions();

      expect(fetchStub.calledOnceWith(RFLIB_PROJECT_URL)).to.equal(true);
      expect(result.map((pkg) => pkg.name)).to.deep.equal(['RFLIB', 'RFLIB-FS', 'RFLIB-TF', 'RFLIB-PHAROS']);
    });

    it('reports HTTP errors', async () => {
      sinon.stub(globalThis, 'fetch').resolves(new Response('missing', { status: 404, statusText: 'Not Found' }));

      try {
        await fetchPackageVersions('https://example.com/sfdx-project.json');
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('ProjectDownloadFailed');
        expect((err as Error).message).to.include('HTTP 404 Not Found');
      }
    });

    it('reports network errors', async () => {
      sinon.stub(globalThis, 'fetch').rejects(new Error('getaddrinfo ENOTFOUND'));

      try {
        await fetchPackageVersions();
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('ProjectDownloadFailed');
        expect((err as Error).message).to.include('ENOTFOUND');
      }
    });

    it('reports invalid JSON', async () => {
      sinon.stub(globalThis, 'fetch').resolves(new Response('<html>'));

      try {
        await fetchPackageVersions();
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
    it('returns only the requested packages, matching names case-insensitively', async () => {
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
      const { conn } = buildMockConnection({
        tooling: { query: () => [row('RFLIB'), row('rflib-fs'), row('Other Package')] },
      });

      const result = await getInstalledPackages(conn, ['RFLIB-FS', 'rflib', 'RFLIB-TF']);

      expect(result.map((pkg) => pkg.name)).to.deep.equal(['RFLIB', 'rflib-fs']);
    });

    it('returns an empty list when the filter is empty', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: () => [{ SubscriberPackageId: '033000000000001', SubscriberPackage: { Name: 'RFLIB' } }] },
      });

      expect(await getInstalledPackages(conn, [])).to.deep.equal([]);
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

    it('treats an installed version newer than the repository version as up to date', () => {
      const [result] = comparePackages([latest('RFLIB', 11, 3, 1, 1)], [installed('RFLIB', 11, 3, 1, 2)]);
      expect(result.status).to.equal('UpToDate');
    });

    it('reports the skipped unreleased versions next to the latest released version', () => {
      const [result] = comparePackages(
        [
          {
            ...latest('RFLIB', 11, 3, 1, 1),
            unreleased: [{ ...version('RFLIB', '11.4.0-1', '04tKY0000005SvfYAE'), releaseState: 'Beta' }],
          },
        ],
        [installed('RFLIB', 11, 3, 1, 1)],
      );

      expect(result).to.deep.include({
        status: 'UpToDate',
        latestVersion: '11.3.1-1',
        unreleasedVersions: [{ version: '11.4.0-1', versionId: '04tKY0000005SvfYAE', releaseState: 'Beta' }],
      });
    });

    it('reports installed packages without any released version', () => {
      const unreleased = [{ ...version('RFLIB-NEW', '1.0.0-1', '04tKY000000xhxmYAA'), releaseState: 'Beta' as const }];
      const result = comparePackages(
        [
          { name: 'RFLIB-NEW', unreleased },
          { name: 'RFLIB-OTHER', unreleased },
        ],
        [installed('RFLIB-NEW', 1, 0, 0, 1)],
      );

      expect(result.map((pkg) => pkg.status)).to.deep.equal(['NoReleasedVersion', 'NotInstalled']);
      expect(result[0]).to.not.have.any.keys('latestVersion', 'latestVersionId');
      expect(result[0].installedVersion).to.equal('1.0.0-1');
    });
  });

  describe('getPackageVersionReleaseState', () => {
    it('queries the release state of the version through the Tooling API', async () => {
      const { conn, calls } = buildMockConnection({
        tooling: { query: releaseStateQuery({ '04tKY0000005SoJYAU': 'Released' }) },
      });

      expect(await getPackageVersionReleaseState(conn, '04tKY0000005SoJYAU')).to.equal('Released');
      expect(calls.toolingQueries).to.deep.equal([
        "SELECT Id, ReleaseState FROM SubscriberPackageVersion WHERE Id = '04tKY0000005SoJYAU'",
      ]);
    });

    it('treats every release state other than Released as beta', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: releaseStateQuery({ '04tKY0000005SfjYAE': 'Beta', '04tKY0000005SvfYAE': '' }) },
      });

      expect(await getPackageVersionReleaseState(conn, '04tKY0000005SfjYAE')).to.equal('Beta');
      expect(await getPackageVersionReleaseState(conn, '04tKY0000005SvfYAE')).to.equal('Beta');
    });

    it('reports versions without a record as not found', async () => {
      const { conn } = buildMockConnection({ tooling: { query: () => [] } });

      expect(await getPackageVersionReleaseState(conn, '04tKY0000005SfjYAE')).to.equal('NotFound');
    });

    it('wraps query errors, such as an ID that Salesforce does not know', async () => {
      const { conn } = buildMockConnection({
        tooling: {
          query: () => {
            throw new Error('invalid parameter value');
          },
        },
      });

      try {
        await getPackageVersionReleaseState(conn, '04tKY0000005SfjYAE');
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('ReleaseStateCheckFailed');
        expect((err as Error).message).to.equal(
          'Unable to check whether package version 04tKY0000005SfjYAE is released: invalid parameter value',
        );
      }
    });

    it('rejects values that are not package version IDs before querying the org', async () => {
      const { conn, calls } = buildMockConnection({});

      try {
        await getPackageVersionReleaseState(conn, "04t' OR Id != '");
        expect.fail('expected an error');
      } catch (err) {
        expect((err as Error).name).to.equal('InvalidPackageVersionId');
      }
      expect(calls.toolingQueries).to.deep.equal([]);
    });
  });

  describe('findLatestReleasedVersions', () => {
    const histories: PackageVersionHistory[] = [
      {
        name: 'RFLIB',
        versions: [
          version('RFLIB', '11.4.0-2', '04tKY0000005SvkYAE'),
          version('RFLIB', '11.4.0-1', '04tKY0000005SvfYAE'),
          version('RFLIB', '11.3.1-1', '04tKY0000005Sv1YAE'),
          version('RFLIB', '11.3.0-1', '04tKY0000005SuhYAE'),
        ],
      },
      { name: 'RFLIB-FS', versions: [version('RFLIB-FS', '4.0.0-1', '04tKY0000005SfyYAE')] },
      {
        name: 'RFLIB-TF',
        versions: [
          version('RFLIB-TF', '4.0.0-2', '04tKY0000005SoJYAU'),
          version('RFLIB-TF', '4.0.0-1', '04tKY0000005SfjYAE'),
        ],
      },
    ];

    it('only checks the newest version when it is released', async () => {
      const { conn, calls } = buildMockConnection({
        tooling: {
          query: releaseStateQuery({
            '04tKY0000005SvkYAE': 'Released',
            '04tKY0000005SfyYAE': 'Released',
            '04tKY0000005SoJYAU': 'Released',
          }),
        },
      });

      const result = await findLatestReleasedVersions(conn, histories);

      expect(result.map((pkg) => [pkg.name, pkg.latest?.versionId, pkg.unreleased])).to.deep.equal([
        ['RFLIB', '04tKY0000005SvkYAE', []],
        ['RFLIB-FS', '04tKY0000005SfyYAE', []],
        ['RFLIB-TF', '04tKY0000005SoJYAU', []],
      ]);
      expect(calls.toolingQueries).to.have.lengthOf(3);
    });

    it('falls back to the newest released version and returns the skipped versions', async () => {
      const { conn, calls } = buildMockConnection({
        tooling: {
          query: releaseStateQuery({
            '04tKY0000005SvkYAE': 'Beta',
            // 04tKY0000005SvfYAE has no record and is skipped as well.
            '04tKY0000005Sv1YAE': 'Released',
            '04tKY0000005SuhYAE': 'Released',
            '04tKY0000005SfyYAE': 'Released',
            '04tKY0000005SoJYAU': 'Released',
          }),
        },
      });

      const [rflib, rflibFs] = await findLatestReleasedVersions(conn, histories);

      expect(rflib.latest).to.deep.equal(version('RFLIB', '11.3.1-1', '04tKY0000005Sv1YAE'));
      expect(rflib.unreleased).to.deep.equal([
        { ...version('RFLIB', '11.4.0-2', '04tKY0000005SvkYAE'), releaseState: 'Beta' },
        { ...version('RFLIB', '11.4.0-1', '04tKY0000005SvfYAE'), releaseState: 'NotFound' },
      ]);
      expect(rflibFs.unreleased).to.deep.equal([]);
      // Older versions than the released one aren't queried.
      expect(calls.toolingQueries.some((soql) => soql.includes('04tKY0000005SuhYAE'))).to.equal(false);
    });

    it('returns no latest version when none of the versions is released', async () => {
      const { conn } = buildMockConnection({
        tooling: { query: releaseStateQuery({ '04tKY0000005SoJYAU': 'Beta', '04tKY0000005SfjYAE': 'Beta' }) },
      });

      const [result] = await findLatestReleasedVersions(conn, [histories[2]]);

      expect(result.latest).to.equal(undefined);
      expect(result.unreleased.map((pkg) => pkg.versionId)).to.deep.equal(['04tKY0000005SoJYAU', '04tKY0000005SfjYAE']);
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
