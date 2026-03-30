import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { callMcpTool } from '../../../../shared/mcpClient.js';

export type RflibMcpLoggerSettingsGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.loggersettings.get');

/**
 * SF CLI command to read all RFLIB Logger Settings via the MCP server.
 */
export default class RflibMcpLoggerSettingsGet extends SfCommand<RflibMcpLoggerSettingsGetResult> {
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
  };

  public async run(): Promise<RflibMcpLoggerSettingsGetResult> {
    const { flags } = await this.parse(RflibMcpLoggerSettingsGet);
    const org = flags['target-org'];
    const conn = org.getConnection(undefined);

    this.spinner.start('Reading logger settings...');
    const result = await callMcpTool(conn, 'rflib_get_logger_settings', {});
    this.spinner.stop();

    this.log(result);
    return { result };
  }
}
