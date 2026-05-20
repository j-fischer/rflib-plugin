import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { updateLoggerSetting, type UpdateLoggerSettingResult } from '../../../../shared/orgClient.js';

export type RflibDebugLoggerSettingsUpdateResult = UpdateLoggerSettingResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.loggersettings.update');

export default class RflibDebugLoggerSettingsUpdate extends SfCommand<RflibDebugLoggerSettingsUpdateResult> {
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

  public async run(): Promise<RflibDebugLoggerSettingsUpdateResult> {
    const { flags } = await this.parse(RflibDebugLoggerSettingsUpdate);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Updating logger setting...');
    const payload = await updateLoggerSetting(conn, {
      recordId: flags['record-id'],
      setupOwnerId: flags['setup-owner-id'],
      fieldName: flags['field-name'],
      fieldValue: flags['field-value'],
    });
    this.spinner.stop();

    // For human invocations, render the payload as JSON. Under --json, SfCommand
    // suppresses log output and wraps this method's return value directly.
    this.log(JSON.stringify(payload));
    return payload;
  }
}
