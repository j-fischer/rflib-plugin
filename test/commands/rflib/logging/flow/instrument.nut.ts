import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import * as xml2js from 'xml2js';

type FlowMetadata = {
  name: string;
  value: {
    stringValue: string;
  };
}

type FlowAction = {
  name?: string;
  actionName?: string;
  connector?: {
    targetReference: string;
  };
  inputParameters?: Array<{
    value?: {
      stringValue?: string;
    };
  }>;
}

type FlowRule = {
  connector: {
    targetReference: string;
  };
}

type FlowDecision = {
  defaultConnector: {
    targetReference: string;
  };
  rules: FlowRule | FlowRule[];
}

type Flow = {
  Flow: {
    processMetadataValues: FlowMetadata[];
    actionCalls?: FlowAction | FlowAction[];
    processType?: string;
    startElementReference?: string;
    start?: {
      connector: {
        targetReference: string;
      };
      locationX: number;
      locationY: number;
      object?: string;
      recordTriggerType?: string;
      triggerType?: string;
    };
    decisions?: FlowDecision;
  };
}

// Use filename without dangling underscore
const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

describe('rflib logging flow instrument NUTs', () => {
  let testSession: TestSession;
  let tempDir: string;
  let srcDir: string;

  before(async () => {
    testSession = await TestSession.create();
    tempDir = testSession.dir;

    srcDir = path.join(tempDir, 'force-app', 'main', 'default', 'flows');
    await fs.promises.mkdir(srcDir, { recursive: true });

    const sampleFilesDir = path.join(dirname, 'sample');
    const sampleFiles = await fs.promises.readdir(sampleFilesDir);

    // Use Promise.all to handle multiple files in parallel
    await Promise.all(
      sampleFiles
        .filter(file => file.endsWith('.flow-meta.xml'))
        .map(file => fs.promises.copyFile(
          path.join(sampleFilesDir, file),
          path.join(srcDir, file)
        ))
    );
  });

  after(async () => {
    await testSession?.clean();
  });

  const parseXml = async (content: string): Promise<Flow> => {
    const parser = new xml2js.Parser({
      explicitArray: false,
      preserveChildrenOrder: true,
      xmlns: false
    });

    const result: unknown = await parser.parseStringPromise(content);
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid XML content');
    }
    return result as Flow;
  };

  const hasRFLIBLogger = (flowObj: Flow): boolean => {
    const actionCalls = flowObj?.Flow?.actionCalls;
    if (!actionCalls) {
      return false;
    }

    const actions = Array.isArray(actionCalls) ? actionCalls : [actionCalls];
    return actions.some(action =>
      action?.actionName === 'rflib:Logger' ||
      action?.actionName === 'rflib_LoggerFlowAction' ||
      action?.actionName === 'rflib_ApplicationEventLoggerAction' ||
      action?.name?.startsWith('RFLIB_Flow_Logger')
    );
  };

  it('should instrument the standard flow sample file', async () => {
    const standardFlowPath = path.join(srcDir, 'Verify_Identity_with_App_Event_Logging.flow-meta.xml');
    const originalContent = await fs.promises.readFile(standardFlowPath, 'utf8');

    const originalFlow = await parseXml(originalContent);
    const originalCanvasModeValues = originalFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );
    expect(originalCanvasModeValues?.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');

    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    execCmd(command, { ensureExitCode: 0 });

    const modifiedContent = await fs.promises.readFile(standardFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);

    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;

    const modifiedCanvasModeValues = modifiedFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );
    expect(modifiedCanvasModeValues?.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
  });

  it('should instrument an auto-launched flow and update canvas mode', async () => {
    // Reset the auto-launched flow sample to original state before testing
    const sampleFilesDir = path.join(dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowPath);
    const originalContent = await fs.promises.readFile(autoLaunchedFlowPath, 'utf8');

    const originalFlow = await parseXml(originalContent);
    const originalCanvasModeValues = originalFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );
    expect(originalCanvasModeValues?.value.stringValue).to.equal('FREE_FORM_CANVAS');

    expect(originalFlow.Flow.processType).to.equal('AutoLaunchedFlow');
    
    // Store the original target reference from the start element
    // This is important for testing the AutoLaunchedFlow start element structure
    const originalStartTarget = originalFlow.Flow.start?.connector?.targetReference;
    expect(originalStartTarget).to.exist;

    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    execCmd(command, { ensureExitCode: 0 });

    const modifiedContent = await fs.promises.readFile(autoLaunchedFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);

    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;

    const modifiedCanvasModeValues = modifiedFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );
    expect(modifiedCanvasModeValues?.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');

    expect(modifiedFlow.Flow.processType).to.equal('AutoLaunchedFlow');
    
    // Verify that start element connection chain is properly set up
    // 1. Find the logger action
    const actionCalls = Array.isArray(modifiedFlow.Flow.actionCalls) ? 
      modifiedFlow.Flow.actionCalls : [modifiedFlow.Flow.actionCalls];
      
    const loggerAction = actionCalls.find(action =>
      action?.name?.startsWith('RFLIB_Flow_Logger_') === true ||
      action?.name?.startsWith('RFLIBLogger') === true
    );
    expect(loggerAction).to.exist;
    
    // 2. Verify the logger's connector points to the original target
    expect(loggerAction?.connector?.targetReference).to.equal(originalStartTarget);
    
    // 3. Verify the start element now points to the logger
    expect(modifiedFlow.Flow.start?.connector?.targetReference).to.equal(loggerAction?.name);
  });

  it('should respect the dryrun flag', async () => {
    const sampleFilesDir = path.join(dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);

    const originalContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');

    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')} --dryrun`;
    execCmd(command, { ensureExitCode: 0 });

    const afterDryRunContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    expect(afterDryRunContent).to.equal(originalContent);
  });

  it('should respect the skip-instrumented flag', async () => {
    const sampleFilesDir = path.join(dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);

    let command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    execCmd(command, { ensureExitCode: 0 });

    const instrumentedContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const instrumentedFlow = await parseXml(instrumentedContent);

    const initialActionCallsCount = Array.isArray(instrumentedFlow.Flow.actionCalls)
      ? instrumentedFlow.Flow.actionCalls.length
      : (instrumentedFlow.Flow.actionCalls ? 1 : 0);

    command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')} --skip-instrumented`;
    execCmd(command, { ensureExitCode: 0 });

    const afterSkipContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const afterSkipFlow = await parseXml(afterSkipContent);

    const finalActionCallsCount = Array.isArray(afterSkipFlow.Flow.actionCalls)
      ? afterSkipFlow.Flow.actionCalls.length
      : (afterSkipFlow.Flow.actionCalls ? 1 : 0);

    expect(finalActionCallsCount).to.equal(initialActionCallsCount);
  });

  it('should instrument decision paths with logging', async () => {
    const decisionFlowContent = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>63.0</apiVersion>
  <decisions>
    <n>Check_Value</n>
    <label>Check Value</label>
    <locationX>182</locationX>
    <locationY>188</locationY>
    <defaultConnector>
      <targetReference>Default_Action</targetReference>
    </defaultConnector>
    <defaultConnectorLabel>Default Outcome</defaultConnectorLabel>
    <rules>
      <n>Condition_True</n>
      <conditionLogic>and</conditionLogic>
      <conditions>
        <leftValueReference>SomeValue</leftValueReference>
        <operator>EqualTo</operator>
        <rightValue>
          <booleanValue>true</booleanValue>
        </rightValue>
      </conditions>
      <connector>
        <targetReference>True_Action</targetReference>
      </connector>
      <label>Value Is True</label>
    </rules>
  </decisions>
  <assignments>
    <n>Default_Action</n>
    <label>Default Action</label>
    <locationX>50</locationX>
    <locationY>288</locationY>
    <assignmentItems>
      <assignToReference>Result</assignToReference>
      <operator>Assign</operator>
      <value>
        <stringValue>Default</stringValue>
      </value>
    </assignmentItems>
  </assignments>
  <assignments>
    <n>True_Action</n>
    <label>True Action</label>
    <locationX>314</locationX>
    <locationY>288</locationY>
    <assignmentItems>
      <assignToReference>Result</assignToReference>
      <operator>Assign</operator>
      <value>
        <stringValue>True</stringValue>
      </value>
    </assignmentItems>
  </assignments>
  <variables>
    <n>SomeValue</n>
    <dataType>Boolean</dataType>
    <isCollection>false</isCollection>
    <isInput>true</isInput>
    <isOutput>false</isOutput>
  </variables>
  <variables>
    <n>Result</n>
    <dataType>String</dataType>
    <isCollection>false</isCollection>
    <isInput>false</isInput>
    <isOutput>true</isOutput>
  </variables>
  <processType>Flow</processType>
  <start>
    <locationX>182</locationX>
    <locationY>88</locationY>
    <connector>
      <targetReference>Check_Value</targetReference>
    </connector>
  </start>
</Flow>`;

    const decisionFlowPath = path.join(srcDir, 'Decision_Path_Test.flow-meta.xml');
    await fs.promises.writeFile(decisionFlowPath, decisionFlowContent);

    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    execCmd(command, { ensureExitCode: 0 });

    const modifiedContent = await fs.promises.readFile(decisionFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);

    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;

    const actionCalls = Array.isArray(modifiedFlow.Flow.actionCalls)
      ? modifiedFlow.Flow.actionCalls
      : [modifiedFlow.Flow.actionCalls];

    const flowInvocationLogger = actionCalls.find((action: FlowAction | undefined): action is FlowAction =>
      action?.name !== undefined &&
      action.name.startsWith('RFLIB_Flow_Logger_') &&
      !action.name.includes('Decision_')
    );

    expect(flowInvocationLogger).to.exist;
    expect(flowInvocationLogger?.connector?.targetReference).to.equal('Check_Value');

    const decisionLoggers = actionCalls.filter((action: FlowAction | undefined): action is FlowAction =>
      action?.name !== undefined &&
      action.name.includes('RFLIB_Flow_Logger_Decision_')
    );

    expect(decisionLoggers.length).to.equal(2);

    const defaultPathLogger = decisionLoggers.find((action: FlowAction): boolean =>
      action.inputParameters?.some(param =>
        param.value?.stringValue?.includes('Default Outcome')
      ) ?? false
    );

    expect(defaultPathLogger).to.exist;
    expect(defaultPathLogger?.connector?.targetReference).to.equal('Default_Action');

    const rulePathLogger = decisionLoggers.find((action: FlowAction): boolean =>
      action.inputParameters?.some(param =>
        param.value?.stringValue?.includes('Value Is True')
      ) ?? false
    );

    expect(rulePathLogger).to.exist;
    expect(rulePathLogger?.connector?.targetReference).to.equal('True_Action');

    const decision = modifiedFlow.Flow.decisions!;
    expect(decision.defaultConnector.targetReference).to.equal(defaultPathLogger?.name);

    const rule = Array.isArray(decision.rules)
      ? decision.rules[0]
      : decision.rules;

    expect(rule.connector.targetReference).to.equal(rulePathLogger?.name);

    expect(modifiedFlow.Flow.startElementReference).to.equal(flowInvocationLogger?.name);

    const canvasModeMetadata = modifiedFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );

    expect(canvasModeMetadata).to.exist;
    expect(canvasModeMetadata?.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
  });
});