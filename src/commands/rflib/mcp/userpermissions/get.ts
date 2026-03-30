import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { callMcpTool } from '../../../../shared/mcpClient.js';

export type RflibMcpUserPermissionsGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.userpermissions.get');

/**
 * SF CLI command to check Salesforce user permissions via the MCP server.
 */
export default class RflibMcpUserPermissionsGet extends SfCommand<RflibMcpUserPermissionsGetResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg({
      summary: messages.getMessage('flags.target-org.summary'),
      description: messages.getMessage('flags.target-org.description'),
      char: 'o',
      required: true,
    }),
    'user-id': Flags.string({
      summary: messages.getMessage('flags.user-id.summary'),
      description: messages.getMessage('flags.user-id.description'),
      char: 'u',
      required: true,
    }),
    'permission-type': Flags.string({
      summary: messages.getMessage('flags.permission-type.summary'),
      description: messages.getMessage('flags.permission-type.description'),
      char: 't',
      required: true,
      options: ['FLS', 'OLS', 'APEX', 'ALL'],
    }),
    'sobject-type': Flags.string({
      summary: messages.getMessage('flags.sobject-type.summary'),
      description: messages.getMessage('flags.sobject-type.description'),
      char: 'b',
    }),
  };

  public async run(): Promise<RflibMcpUserPermissionsGetResult> {
    const { flags } = await this.parse(RflibMcpUserPermissionsGet);
    const org = flags['target-org'];
    const conn = org.getConnection(undefined);

    const args: Record<string, unknown> = {
      userId: flags['user-id'],
      permissionType: flags['permission-type'],
    };
    if (flags['sobject-type']) args['sobjectType'] = flags['sobject-type'];

    this.spinner.start('Retrieving user permissions...');
    const result = await callMcpTool(conn, 'rflib_get_user_permissions', args);
    this.spinner.stop();

    this.log(result);
    return { result };
  }
}
