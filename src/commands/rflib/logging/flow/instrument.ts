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

class FlowInstrumentationService {
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

  public static instrumentFlow(flowObj: any): any {
    // Deep clone the object to avoid modifying the original
    const instrumentedFlow = JSON.parse(JSON.stringify(flowObj));

    // Add logging elements here
    // This is where you would add your flow logging logic
    // For example, adding logging actions before/after specific elements

    return instrumentedFlow;
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

    this.log(`Scanning Flow files in ${sourcePath} and sub directories`);
    this.logger.debug(`Dry run mode: ${isDryRun}`);

    this.spinner.start('Running...');
    await this.processDirectory(sourcePath, isDryRun);
    this.spinner.stop();

    const duration = Date.now() - startTime;
    this.logger.debug(`Completed instrumentation in ${duration}ms`);

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);

    return { ...this.stats };
  }

  private async processDirectory(dirPath: string, isDryRun: boolean): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun);
      } else if (file.endsWith('.flow-meta.xml')) {
        await this.instrumentFlowFile(filePath, isDryRun);
      }
    }
  }

  private async instrumentFlowFile(filePath: string, isDryRun: boolean): Promise<void> {
    const flowName = path.basename(filePath, '.flow-meta.xml');
    this.logger.debug(`Processing flow: ${flowName}`);

    try {
      this.stats.processedFiles++;
      const content = await fs.promises.readFile(filePath, 'utf8');

      const flowObj = await FlowInstrumentationService.parseFlowContent(content);
      const instrumentedFlow = FlowInstrumentationService.instrumentFlow(flowObj);
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
