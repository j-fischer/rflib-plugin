import * as fs from 'node:fs';
import * as path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { RflibLoggingAuraInstrumentResult } from '../../../../../src/commands/rflib/logging/aura/instrument.js';

let testSession: TestSession;

describe('rflib logging aura instrument NUTs', () => {
  before('prepare session', async () => {
    testSession = await TestSession.create();

    const sampleCmp = `
<aura:component>
    <aura:attribute name="value" type="String" default="" />
    <aura:attribute name="isValid" type="Boolean" default="false" />
</aura:component>`;

    const sampleController = `({
    handleClick: function(component, event, helper) {
        try {
            helper.loadData(component);
        } catch(error) {
            console.error(error);
        }
    },
    
    processResult: function(component, event, helper) {
        var data = event.getParam('data');
        if (data.isValid) {
            component.set("v.value", data.value);
        }
    }
})`;

    const sampleHelper = `({
    loadData: function(component, params) {
        var action = component.get("c.getData");
        action.setParams(params);
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                component.set("v.value", response.getReturnValue());
            }
        });
        $A.enqueueAction(action);
    }
})`;

    const testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'aura', 'sampleComponent');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'sampleComponent.cmp'), sampleCmp);
    fs.writeFileSync(path.join(testDir, 'sampleComponentController.js'), sampleController);
    fs.writeFileSync(path.join(testDir, 'sampleComponentHelper.js'), sampleHelper);
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should process aura component in dry run mode', () => {
    const result = execCmd<RflibLoggingAuraInstrumentResult>(
      'rflib logging aura instrument --sourcepath force-app/main/default/aura --dryrun --json',
      {
        ensureExitCode: 0,
        cwd: testSession.dir,
      },
    ).jsonOutput?.result;

    expect(result?.processedFiles).to.equal(3);
    expect(result?.modifiedFiles).to.equal(3);
    expect(result?.formattedFiles).to.equal(0);
  });

  it('should modify aura component with logger statements', () => {
    execCmd('rflib logging aura instrument --sourcepath force-app/main/default/aura --json', {
      ensureExitCode: 0,
      cwd: testSession.dir,
    });

    const cmpContent = fs.readFileSync(
      path.join(testSession.dir, 'force-app', 'main', 'default', 'aura', 'sampleComponent', 'sampleComponent.cmp'),
      'utf8',
    );

    const controllerContent = fs.readFileSync(
      path.join(testSession.dir, 'force-app', 'main', 'default', 'aura', 'sampleComponent', 'sampleComponentController.js'),
      'utf8',
    );

    const helperContent = fs.readFileSync(
      path.join(testSession.dir, 'force-app', 'main', 'default', 'aura', 'sampleComponent', 'sampleComponentHelper.js'),
      'utf8',
    );

    // Check component modifications
    expect(cmpContent).to.include('<c:rflibLoggerCmp aura:id="logger" name="sampleComponent" appendComponentId="false" />');

    // Check controller modifications
    expect(controllerContent).to.include("var logger = component.find('logger')");
    expect(controllerContent).to.include("logger.info('handleClick({0})', [event])");
    expect(controllerContent).to.include("logger.error('An error occurred', error)");
    expect(controllerContent).to.include("logger.info('processResult({0})', [event])");

    // Check helper modifications
    expect(helperContent).to.include("var logger = component.find('logger')");
    expect(helperContent).to.include("logger.info('loadData({0}, {1})', [component, params])");
  });
});