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
  });

  beforeEach(() => {
    // Reset files before each test
    fs.writeFileSync(sampleCmpPath, originalContent.cmp);
    fs.writeFileSync(sampleControllerPath, originalContent.controller);
    fs.writeFileSync(sampleHelperPath, originalContent.helper);
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should add logger component to cmp file', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);
    const modifiedContent = fs.readFileSync(sampleCmpPath, 'utf8');

    expect(modifiedContent).to.include('<c:rflibLoggerCmp aura:id="logger" name="sampleComponent" appendComponentId="false" />');
  });

  it('should add logger initialization to controller methods', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);
    const modifiedContent = fs.readFileSync(sampleControllerPath, 'utf8');

    expect(modifiedContent).to.include("var logger = component.find('logger')");
    expect(modifiedContent).to.include("logger.info('handleClick({0})', [event])");
    expect(modifiedContent).to.include("logger.info('processResult({0})', [event])");
  });

  it('should add logger initialization to helper methods', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);
    const modifiedContent = fs.readFileSync(sampleHelperPath, 'utf8');

    expect(modifiedContent).to.include("var logger = component.find('logger')");
    expect(modifiedContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
  });

  it('should add error logging to catch blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);
    const modifiedContent = fs.readFileSync(sampleControllerPath, 'utf8');

    expect(modifiedContent).to.include("logger.error('An error occurred', error)");
  });

  it('should convert single line if statements to blocks', async () => {
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir]);
    const modifiedControllerContent = fs.readFileSync(sampleControllerPath, 'utf8');
    const modifiedHelperContent = fs.readFileSync(sampleHelperPath, 'utf8');

    expect(modifiedControllerContent).to.match(/if \(data.isValid\) {\s+logger\.debug.*\s+component\.set\("v.value", data\.value\);\s+}/);
    expect(modifiedHelperContent).to.match(/if \(response.getState\(\) === "SUCCESS"\) {\s+logger\.debug.*\s+component\.set\("v\.value", response\.getReturnValue\(\)\);\s+}/);
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

  it('should skip instrumented components when skip-instrumented flag is used', async () => {
    // Create a directory for the instrumented component
    const instrumentedDir = path.join(sourceDir, 'main', 'default', 'aura', 'instrumentedComponent');
    fs.mkdirSync(instrumentedDir, { recursive: true });

    // Create instrumented component files
    const instrumentedCmpPath = path.join(instrumentedDir, 'instrumentedComponent.cmp');
    const instrumentedControllerPath = path.join(instrumentedDir, 'instrumentedComponentController.js');

    // Create already instrumented content
    const instrumentedCmpContent = `<aura:component>
        <aura:attribute name="value" type="String" />
        <c:rflibLoggerCmp aura:id="logger" name="instrumentedComponent" appendComponentId="false" />
    </aura:component>`;

    const instrumentedControllerContent = `({
        handleClick: function(component, event) {
            var logger = component.find('logger');
            logger.info('handleClick({0})', [event]);
            // Some logic here
        }
    })`;

    // Write instrumented files
    fs.writeFileSync(instrumentedCmpPath, instrumentedCmpContent);
    fs.writeFileSync(instrumentedControllerPath, instrumentedControllerContent);

    // Save original content to verify it doesn't change
    const originalInstrumentedCmpContent = fs.readFileSync(instrumentedCmpPath, 'utf8');
    const originalInstrumentedControllerContent = fs.readFileSync(instrumentedControllerPath, 'utf8');

    // Run instrumentation with skip-instrumented flag
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--skip-instrumented']);

    // Verify instrumented component was skipped
    const finalInstrumentedCmpContent = fs.readFileSync(instrumentedCmpPath, 'utf8');
    const finalInstrumentedControllerContent = fs.readFileSync(instrumentedControllerPath, 'utf8');

    expect(finalInstrumentedCmpContent).to.equal(originalInstrumentedCmpContent);
    expect(finalInstrumentedControllerContent).to.equal(originalInstrumentedControllerContent);

    // Verify regular component was instrumented
    const regularCmpContent = fs.readFileSync(sampleCmpPath, 'utf8');
    const regularControllerContent = fs.readFileSync(sampleControllerPath, 'utf8');

    expect(regularCmpContent).to.include('<c:rflibLoggerCmp');
    expect(regularControllerContent).to.include("logger.info('handleClick({0})', [event])");
  });

  it('should handle mixed instrumentation states when skip-instrumented flag is used', async () => {
    // Create a directory for the mixed instrumentation component
    const mixedDir = path.join(sourceDir, 'main', 'default', 'aura', 'mixedComponent');
    fs.mkdirSync(mixedDir, { recursive: true });

    // Create component files
    const mixedCmpPath = path.join(mixedDir, 'mixedComponent.cmp');
    const mixedControllerPath = path.join(mixedDir, 'mixedComponentController.js');
    const mixedHelperPath = path.join(mixedDir, 'mixedComponentHelper.js');

    // Create component with logger already present
    const mixedCmpContent = `<aura:component>
        <aura:attribute name="value" type="String" />
        <c:rflibLoggerCmp aura:id="logger" name="mixedComponent" appendComponentId="false" />
    </aura:component>`;

    // Create controller that's already instrumented
    const instrumentedControllerContent = `({
        handleClick: function(component, event) {
            var logger = component.find('logger');
            logger.info('handleClick({0})', [event]);
            if (event.getSource()) {
                logger.debug('if (event.getSource())');
                component.set('v.value', event.getSource().get('v.value'));
            }
        }
    })`;

    // Create helper that's not instrumented
    const uninstrumentedHelperContent = `({
        loadData: function(component, params) {
            var action = component.get('c.serverAction');
            action.setParams(params);
            action.setCallback(this, function(response) {
                if (response.getState() === "SUCCESS") {
                    component.set('v.value', response.getReturnValue());
                }
            });
            $A.enqueueAction(action);
        }
    })`;

    // Write the files
    fs.writeFileSync(mixedCmpPath, mixedCmpContent);
    fs.writeFileSync(mixedControllerPath, instrumentedControllerContent);
    fs.writeFileSync(mixedHelperPath, uninstrumentedHelperContent);

    // Save original content to verify selective changes
    const originalControllerContent = fs.readFileSync(mixedControllerPath, 'utf8');
    const originalHelperContent = fs.readFileSync(mixedHelperPath, 'utf8');

    // Run instrumentation with skip-instrumented flag
    await RflibLoggingAuraInstrument.run(['--sourcepath', sourceDir, '--skip-instrumented']);

    // Verify controller was skipped (should be unchanged)
    const finalControllerContent = fs.readFileSync(mixedControllerPath, 'utf8');
    expect(finalControllerContent).to.equal(originalControllerContent);

    // Verify helper was instrumented (should be changed)
    const finalHelperContent = fs.readFileSync(mixedHelperPath, 'utf8');
    expect(finalHelperContent).to.not.equal(originalHelperContent);
    expect(finalHelperContent).to.include("var logger = component.find('logger')");
    expect(finalHelperContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
    expect(finalHelperContent).to.include("logger.debug('if (response.getState() === \"SUCCESS\")')");
  });
});