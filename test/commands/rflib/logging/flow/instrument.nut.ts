import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import * as xml2js from 'xml2js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('rflib logging flow instrument NUTs', () => {
  let testSession: TestSession;
  let tempDir: string;
  let srcDir: string;
  
  before(async () => {
    // Create a test session
    testSession = await TestSession.create();
    tempDir = testSession.dir;
    
    // Create source directory structure
    srcDir = path.join(tempDir, 'force-app', 'main', 'default', 'flows');
    await fs.promises.mkdir(srcDir, { recursive: true });
    
    // Copy the sample flow files to the test directory
    const sampleFilesDir = path.join(__dirname, 'sample');
    const sampleFiles = await fs.promises.readdir(sampleFilesDir);
    
    // Copy each sample file to the source directory
    for (const file of sampleFiles) {
      if (file.endsWith('.flow-meta.xml')) {
        const sourcePath = path.join(sampleFilesDir, file);
        const destPath = path.join(srcDir, file);
        await fs.promises.copyFile(sourcePath, destPath);
      }
    }
  });
  
  after(async () => {
    // Clean up
    await testSession?.clean();
  });
  
  // Helper function to parse XML content
  const parseXml = async (content: string) => {
    const parser = new xml2js.Parser({
      explicitArray: false,
      preserveChildrenOrder: true,
      xmlns: false
    });
    
    return parser.parseStringPromise(content);
  };
  
  // Helper function to check if flow has RFLIB logging
  const hasRFLIBLogger = (flowObj: any): boolean => {
    if (!flowObj?.Flow?.actionCalls) {
      return false;
    }
    
    const actionCalls = Array.isArray(flowObj.Flow.actionCalls)
      ? flowObj.Flow.actionCalls
      : [flowObj.Flow.actionCalls];
    
    return actionCalls.some(
      (action: any) => 
        action.actionName === 'rflib:Logger' || 
        action.actionName === 'rflib_LoggerFlowAction' ||
        action.actionName === 'rflib_ApplicationEventLoggerAction' ||
        (action.name && typeof action.name === 'string' && action.name.startsWith('RFLIB_Flow_Logger'))
    );
  };
  
  it('should instrument the standard flow sample file', async () => {
    // Get the original content of the standard flow
    const standardFlowPath = path.join(srcDir, 'Verify_Identity_with_App_Event_Logging.flow-meta.xml');
    const originalContent = await fs.promises.readFile(standardFlowPath, 'utf8');
    
    // Check the original CanvasMode
    const originalFlow = await parseXml(originalContent);
    const originalCanvasModeValues = originalFlow.Flow.processMetadataValues.find(
      (meta: any) => meta.name === 'CanvasMode'
    );
    expect(originalCanvasModeValues.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
    
    // Note: This flow already has RFLIB logging, so we'll run with skip-instrumented=false
    // to force instrumentation
    
    // Run the command
    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    const commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the modified file
    const modifiedContent = await fs.promises.readFile(standardFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);
    
    // Verify the file was modified with additional loggers
    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;
    
    // Verify the CanvasMode is still AUTO_LAYOUT_CANVAS
    const modifiedCanvasModeValues = modifiedFlow.Flow.processMetadataValues.find(
      (meta: any) => meta.name === 'CanvasMode'
    );
    expect(modifiedCanvasModeValues.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
  });
  
  it('should instrument an auto-launched flow and update canvas mode', async () => {
    // Get the original content of the auto-launched flow
    const autoLaunchedFlowPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const originalContent = await fs.promises.readFile(autoLaunchedFlowPath, 'utf8');
    
    // Check the original canvas mode is FREE_FORM_CANVAS
    const originalFlow = await parseXml(originalContent);
    const originalCanvasModeValues = originalFlow.Flow.processMetadataValues.find(
      (meta: any) => meta.name === 'CanvasMode'
    );
    expect(originalCanvasModeValues.value.stringValue).to.equal('FREE_FORM_CANVAS');
    
    // Check the process type is AutoLaunchedFlow
    expect(originalFlow.Flow.processType).to.equal('AutoLaunchedFlow');
    
    // Run the command
    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    const commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the modified file
    const modifiedContent = await fs.promises.readFile(autoLaunchedFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);
    
    // Verify the file was instrumented with RFLIB logging
    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;
    
    // Verify the CanvasMode was updated to AUTO_LAYOUT_CANVAS
    const modifiedCanvasModeValues = modifiedFlow.Flow.processMetadataValues.find(
      (meta: any) => meta.name === 'CanvasMode'
    );
    expect(modifiedCanvasModeValues.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
    
    // Verify the process type remains AutoLaunchedFlow
    expect(modifiedFlow.Flow.processType).to.equal('AutoLaunchedFlow');
  });
  
  it('should respect the dryrun flag', async () => {
    // First reset the files
    const sampleFilesDir = path.join(__dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);
    
    // Get the original content
    const originalContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    
    // Run the command with dryrun flag
    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')} --dryrun`;
    const commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the file and verify it was not modified
    const afterDryRunContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    expect(afterDryRunContent).to.equal(originalContent);
  });
  
  it('should respect the skip-instrumented flag', async () => {
    // First reset and then instrument the flow file
    const sampleFilesDir = path.join(__dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);
    
    // First instrument the file
    let command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    let commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the instrumented content
    const instrumentedContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const instrumentedFlow = await parseXml(instrumentedContent);
    
    // Count the number of logger actions
    const initialActionCallsCount = Array.isArray(instrumentedFlow.Flow.actionCalls) 
      ? instrumentedFlow.Flow.actionCalls.length 
      : (instrumentedFlow.Flow.actionCalls ? 1 : 0);
    
    // Run the command again with skip-instrumented flag
    command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')} --skip-instrumented`;
    commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the file again
    const afterSkipContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const afterSkipFlow = await parseXml(afterSkipContent);
    
    // Verify the number of action calls did not increase
    const finalActionCallsCount = Array.isArray(afterSkipFlow.Flow.actionCalls) 
      ? afterSkipFlow.Flow.actionCalls.length 
      : (afterSkipFlow.Flow.actionCalls ? 1 : 0);
    
    expect(finalActionCallsCount).to.equal(initialActionCallsCount);
  });
  
  it('should instrument decision paths with logging', async () => {
    // Create a new flow with a decision element to test decision path instrumentation
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
    
    // Write this flow to a file
    const decisionFlowPath = path.join(srcDir, 'Decision_Path_Test.flow-meta.xml');
    await fs.promises.writeFile(decisionFlowPath, decisionFlowContent);
    
    // Run the command
    const command = `rflib logging flow instrument --sourcepath ${path.join(tempDir, 'force-app')}`;
    const commandResult = execCmd(command, { ensureExitCode: 0 });
    
    // Read the modified file
    const modifiedContent = await fs.promises.readFile(decisionFlowPath, 'utf8');
    const modifiedFlow = await parseXml(modifiedContent);
    
    // Verify the file was instrumented
    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;
    
    // Verify there's a flow invocation logger
    const actionCalls = Array.isArray(modifiedFlow.Flow.actionCalls)
      ? modifiedFlow.Flow.actionCalls
      : [modifiedFlow.Flow.actionCalls];
    
    // Find the logger for flow invocation (should be connected to the original start element target)
    const flowInvocationLogger = actionCalls.find((action: any) => 
      action.name && 
      action.name.startsWith('RFLIB_Flow_Logger_') && 
      !action.name.includes('Decision_')
    );
    
    expect(flowInvocationLogger).to.exist;
    expect(flowInvocationLogger.connector.targetReference).to.equal('Check_Value');
    
    // Find loggers for decision paths
    const decisionLoggers = actionCalls.filter((action: any) => 
      action.name && 
      action.name.includes('RFLIB_Flow_Logger_Decision_')
    );
    
    // Should have 2 decision loggers (one for default path, one for rule path)
    expect(decisionLoggers.length).to.equal(2);
    
    // Check decision default path logger
    const defaultPathLogger = decisionLoggers.find((action: any) => 
      action.inputParameters.some((param: any) => 
        param.value && 
        param.value.stringValue && 
        param.value.stringValue.includes('Default Outcome')
      )
    );
    
    expect(defaultPathLogger).to.exist;
    expect(defaultPathLogger.connector.targetReference).to.equal('Default_Action');
    
    // Check decision rule path logger
    const rulePathLogger = decisionLoggers.find((action: any) => 
      action.inputParameters.some((param: any) => 
        param.value && 
        param.value.stringValue && 
        param.value.stringValue.includes('Value Is True')
      )
    );
    
    expect(rulePathLogger).to.exist;
    expect(rulePathLogger.connector.targetReference).to.equal('True_Action');
    
    // Verify the decision's connectors now point to the loggers
    const decision = modifiedFlow.Flow.decisions;
    expect(decision.defaultConnector.targetReference).to.equal(defaultPathLogger.name);
    
    const rule = Array.isArray(decision.rules) 
      ? decision.rules[0] 
      : decision.rules;
      
    expect(rule.connector.targetReference).to.equal(rulePathLogger.name);
    
    // Verify the startElementReference now points to the flow invocation logger
    expect(modifiedFlow.Flow.startElementReference).to.equal(flowInvocationLogger.name);
    
    // Verify the CanvasMode is set to AUTO_LAYOUT_CANVAS
    const canvasModeMetadata = modifiedFlow.Flow.processMetadataValues.find(
      (meta: any) => meta.name === 'CanvasMode'
    );
    
    expect(canvasModeMetadata).to.exist;
    expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
  });
});