/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Connection } from '@salesforce/core';

export type QueryResultLike<T = unknown> = {
  records: T[];
  done: boolean;
  totalSize: number;
  nextRecordsUrl?: string;
};

export type QueryHandler = (soql: string) => unknown[] | QueryResultLike;
export type QueryMoreHandler = (url: string) => unknown[] | QueryResultLike;
export type DescribeHandler = () => unknown;
export type SaveResultLike = { success: boolean; id?: string; errors?: Array<{ message?: string }> };
export type SaveHandler = (record: Record<string, unknown>) => SaveResultLike | Promise<SaveResultLike>;
export type ToolingSaveResultLike = { success: boolean; id?: string; errors?: Array<string | { message?: string }> };
export type ToolingHandlers = {
  query?: QueryHandler;
  create?: (object: string, record: Record<string, unknown>) => ToolingSaveResultLike;
  retrieve?: (object: string, id: string) => unknown;
};

export type MockConnectionOptions = {
  query?: QueryHandler;
  queryMore?: QueryMoreHandler;
  describe?: DescribeHandler;
  create?: SaveHandler;
  update?: SaveHandler;
  tooling?: ToolingHandlers;
};

export type CapturedCalls = {
  queries: string[];
  queryMoreUrls: string[];
  describes: string[];
  creates: Array<{ object: string; record: Record<string, unknown> }>;
  updates: Array<{ object: string; record: Record<string, unknown> }>;
  toolingQueries: string[];
  toolingCreates: Array<{ object: string; record: Record<string, unknown> }>;
  toolingRetrieves: Array<{ object: string; id: string }>;
};

export function buildMockConnection(opts: MockConnectionOptions): { conn: Connection; calls: CapturedCalls } {
  const calls: CapturedCalls = {
    queries: [],
    queryMoreUrls: [],
    describes: [],
    creates: [],
    updates: [],
    toolingQueries: [],
    toolingCreates: [],
    toolingRetrieves: [],
  };

  const wrapQueryResult = <T>(value: unknown[] | QueryResultLike): QueryResultLike<T> => {
    if (Array.isArray(value)) {
      return { records: value as T[], done: true, totalSize: value.length };
    }
    return value as QueryResultLike<T>;
  };

  const conn: any = {
    query: <T>(soql: string): Promise<QueryResultLike<T>> => {
      calls.queries.push(soql);
      const value = opts.query?.(soql) ?? [];
      return Promise.resolve(wrapQueryResult<T>(value));
    },
    queryMore: <T>(url: string): Promise<QueryResultLike<T>> => {
      calls.queryMoreUrls.push(url);
      const value = opts.queryMore?.(url) ?? [];
      return Promise.resolve(wrapQueryResult<T>(value));
    },
    sobject: (objectName: string) => ({
      describe: (): Promise<unknown> => {
        calls.describes.push(objectName);
        return Promise.resolve(opts.describe?.() ?? { fields: [] });
      },
      create: async (record: Record<string, unknown>): Promise<SaveResultLike> => {
        calls.creates.push({ object: objectName, record });
        return Promise.resolve(opts.create?.(record) ?? { success: true, id: 'a01CREATEDID0000' });
      },
      update: async (record: Record<string, unknown>): Promise<SaveResultLike> => {
        calls.updates.push({ object: objectName, record });
        return Promise.resolve(opts.update?.(record) ?? { success: true, id: (record.Id as string) ?? '' });
      },
    }),
    tooling: {
      query: <T>(soql: string): Promise<QueryResultLike<T>> => {
        calls.toolingQueries.push(soql);
        const value = opts.tooling?.query?.(soql) ?? [];
        return Promise.resolve(wrapQueryResult<T>(value));
      },
      create: async (object: string, record: Record<string, unknown>): Promise<ToolingSaveResultLike> => {
        calls.toolingCreates.push({ object, record });
        return Promise.resolve(opts.tooling?.create?.(object, record) ?? { success: true, id: '0HfCREATEDID0000' });
      },
      retrieve: async (object: string, id: string): Promise<unknown> => {
        calls.toolingRetrieves.push({ object, id });
        return Promise.resolve(opts.tooling?.retrieve?.(object, id) ?? {});
      },
    },
  };

  return { conn, calls };
}
