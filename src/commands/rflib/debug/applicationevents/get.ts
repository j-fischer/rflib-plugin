import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { getApplicationEvents, type ApplicationEventsResult } from '../../../../shared/orgClient.js';

export type RflibDebugApplicationEventsGetResult = ApplicationEventsResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.applicationevents.get');

export default class RflibDebugApplicationEventsGet extends SfCommand<RflibDebugApplicationEventsGetResult> {
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

  public async run(): Promise<RflibDebugApplicationEventsGetResult> {
    const { flags } = await this.parse(RflibDebugApplicationEventsGet);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Querying application events...');
    const payload = await getApplicationEvents(conn, {
      eventName: flags['event-name'],
      startDate: flags['start-date'],
      endDate: flags['end-date'],
      relatedRecordId: flags['related-record-id'],
      recordLimit: flags['record-limit'],
    });
    this.spinner.stop();

    // For human invocations, render the payload as JSON. Under --json, SfCommand
    // suppresses log output and wraps this method's return value directly.
    this.log(JSON.stringify(payload));
    return payload;
  }
}
