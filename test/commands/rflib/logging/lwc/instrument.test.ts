/* eslint-disable @typescript-eslint/quotes */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from 'chai';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import RflibLoggingLwcInstrument from '../../../../../src/commands/rflib/logging/lwc/instrument.js';

describe('rflib logging lwc instrument', () => {
  let testSession: TestSession;
  let testDir: string;
  let sampleComponentPath: string;
  let originalContent: string;
  let modifiedContent: string;

  before(async () => {
    testSession = await TestSession.create();
    testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'lwc', 'sampleComponent');
    fs.mkdirSync(testDir, { recursive: true });

    const sampleComponent = `
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

    loadData() {
        return fetch('/api/data')
            .then(response => response.json())
            .catch(error => {
                console.error(error);
            });
    }

    async complexOperation(param1, param2) {
        switch(param1) {
            case 'test':
                return param2;
            default:
                return null;
        }
    }
}`;

    sampleComponentPath = path.join(testDir, 'sampleComponent.js');
    originalContent = sampleComponent;
    fs.writeFileSync(sampleComponentPath, originalContent);

    await RflibLoggingLwcInstrument.run(['--sourcepath', testDir]);
    modifiedContent = fs.readFileSync(sampleComponentPath, 'utf8');
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should add logger import and initialization', () => {
    expect(modifiedContent).to.include("import { createLogger } from 'c/rflibLogger'");
    expect(modifiedContent).to.include("const logger = createLogger('SampleComponent')");
  });

  it('should add entry logging to methods with parameters', () => {
    expect(modifiedContent).to.include("logger.info('handleClick({0})', event)");
    expect(modifiedContent).to.include("logger.info('processResult({0})', data)");
    expect(modifiedContent).to.include("logger.info('complexOperation({0}, {1})', param1, param2)");
  });

  it('should add error logging to catch blocks', () => {
    expect(modifiedContent).to.include("logger.error('An error occurred in function handleClick()', error)");
  });

  it('should add error logging to promise catch blocks', () => {
    expect(modifiedContent).to.include("logger.error('An error occurred in function loadData()', error)");
  });

  it('should add debug logging to if statements', () => {
    expect(modifiedContent).to.include("logger.debug(`if (data.isValid)`);");
  });

  it('should add debug logging to else blocks', () => {
    expect(modifiedContent).to.include("logger.debug(`else for if (data.isValid)`);");
  });

  it('should not add logging to switch statements', () => {
    expect(modifiedContent).not.to.include("logger.info('switch");
    expect(modifiedContent).not.to.include("logger.info('case");
  });

  it('should process lwc in dry run mode', async () => {
    const result = await RflibLoggingLwcInstrument.run(['--sourcepath', testDir, '--dryrun']);
    expect(result.processedFiles).to.be.greaterThan(0);
    expect(result.modifiedFiles).to.be.greaterThan(0);
    expect(result.formattedFiles).to.equal(0);
  });

  it('should format modified files when prettier flag is used', async () => {
    await RflibLoggingLwcInstrument.run(['--sourcepath', testDir, '--prettier']);
    const formattedContent = fs.readFileSync(sampleComponentPath, 'utf8');
    expect(formattedContent).to.include(';');
    expect(formattedContent).to.include('    ');
  });
});