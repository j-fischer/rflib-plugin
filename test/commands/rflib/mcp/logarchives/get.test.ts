/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import type { Connection } from '@salesforce/core';
import { expect } from 'chai';
import { callMcpTool } from '../../../../../src/shared/mcpClient.js';

type McpRequest = { method: string; url: string; body: string; headers: Record<string, string> };
type McpBody = { params: { name: string; arguments: Record<string, unknown> } };
type McpResponse = { jsonrpc: string; id: number; result?: { content?: Array<{ type: string; text: string }> } };

const buildSuccessResponse = (text: string): McpResponse => ({
  jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] },
});

const parseBody = (raw: string): McpBody => JSON.parse(raw) as McpBody;

const mockConn = (handler: (req: McpRequest) => McpResponse | Error): Connection => ({
  request(req: McpRequest): Promise<McpResponse> {
    const outcome = handler(req);
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(outcome);
  },
} as unknown as Connection);

describe('callMcpTool - rflib_query_log_archives', () => {
  it('should send the tool call with no args when none are provided', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_query_log_archives', {});

    expect(capturedBody!.params.name).to.equal('rflib_query_log_archives');
    expect(capturedBody!.params.arguments).to.deep.equal({});
  });

  it('should pass startDate and endDate when provided', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_query_log_archives', {
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-02T00:00:00Z',
    });

    expect(capturedBody!.params.arguments).to.have.property('startDate', '2024-01-01T00:00:00Z');
    expect(capturedBody!.params.arguments).to.have.property('endDate', '2024-01-02T00:00:00Z');
  });

  it('should return the text result', async () => {
    const expected = '{"recordCount":5,"records":[]}';
    const conn = mockConn(() => buildSuccessResponse(expected));
    const result = await callMcpTool(conn, 'rflib_query_log_archives', {});
    expect(result).to.equal(expected);
  });
});
