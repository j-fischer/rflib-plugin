/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/member-ordering, unicorn/numeric-separators-style */
import type { Connection } from '@salesforce/core';
import { expect } from 'chai';
import { callMcpTool } from '../../../../../src/shared/mcpClient.js';

type McpRequest = {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string>;
};

type McpBody = {
  jsonrpc: string;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

type McpContentItem = {
  type: string;
  text: string;
};

type McpResult = {
  [key: string]: unknown;
  content?: McpContentItem[];
};

type McpResponse = {
  jsonrpc: string;
  id: number;
  result?: McpResult;
  error?: { code: number; message: string };
};

function buildSuccessResponse(text: string): McpResponse {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text }] },
  };
}

function buildErrorResponse(code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id: 1, error: { code, message } };
}

function parseBody(raw: string): McpBody {
  return JSON.parse(raw) as McpBody;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequestFn = (req: McpRequest) => Promise<any>;

function mockConnection(requestFn: RequestFn): Connection {
  return { request: requestFn } as unknown as Connection;
}

function mockConn(handler: (req: McpRequest) => McpResponse | Error): Connection {
  return mockConnection((req: McpRequest) => {
    const outcome = handler(req);
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(outcome);
  });
}

describe('callMcpTool', () => {
  it('should send a JSON-RPC tools/call request to the MCP endpoint', async () => {
    let capturedRequest: McpRequest | undefined;
    const conn = mockConn((req) => {
      capturedRequest = req;
      return buildSuccessResponse('{}');
    });

    await callMcpTool(conn, 'rflib_get_logger_settings', {});

    expect(capturedRequest).to.not.be.undefined;
    expect(capturedRequest!.method).to.equal('POST');
    expect(capturedRequest!.url).to.equal('/services/apexrest/rflib-mcp/v1');
    expect(capturedRequest!.headers['Content-Type']).to.equal('application/json');

    const body = parseBody(capturedRequest!.body);
    expect(body.jsonrpc).to.equal('2.0');
    expect(body.method).to.equal('tools/call');
    expect(body.params.name).to.equal('rflib_get_logger_settings');
  });

  it('should pass tool arguments in the request body', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => {
      capturedBody = parseBody(req.body);
      return buildSuccessResponse('{}');
    });

    await callMcpTool(conn, 'rflib_get_application_events', { eventName: 'order-%', recordLimit: 50 });

    expect(capturedBody!.params.arguments).to.deep.equal({ eventName: 'order-%', recordLimit: 50 });
  });

  it('should return the text content from a successful MCP response', async () => {
    const expected = '{"recordCount":2,"events":[]}';
    const conn = mockConn(() => buildSuccessResponse(expected));

    const result = await callMcpTool(conn, 'rflib_get_application_events', {});
    expect(result).to.equal(expected);
  });

  it('should fall back to serializing the result object when content array is absent', async () => {
    const conn = mockConn(() => ({
      jsonrpc: '2.0',
      id: 1,
      result: { someOtherKey: 'value' },
    }));

    const result = await callMcpTool(conn, 'rflib_get_logger_settings', {});
    expect(result).to.include('someOtherKey');
  });

  it('should throw a descriptive error when the MCP server returns a JSON-RPC error', async () => {
    const conn = mockConn(() => buildErrorResponse(-32601, 'Unknown tool: bad_tool'));

    try {
      await callMcpTool(conn, 'bad_tool', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).to.include('-32601');
      expect((err as Error).message).to.include('Unknown tool: bad_tool');
    }
  });

  it('should throw with installation instructions on 404 error', async () => {
    const conn = mockConn(() => new Error('404 Not Found'));

    try {
      await callMcpTool(conn, 'rflib_get_logger_settings', {});
      expect.fail('Should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).to.include('https://github.com/j-fischer/rflib');
      expect(msg).to.include('rflib_MCP_Access');
    }
  });

  it('should throw with installation instructions on 403 forbidden error', async () => {
    const conn = mockConn(() => new Error('403 Forbidden'));

    try {
      await callMcpTool(conn, 'rflib_get_logger_settings', {});
      expect.fail('Should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).to.include('https://github.com/j-fischer/rflib');
      expect(msg).to.include('rflib_MCP_Access');
    }
  });

  it('should throw with installation instructions on insufficient privileges error', async () => {
    const conn = mockConn(() => new Error('Insufficient Privileges'));

    try {
      await callMcpTool(conn, 'rflib_get_logger_settings', {});
      expect.fail('Should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).to.include('https://github.com/j-fischer/rflib');
      expect(msg).to.include('rflib_MCP_Access');
    }
  });

  it('should rethrow non-auth errors as-is', async () => {
    const conn = mockConn(() => new Error('500 Internal Server Error'));

    try {
      await callMcpTool(conn, 'rflib_get_logger_settings', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).to.equal('500 Internal Server Error');
    }
  });
});
