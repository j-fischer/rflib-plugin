/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection } from '@salesforce/core';
import { MockTestOrgData, TestContext } from '@salesforce/core/testSetup';
import type { SinonStub } from 'sinon';

export type StubbedDescribe = () => unknown;
export type StubbedSave = (record: Record<string, unknown>) => Promise<{ success: boolean; id?: string }>;
export type QueryShape =
  | unknown[]
  | { records: unknown[]; done: boolean; totalSize: number; nextRecordsUrl?: string };
export type StubbedQuery = (soql: string) => QueryShape;
export type StubbedQueryMore = (url: string) => QueryShape;

export type NutStubs = {
  query?: StubbedQuery;
  queryMore?: StubbedQueryMore;
  describe?: Record<string, StubbedDescribe>;
  create?: Record<string, StubbedSave>;
  update?: Record<string, StubbedSave>;
};

export type NutHarness = {
  $$: TestContext;
  testOrg: MockTestOrgData;
  /** Captured SOQL strings, in order. */
  queries: string[];
  /** Captured queryMore URLs, in order. */
  queryMoreUrls: string[];
  /** Captured create/update payloads, keyed by sobject name. */
  creates: Array<{ object: string; record: Record<string, unknown> }>;
  updates: Array<{ object: string; record: Record<string, unknown> }>;
  /** Reset captured calls between tests. */
  reset: () => void;
};

/**
 * Queries issued internally by @salesforce/sf-plugins-core or @salesforce/core when
 * resolving the --target-org flag (e.g. fetching org details from the Organization sObject).
 * These are framework-level queries and should not appear in test assertions that count or
 * inspect user-issued SOQL.
 */
const FRAMEWORK_QUERY_PATTERNS = [
  // sf-plugins-core ≥12.2.22 issues this to refresh org metadata after flag resolution.
  /^SELECT\s+Name\s*,\s*InstanceName\s*,\s*IsSandbox/i,
];

function isFrameworkQuery(soql: string): boolean {
  return FRAMEWORK_QUERY_PATTERNS.some((re) => re.test(soql));
}

/**
 * Sets up a TestContext with a mock-authed org and stubs Connection.prototype.query
 * and Connection.prototype.sobject so command invocations don't touch a real org.
 *
 * Call inside a describe() block; returns the harness for use inside before/beforeEach/it.
 */
export function setupNut(stubs: NutStubs): NutHarness {
  const $$ = new TestContext();
  const testOrg = new MockTestOrgData();
  const harness: NutHarness = {
    $$,
    testOrg,
    queries: [],
    queryMoreUrls: [],
    creates: [],
    updates: [],
    reset: () => {
      harness.queries.length = 0;
      harness.queryMoreUrls.length = 0;
      harness.creates.length = 0;
      harness.updates.length = 0;
    },
  };

  before(async () => {
    await $$.stubAuths(testOrg);
  });

  beforeEach(() => {
    harness.reset();

    const queryStub = $$.SANDBOX.stub(Connection.prototype, 'query') as unknown as SinonStub;
    queryStub.callsFake(async (soql: string) => {
      // Exclude framework-internal queries so test assertions only see user-issued SOQL.
      if (!isFrameworkQuery(soql)) {
        harness.queries.push(soql);
      }
      const value = stubs.query ? stubs.query(soql) : [];
      if (Array.isArray(value)) {
        return Promise.resolve({ records: value, done: true, totalSize: value.length });
      }
      return Promise.resolve(value);
    });

    const queryMoreStub = $$.SANDBOX.stub(Connection.prototype, 'queryMore') as unknown as SinonStub;
    queryMoreStub.callsFake(async (url: string) => {
      harness.queryMoreUrls.push(url);
      const value = stubs.queryMore ? stubs.queryMore(url) : [];
      if (Array.isArray(value)) {
        return Promise.resolve({ records: value, done: true, totalSize: value.length });
      }
      return Promise.resolve(value);
    });

    const sobjectStub = $$.SANDBOX.stub(Connection.prototype, 'sobject') as unknown as SinonStub;
    sobjectStub.callsFake((objectName: string) => ({
      describe: (): Promise<unknown> => {
        const fn = stubs.describe?.[objectName];
        return Promise.resolve(fn ? fn() : { fields: [] });
      },
      create: async (record: Record<string, unknown>) => {
        harness.creates.push({ object: objectName, record });
        const fn = stubs.create?.[objectName];
        return fn ? fn(record) : Promise.resolve({ success: true, id: 'a01CREATEDID0000' });
      },
      update: async (record: Record<string, unknown>) => {
        harness.updates.push({ object: objectName, record });
        const fn = stubs.update?.[objectName];
        return fn ? fn(record) : Promise.resolve({ success: true, id: (record.Id as string) ?? '' });
      },
    }));
  });

  afterEach(() => {
    $$.restore();
  });

  return harness;
}
