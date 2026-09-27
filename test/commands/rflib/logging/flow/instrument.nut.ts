import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import * as xml2js from 'xml2js';
import RflibLoggingFlowInstrument from '../../../../../src/commands/rflib/logging/flow/instrument.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

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
    name?: string;
    value?: {
      stringValue?: string;
      booleanValue?: string;
    };
  }>;
}

type FlowFaultElement = {
  faultConnector?: {
    targetReference: string;
  };
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
    recordCreates?: FlowFaultElement;
    recordLookups?: FlowFaultElement;
    recordUpdates?: FlowFaultElement;
  };
}

// Use filename without dangling underscore
const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// Row returned by the Tooling API query for the packages installed in the target org
const installedRflib = (major: number, minor: number, patch: number, build: number): Record<string, unknown> => ({
  SubscriberPackageId: '033000000000001',
  SubscriberPackage: { Name: 'RFLIB' },
  SubscriberPackageVersion: {
    Id: '04t000000000001',
    MajorVersion: major,
    MinorVersion: minor,
    PatchVersion: patch,
    BuildNumber: build,
  },
});

describe('rflib logging flow instrument NUTs', () => {
  let installedPackages: Array<Record<string, unknown>> = [];
  let tempDir: string;
  let srcDir: string;
  let uxStubs: ReturnType<typeof stubSfCommandUx>;

  const harness = setupNut({
    tooling: {
      query: () => installedPackages,
    },
  });

  beforeEach(() => {
    installedPackages = [installedRflib(11, 4, 0, 1)];
    uxStubs = stubSfCommandUx(harness.$$.SANDBOX);
  });

  const instrument = (...flags: string[]): Promise<unknown> =>
    RflibLoggingFlowInstrument.run([
      '--target-org',
      harness.testOrg.username,
      '--sourcepath',
      path.join(tempDir, 'force-app'),
      ...flags,
    ]);

  const warnings = (): string[] =>
    uxStubs.warn.args.map(([warning]) => (typeof warning === 'string' ? warning : warning.message));

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rflib-flow-instrument-'));

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
    await fs.promises.rm(tempDir, { recursive: true, force: true });
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

    await instrument();

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

    await instrument();

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

    // 4. Ensure no conflicting startElementReference is present
    expect(modifiedFlow.Flow.startElementReference).to.be.undefined;
  });

  it('should respect the dryrun flag', async () => {
    const sampleFilesDir = path.join(dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);

    const originalContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');

    await instrument('--dryrun');

    const afterDryRunContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    expect(afterDryRunContent).to.equal(originalContent);
  });

  it('should respect the skip-instrumented flag', async () => {
    const sampleFilesDir = path.join(dirname, 'sample');
    const autoLaunchedFlowSourcePath = path.join(sampleFilesDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    const autoLaunchedFlowDestPath = path.join(srcDir, 'Flow_with_Free_Form_Layout.flow-meta.xml');
    await fs.promises.copyFile(autoLaunchedFlowSourcePath, autoLaunchedFlowDestPath);

    await instrument();

    const instrumentedContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const instrumentedFlow = await parseXml(instrumentedContent);

    const initialActionCallsCount = Array.isArray(instrumentedFlow.Flow.actionCalls)
      ? instrumentedFlow.Flow.actionCalls.length
      : (instrumentedFlow.Flow.actionCalls ? 1 : 0);

    await instrument('--skip-instrumented');

    const afterSkipContent = await fs.promises.readFile(autoLaunchedFlowDestPath, 'utf8');
    const afterSkipFlow = await parseXml(afterSkipContent);

    const finalActionCallsCount = Array.isArray(afterSkipFlow.Flow.actionCalls)
      ? afterSkipFlow.Flow.actionCalls.length
      : (afterSkipFlow.Flow.actionCalls ? 1 : 0);

    expect(finalActionCallsCount).to.equal(initialActionCallsCount);
  });

  it('should instrument decision paths with logging', async () => {
    const sampleFilesDir = path.join(dirname, 'sample');
    const decisionFlowSourcePath = path.join(sampleFilesDir, 'Decision_Path_Test.flow-meta.xml');
    const decisionFlowPath = path.join(srcDir, 'Decision_Path_Test.flow-meta.xml');
    await fs.promises.copyFile(decisionFlowSourcePath, decisionFlowPath);

    await instrument();

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
      action?.name?.includes('RFLIB_Flow_Logger_Decision_') === true
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

    expect(modifiedFlow.Flow.start?.connector?.targetReference).to.equal(flowInvocationLogger?.name);

    const canvasModeMetadata = modifiedFlow.Flow.processMetadataValues.find(
      (meta: FlowMetadata) => meta.name === 'CanvasMode'
    );

    expect(canvasModeMetadata).to.exist;
    expect(canvasModeMetadata?.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
  });

  const getActionCalls = (flowObj: Flow): FlowAction[] => {
    const actionCalls = flowObj.Flow.actionCalls;
    if (!actionCalls) {
      return [];
    }
    return Array.isArray(actionCalls) ? actionCalls : [actionCalls];
  };

  const getParameter = (action: FlowAction | undefined, name: string): { stringValue?: string; booleanValue?: string } | undefined =>
    action?.inputParameters?.find(param => param.name === name)?.value;

  const copyFaultPathSample = async (): Promise<string> => {
    const faultFlowPath = path.join(srcDir, 'Fault_Path_Test.flow-meta.xml');
    await fs.promises.copyFile(path.join(dirname, 'sample', 'Fault_Path_Test.flow-meta.xml'), faultFlowPath);
    return faultFlowPath;
  };

  it('should instrument fault paths with error logging', async () => {
    const faultFlowPath = await copyFaultPathSample();

    await instrument();

    expect(harness.toolingQueries).to.have.lengthOf(1);
    expect(harness.toolingQueries[0]).to.include('FROM InstalledSubscriberPackage');
    expect(warnings()).to.deep.equal([]);

    const modifiedFlow = await parseXml(await fs.promises.readFile(faultFlowPath, 'utf8'));
    const actionCalls = getActionCalls(modifiedFlow);
    const findAction = (name?: string): FlowAction | undefined => actionCalls.find(action => action.name === name);

    // Elements without a fault path get one that logs the error and terminates the transaction
    [modifiedFlow.Flow.recordLookups, modifiedFlow.Flow.recordCreates].forEach(element => {
      const faultLogger = findAction(element?.faultConnector?.targetReference);

      expect(faultLogger?.name).to.match(/^RFLIB_Flow_Logger_Fault_/);
      expect(getParameter(faultLogger, 'logLevel')?.stringValue).to.equal('ERROR');
      expect(getParameter(faultLogger, 'message')?.stringValue).to.contain('{!$Flow.FaultMessage}');
      expect(getParameter(faultLogger, 'terminateTransaction')?.booleanValue).to.equal('true');
      expect(faultLogger?.connector).to.be.undefined;
    });

    // Existing fault paths continue after the logger without terminating the transaction
    const updateLogger = findAction(modifiedFlow.Flow.recordUpdates?.faultConnector?.targetReference);

    expect(updateLogger?.name).to.match(/^RFLIB_Flow_Logger_Fault_Update_Account_/);
    expect(getParameter(updateLogger, 'logLevel')?.stringValue).to.equal('ERROR');
    expect(getParameter(updateLogger, 'terminateTransaction')).to.be.undefined;
    expect(updateLogger?.connector?.targetReference).to.equal('Handle_Update_Error');
  });

  it('should not add fault paths to RFLIB log actions or stack fault loggers on consecutive runs', async () => {
    const faultFlowPath = await copyFaultPathSample();

    await instrument();
    await instrument();

    const modifiedFlow = await parseXml(await fs.promises.readFile(faultFlowPath, 'utf8'));
    const actionCalls = getActionCalls(modifiedFlow) as Array<FlowAction & FlowFaultElement>;

    const faultLoggers = actionCalls.filter(action => action.name?.startsWith('RFLIB_Flow_Logger_Fault_'));
    expect(faultLoggers).to.have.lengthOf(3);

    actionCalls
      .filter(action => action.actionName === 'rflib_LoggerFlowAction')
      .forEach(action => expect(action.faultConnector, `${action.name ?? ''} must not have a fault path`).to.be.undefined);

    const updateLogger = actionCalls.find(action => action.name === modifiedFlow.Flow.recordUpdates?.faultConnector?.targetReference);
    expect(updateLogger?.connector?.targetReference).to.equal('Handle_Update_Error');
  });

  it('should respect the skip-fault-paths flag', async () => {
    const faultFlowPath = await copyFaultPathSample();

    await instrument('--skip-fault-paths');

    // The RFLIB version is irrelevant when fault paths are skipped, so the org isn't queried
    expect(harness.toolingQueries).to.deep.equal([]);
    expect(warnings()).to.deep.equal([]);
    await expectFaultPathsSkipped(faultFlowPath);
  });

  const expectFaultPathsSkipped = async (faultFlowPath: string): Promise<void> => {
    const modifiedFlow = await parseXml(await fs.promises.readFile(faultFlowPath, 'utf8'));

    expect(hasRFLIBLogger(modifiedFlow)).to.be.true;
    expect(getActionCalls(modifiedFlow).some(action => action.name?.startsWith('RFLIB_Flow_Logger_Fault_'))).to.be.false;
    expect(modifiedFlow.Flow.recordCreates?.faultConnector).to.be.undefined;
    expect(modifiedFlow.Flow.recordUpdates?.faultConnector?.targetReference).to.equal('Handle_Update_Error');
  };

  it('should skip fault paths with a warning if the target org runs an RFLIB version before 11.4.0', async () => {
    installedPackages = [installedRflib(11, 3, 1, 1)];
    const faultFlowPath = await copyFaultPathSample();

    await instrument();

    expect(harness.toolingQueries[0]).to.include('FROM InstalledSubscriberPackage');
    expect(warnings()).to.have.lengthOf(1);
    expect(warnings()[0]).to.include('the target org runs RFLIB 11.3.1-1');
    expect(warnings()[0]).to.include('requires RFLIB 11.4.0 or later');
    await expectFaultPathsSkipped(faultFlowPath);
  });

  it('should skip fault paths with a warning if RFLIB is not installed as a package in the target org', async () => {
    installedPackages = [];
    const faultFlowPath = await copyFaultPathSample();

    await instrument();

    expect(warnings()).to.have.lengthOf(1);
    expect(warnings()[0]).to.include('RFLIB is not installed as a package in the target org');
    await expectFaultPathsSkipped(faultFlowPath);
  });

  it('should require the target-org flag', async () => {
    const faultFlowPath = await copyFaultPathSample();
    const originalContent = await fs.promises.readFile(faultFlowPath, 'utf8');

    try {
      await RflibLoggingFlowInstrument.run(['--sourcepath', path.join(tempDir, 'force-app')]);
      expect.fail('Expected the command to fail without a target org');
    } catch (error) {
      expect((error as Error).name).to.equal('NoDefaultEnvError');
    }

    expect(await fs.promises.readFile(faultFlowPath, 'utf8')).to.equal(originalContent);
  });
});
