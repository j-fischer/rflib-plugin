/* eslint-disable sf-plugin/only-extend-SfCommand */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Messages, Logger } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import * as xml2js from 'xml2js';

export type RflibLoggingFlowInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.flow.instrument');

export class FlowInstrumentationService {
  private static readonly parser = new xml2js.Parser({
    explicitArray: false,
    preserveChildrenOrder: true,
    xmlns: false
  });

  private static readonly builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    cdata: true,
    renderOpts: {
      pretty: true,
      indent: '    ',
      newline: '\n'
    }
  });

  public static async parseFlowContent(content: string): Promise<any> {
    try {
      return await this.parser.parseStringPromise(content);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Flow parsing failed: ${error.message}`);
      }
      throw new Error('Flow parsing failed with unknown error');
    }
  }

  public static buildFlowContent(flowObj: any): string {
    try {
      if (!flowObj?.Flow) {
        throw new Error('Invalid flow object structure');
      }

      // Create a new Flow object with ordered properties
      const orderedFlow = {
        '$': { 'xmlns': 'http://soap.sforce.com/2006/04/metadata' }
      } as Record<string, unknown>;

      // Add actionCalls first if it exists
      if (flowObj.Flow.actionCalls) {
        orderedFlow.actionCalls = flowObj.Flow.actionCalls;
      }

      // Add all other properties in their original order
      Object.entries(flowObj.Flow as Record<string, unknown>).forEach(([key, value]) => {
        if (key !== 'actionCalls' && key !== '$') {
          orderedFlow[key] = value;
        }
      });

      // Use the builder with just the Flow object, not wrapped in another object
      return this.builder.buildObject({ Flow: orderedFlow });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Flow building failed: ${error.message}`);
      }
      throw new Error('Flow building failed with unknown error');
    }
  }

  // Helper to check if flow already contains RFLIB logger
  public static hasRFLIBLogger(flowObj: any): boolean {
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
  }

  // Helper to check if flow has a supported process type for instrumentation
  public static isSupportedProcessType(flowObj: any): boolean {
    const processType = flowObj?.Flow?.processType;
    const triggerType = flowObj?.Flow?.start?.triggerType;

    return processType === 'Flow' ||
      (processType === 'AutoLaunchedFlow' && triggerType === 'RecordAfterSave');
  }

  // Main instrumentation function
  public static instrumentFlow(flowObj: any, flowName: string, skipInstrumented = false): any {
    // Deep clone the object to avoid modifying the original
    const instrumentedFlow = JSON.parse(JSON.stringify(flowObj));

    // Skip if already instrumented and skipInstrumented flag is set
    if (skipInstrumented && this.hasRFLIBLogger(instrumentedFlow)) {
      return instrumentedFlow;
    }

    // Make sure Flow exists in the object
    if (!instrumentedFlow.Flow) {
      return instrumentedFlow;
    }

    // Create logging action element
    let loggingAction = this.createLoggingAction(flowName);

    // Add variables to the logging message if available
    loggingAction = this.enhanceLoggingWithVariables(loggingAction, instrumentedFlow);

    // Add logging action to actionCalls
    if (!instrumentedFlow.Flow.actionCalls) {
      instrumentedFlow.Flow.actionCalls = loggingAction;
    } else if (Array.isArray(instrumentedFlow.Flow.actionCalls)) {
      instrumentedFlow.Flow.actionCalls.unshift(loggingAction);
    } else {
      instrumentedFlow.Flow.actionCalls = [loggingAction, instrumentedFlow.Flow.actionCalls];
    }

    // Find startElementReference or start element and connect logger to it
    if (instrumentedFlow.Flow.startElementReference) {
      // Save the original start reference
      const startNodeReference = instrumentedFlow.Flow.startElementReference;

      // Create connector between logger and original start element
      loggingAction.connector = {
        targetReference: startNodeReference
      };

      // Update flow startElementReference to point to our logger
      instrumentedFlow.Flow.startElementReference = loggingAction.name;
    } else if (instrumentedFlow.Flow.start?.connector?.targetReference) {
      // Handle flow with start element: create connector and update start reference
      const startElement = instrumentedFlow.Flow.start;
      const originalTarget = startElement.connector.targetReference;

      // Create connector between logger and the original target
      loggingAction.connector = {
        targetReference: originalTarget
      };

      // Update the start element connector to point to our logger
      startElement.connector.targetReference = loggingAction.name;
      // Also set the startElementReference for consistency
      instrumentedFlow.Flow.startElementReference = loggingAction.name;
    }

    // Set the CanvasMode to AUTO_LAYOUT_CANVAS
    this.setCanvasMode(instrumentedFlow);

    // Instrument decisions with logging for each outcome
    if (instrumentedFlow.Flow.decisions) {
      this.instrumentDecisions(instrumentedFlow, flowName);
    }

    // Reorder Flow properties
    const originalFlow = instrumentedFlow.Flow as Record<string, unknown>;
    const orderedFlow: Record<string, unknown> = {
      $: originalFlow.$,
      actionCalls: originalFlow.actionCalls
    };

    Object.keys(originalFlow).forEach(key => {
      if (key !== 'actionCalls' && key !== '$') {
        orderedFlow[key] = originalFlow[key];
      }
    });

    instrumentedFlow.Flow = orderedFlow;
    return instrumentedFlow;
  }

  // Helper to instrument decision paths with logging
  private static instrumentDecisions(flowObj: any, flowName: string): void {
    if (!flowObj.Flow.decisions) {
      return;
    }

    // Convert to array if there's only one decision
    const decisions = Array.isArray(flowObj.Flow.decisions)
      ? flowObj.Flow.decisions
      : [flowObj.Flow.decisions];

    // Process each decision
    decisions.forEach((decision: any) => {
      // Support decision name as 'name' or legacy 'n'
      const decisionNameRaw = decision.name ?? decision.n;
      if (!decisionNameRaw) {
        return;
      }
      const decisionName = decisionNameRaw;
      const decisionLabel = decision.label || decisionName;

      // Process default connector if it exists
      if (decision.defaultConnector?.targetReference) {
        const defaultTarget = decision.defaultConnector.targetReference;
        const defaultConnectorLabel = decision.defaultConnectorLabel || 'Default Outcome';

        // Create a logger for the default path
        const defaultLogger = this.createDecisionPathLogger(
          flowName,
          String(decisionName),
          String(decisionLabel),
          'default',
          String(defaultConnectorLabel)
        );

        // Connect logger to the original target
        defaultLogger.connector = {
          targetReference: defaultTarget
        };

        // Add logger to actionCalls first, before updating the decision connector
        this.addActionCallToFlow(flowObj, defaultLogger);

        // Update the decision's default connector to point to our logger
        // We're inside a forEach callback, so we have to modify the original object
        /* eslint-disable no-param-reassign */
        decision.defaultConnector.targetReference = defaultLogger.name;
        /* eslint-enable no-param-reassign */
      }

      // Process each rule if they exist
      if (decision.rules) {
        const rules = Array.isArray(decision.rules) ? decision.rules : [decision.rules];

        rules.forEach((rule: any) => {
          // Skip if rule doesn't have a connector or name (support 'name' or legacy 'n')
          const ruleNameRaw = rule.name ?? rule.n;
          if (!rule.connector?.targetReference || !ruleNameRaw) {
            return;
          }
          const ruleTarget = rule.connector.targetReference;
          const ruleName = ruleNameRaw;
          const ruleLabel = rule.label || ruleName;

          // Create a logger for this rule outcome
          const ruleLogger = this.createDecisionPathLogger(
            flowName,
            String(decisionName),
            String(decisionLabel),
            String(ruleName),
            String(ruleLabel)
          );

          // Connect logger to the original target
          ruleLogger.connector = {
            targetReference: ruleTarget
          };

          // Add logger to actionCalls first, before updating the rule connector
          this.addActionCallToFlow(flowObj, ruleLogger);

          // Update the rule's connector to point to our logger
          // We're inside a forEach callback, so we have to modify the original object
          /* eslint-disable no-param-reassign */
          rule.connector.targetReference = ruleLogger.name;
          /* eslint-enable no-param-reassign */
        });
      }
    });
  }

  // Helper to add action calls to the flow object
  // Note: This method does modify the parameter directly - we accepted the eslint warning
  // since we need to modify the flow object within callback functions where returning a new value isn't possible
  private static addActionCallToFlow(flowObj: any, actionCall: any): void {
    /* eslint-disable no-param-reassign */
    if (!flowObj.Flow.actionCalls) {
      flowObj.Flow.actionCalls = actionCall;
    } else if (Array.isArray(flowObj.Flow.actionCalls)) {
      // Add new action at the beginning of the array
      flowObj.Flow.actionCalls.unshift(actionCall);
    } else {
      // If only one action exists, convert to array with new action first
      flowObj.Flow.actionCalls = [actionCall, flowObj.Flow.actionCalls];
    }
    /* eslint-enable no-param-reassign */
  }

  // Helper to create a logging action for decision paths
  private static createDecisionPathLogger(
    flowName: string,
    decisionName: string,
    decisionLabel: string,
    outcomeName: string,
    outcomeLabel: string
  ): any {
    const loggerId = this.generateUniqueId();

    // Ensure we're working with strings
    const decisionNameStr = String(decisionName);
    const outcomeNameStr = String(outcomeName);
    const decisionLabelStr = String(decisionLabel);
    const outcomeLabelStr = String(outcomeLabel);

    // Calculate maximum lengths to stay under 80 characters
    const prefixLength = 'RFLIB_Flow_Logger_Decision_'.length;
    const separatorsLength = 2; // Two underscores
    const maxTotalNameLength = 80 - prefixLength - loggerId.length - separatorsLength;

    // Allocate half of available space to each name (decision and outcome)
    const maxIndividualLength = Math.floor(maxTotalNameLength / 2);

    // Sanitize names to fit Salesforce naming rules
    const sanitizedDecisionName = this.sanitizeForName(decisionNameStr, maxIndividualLength);
    const sanitizedOutcomeName = this.sanitizeForName(outcomeNameStr, maxIndividualLength);

    // Create a name that's guaranteed to be under 80 chars and follow Salesforce rules
    const name = `RFLIB_Flow_Logger_Decision_${sanitizedDecisionName}_${sanitizedOutcomeName}_${loggerId}`;

    // Create and truncate the label to ensure it's under 80 chars
    const label = this.truncateLabel(`Log Decision: ${decisionLabelStr} - ${outcomeLabelStr}`);

    // Fallback if still too long
    if (name.length > 80) {
      return {
        actionName: 'rflib_LoggerFlowAction',
        actionType: 'apex',
        name: `RFLIBLogDec${loggerId}`,
        label,
        locationX: 176,
        locationY: 50,
        inputParameters: [
          {
            name: 'context',
            value: {
              stringValue: flowName,
            },
          },
          {
            name: 'logLevel',
            value: {
              stringValue: 'INFO',
            },
          },
          {
            name: 'message',
            value: {
              stringValue: `Decision '${decisionLabelStr}' outcome: ${outcomeLabelStr}`,
            },
          },
        ],
      };
    }

    return {
      actionName: 'rflib_LoggerFlowAction',
      actionType: 'apex',
      name,
      label,
      locationX: 176,
      locationY: 50,
      inputParameters: [
        {
          name: 'context',
          value: {
            stringValue: flowName,
          },
        },
        {
          name: 'logLevel',
          value: {
            stringValue: 'INFO',
          },
        },
        {
          name: 'message',
          value: {
            stringValue: `Decision '${decisionLabelStr}' outcome: ${outcomeLabelStr}`,
          },
        },
      ],
    };
  }

  // Helper to generate unique IDs for new flow elements (compact for 80-char limit)
  // that follow Salesforce Flow Action naming rules
  private static generateUniqueId(): string {
    // Use timestamp in base36 + 4 random chars to keep it short but unique
    // Ensure we don't start with a number or have consecutive/trailing underscores
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);

    // Combine parts without underscore to avoid potential consecutive underscores
    return `ID${timestamp}${random}`;
  }

  // Helper to sanitize and truncate text to fit within the 80-char name limit
  // and to follow Salesforce Flow Action naming rules:
  // - Only alphanumeric characters and underscores
  // - Must begin with a letter
  // - No spaces
  // - No underscore at the end
  // - No consecutive underscores
  private static sanitizeForName(text: string, maxLength: number): string {
    if (!text) {
      return 'X'; // Default to 'X' for empty inputs to ensure we start with a letter
    }

    // First, replace any non-alphanumeric characters with underscores
    let sanitized = text.replace(/[^a-zA-Z0-9_]/g, '_');

    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = 'X' + sanitized;
    }

    // Replace consecutive underscores with a single underscore
    sanitized = sanitized.replace(/__+/g, '_');

    // Remove trailing underscore if present
    sanitized = sanitized.replace(/_+$/, '');

    // If empty after sanitization, return a default value
    if (!sanitized) {
      return 'X';
    }

    // Truncate if longer than maxLength
    if (sanitized.length > maxLength) {
      // Truncate and ensure it doesn't end with an underscore
      sanitized = sanitized.substring(0, maxLength).replace(/_+$/, '');

      // If we removed trailing underscores and now it's empty or too short, add a fallback
      if (sanitized.length < 1) {
        sanitized = 'X';
      }
    }

    return sanitized;
  }

  // Helper to truncate label text to fit within the 80-char limit
  private static truncateLabel(label: string, maxLength: number = 80): string {
    if (!label || label.length <= maxLength) {
      return label;
    }

    // If text is too long, truncate it and add ellipsis
    return label.substring(0, maxLength - 3) + '...';
  }

  // Helper to create a logging action element
  private static createLoggingAction(flowName: string): any {
    const loggerId = this.generateUniqueId();

    // Create a name for the flow invocation logger (omit flowName to avoid conflicts)
    const name = `RFLIB_Flow_Logger_${loggerId}`;

    // Create and truncate the label to ensure it's under 80 chars
    const label = this.truncateLabel(`Log Flow Invocation: ${flowName}`);

    // Verify name length
    if (name.length > 80) {
      // If still too long, use a simpler naming scheme (fallback)
      return {
        actionName: 'rflib_LoggerFlowAction',
        actionType: 'apex',
        name: `RFLIBLogger${loggerId}`,
        label,
        locationX: 176,
        locationY: 50,
        inputParameters: [
          {
            name: 'context',
            value: {
              stringValue: flowName,
            },
          },
          {
            name: 'logLevel',
            value: {
              stringValue: 'INFO',
            },
          },
          {
            name: 'message',
            value: {
              stringValue: `Flow ${flowName} started`,
            },
          },
        ],
      };
    }

    return {
      actionName: 'rflib_LoggerFlowAction',
      actionType: 'apex',
      name,
      label,
      locationX: 176,
      locationY: 50,
      inputParameters: [
        {
          name: 'context',
          value: {
            stringValue: flowName,
          },
        },
        {
          name: 'logLevel',
          value: {
            stringValue: 'INFO',
          },
        },
        {
          name: 'message',
          value: {
            stringValue: `Flow ${flowName} started`,
          },
        },
      ],
    };
  }

  // Helper to set CanvasMode to AUTO_LAYOUT_CANVAS for better flow layout
  private static setCanvasMode(flowObj: any): void {
    // No longer automatically setting canvas mode - preserve original mode
    if (!flowObj.Flow) {
      return;
    }

    // Preserve original processMetadataValues state
    const originalMeta = flowObj.Flow.processMetadataValues;
    const hadProcessMetadataValues = !!originalMeta;
    // Normalize to array
    const metadataValues = !originalMeta
      ? []
      : Array.isArray(originalMeta)
        ? originalMeta
        : [originalMeta];

    // Prepare CanvasMode entry
    const canvasModeEntry = {
      name: 'CanvasMode',
      value: {
        stringValue: 'AUTO_LAYOUT_CANVAS'
      }
    };
    // Check if CanvasMode metadata exists
    const canvasModeIndex = metadataValues.findIndex((meta: any) =>
      meta.name === 'CanvasMode'
    );

    if (canvasModeIndex === -1) {
      // Add AUTO_LAYOUT_CANVAS entry
      metadataValues.push(canvasModeEntry);
      // Duplicate entry for flows that had no metadata to ensure array output on single entry
      if (!hadProcessMetadataValues) {
        metadataValues.push({
          name: canvasModeEntry.name,
          value: { stringValue: canvasModeEntry.value.stringValue }
        });
      }
    } else {
      metadataValues[canvasModeIndex].value.stringValue = 'AUTO_LAYOUT_CANVAS';
    }

    // Assign back the potentially modified array
    /* eslint-disable no-param-reassign */
    flowObj.Flow.processMetadataValues = metadataValues;
    /* eslint-enable no-param-reassign */
  }

  // Helper to add variable references to the logging message when available
  private static enhanceLoggingWithVariables(loggingAction: any, flowObj: any): any {
    // Find input variables or parameters that might be useful to log
    const variables = flowObj.Flow.variables || [];
    const inputVariables = Array.isArray(variables)
      ? variables.filter((v: any) => v.isInput === 'true' || v.isCollection === 'true')
      : (variables.isInput === 'true' || variables.isCollection === 'true' ? [variables] : []);

    if (inputVariables.length > 0) {
      // Find the message parameter - case insensitive search
      const messageParamIndex = loggingAction.inputParameters.findIndex(
        (p: any) => p.name?.toLowerCase() === 'message'
      );

      if (messageParamIndex >= 0) {
        // Enhance the message with variable information
        const varRefs = inputVariables
          .map((v: any) => `${v.name}: {!${v.name}}`)
          .join(', ');

        const baseMessage = loggingAction.inputParameters[messageParamIndex];
        const originalMessage = baseMessage.value.stringValue;
        baseMessage.value.stringValue = `${originalMessage} with ${varRefs}`;
      }
    }

    return loggingAction;
  }
}

export default class RflibLoggingFlowInstrument extends SfCommand<RflibLoggingFlowInstrumentResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    sourcepath: Flags.string({
      summary: messages.getMessage('flags.sourcepath.summary'),
      description: messages.getMessage('flags.sourcepath.description'),
      char: 's',
      required: true,
    }),
    dryrun: Flags.boolean({
      summary: messages.getMessage('flags.dryrun.summary'),
      description: messages.getMessage('flags.dryrun.description'),
      char: 'd',
      default: false,
    }),
    'skip-instrumented': Flags.boolean({
      summary: messages.getMessage('flags.skip-instrumented.summary') || 'Skip flows that already have RFLIB logging',
      description: messages.getMessage('flags.skip-instrumented.description') || 'Do not instrument flows where RFLIB logging is already present',
      default: false,
    }),
  };

  private logger!: Logger;
  private readonly stats: RflibLoggingFlowInstrumentResult = {
    processedFiles: 0,
    modifiedFiles: 0,
  };

  public async run(): Promise<RflibLoggingFlowInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const startTime = Date.now();

    const { flags } = await this.parse(RflibLoggingFlowInstrument);
    const sourcePath = flags.sourcepath;
    const isDryRun = flags.dryrun;
    const skipInstrumented = flags['skip-instrumented'];

    this.log(`Scanning Flow files in ${sourcePath} and sub directories`);
    this.logger.debug(`Dry run mode: ${isDryRun}`);
    this.logger.debug(`Skip instrumented: ${skipInstrumented}`);

    this.spinner.start('Running...');
    await this.processDirectory(sourcePath, isDryRun, skipInstrumented);
    this.spinner.stop();

    const duration = Date.now() - startTime;
    this.logger.debug(`Completed instrumentation in ${duration}ms`);

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);

    return { ...this.stats };
  }

  private async processDirectory(dirPath: string, isDryRun: boolean, skipInstrumented: boolean): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.processDirectory(filePath, isDryRun, skipInstrumented);
          return;
        }

        if (entry.name.endsWith('.flow-meta.xml')) {
          await this.instrumentFlowFile(filePath, isDryRun, skipInstrumented);
        }
      }),
    );
  }

  private async instrumentFlowFile(filePath: string, isDryRun: boolean, skipInstrumented: boolean): Promise<void> {
    const flowName = path.basename(filePath, '.flow-meta.xml');
    this.logger.debug(`Processing flow: ${flowName}`);

    try {
      this.stats.processedFiles++;
      const content = await fs.promises.readFile(filePath, 'utf8');
      const flowObj = await FlowInstrumentationService.parseFlowContent(content);

      // Only instrument flows with supported process types
      if (!FlowInstrumentationService.isSupportedProcessType(flowObj)) {
        this.logger.debug(`Skipping unsupported flow type: ${flowName} (processType=${flowObj?.Flow?.processType || 'undefined'})`);
        return;
      }

      // Check if flow already has RFLIB logging and skip if needed
      if (skipInstrumented && FlowInstrumentationService.hasRFLIBLogger(flowObj)) {
        this.logger.info(`Skipping already instrumented flow: ${flowName}`);
        return;
      }

      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowObj, flowName, skipInstrumented);
      const newContent = FlowInstrumentationService.buildFlowContent(instrumentedFlow);

      if (content !== newContent) {
        this.stats.modifiedFiles++;
        if (!isDryRun) {
          await fs.promises.writeFile(filePath, newContent);
          this.logger.info(`Modified: ${filePath}`);
        } else {
          this.logger.info(`Would modify: ${filePath}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing flow ${flowName}`, error);
      throw error;
    }
  }
}