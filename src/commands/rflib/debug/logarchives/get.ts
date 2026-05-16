import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { queryLogArchives, type LogArchivesResult } from '../../../../shared/orgClient.js';

export type RflibDebugLogArchivesGetResult = LogArchivesResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.logarchives.get');

export default class RflibDebugLogArchivesGet extends SfCommand<RflibDebugLogArchivesGetResult> {
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

  public async run(): Promise<RflibDebugLogArchivesGetResult> {
    const { flags } = await this.parse(RflibDebugLogArchivesGet);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Querying log archives...');
    const payload = await queryLogArchives(conn, {
      startDate: flags['start-date'],
      endDate: flags['end-date'],
    });
    this.spinner.stop();

    // For human invocations, render the payload as JSON. Under --json, SfCommand
    // suppresses log output and wraps this method's return value directly.
    this.log(JSON.stringify(payload));
    return payload;
  }
}
