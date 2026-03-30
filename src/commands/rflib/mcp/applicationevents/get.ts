import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { callMcpTool } from '../../../../shared/mcpClient.js';

export type RflibMcpApplicationEventsGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.applicationevents.get');

/**
 * SF CLI command to query RFLIB Application Events via the MCP server.
 */
export default class RflibMcpApplicationEventsGet extends SfCommand<RflibMcpApplicationEventsGetResult> {
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
    'event-name': Flags.string({
      summary: messages.getMessage('flags.event-name.summary'),
      description: messages.getMessage('flags.event-name.description'),
      char: 'e',
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
    'related-record-id': Flags.string({
      summary: messages.getMessage('flags.related-record-id.summary'),
      description: messages.getMessage('flags.related-record-id.description'),
      char: 'r',
    }),
    'record-limit': Flags.integer({
      summary: messages.getMessage('flags.record-limit.summary'),
      description: messages.getMessage('flags.record-limit.description'),
      char: 'l',
      min: 1,
      max: 2000,
    }),
  };

  public async run(): Promise<RflibMcpApplicationEventsGetResult> {
    const { flags } = await this.parse(RflibMcpApplicationEventsGet);
    const org = flags['target-org'];
    const conn = org.getConnection(undefined);

    const args: Record<string, unknown> = {};
    if (flags['event-name']) args['eventName'] = flags['event-name'];
    if (flags['start-date']) args['startDate'] = flags['start-date'];
    if (flags['end-date']) args['endDate'] = flags['end-date'];
    if (flags['related-record-id']) args['relatedRecordId'] = flags['related-record-id'];
    if (flags['record-limit'] !== undefined) args['recordLimit'] = flags['record-limit'];

    this.spinner.start('Querying application events...');
    const result = await callMcpTool(conn, 'rflib_get_application_events', args);
    this.spinner.stop();

    this.log(result);
    return { result };
  }
}
