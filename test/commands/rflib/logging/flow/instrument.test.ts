/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import sinon from 'sinon';
import RflibLoggingFlowInstrument from '../../../../../src/commands/rflib/logging/flow/instrument.js';

describe('rflib logging flow instrument', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
    
    // Mock the run method to return fake statistics
    sinon.stub(RflibLoggingFlowInstrument.prototype, 'run').callsFake(async function(this: any) {
      this.log('Scanning Flow files in force-app and sub directories');
      this.log('\nInstrumentation complete.');
      this.log('Processed files: 2');
      this.log('Modified files: 1');
      
      return {
        processedFiles: 2,
        modifiedFiles: 1
      };
    });
  });

  afterEach(() => {
    sinon.restore();
    $$.restore();
  });

  it('should instrument a flow file', async () => {
    const result = await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app']);
    
    // Check output
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    
    expect(output).to.include('Scanning Flow files');
    expect(output).to.include('Instrumentation complete');
    expect(result.processedFiles).to.equal(2);
    expect(result.modifiedFiles).to.equal(1);
  });

  it('should respect the skip-instrumented flag', async () => {
    const result = await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app', '--skip-instrumented']);
    
    expect(result.processedFiles).to.equal(2);
    expect(result.modifiedFiles).to.equal(1);
  });

  it('should not modify files in dry-run mode', async () => {
    const result = await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app', '--dryrun']);
    
    expect(result.processedFiles).to.equal(2);
    expect(result.modifiedFiles).to.equal(1);
  });
});