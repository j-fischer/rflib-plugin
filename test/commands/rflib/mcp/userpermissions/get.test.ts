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

describe('callMcpTool - rflib_get_user_permissions', () => {
  it('should pass userId and permissionType in the request', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_get_user_permissions', {
      userId: '0057000000XXXXXX',
      permissionType: 'FLS',
    });

    expect(capturedBody!.params.name).to.equal('rflib_get_user_permissions');
    expect(capturedBody!.params.arguments).to.have.property('userId', '0057000000XXXXXX');
    expect(capturedBody!.params.arguments).to.have.property('permissionType', 'FLS');
  });

  it('should pass sobjectType when provided', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_get_user_permissions', {
      userId: '0057000000XXXXXX',
      permissionType: 'OLS',
      sobjectType: 'Account',
    });

    expect(capturedBody!.params.arguments).to.have.property('sobjectType', 'Account');
  });

  it('should support ALL permission type', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_get_user_permissions', {
      userId: '0057000000XXXXXX',
      permissionType: 'ALL',
    });

    expect(capturedBody!.params.arguments).to.have.property('permissionType', 'ALL');
  });

  it('should return the permissions JSON result', async () => {
    const expected = '{"userId":"0057000000XXXXXX","profileName":"System Administrator"}';
    const conn = mockConn(() => buildSuccessResponse(expected));
    const result = await callMcpTool(conn, 'rflib_get_user_permissions', {
      userId: '0057000000XXXXXX',
      permissionType: 'FLS',
    });
    expect(result).to.equal(expected);
  });
});
