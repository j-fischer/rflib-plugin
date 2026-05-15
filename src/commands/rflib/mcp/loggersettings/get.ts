import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { getLoggerSettings } from '../../../../shared/orgClient.js';

export type RflibMcpLoggerSettingsGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.mcp.loggersettings.get');

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
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Reading logger settings...');
    const payload = await getLoggerSettings(conn);
    this.spinner.stop();

    const result = JSON.stringify(payload);
    this.log(result);
    return { result };
  }
}
