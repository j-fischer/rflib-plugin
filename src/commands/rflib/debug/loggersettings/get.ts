import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { getLoggerSettings, type LoggerSettingsResult } from '../../../../shared/orgClient.js';

export type RflibDebugLoggerSettingsGetResult = LoggerSettingsResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.loggersettings.get');

export default class RflibDebugLoggerSettingsGet extends SfCommand<RflibDebugLoggerSettingsGetResult> {
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

  public async run(): Promise<RflibDebugLoggerSettingsGetResult> {
    const { flags } = await this.parse(RflibDebugLoggerSettingsGet);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Reading logger settings...');
    const payload = await getLoggerSettings(conn);
    this.spinner.stop();

    // For human invocations, render the payload as JSON. Under --json, SfCommand
    // suppresses log output and wraps this method's return value directly.
    this.log(JSON.stringify(payload));
    return payload;
  }
}
