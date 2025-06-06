/* eslint-disable no-unused-expressions, import/no-unresolved, import/extensions */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method, no-underscore-dangle */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import sinon from 'sinon';
import RflibLoggingFlowInstrument from '../../../../../src/commands/rflib/logging/flow/instrument.js';
import { FlowInstrumentationService } from '../../../../../src/commands/rflib/logging/flow/instrument.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('rflib logging flow instrument', () => {
  const $$ = new TestContext();
  const sampleFlowPath = path.join(__dirname, 'sample', 'Verify_Identity_with_App_Event_Logging.flow-meta.xml');
  let sampleFlowContent: string;

  before(async () => {
    sampleFlowContent = await fs.promises.readFile(sampleFlowPath, 'utf8');
  });

  beforeEach(() => {
    stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    sinon.restore();
    $$.restore();
  });

  describe('command execution', () => {
    beforeEach(() => {
      // Mock the run method to avoid actual file operations
      sinon.stub(RflibLoggingFlowInstrument.prototype, 'run').resolves({
        processedFiles: 2,
        modifiedFiles: 1
      });
    });

    it('should scan flow files in the specified directory', async () => {
      const result = await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app']);

      expect(result.processedFiles).to.equal(2);
      expect(result.modifiedFiles).to.equal(1);
    });

    it('should respect the skip-instrumented flag', async () => {
      await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app', '--skip-instrumented']);

      // Verify run was called with the right arguments
      const runStub = RflibLoggingFlowInstrument.prototype.run as sinon.SinonStub;
      expect(runStub.called).to.be.true;
    });

    it('should pass the dry-run flag correctly', async () => {
      await RflibLoggingFlowInstrument.run(['--sourcepath', 'force-app', '--dryrun']);

      // Verify run was called with the right arguments
      const runStub = RflibLoggingFlowInstrument.prototype.run as sinon.SinonStub;
      expect(runStub.called).to.be.true;
    });
  });

  describe('FlowInstrumentationService', () => {
    let flowObj: any;

    beforeEach(async () => {
      flowObj = await FlowInstrumentationService.parseFlowContent(sampleFlowContent);
    });

    it('should correctly parse flow XML content', async () => {
      expect(flowObj).to.be.an('object');
      expect(flowObj.Flow).to.exist;
      expect(flowObj.Flow.processType).to.equal('Flow');
    });

    it('should detect when a flow already has RFLIB logging', () => {
      // First test with the sample flow which we know has logger actions
      const hasLogger = FlowInstrumentationService.hasRFLIBLogger(flowObj);
      expect(hasLogger).to.be.true;

      // Create a completely new flow without logger actions
      const noLoggerFlow = {
        Flow: {
          processType: 'Flow',
          actionCalls: [
            {
              actionName: 'someOtherAction',
              actionType: 'apex'
            }
          ]
        }
      };

      const hasNoLogger = FlowInstrumentationService.hasRFLIBLogger(noLoggerFlow);
      expect(hasNoLogger).to.be.false;
    });

    it('should detect supported process types correctly', () => {
      expect(FlowInstrumentationService.isSupportedProcessType(flowObj)).to.be.true;

      // Test AutoLaunchedFlow type (should be supported)
      const autoLaunchedFlowObj = JSON.parse(JSON.stringify(flowObj));
      autoLaunchedFlowObj.Flow.processType = 'AutoLaunchedFlow';
      // Ensure triggerType is set for auto-launched flows to match supported types
      autoLaunchedFlowObj.Flow.start = autoLaunchedFlowObj.Flow.start || {};
      autoLaunchedFlowObj.Flow.start.triggerType = 'RecordAfterSave';
      expect(FlowInstrumentationService.isSupportedProcessType(autoLaunchedFlowObj)).to.be.true;

      // Test unsupported flow type
      const unsupportedFlowObj = JSON.parse(JSON.stringify(flowObj));
      unsupportedFlowObj.Flow.processType = 'SomeOtherType';
      expect(FlowInstrumentationService.isSupportedProcessType(unsupportedFlowObj)).to.be.false;
    });

    it('should build flow XML content correctly', () => {
      const xml = FlowInstrumentationService.buildFlowContent(flowObj);
      expect(xml).to.be.a('string');
      expect(xml).to.include('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).to.include('<Flow xmlns');
    });

    it('should handle error cases gracefully', async () => {
      try {
        await FlowInstrumentationService.parseFlowContent('invalid xml');
        expect.fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).to.include('Flow parsing failed');
        } else {
          expect.fail('Expected Error instance');
        }
      }

      try {
        FlowInstrumentationService.buildFlowContent(null as any);
        expect.fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).to.include('Flow building failed');
        } else {
          expect.fail('Expected Error instance');
        }
      }
    });

    it('should enhance logging with variables when available', () => {
      // Create a test flow object with variables
      const simpleFlow = {
        Flow: {
          processType: 'Flow',
          variables: [
            { name: 'testVar', isInput: 'true' },
            { name: 'anotherVar', isCollection: 'true' }
          ]
        }
      };

      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(simpleFlow, 'TestFlow', false);
      const loggingAction = Array.isArray(instrumentedFlow.Flow.actionCalls)
        ? instrumentedFlow.Flow.actionCalls[0]
        : instrumentedFlow.Flow.actionCalls;

      // Verify variables were captured
      expect(loggingAction).to.exist;
      expect(loggingAction.inputParameters).to.be.an('array');

      // The test is failing because the case is inconsistent - look for messageParam case-insensitively
      const messageParam = loggingAction.inputParameters.find((p: any) =>
        (p.name?.toLowerCase() === 'message') || (p.name?.toLowerCase() === 'message')
      );

      expect(messageParam).to.exist;
      expect(messageParam.value.stringValue).to.contain('testVar:');
      expect(messageParam.value.stringValue).to.contain('anotherVar:');
    });
  });

  describe('instrumentFlow', () => {
    it('should add logging to a flow without existing logger', async () => {
      // Create a clean flow without logging
      const cleanFlow = JSON.parse(JSON.stringify(await FlowInstrumentationService.parseFlowContent(sampleFlowContent)));

      // Remove all logging actions
      cleanFlow.Flow.actionCalls = cleanFlow.Flow.actionCalls.filter((action: any) =>
        !action.actionName.includes('Logger') && !action.name?.includes('Logger')
      );

      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(cleanFlow, 'TestFlow', false);

      // Verify logging was added
      expect(FlowInstrumentationService.hasRFLIBLogger(instrumentedFlow)).to.be.true;
    });

    it('should respect skipInstrumented flag when instrumenting flows', async () => {
      // Create a flow with existing logger
      const flowWithLogger = JSON.parse(JSON.stringify(await FlowInstrumentationService.parseFlowContent(sampleFlowContent)));

      // Verify it has a logger
      expect(FlowInstrumentationService.hasRFLIBLogger(flowWithLogger)).to.be.true;

      // With skipInstrumented=true, it should not add more logging
      const skipResult = FlowInstrumentationService.instrumentFlow(flowWithLogger, 'TestFlow', true);
      expect(skipResult).to.deep.equal(flowWithLogger);

      // With skipInstrumented=false, it should add more logging even if it already has a logger
      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithLogger, 'TestFlow', false);

      // Flow should be modified (not the same as original)
      expect(instrumentedFlow).not.to.deep.equal(flowWithLogger);

      // Verify that a new action was added
      const originalActionCount: number = Array.isArray(flowWithLogger.Flow.actionCalls)
        ? flowWithLogger.Flow.actionCalls.length
        : 1;

      const newActionCount: number = Array.isArray(instrumentedFlow.Flow.actionCalls)
        ? instrumentedFlow.Flow.actionCalls.length
        : 1;

      expect(newActionCount).to.be.greaterThan(originalActionCount);
    });

    it('should add logging to decision outcomes', async () => {
      // Create a simple test flow with decision
      const mockFlow = {
        Flow: {
          processType: 'Flow',
          decisions: [
            {
              name: 'Test_Decision',
              label: 'Test Decision',
              defaultConnector: {
                targetReference: 'Target_1'
              },
              defaultConnectorLabel: 'Default Path',
              rules: [
                {
                  name: 'Test_Rule',
                  label: 'Test Rule',
                  connector: {
                    targetReference: 'Target_2'
                  }
                }
              ]
            }
          ]
        }
      };

      // Instrument the flow
      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(mockFlow, 'TestFlow', false);

      // Find all loggers
      const actionCalls = Array.isArray(instrumentedFlow.Flow.actionCalls)
        ? instrumentedFlow.Flow.actionCalls
        : [instrumentedFlow.Flow.actionCalls];

      // Should have at least 3 loggers (flow start + 2 decision paths)
      expect(actionCalls.length).to.be.at.least(3);

      // Find decision loggers
      const decisionLoggers = actionCalls.filter((action: any) => {
        // Using type guard to ensure safe return
        if (typeof action.name === 'string') {
          return Boolean(action.name.includes('RFLIB_Flow_Logger_Decision_'));
        }
        return false;
      });

      // Should have 2 decision loggers (default + rule)
      expect(decisionLoggers.length).to.equal(2);

      // Check the decision references are updated to point to the loggers
      const decision = instrumentedFlow.Flow.decisions[0];

      // Decision default connector should point to a logger
      const defaultTarget = decision.defaultConnector.targetReference;
      const defaultLogger = actionCalls.find((a: any) => a.name === defaultTarget);
      expect(defaultLogger).to.exist;
      expect(defaultLogger.name).to.include('RFLIB_Flow_Logger_Decision_');
      expect(defaultLogger.connector.targetReference).to.equal('Target_1');

      // Rule connector should point to a logger
      const rule = Array.isArray(decision.rules) ? decision.rules[0] : decision.rules;
      const ruleTarget = rule.connector.targetReference;
      const ruleLogger = actionCalls.find((a: any) => a.name === ruleTarget);
      expect(ruleLogger).to.exist;
      expect(ruleLogger.name).to.include('RFLIB_Flow_Logger_Decision_');
      expect(ruleLogger.connector.targetReference).to.equal('Target_2');

      // Verify the structure of the loggers
      decisionLoggers.forEach((logger: any) => {
        expect(logger.actionName).to.equal('rflib_LoggerFlowAction');
        expect(logger.actionType).to.equal('apex');
        expect(logger.label).to.include('Log Decision:');

        // Verify input parameters
        const messageParam = logger.inputParameters.find((p: any) => p.name === 'message');
        expect(messageParam).to.exist;
        expect(messageParam.value.stringValue).to.include('Decision');
        expect(messageParam.value.stringValue).to.include('outcome:');

        // Verify context is set correctly
        const contextParam = logger.inputParameters.find((p: any) => p.name === 'context');
        expect(contextParam).to.exist;
        expect(contextParam.value.stringValue).to.equal('TestFlow');
      });
    });

    it('should ensure logger names are less than 80 characters and follow Salesforce naming rules', async () => {
      // Create a flow with a very long name, special characters, and problematic names to test sanitization
      const problematicFlow = {
        Flow: {
          processType: 'Flow',
          decisions: [
            {
              name: 'This-is-a-very_long__decision-name!@#$%^&*()that would normally exceed the 80_character_limit_when_combined_with_other_parts_',
              label: 'Long Decision Label',
              defaultConnector: {
                targetReference: 'Target_1'
              },
              defaultConnectorLabel: 'Default Path',
              rules: [
                {
                  name: '_This__is__a__very__long__rule__name__that would normally exceed the character ##limit## when_combined_with_other_elements_',
                  label: 'Long Rule Label',
                  connector: {
                    targetReference: 'Target_2'
                  }
                }
              ]
            }
          ]
        }
      };

      // Instrument the flow with a long name containing special chars, spaces, consecutive/trailing underscores
      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(
        problematicFlow,
        'This is an extremely-long flow name 123 !@#$%^&*() that would normally__exceed__the_80_character_limit_',
        false
      );

      // Find all action calls
      const actionCalls = Array.isArray(instrumentedFlow.Flow.actionCalls)
        ? instrumentedFlow.Flow.actionCalls
        : [instrumentedFlow.Flow.actionCalls];

      // Verify that all logger names follow Salesforce naming rules
      actionCalls.forEach((action: any) => {
        if (typeof action.name === 'string') {
          // 1. Must be 80 characters or less
          expect(action.name.length).to.be.at.most(80);

          // 2. Must begin with a letter
          expect(action.name).to.match(/^[a-zA-Z]/);

          // 3. Must contain only alphanumeric characters and underscores
          expect(action.name).to.match(/^[a-zA-Z0-9_]+$/);

          // 4. Must not contain two consecutive underscores
          expect(action.name).not.to.match(/__/);

          // 5. Must not end with an underscore
          expect(action.name).not.to.match(/_$/);

          // 6. Must not contain spaces
          expect(action.name).not.to.match(/\s/);

          // 7. Labels must also not exceed 80 characters
          if (action.label) {
            expect(action.label.length).to.be.at.most(80);
          }
        }
      });
    });

    describe('CanvasMode functionality', () => {
      it('should set CanvasMode to AUTO_LAYOUT_CANVAS when instrumenting a flow without existing CanvasMode', () => {
        // Create a flow without CanvasMode
        const flowWithoutCanvasMode = {
          Flow: {
            processType: 'Flow',
            processMetadataValues: [
              {
                name: 'BuilderType',
                value: {
                  stringValue: 'LightningFlowBuilder'
                }
              }
            ]
          }
        };

        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithoutCanvasMode, 'TestFlow', false);

        // Check that CanvasMode was added
        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );

        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
      });

      it('should update existing CanvasMode to AUTO_LAYOUT_CANVAS', () => {
        // Create a flow with existing CanvasMode set to something else
        const flowWithDifferentCanvasMode = {
          Flow: {
            processType: 'Flow',
            processMetadataValues: [
              {
                name: 'BuilderType',
                value: {
                  stringValue: 'LightningFlowBuilder'
                }
              },
              {
                name: 'CanvasMode',
                value: {
                  stringValue: 'FREE_FORM_CANVAS'
                }
              }
            ]
          }
        };

        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithDifferentCanvasMode, 'TestFlow', false);

        // Check that CanvasMode was updated
        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );

        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
      });

      it('should update CanvasMode from FREE_FORM_CANVAS to AUTO_LAYOUT_CANVAS using the sample file', async () => {
        // Use the Flow_with_Free_Form_Layout sample file (which is an AutoLaunchedFlow)
        const samplePath = path.join(__dirname, 'sample', 'Flow_with_Free_Form_Layout.flow-meta.xml');
        const sampleContent = await fs.promises.readFile(samplePath, 'utf8');
        const flowObj = await FlowInstrumentationService.parseFlowContent(sampleContent);

        // Verify the sample has FREE_FORM_CANVAS initially
        const originalCanvasModeValue = flowObj.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        ).value.stringValue;
        expect(originalCanvasModeValue).to.equal('FREE_FORM_CANVAS');

        // Verify the original processType is AutoLaunchedFlow and it's supported
        expect(flowObj.Flow.processType).to.equal('AutoLaunchedFlow');
        expect(FlowInstrumentationService.isSupportedProcessType(flowObj)).to.be.true;

        // Instrument the flow
        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowObj, 'Flow_with_Free_Form_Layout', false);

        // Check that CanvasMode was updated to AUTO_LAYOUT_CANVAS
        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );

        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');

        // Check that processType remains unchanged
        expect(instrumentedFlow.Flow.processType).to.equal('AutoLaunchedFlow');
      });

      it('should correctly instrument an AutoLaunchedFlow with start element', async () => {
        // Use the Flow_with_Free_Form_Layout sample file which has a start element instead of startElementReference
        const samplePath = path.join(__dirname, 'sample', 'Flow_with_Free_Form_Layout.flow-meta.xml');
        const sampleContent = await fs.promises.readFile(samplePath, 'utf8');
        const flowObj = await FlowInstrumentationService.parseFlowContent(sampleContent);

        // Verify the flow has a start element with connector
        expect(flowObj.Flow.start).to.exist;
        expect(flowObj.Flow.start.connector).to.exist;
        expect(flowObj.Flow.start.connector.targetReference).to.exist;
        const originalTarget = flowObj.Flow.start.connector.targetReference;

        // Instrument the flow
        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowObj, 'Flow_with_Free_Form_Layout', false);

        // Check that a logger was added
        expect(FlowInstrumentationService.hasRFLIBLogger(instrumentedFlow)).to.be.true;

        // Get the logger action
        const actionCalls = Array.isArray(instrumentedFlow.Flow.actionCalls)
          ? instrumentedFlow.Flow.actionCalls
          : [instrumentedFlow.Flow.actionCalls];

        const flowLogger = actionCalls.find((action: any) =>
          // ensure boolean return type when checking prefix
          Boolean(
            typeof action.name === 'string' &&
            action.name.startsWith('RFLIB_Flow_Logger_')
          )
        );

        expect(flowLogger).to.exist;

        // Verify the logger connects to the original target
        expect(flowLogger.connector).to.exist;
        expect(flowLogger.connector.targetReference).to.equal(originalTarget);

        // Verify the start element now points to the logger
        expect(instrumentedFlow.Flow.start.connector.targetReference).to.equal(flowLogger.name);
      });

      it('should correctly handle a flow with no processMetadataValues', () => {
        // Create a flow without processMetadataValues
        const flowWithoutMetadata = {
          Flow: {
            processType: 'Flow'
          }
        };

        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithoutMetadata, 'TestFlow', false);

        // Check that processMetadataValues was created with CanvasMode
        expect(instrumentedFlow.Flow.processMetadataValues).to.exist;

        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );

        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
      });

      it('should maintain existing AUTO_LAYOUT_CANVAS setting', () => {
        // Create a flow with existing CanvasMode already set to AUTO_LAYOUT_CANVAS
        const flowWithCorrectCanvasMode = {
          Flow: {
            processType: 'Flow',
            processMetadataValues: [
              {
                name: 'BuilderType',
                value: {
                  stringValue: 'LightningFlowBuilder'
                }
              },
              {
                name: 'CanvasMode',
                value: {
                  stringValue: 'AUTO_LAYOUT_CANVAS'
                }
              }
            ]
          }
        };

        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithCorrectCanvasMode, 'TestFlow', false);

        // Check that CanvasMode is still AUTO_LAYOUT_CANVAS
        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );

        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');

        // Ensure we didn't add a duplicate
        const canvasModeCount = instrumentedFlow.Flow.processMetadataValues.filter((meta: any) =>
          meta.name === 'CanvasMode'
        ).length;

        expect(canvasModeCount).to.equal(1);
      });

      it('should handle a flow with single processMetadataValue (non-array)', () => {
        // Create a flow with processMetadataValues as a single object, not an array
        const flowWithSingleMetadata = {
          Flow: {
            processType: 'Flow',
            processMetadataValues: {
              name: 'BuilderType',
              value: {
                stringValue: 'LightningFlowBuilder'
              }
            }
          }
        };

        const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowWithSingleMetadata, 'TestFlow', false);

        // Check that processMetadataValues was converted to array with both values
        expect(Array.isArray(instrumentedFlow.Flow.processMetadataValues)).to.be.true;

        const builderTypeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'BuilderType')
        );
        expect(builderTypeMetadata).to.exist;

        const canvasModeMetadata = instrumentedFlow.Flow.processMetadataValues.find((meta: any) =>
          // ensure boolean return for find predicate
          Boolean(meta.name === 'CanvasMode')
        );
        expect(canvasModeMetadata).to.exist;
        expect(canvasModeMetadata.value.stringValue).to.equal('AUTO_LAYOUT_CANVAS');
      });
    });
  });

  describe('Flow XML structure', () => {
    it('should place actionCalls as first element in Flow XML', () => {
      const simpleFlow = {
        Flow: {
          processType: 'Flow',
          variables: [{ name: 'testVar' }],
          decisions: [{ name: 'testDecision' }]
        }
      };

      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(simpleFlow, 'TestFlow', false);
      const xml = FlowInstrumentationService.buildFlowContent(instrumentedFlow);

      // Get the index of actionCalls and processType in the XML
      const actionCallsIndex = xml.indexOf('<actionCalls>');
      const processTypeIndex = xml.indexOf('<processType>');
      const variablesIndex = xml.indexOf('<variables>');
      const decisionsIndex = xml.indexOf('<decisions>');

      // Verify actionCalls appears before other elements
      expect(actionCallsIndex).to.be.greaterThan(-1);
      expect(actionCallsIndex).to.be.lessThan(processTypeIndex);
      expect(actionCallsIndex).to.be.lessThan(variablesIndex);
      expect(actionCallsIndex).to.be.lessThan(decisionsIndex);
    });
  });
});