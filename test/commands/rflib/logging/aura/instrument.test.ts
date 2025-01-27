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
  let hasFailures = false;
  let testSession: TestSession;
  let sourceDir: string;
  let paths: {
    sample: {
      dir: string;
      cmp: string;
      controller: string;
      helper: string;
    };
    instrumented: {
      dir: string;
      cmp: string;
      controller: string;
      helper: string;
    };
  };
  let originalContent: { [key: string]: string };

  before(async () => {
    testSession = await TestSession.create();
    sourceDir = path.join(testSession.dir, 'force-app');

    // Setup path structure
    paths = {
      sample: {
        dir: path.join(sourceDir, 'main', 'default', 'aura', 'sampleComponent'),
        cmp: '',
        controller: '',
        helper: ''
      },
      instrumented: {
        dir: path.join(sourceDir, 'main', 'default', 'aura', 'instrumentedComponent'),
        cmp: '',
        controller: '',
        helper: ''
      }
    };

    // Create component directories
    fs.mkdirSync(paths.sample.dir, { recursive: true });
    fs.mkdirSync(paths.instrumented.dir, { recursive: true });

    // Set file paths
    paths.sample.cmp = path.join(paths.sample.dir, 'sampleComponent.cmp');
    paths.sample.controller = path.join(paths.sample.dir, 'sampleComponentController.js');
    paths.sample.helper = path.join(paths.sample.dir, 'sampleComponentHelper.js');

    paths.instrumented.cmp = path.join(paths.instrumented.dir, 'instrumentedComponent.cmp');
    paths.instrumented.controller = path.join(paths.instrumented.dir, 'instrumentedComponentController.js');
    paths.instrumented.helper = path.join(paths.instrumented.dir, 'instrumentedComponentHelper.js');

    // Load original content
    originalContent = {
      cmp: fs.readFileSync(path.join(__dirname, 'sample', 'sample.cmp'), 'utf8'),
      controller: fs.readFileSync(path.join(__dirname, 'sample', 'sampleController.js'), 'utf8'),
      helper: fs.readFileSync(path.join(__dirname, 'sample', 'sampleHelper.js'), 'utf8'),
      instrumentedCmp: fs.readFileSync(path.join(__dirname, 'instrumentedSample', 'instrumentedSample.cmp'), 'utf8'),
      instrumentedController: fs.readFileSync(path.join(__dirname, 'instrumentedSample', 'instrumentedSampleController.js'), 'utf8'),
      instrumentedHelper: fs.readFileSync(path.join(__dirname, 'instrumentedSample', 'instrumentedSampleHelper.js'), 'utf8')
    };

    // Write sample files
    fs.writeFileSync(paths.sample.cmp, originalContent.cmp);
    fs.writeFileSync(paths.sample.controller, originalContent.controller);
    fs.writeFileSync(paths.sample.helper, originalContent.helper);
    fs.writeFileSync(paths.instrumented.cmp, originalContent.instrumentedCmp);
    fs.writeFileSync(paths.instrumented.controller, originalContent.instrumentedController);
    fs.writeFileSync(paths.instrumented.helper, originalContent.instrumentedHelper);
  });

  beforeEach(() => {
    // Reset files before each test
    fs.writeFileSync(paths.sample.cmp, originalContent.cmp);
    fs.writeFileSync(paths.sample.controller, originalContent.controller);
    fs.writeFileSync(paths.sample.helper, originalContent.helper);
    fs.writeFileSync(paths.instrumented.cmp, originalContent.instrumentedCmp);
    fs.writeFileSync(paths.instrumented.controller, originalContent.instrumentedController);
    fs.writeFileSync(paths.instrumented.helper, originalContent.instrumentedHelper);
  });

  afterEach(function () {
    if (this.currentTest?.state === 'failed') {
      hasFailures = true;
      const failedTestDir = path.join(testSession.dir, 'failedTest', this.currentTest.title);

      // Create target directory
      fs.mkdirSync(failedTestDir, { recursive: true });

      // Copy entire directory structure recursively
      fs.cpSync(sourceDir, path.join(failedTestDir, 'force-app'), {
        recursive: true,
        force: true,
        preserveTimestamps: true
      });
    }
  });

  after(async () => {
    if (!hasFailures) {
      await testSession?.clean();
    }
  });

  it('should add logger component to cmp file', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedContent = fs.readFileSync(paths.sample.cmp, 'utf8');

    expect(modifiedContent).to.include('<c:rflibLoggerCmp aura:id="logger" name="sampleComponent" appendComponentId="false" />');
  });

  it('should add logger initialization to controller methods', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedContent = fs.readFileSync(paths.sample.controller, 'utf8');

    expect(modifiedContent).to.include("var logger = component.find('logger')");
    expect(modifiedContent).to.include("logger.info('handleClick({0})', [event])");
    expect(modifiedContent).to.include("logger.info('testIfInstrumentation({0})', [event]);");
  });

  it('should add logger initialization to helper methods', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedContent = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(modifiedContent).to.include("var logger = component.find('logger')");
    expect(modifiedContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
  });

  it('should add error logging to catch blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedContent = fs.readFileSync(paths.sample.controller, 'utf8');

    expect(modifiedContent).to.include("logger.error('An error occurred', error)");
  });

  it('should convert single line if statements to blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedControllerContent = fs.readFileSync(paths.sample.controller, 'utf8');
    const modifiedHelperContent = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(modifiedControllerContent).to.match(/if \(data.isValid\) {\s+logger\.debug.*\s+component\.set\("v.value", data\.value\);\s+}/);
    expect(modifiedHelperContent).to.match(/if \(response.getState\(\) === "SUCCESS"\) {\s+logger\.debug.*\s+component\.set\("v\.value", response\.getReturnValue\(\)\);\s+}/);
  });

  it('should process aura in dry run mode', async () => {
    const result = await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir, '--dryrun']);
    expect(result.processedFiles).to.be.greaterThan(0);
    expect(result.modifiedFiles).to.be.greaterThan(0);
    expect(result.formattedFiles).to.equal(0);
  });

  it('should format modified files when prettier flag is used', async () => {
    const result = await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir, '--prettier']);
    const formattedContent = fs.readFileSync(paths.sample.controller, 'utf8');
    expect(formattedContent).to.include(';');
    expect(formattedContent).to.match(/\n {4}/);

    expect(result.processedFiles).to.equal(3);
    expect(result.modifiedFiles).to.equal(3);
    expect(result.formattedFiles).to.equal(2);
  });

  it('should skip if statement instrumentation when no-if flag is used', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir, '--no-if']);

    const controllerContent = fs.readFileSync(paths.sample.controller, 'utf8');
    const helperContent = fs.readFileSync(paths.sample.helper, 'utf8');

    // Should have regular logging
    expect(controllerContent).to.include("logger.info('handleClick({0})', [event])");
    expect(helperContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
    expect(controllerContent).to.include("logger.error('An error occurred', error)");

    // Should not have if/else logging
    expect(controllerContent).not.to.include("logger.debug('if (data.isValid)");
    expect(helperContent).not.to.include("logger.debug('if (response.getState()");
    expect(controllerContent).not.to.include("logger.debug('else");
  });

  it('should skip instrumented components when skip-instrumented flag is used', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--skip-instrumented']);

    // Verify instrumented component was skipped
    const finalInstrumentedCmpContent = fs.readFileSync(paths.instrumented.cmp, 'utf8');
    const finalInstrumentedControllerContent = fs.readFileSync(paths.instrumented.controller, 'utf8');

    expect(finalInstrumentedCmpContent).to.equal(originalContent.instrumentedCmp);
    expect(finalInstrumentedControllerContent).to.equal(originalContent.instrumentedController);

    // Verify regular component was instrumented
    const regularCmpContent = fs.readFileSync(paths.sample.cmp, 'utf8');
    const regularControllerContent = fs.readFileSync(paths.sample.controller, 'utf8');

    expect(regularCmpContent).to.include('<c:rflibLoggerCmp');
    expect(regularControllerContent).to.include("logger.info('handleClick({0})', [event])");
  });

  it('should handle mixed instrumentation states when skip-instrumented flag is used', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--skip-instrumented']);

    // Verify controller was skipped (should be unchanged)
    const finalControllerContent = fs.readFileSync(paths.instrumented.controller, 'utf8');
    expect(finalControllerContent).to.equal(originalContent.instrumentedController);

    // Verify helper was instrumented (should be changed)
    const finalHelperContent = fs.readFileSync(paths.instrumented.helper, 'utf8');
    expect(finalHelperContent).to.not.equal(originalContent.instrumentedHelper);
    expect(finalHelperContent).to.include("var logger = component.find('logger')");
    expect(finalHelperContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
    expect(finalHelperContent).to.include("logger.debug('if (response.getState() === \"SUCCESS\")')");
  });

  it('should add log statements to if blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);

    const modifiedControllerContent = fs.readFileSync(paths.sample.controller, 'utf8');
    const modifiedHelperContent = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(modifiedControllerContent).to.include("logger.debug('if (data.isValid)");
    expect(modifiedHelperContent).to.include("logger.debug('if (response.getState()");
  });

  it('should add log statements to else blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir]);
    const modifiedContent = fs.readFileSync(paths.sample.controller, 'utf8');

    expect(modifiedContent).to.include("logger.debug('else for if (data.isValid)");
  });

  it('should process aura in dry run mode', async () => {
    const result = await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir, '--dryrun']);

    expect(result.processedFiles).to.equal(3);
    expect(result.modifiedFiles).to.equal(3);
    expect(result.formattedFiles).to.equal(0);
  });

  it('should format modified files when prettier flag is used', async () => {
    const result = await RflibLoggingAuraInstrument.run(['--sourcepath', paths.sample.dir, '--prettier']);

    const formattedController = fs.readFileSync(paths.sample.controller, 'utf8');
    const formattedHelper = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(formattedController).to.match(/^\s{4}/gm);
    expect(formattedController).to.include("var data = event.getParam('data');");
    expect(formattedHelper).to.match(/{\n/);

    expect(result.processedFiles).to.equal(3);
    expect(result.modifiedFiles).to.equal(3);
    expect(result.formattedFiles).to.equal(2);
  });

  it('should skip instrumented components when skip-instrumented flag is used', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--skip-instrumented']);

    const instrumentedContent = fs.readFileSync(paths.instrumented.controller, 'utf8');
    const instrumentedHelper = fs.readFileSync(paths.instrumented.helper, 'utf8');

    expect(instrumentedContent).to.equal(originalContent.instrumentedController);
    expect(instrumentedHelper).to.include("var logger = component.find('logger')");
  });

  it('should use existing logger var if available', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);

    const instrumentedController = fs.readFileSync(paths.instrumented.controller, 'utf8');

    expect(instrumentedController).to.include("var customLogger = component.find('logger');");
    expect(instrumentedController).to.include("customLogger.debug('if (data.isValid)");
    expect(instrumentedController).to.include("customLogger.debug('else");
  });

  it('should replace console log statements in functions', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);

    const sampleController = fs.readFileSync(paths.sample.controller, 'utf8');
    const sampleHelper = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(sampleController).to.include("logger.debug('This is a console.log message');");
    expect(sampleController).to.include("logger.info('This is a console.info message');");
    expect(sampleController).to.include("logger.warn('This is a console.warn message');");
    expect(sampleController).to.include("logger.error('This is a console.error message');");

    expect(sampleController).to.include('logger.debug(anObject);');

    expect(sampleHelper).to.include("myLogger.debug('This is a console.log message');");
  });

  it('should replace console log statements in promises', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);

    const sampleHelper = fs.readFileSync(paths.sample.helper, 'utf8');

    expect(sampleHelper).to.include('logger.debug("Promise resolved: " + data);');
    expect(sampleHelper).to.include('logger.error("Promise rejected: " + error);');
    expect(sampleHelper).to.include('logger.debug("Promise finally");');
  });
});