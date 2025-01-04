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
    isEnabled = false;
    loading = false;
    disabled = false;
    data = null;

    async handleClick(event) {
        try {
            const result = await this.loadData();
            this.processResult(result);
        } catch(error) {
            console.error(error);
        }
    }

    handleEvent(event) {
        if (disabled) return;

        if (this.isEnabled) {
            this.processEvent(event);
            if (this.loading) {
                if (this.data) {
                    this.updateData();
                }
            }
        } else {
            this.handleError();
        }
    }

    loadData() {
        return fetch('/api/data')
            .then(response => response.json())
            .catch(error => {
                console.error(error);
            });
    }

    setTitle() {
        getCustomSettingLabel({ customSettingsApiName: this.customSettingsApiName })
            .then((label) => {
                this.title = \`\${label} Editor\`;
            })
            .catch(error => {
                this.title = 'Custom Settings Editor';
            });
    }

    checkUserPermissions() {
        return canUserModifyCustomSettings({ customSettingsApiName: this.customSettingsApiName })
            .then(result => {
                this.canModifySettings = result;
            }) // checkUserPermissions must complete before the settings are loaded
            .finally(() => this.loadCustomSettings());
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
    expect(modifiedContent).to.include("logger.info('loadData()')");
    expect(modifiedContent).to.include("logger.info('setTitle()')");
  });

  it('should add logging to promise then blocks', () => {
    expect(modifiedContent).to.include("logger.info('loadData() promise resolved. Result={0}', response)");
    expect(modifiedContent).to.include("logger.info('setTitle() promise resolved. Result={0}', label)");
    expect(modifiedContent).to.include("logger.info('checkUserPermissions() promise resolved. Result={0}', result)");
  });

  it('should add logging to promise catch blocks', () => {
    expect(modifiedContent).to.include("logger.error('An error occurred in function loadData()', error)");
    expect(modifiedContent).to.include("logger.error('An error occurred in function setTitle()', error)");
  });

  it('should add logging to promise finally blocks', () => {
    expect(modifiedContent).to.include("logger.info('checkUserPermissions() promise chain completed')");
  });

  it('should handle single line promise chains', () => {
    expect(modifiedContent).to.include('.then((response) => {\n');
    expect(modifiedContent).to.include('return response.json()');
  });

  it('should handle template literals in promise chains', () => {
    expect(modifiedContent).to.include('`${label} Editor`');
  });

  it('should add log statements to if blocks', () => {
    expect(modifiedContent).to.include("logger.debug('if (this.isEnabled)");
    expect(modifiedContent).to.match(/if \(this\.isEnabled\) {\s+logger\.debug.*\s+this\.processEvent/);
  });

  it('should convert single line if statements to blocks', () => {
    expect(modifiedContent).to.match(/if \(disabled\) {\s+logger\.debug.*\s+return;\s+}/);
  });

  it('should add log statements to else blocks', () => {
    expect(modifiedContent).to.include("logger.debug('else for if (this.isEnabled)");
    expect(modifiedContent).to.match(/} else {\s+logger\.debug.*\s+this\.handleError/);
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
    expect(formattedContent).to.match(/\n {4}/); // Check for 4-space indentation
  });
});
