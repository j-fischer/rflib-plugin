/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable sf-plugin/no-missing-messages */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as prettier from 'prettier';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.apex.instrument');

const methodRegex =
  /(@AuraEnabled\s*[\s\S]*?)?\b(public|private|protected|global)\s+(static\s+)?(?:(\w+(?:\s*<(?:[^<>]|<[^<>]*>)*>)?)|void)\s+(\w+)\s*\(([\s\S]*?)\)\s*{/g;
const classRegex = /\bclass\s+\w+\s*{/;
const classLevelLoggerRegex = /\bprivate\s+(?:static\s+)?(?:final\s+)?rflib_Logger\s+(\w+)\b/;
const genericArgsRegex = /<[^>]+>/g;
const catchRegex = /catch\s*\(\s*\w+\s+(\w+)\s*\)\s*{/g;
const testSetupRegex = /@TestSetup\s+((public|private|protected|global)s+)?(?:static\s+)?void\s+(\w+)\s*\([^)]*\)\s*{/g;
const ifStatementRegex = /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
const elseRegex = /}\s*else(?!\s+if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{].*?)(?=\n|;|$))/g;

const PRIMITIVE_TYPES = new Set([
  'STRING',
  'INTEGER',
  'LONG',
  'DECIMAL',
  'DOUBLE',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIME',
  'ID',
]);

type IfCondition = {
  condition: string;
  position: number;
};

export type RflibLoggingApexInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
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
    prettier: Flags.boolean({
      summary: messages.getMessage('flags.prettier.summary'),
      description: messages.getMessage('flags.prettier.description'),
      char: 'p',
      default: false,
    }),
  };

  private logger!: Logger;

  private processedFiles = 0;
  private modifiedFiles = 0;
  private formattedFiles = 0;

  private readonly prettierConfig: prettier.Options = {
    parser: 'apex',
    plugins: ['prettier-plugin-apex'],
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
  };

  private static isComplexType(paramType: string): boolean {
    return (
      paramType.includes('<') ||
      paramType.includes('[') ||
      paramType === 'Object' ||
      !PRIMITIVE_TYPES.has(paramType.toUpperCase())
    );
  }

  private static detectExistingLogger(content: string): { exists: boolean; loggerVariableName: string } {
    const match = content.match(classLevelLoggerRegex);
    return {
      exists: classLevelLoggerRegex.test(content),
      loggerVariableName: match ? match[1] : 'LOGGER',
    };
  }

  private static addLoggerDeclaration(content: string, className: string): string {
    const { exists, loggerVariableName } = RflibLoggingApexInstrument.detectExistingLogger(content);
    if (!exists) {
      const loggerDeclaration = `private static final rflib_Logger ${loggerVariableName} = rflib_LoggerUtil.getFactory().createLogger('${className}');`;
      return content.replace(classRegex, `$&\n    ${loggerDeclaration}`);
    }
    return content;
  }

  private static processParameters(args: string): { paramList: string[]; logArgs: string } {
    const parameters = args
      ? args
        .replaceAll(genericArgsRegex, '')
        .split(',')
        .map((param) => param.trim())
      : [];

    const logArgs =
      parameters.length > 0 && parameters[0] !== ''
        ? `, new Object[] { ${parameters
          .map((p) => {
            const parts = p.split(' ');
            const paramType = parts[0];
            const paramName = parts.length > 1 ? parts[1] : parts[0];

            return this.isComplexType(paramType) ? `JSON.serialize(${paramName})` : paramName;
          })
          .join(', ')} }`
        : '';

    return { paramList: parameters, logArgs };
  }

  private static processMethodDeclarations(content: string, loggerName: string): string {
    return content.replace(
      methodRegex,
      (
        match: string,
        auraEnabled: string | undefined,
        access: string,
        isStatic: string | undefined,
        returnType: string,
        methodName: string,
        args: string,
      ) => {
        const { paramList, logArgs } = RflibLoggingApexInstrument.processParameters(args);
        let newMethod = match + '\n';
        newMethod += `        ${loggerName}.info('${methodName}(${paramList.map((_, i) => `{${i}}`).join(', ')})'${logArgs});\n`;
        return newMethod;
      },
    );
  }

  private static processCatchBlocks(content: string, loggerName: string): string {
    return content.replace(catchRegex, (match: string, exceptionVar: string, offset: number) => {
      // Get content before catch block
      const contentBeforeCatch = content.substring(0, offset);

      // Find all method declarations before this catch block
      const methodMatches = [...contentBeforeCatch.matchAll(methodRegex)];

      // Get last method match (closest to catch block)
      const lastMethodMatch = methodMatches[methodMatches.length - 1];

      // Extract method name from match or use 'unknown'
      const methodName = lastMethodMatch
        ? lastMethodMatch[5] // Group 4 contains method name in methodRegex
        : 'unknown';

      return `${match}\n            ${loggerName}.error('An error occurred in ${methodName}()', ${exceptionVar.trim()});`;
    });
  }

  private static processIfStatements(content: string, loggerName: string): string {
    const conditions: IfCondition[] = [];

    // Process if statements and store conditions with positions
    let modified = content.replace(ifStatementRegex, (match: string, condition: string, blockBody: string, singleLineBody: string, offset: number) => {
      const cleanedUpCondition = condition.trim().replaceAll("'", "\\'");
      conditions.push({
        condition: cleanedUpCondition,
        position: offset
      });

      const logStatement = `${loggerName}.debug('if (${cleanedUpCondition})');\n        `;

      if (blockBody) {
        return `if (${condition}) {\n        ${logStatement}${blockBody}}`;
      } else if (singleLineBody) {
        const cleanBody = singleLineBody.replace(/;$/, '').trim();
        return `if (${condition}) {\n        ${logStatement}${cleanBody};\n    }`;
      }
      return match;
    });

    // Process else blocks using nearest if condition
    modified = modified.replace(elseRegex, (match, blockBody, singleLineBody, offset) => {
      // Find last if statement before this else
      const nearestIf = conditions
        .filter(c => c.position < offset)
        .reduce((prev, curr) =>
          (!prev || curr.position > prev.position) ? curr : prev
        );

      const logStatement = nearestIf
        ? `${loggerName}.debug('else for if (${nearestIf.condition})');\n        `
        : `${loggerName}.debug('else statement');\n        `;

      if (blockBody) {
        return `} else {\n        ${logStatement}${blockBody}}`;
      } else if (singleLineBody) {
        return `} else {\n        ${logStatement}${singleLineBody};\n    }`;
      }
      return match;
    });

    return modified;
  }

  public async run(): Promise<RflibLoggingApexInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const startTime = Date.now();

    const { flags } = await this.parse(RflibLoggingApexInstrument);
    const sourcePath = flags.sourcepath;
    const isDryRun = flags.dryrun;
    const usePrettier = flags.prettier;

    this.log(`Scanning Apex classes in ${sourcePath} and sub directories`);

    this.spinner.start('Running...');
    await this.processDirectory(sourcePath, isDryRun, usePrettier);
    this.spinner.stop();

    const duration = Date.now() - startTime;
    this.logger.debug(`Completed instrumentation in ${duration}ms`);

    this.log(`\nInstrumentation complete.`);
    this.log(`Processed files: ${this.processedFiles}`);
    this.log(`Modified files: ${this.modifiedFiles}`);
    this.log(`Formatted files: ${this.formattedFiles}`);

    return {
      processedFiles: this.processedFiles,
      modifiedFiles: this.modifiedFiles,
      formattedFiles: this.formattedFiles,
    };
  }

  private async processDirectory(dirPath: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun, usePrettier);
      } else if (file.endsWith('Test.cls')) {
        await this.processTestFile(filePath, isDryRun);
      } else if (file.endsWith('.cls')) {
        await this.instrumentApexClass(filePath, isDryRun, usePrettier);
      }
    }
  }

  private async processTestFile(filePath: string, isDryRun: boolean): Promise<void> {
    this.logger.debug(`Processing test file: ${filePath}`);
    let content = await fs.promises.readFile(filePath, 'utf8');
    const originalContent = content;

    content = content.replace(
      testSetupRegex,
      (match) => `${match}\n        rflib_TestUtil.prepareLoggerForUnitTests();`,
    );

    if (content !== originalContent) {
      this.modifiedFiles++;
      if (!isDryRun) {
        await fs.promises.writeFile(filePath, content);
        this.logger.info(`Modified test file: ${filePath}`);
      } else {
        this.logger.info(`Would modify test file: ${filePath}`);
      }
    }
  }

  private async instrumentApexClass(filePath: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    const className = path.basename(filePath, '.cls');
    this.logger.debug(`Processing class: ${className}`);

    try {
      this.processedFiles++;
      let content = await fs.promises.readFile(filePath, 'utf8');
      const originalContent = content;

      const { loggerVariableName } = RflibLoggingApexInstrument.detectExistingLogger(content);
      content = RflibLoggingApexInstrument.addLoggerDeclaration(content, className);
      content = RflibLoggingApexInstrument.processMethodDeclarations(content, loggerVariableName);
      content = RflibLoggingApexInstrument.processIfStatements(content, loggerVariableName);
      content = RflibLoggingApexInstrument.processCatchBlocks(content, loggerVariableName);

      if (content !== originalContent) {
        this.modifiedFiles++;
        if (!isDryRun) {
          try {
            const finalContent = usePrettier ? await prettier.format(content, this.prettierConfig) : content;

            await fs.promises.writeFile(filePath, finalContent);

            if (usePrettier) {
              this.formattedFiles++;
              this.logger.info(`Modified and formatted: ${filePath}`);
            } else {
              this.logger.info(`Modified: ${filePath}`);
            }
          } catch (error) {
            if (error instanceof Error) {
              this.logger.warn(`Failed to format ${filePath}: ${error.message}`);
            } else {
              this.logger.warn(`Failed to format ${filePath}: ${String(error)}`);
            }
            await fs.promises.writeFile(filePath, content);
            this.logger.info(`Modified without formatting: ${filePath}`);
          }
        } else {
          this.logger.info(`Would modify: ${filePath}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing class ${className}`, error);
      throw error;
    }
  }
}
