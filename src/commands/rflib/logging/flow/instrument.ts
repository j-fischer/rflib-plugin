/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import * as xml2js from 'xml2js';

export type RflibLoggingFlowInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.flow.instrument');

// Type definition removed to fix compiler error
// This was used to document valid Flow variable types: 'String' | 'Number' | 'Boolean' | 'SObject' | 'SObjectCollection'

export class FlowInstrumentationService {
  private static readonly parser = new xml2js.Parser({
    explicitArray: false,
    preserveChildrenOrder: true,
    xmlns: false
  });

  private static readonly builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    cdata: true
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
      return this.builder.buildObject(flowObj);
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

  // Helper to check if flow is of type "Flow" that we want to instrument
  public static isFlowType(flowObj: any): boolean {
    return flowObj?.Flow?.processType === 'Flow';
  }

  // Main instrumentation function
  public static instrumentFlow(flowObj: any, flowName: string): any {
    // Deep clone the object to avoid modifying the original
    const instrumentedFlow = JSON.parse(JSON.stringify(flowObj));

    // Skip if already instrumented
    if (this.hasRFLIBLogger(instrumentedFlow)) {
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
      instrumentedFlow.Flow.actionCalls.push(loggingAction);
    } else {
      // If only one action exists, convert to array
      instrumentedFlow.Flow.actionCalls = [instrumentedFlow.Flow.actionCalls, loggingAction];
    }

    // Find startElementReference and connect logger to it
    if (instrumentedFlow.Flow.startElementReference) {
      // Save the original start reference
      const startNodeReference = instrumentedFlow.Flow.startElementReference;
      
      // Create connector between logger and original start element
      loggingAction.connector = {
        targetReference: startNodeReference
      };
      
      // Update flow startElementReference to point to our logger
      instrumentedFlow.Flow.startElementReference = loggingAction.name;
    } else {
      // If no start element, try to find another entry point
      // Common patterns: decisions, screens, or first element in the process
      if (Array.isArray(instrumentedFlow.Flow.decisions) && instrumentedFlow.Flow.decisions.length > 0) {
        // Find the first decision and connect to it
        const firstDecision = instrumentedFlow.Flow.decisions[0];
        loggingAction.connector = {
          targetReference: firstDecision.name
        };
      } else if (Array.isArray(instrumentedFlow.Flow.screens) && instrumentedFlow.Flow.screens.length > 0) {
        // Find the first screen and connect to it
        const firstScreen = instrumentedFlow.Flow.screens[0];
        loggingAction.connector = {
          targetReference: firstScreen.name
        };
      }

      // Create a startElementReference pointing to our logger if none exists
      instrumentedFlow.Flow.startElementReference = loggingAction.name;
    }

    // Add interviewLabel if not present
    if (!instrumentedFlow.Flow.interviewLabel) {
      instrumentedFlow.Flow.interviewLabel = `${flowName} {!$Flow.CurrentDateTime}`;
    }

    // Ensure processType is set to 'Flow'
    instrumentedFlow.Flow.processType = 'Flow';

    // Add variables if not present (needed for variable references)
    if (!instrumentedFlow.Flow.variables) {
      instrumentedFlow.Flow.variables = [];
    } else if (!Array.isArray(instrumentedFlow.Flow.variables)) {
      instrumentedFlow.Flow.variables = [instrumentedFlow.Flow.variables];
    }

    return instrumentedFlow;
  }

  // Helper to generate unique IDs for new flow elements
  private static generateUniqueId(): string {
    return `RFLIB_LOG_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Helper to create a logging action element
  private static createLoggingAction(flowName: string): any {
    const loggerId = this.generateUniqueId();
    return {
      actionName: 'rflib_LoggerFlowAction',
      actionType: 'apex',
      name: `RFLIB_Flow_Logger_${loggerId}`,
      label: 'Log Flow Invocation',
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
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun, skipInstrumented);
      } else if (file.endsWith('.flow-meta.xml')) {
        await this.instrumentFlowFile(filePath, isDryRun, skipInstrumented);
      }
    }
  }

  private async instrumentFlowFile(filePath: string, isDryRun: boolean, skipInstrumented: boolean): Promise<void> {
    const flowName = path.basename(filePath, '.flow-meta.xml');
    this.logger.debug(`Processing flow: ${flowName}`);

    try {
      this.stats.processedFiles++;
      const content = await fs.promises.readFile(filePath, 'utf8');
      const flowObj = await FlowInstrumentationService.parseFlowContent(content);

      // Only instrument flows with processType="Flow", skip all others
      if (!FlowInstrumentationService.isFlowType(flowObj)) {
        this.logger.debug(`Skipping non-Flow type: ${flowName} (processType=${flowObj?.Flow?.processType || 'undefined'})`);
        return;
      }

      // Check if flow already has RFLIB logging and skip if needed
      if (skipInstrumented && FlowInstrumentationService.hasRFLIBLogger(flowObj)) {
        this.logger.info(`Skipping already instrumented flow: ${flowName}`);
        return;
      }

      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowObj, flowName);
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
