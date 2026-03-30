import { Connection } from '@salesforce/core';

const MCP_ENDPOINT = '/services/apexrest/rflib-mcp/v1';
const INSTALL_INSTRUCTIONS = `
The RFLIB MCP package does not appear to be installed in the target org, or the running user
does not have the required access.

To resolve this:
  1. Install the RFLIB MCP package from: https://github.com/j-fischer/rflib
  2. Assign the "rflib_MCP_Access" permission set to the running user:
       sf org assign permset --name rflib_MCP_Access --target-org <alias>

For more information, visit: https://github.com/j-fischer/rflib
`.trim();

type JsonRpcResult = {
  [key: string]: unknown;
  content?: Array<{ type: string; text: string }>;
};

type JsonRpcSuccessResponse = {
  jsonrpc: string;
  id: unknown;
  result: JsonRpcResult;
};

type JsonRpcErrorResponse = {
  jsonrpc: string;
  id: unknown;
  error: {
    code: number;
    message: string;
  };
};

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

function isErrorResponse(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return 'error' in response;
}

/**
 * Calls an RFLIB MCP tool via the Salesforce REST endpoint.
 *
 * @param conn - Authenticated Salesforce connection from the target org
 * @param toolName - The MCP tool name to invoke (e.g. rflib_get_logger_settings)
 * @param args - Key/value arguments to pass to the tool
 * @returns The text content returned by the MCP tool
 * @throws SfError with installation instructions if the package is not found or access is denied
 */
export async function callMcpTool(
  conn: Connection,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  let rawResponse: unknown;
  try {
    rawResponse = await conn.request({
      method: 'POST',
      url: MCP_ENDPOINT,
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (isNotFoundOrForbiddenError(error)) {
      throw new Error(`RFLIB MCP package not found or access denied.\n\n${INSTALL_INSTRUCTIONS}`);
    }
    throw error;
  }

  const response = rawResponse as JsonRpcResponse;

  if (isErrorResponse(response)) {
    throw new Error(`MCP server error (code ${response.error.code}): ${response.error.message}`);
  }

  const content = response.result?.content;
  if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
    return content[0].text;
  }

  return JSON.stringify(response.result, null, 2);
}

function isNotFoundOrForbiddenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('no access') ||
    msg.includes('insufficient privileges')
  );
}
