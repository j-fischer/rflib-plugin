import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { getRecordAccess, type RecordAccessResult } from '../../../../shared/orgClient.js';

export type RflibDebugRecordAccessGetResult = RecordAccessResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.recordaccess.get');

export default class RflibDebugRecordAccessGet extends SfCommand<RflibDebugRecordAccessGetResult> {
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
    user: Flags.string({
      summary: messages.getMessage('flags.user.summary'),
      description: messages.getMessage('flags.user.description'),
      char: 'u',
      required: true,
    }),
    'record-id': Flags.string({
      summary: messages.getMessage('flags.record-id.summary'),
      description: messages.getMessage('flags.record-id.description'),
      char: 'r',
      required: true,
      multiple: true,
    }),
  };

  public async run(): Promise<RflibDebugRecordAccessGetResult> {
    const { flags } = await this.parse(RflibDebugRecordAccessGet);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Checking record access...');
    const result = await getRecordAccess(conn, { user: flags.user, recordIds: flags['record-id'] });
    this.spinner.stop();

    this.log(messages.getMessage('info.user', [result.user.username]));
    this.table({
      data: result.records.map((record) => ({
        recordId: record.recordId,
        object: record.sobjectType ?? '',
        access: record.found ? record.maxAccessLevel : messages.getMessage('info.notFound'),
      })),
      columns: [
        { key: 'recordId', name: 'Record ID' },
        { key: 'object', name: 'Object' },
        { key: 'access', name: 'Max Access' },
      ],
    });
    for (const record of result.records) {
      for (const note of record.notes) {
        this.log(messages.getMessage('info.note', [record.recordId, note]));
      }
    }
    return result;
  }
}
