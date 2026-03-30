import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { callMcpTool } from '../../../../shared/mcpClient.js';

export type RflibMcpLogArchivesGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.logarchives.get');

/**
 * SF CLI command to query RFLIB log archives via the MCP server.
 */
export default class RflibMcpLogArchivesGet extends SfCommand<RflibMcpLogArchivesGetResult> {
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
    'start-date': Flags.string({
      summary: messages.getMessage('flags.start-date.summary'),
      description: messages.getMessage('flags.start-date.description'),
      char: 's',
    }),
    'end-date': Flags.string({
      summary: messages.getMessage('flags.end-date.summary'),
      description: messages.getMessage('flags.end-date.description'),
      char: 'd',
    }),
  };

  public async run(): Promise<RflibMcpLogArchivesGetResult> {
    const { flags } = await this.parse(RflibMcpLogArchivesGet);
    const org = flags['target-org'];
    const conn = org.getConnection(undefined);

    const args: Record<string, unknown> = {};
    if (flags['start-date']) args['startDate'] = flags['start-date'];
    if (flags['end-date']) args['endDate'] = flags['end-date'];

    this.spinner.start('Querying log archives...');
    const result = await callMcpTool(conn, 'rflib_query_log_archives', args);
    this.spinner.stop();

    this.log(result);
    return { result };
  }
}
