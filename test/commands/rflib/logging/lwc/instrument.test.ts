import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import RflibLoggingLwcInstrument from '../../../../../src/commands/rflib/logging/lwc/instrument.js';

describe('rflib logging lwc instrument', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs hello', async () => {
    await RflibLoggingLwcInstrument.run([]);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello world');
  });

  it('runs hello with --json and no provided name', async () => {
    const result = await RflibLoggingLwcInstrument.run([]);
    expect(result.path).to.equal('src/commands/rflib/logging/lwc/instrument.ts');
  });

  it('runs hello world --name Astro', async () => {
    await RflibLoggingLwcInstrument.run(['--name', 'Astro']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello Astro');
  });
});
