import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import RflibLoggingAuraInstrument from '../../../../../src/commands/rflib/logging/aura/instrument.js';

describe('rflib logging aura instrument', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs hello', async () => {
    await RflibLoggingAuraInstrument.run([]);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello world');
  });

  it('runs hello with --json and no provided name', async () => {
    const result = await RflibLoggingAuraInstrument.run([]);
    expect(result.path).to.equal('src/commands/rflib/logging/aura/instrument.ts');
  });

  it('runs hello world --name Astro', async () => {
    await RflibLoggingAuraInstrument.run(['--name', 'Astro']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello Astro');
  });
});
