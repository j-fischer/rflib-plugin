import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { queryLogArchives } from '../../../../shared/orgClient.js';

export type RflibMcpLogArchivesGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.logarchives.get');

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
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Querying log archives...');
    const payload = await queryLogArchives(conn, {
      startDate: flags['start-date'],
      endDate: flags['end-date'],
    });
    this.spinner.stop();

    const result = JSON.stringify(payload);
    this.log(result);
    return { result };
  }
}
