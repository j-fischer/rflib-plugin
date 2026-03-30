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

describe('callMcpTool - rflib_update_logger_setting', () => {
  it('should pass fieldName and fieldValue in the request', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_update_logger_setting', {
      fieldName: 'Log_Event_Reporting_Level__c',
      fieldValue: 'WARN',
    });

    expect(capturedBody!.params.name).to.equal('rflib_update_logger_setting');
    expect(capturedBody!.params.arguments).to.have.property('fieldName', 'Log_Event_Reporting_Level__c');
    expect(capturedBody!.params.arguments).to.have.property('fieldValue', 'WARN');
  });

  it('should pass recordId and setupOwnerId when provided', async () => {
    let capturedBody: McpBody | undefined;
    const conn = mockConn((req) => { capturedBody = parseBody(req.body); return buildSuccessResponse('{}'); });

    await callMcpTool(conn, 'rflib_update_logger_setting', {
      fieldName: 'Log_Event_Reporting_Level__c',
      fieldValue: 'WARN',
      recordId: 'a01abc',
      setupOwnerId: '00D000000000001',
    });

    expect(capturedBody!.params.arguments).to.have.property('recordId', 'a01abc');
    expect(capturedBody!.params.arguments).to.have.property('setupOwnerId', '00D000000000001');
  });

  it('should return the update result JSON', async () => {
    const expected = '{"success":true,"recordId":"a01abc","warnings":[]}';
    const conn = mockConn(() => buildSuccessResponse(expected));
    const result = await callMcpTool(conn, 'rflib_update_logger_setting', {
      fieldName: 'Log_Event_Reporting_Level__c',
      fieldValue: 'WARN',
    });
    expect(result).to.equal(expected);
  });
});
