/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable sf-plugin/no-missing-messages */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.apex.instrument');

export type RflibLoggingApexInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
};

export default class RflibLoggingApexInstrument extends SfCommand<RflibLoggingApexInstrumentResult> {
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

  private processedFiles = 0;
  private modifiedFiles = 0;

  public async run(): Promise<RflibLoggingApexInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const startTime = Date.now();

    const { flags } = await this.parse(RflibLoggingApexInstrument);
    const sourcePath = flags.sourcepath;
    const isDryRun = flags.dryrun;

    this.log(`Scanning Apex classes in ${sourcePath}...`);

    await this.processDirectory(sourcePath, isDryRun);

    const duration = Date.now() - startTime;
    this.logger.debug(`Completed instrumentation in ${duration}ms`);

    this.log(`\nInstrumentation complete.`);
    this.log(`Processed files: ${this.processedFiles}`);
    this.log(`Modified files: ${this.modifiedFiles}`);

    return {
      processedFiles: this.processedFiles,
      modifiedFiles: this.modifiedFiles
    };
  }

  private async processDirectory(dirPath: string, isDryRun: boolean): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun);
      } else if (file.endsWith('.cls') && !file.endsWith('Test.cls')) {
        await this.instrumentApexClass(filePath, isDryRun);
      }
    }
  }

  private async instrumentApexClass(filePath: string, isDryRun: boolean): Promise<void> {
    const className = path.basename(filePath, '.cls');
    this.logger.debug(`Processing class: ${className}`);

    try {
      this.processedFiles++;
      let content = await fs.promises.readFile(filePath, 'utf8');
      const originalContent = content;

      // Check for existing class-level logger
      const hasClassLevelLogger = /\bprivate\s+static\s+(?:final\s+)?rflib_Logger\b/.test(content);

      // Add logger declaration if none exists at class level
      const loggerDeclaration = `private static final rflib_Logger LOGGER = rflib_LoggerUtil.getFactory().createLogger('${className}');`;

      // Insert logger declaration after class definition only if no class-level logger exists
      if (!hasClassLevelLogger) {
        const classRegex = /\bclass\s+\w+\s*{/;
        content = content.replace(classRegex, `$&\n    ${loggerDeclaration}`);
      }

      // Process methods
      const methodRegex = /(@AuraEnabled\s*[\s\S]*?)?\b(public|private|protected|global)\s+(static\s+)?\w+\s+(\w+)\s*\(([\s\S]*?)\)\s*{/g;
      content = content.replace(methodRegex, (
        match: string,
        auraEnabled: string | undefined,
        access: string,
        isStatic: string | undefined,
        methodName: string,
        args: string
      ) => {
        // Ensure args is a string before splitting
        const argsStr = args || '';
        const parameters = argsStr.split(',').map(param => param.trim());

        // Safe parameter name extraction
        const logArgs = parameters.length > 0 && parameters[0] !== ''
          ? `, new Object[] { ${parameters.map(p => {
            const parts = p.split(' ');
            return parts.length > 1 ? parts[1] : parts[0];
          }).join(', ')} }`
          : '';

        let newMethod = match + '\n';

        if (auraEnabled) {
          newMethod += `        try {\n`;
          newMethod += `            LOGGER.info('${methodName}(${parameters.map(() => '{0}').join(', ')})'${logArgs});\n`;
        } else {
          newMethod += `        LOGGER.info('${methodName}(${parameters.map(() => '{0}').join(', ')})'${logArgs});\n`;
        }

        return newMethod;
      });

      // Add catch blocks for @AuraEnabled methods
      const auraMethodRegex = /@AuraEnabled[\s\S]*?{[\s\S]*?}/g;
      content = content.replace(auraMethodRegex, (match) => {
        if (!match.includes('try {')) {
          return match;
        }

        // Extract method name
        const methodNameMatch = match.match(/\b\w+\s*\(/);
        const methodName = methodNameMatch ? methodNameMatch[0].replace('(', '') : 'unknown';

        return match.replace(/}(?!\s*catch)$/, `
          } catch (Exception ex) {
              LOGGER.error('An error occurred in ${methodName}()', ex);
              throw ex;
          }`);
      });

      // Add error logging to existing catch blocks
      const catchRegex = /catch\s*\(([\w\s]+)\)\s*{/g;
      content = content.replace(catchRegex, (match, exceptionVar: string) => {
        // Find the method name from the containing method
        const methodNameMatch = content.substring(0, content.indexOf(match)).match(/\b\w+\s*\([^)]*\)\s*{[^}]*$/);
        const methodName = methodNameMatch ? methodNameMatch[0].split('(')[0].trim() : 'unknown';

        return `${match}\n            LOGGER.error('An error occurred in ${methodName}()', ${exceptionVar.trim()});`;
      });

      if (content !== originalContent) {
        this.modifiedFiles++;
        if (!isDryRun) {
          await fs.promises.writeFile(filePath, content);
          this.logger.info(`Modified class: ${className}`);
        } else {
          this.logger.info(`Would modify class: ${className}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing class ${className}`, error);
      throw error;
    }
  }
}