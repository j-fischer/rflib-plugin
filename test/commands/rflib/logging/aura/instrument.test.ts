import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import RflibLoggingAuraInstrument from '../../../../../src/commands/rflib/logging/aura/instrument.js';

/* eslint-disable no-underscore-dangle */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* eslint-enable no-underscore-dangle */

describe('rflib logging aura instrument', () => {
  let testSession: TestSession;
  let sourceDir: string;
  let testDir: string;
  let sampleCmpPath: string;
  let sampleControllerPath: string;
  let sampleHelperPath: string;
  let originalContent: { [key: string]: string };
  let modifiedContent: { [key: string]: string };

  before(async () => {
    testSession = await TestSession.create();
    sourceDir = path.join(testSession.dir, 'force-app');
    testDir = path.join(sourceDir, 'main', 'default', 'aura', 'sampleComponent');
    fs.mkdirSync(testDir, { recursive: true });

    sampleCmpPath = path.join(testDir, 'sampleComponent.cmp');
    sampleControllerPath = path.join(testDir, 'sampleComponentController.js');
    sampleHelperPath = path.join(testDir, 'sampleComponentHelper.js');

    // Load sample files from test directory
    originalContent = {
      cmp: fs.readFileSync(path.join(__dirname, 'sample', 'sample.cmp'), 'utf8'),
      controller: fs.readFileSync(path.join(__dirname, 'sample', 'sampleController.js'), 'utf8'),
      helper: fs.readFileSync(path.join(__dirname, 'sample', 'sampleHelper.js'), 'utf8')
    };

    // Copy sample files to test directory
    fs.writeFileSync(sampleCmpPath, originalContent.cmp);
    fs.writeFileSync(sampleControllerPath, originalContent.controller);
    fs.writeFileSync(sampleHelperPath, originalContent.helper);

    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);

    modifiedContent = {
      cmp: fs.readFileSync(sampleCmpPath, 'utf8'),
      controller: fs.readFileSync(sampleControllerPath, 'utf8'),
      helper: fs.readFileSync(sampleHelperPath, 'utf8')
    };
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should add logger component to cmp file', () => {
    expect(modifiedContent.cmp).to.include('<c:rflibLoggerCmp aura:id="logger" name="sampleComponent" appendComponentId="false" />');
  });

  it('should add logger initialization to controller methods', () => {
    expect(modifiedContent.controller).to.include("var logger = component.find('logger')");
    expect(modifiedContent.controller).to.include("logger.info('handleClick({0})', [event])");
    expect(modifiedContent.controller).to.include("logger.info('processResult({0})', [event])");
  });

  it('should add logger initialization to helper methods', () => {
    expect(modifiedContent.helper).to.include("var logger = component.find('logger')");
    expect(modifiedContent.helper).to.include("logger.info('loadData({0}, {1})', [component, params])");
  });

  it('should add error logging to catch blocks', () => {
    expect(modifiedContent.controller).to.include("logger.error('An error occurred', error)");
  });

  it('should convert single line if statements to blocks', () => {
    expect(modifiedContent.controller).to.match(/if \(data.isValid\) {\s+logger\.debug.*\s+component\.set\("v.value", data\.value\);\s+}/);
    expect(modifiedContent.helper).to.match(/if \(response.getState\(\) === "SUCCESS"\) {\s+logger\.debug.*\s+component\.set\("v\.value", response\.getReturnValue\(\)\);\s+}/);
  });

  it('should process aura in dry run mode', async () => {
    const result = await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--dryrun']);
    expect(result.processedFiles).to.be.greaterThan(0);
    expect(result.modifiedFiles).to.be.greaterThan(0);
    expect(result.formattedFiles).to.equal(0);
  });

  it('should format modified files when prettier flag is used', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--prettier']);
    const formattedContent = fs.readFileSync(sampleControllerPath, 'utf8');
    expect(formattedContent).to.include(';');
    expect(formattedContent).to.match(/\n {4}/);
  });

  it('should skip if statement instrumentation when no-if flag is used', async () => {
    // Reset test files
    fs.writeFileSync(sampleControllerPath, originalContent.controller);
    fs.writeFileSync(sampleHelperPath, originalContent.helper);

    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--no-if']);

    const controllerContent = fs.readFileSync(sampleControllerPath, 'utf8');
    const helperContent = fs.readFileSync(sampleHelperPath, 'utf8');

    // Should have regular logging
    expect(controllerContent).to.include("logger.info('handleClick({0})', [event])");
    expect(helperContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
    expect(controllerContent).to.include("logger.error('An error occurred', error)");

    // Should not have if/else logging
    expect(controllerContent).not.to.include("logger.debug('if (data.isValid)");
    expect(helperContent).not.to.include("logger.debug('if (response.getState()");
    expect(controllerContent).not.to.include("logger.debug('else");
  });
});