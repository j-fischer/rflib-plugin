

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.apex.instrument');

export type RflibLoggingApexInstrumentResult = {
  path: string;
};

export default class RflibLoggingApexInstrument extends SfCommand<RflibLoggingApexInstrumentResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: false,
    }),
  };

  public async run(): Promise<RflibLoggingApexInstrumentResult> {
    const { flags } = await this.parse(RflibLoggingApexInstrument);

    const name = flags.name ?? 'world';
    this.log(`hello ${name} from src/commands/rflib/logging/apex/instrument.ts`);
    return {
      path: 'src/commands/rflib/logging/apex/instrument.ts',
    };
  }
}
