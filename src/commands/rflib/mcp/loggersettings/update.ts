import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { callMcpTool } from '../../../../shared/mcpClient.js';

export type RflibMcpLoggerSettingsUpdateResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.loggersettings.update');

/**
 * SF CLI command to create or update an RFLIB Logger Setting via the MCP server.
 */
export default class RflibMcpLoggerSettingsUpdate extends SfCommand<RflibMcpLoggerSettingsUpdateResult> {
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
    'field-name': Flags.string({
      summary: messages.getMessage('flags.field-name.summary'),
      description: messages.getMessage('flags.field-name.description'),
      char: 'f',
      required: true,
    }),
    'field-value': Flags.string({
      summary: messages.getMessage('flags.field-value.summary'),
      description: messages.getMessage('flags.field-value.description'),
      char: 'v',
      required: true,
    }),
    'record-id': Flags.string({
      summary: messages.getMessage('flags.record-id.summary'),
      description: messages.getMessage('flags.record-id.description'),
      char: 'r',
    }),
    'setup-owner-id': Flags.string({
      summary: messages.getMessage('flags.setup-owner-id.summary'),
      description: messages.getMessage('flags.setup-owner-id.description'),
      char: 's',
    }),
  };

  public async run(): Promise<RflibMcpLoggerSettingsUpdateResult> {
    const { flags } = await this.parse(RflibMcpLoggerSettingsUpdate);
    const org = flags['target-org'];
    const conn = org.getConnection(undefined);

    const args: Record<string, unknown> = {
      fieldName: flags['field-name'],
      fieldValue: flags['field-value'],
    };
    if (flags['record-id']) args['recordId'] = flags['record-id'];
    if (flags['setup-owner-id']) args['setupOwnerId'] = flags['setup-owner-id'];

    this.spinner.start('Updating logger setting...');
    const result = await callMcpTool(conn, 'rflib_update_logger_setting', args);
    this.spinner.stop();

    this.log(result);
    return { result };
  }
}
