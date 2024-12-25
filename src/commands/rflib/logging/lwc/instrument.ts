

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.lwc.instrument');

export type RflibLoggingLwcInstrumentResult = {
  path: string;
};

export default class RflibLoggingLwcInstrument extends SfCommand<RflibLoggingLwcInstrumentResult> {
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

  public async run(): Promise<RflibLoggingLwcInstrumentResult> {
    const { flags } = await this.parse(RflibLoggingLwcInstrument);

    const name = flags.name ?? 'world';
    this.log(`hello ${name} from src/commands/rflib/logging/lwc/instrument.ts`);
    return {
      path: 'src/commands/rflib/logging/lwc/instrument.ts',
    };
  }
}
