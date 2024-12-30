/* eslint-disable @typescript-eslint/quotes */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { RflibLoggingLwcInstrumentResult } from '../../../../../src/commands/rflib/logging/lwc/instrument.js';

let testSession: TestSession;

describe('rflib logging lwc instrument NUTs', () => {
  before('prepare session', async () => {
    testSession = await TestSession.create();
    const sampleLwc = `
import { LightningElement } from 'lwc';

export default class SampleComponent extends LightningElement {
    async handleClick(event) {
        try {
            const result = await this.loadData();
            this.processResult(result);
        } catch(error) {
            console.error(error);
        }
    }

    processResult(data) {
        if (data.isValid) {
            this.value = data.value;
        } else {
            this.showError();
        }
    }
}`;

    const testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'lwc', 'sampleComponent');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'sampleComponent.js'), sampleLwc);
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should process lwc in dry run mode', () => {
    const result = execCmd<RflibLoggingLwcInstrumentResult>(
      'rflib logging lwc instrument --sourcepath force-app/main/default/lwc --dryrun --json',
      {
        ensureExitCode: 0,
        cwd: testSession.dir,
      },
    ).jsonOutput?.result;

    expect(result?.processedFiles).to.equal(1);
    expect(result?.modifiedFiles).to.equal(1);
    expect(result?.formattedFiles).to.equal(0);
  });

  it('should modify lwc with logger statements', () => {
    execCmd('rflib logging lwc instrument --sourcepath force-app/main/default/lwc --json', {
      ensureExitCode: 0,
      cwd: testSession.dir,
    });

    const modifiedContent = fs.readFileSync(
      path.join(testSession.dir, 'force-app', 'main', 'default', 'lwc', 'sampleComponent', 'sampleComponent.js'),
      'utf8'
    );

    expect(modifiedContent).to.include("import { createLogger } from 'c/rflibLogger'");
    expect(modifiedContent).to.include("const logger = createLogger('SampleComponent')");
    expect(modifiedContent).to.include("logger.info('handleClick({0})', event)");
    expect(modifiedContent).to.include("logger.error('An error occurred in function handleClick()', error)");
    expect(modifiedContent).to.include("logger.debug(`if (data.isValid)`);");
  });
});