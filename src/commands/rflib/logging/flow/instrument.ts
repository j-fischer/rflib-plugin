

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.flow.instrument');

export type RflibLoggingFlowInstrumentResult = {
  path: string;
};

export default class RflibLoggingFlowInstrument extends SfCommand<RflibLoggingFlowInstrumentResult> {
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

  public async run(): Promise<RflibLoggingFlowInstrumentResult> {
    const { flags } = await this.parse(RflibLoggingFlowInstrument);

    const name = flags.name ?? 'world';
    this.log(`hello ${name} from src/commands/rflib/logging/flow/instrument.ts`);
    return {
      path: 'src/commands/rflib/logging/flow/instrument.ts',
    };
  }
}
