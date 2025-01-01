/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
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
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.aura.instrument');

const loggerComponentRegex = /<c:rflibLoggerCmp\s+aura:id="([^"]+)"\s+name="([^"]+)"\s+appendComponentId="([^"]+)"\s*\/>/;
const attributeRegex = /<aura:attribute[^>]*>/g;
const loggerVarRegex = /var\s+(\w+)\s*=\s*component\.find\(['"](\w+)['"]\)/;
const methodRegex = /(\b\w+)\s*:\s*function\s*\((.*?)\)\s*{((?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*})*})*?)}/g;
const promiseChainRegex = /\.(then|catch|finally)\s*\(\s*(?:async\s+)?(?:\(?([^)]*)\)?)?\s*=>\s*(?:{([\s\S]*?)}|([^{].*?)(?=\.|\)|\n|;|$))/g;
const tryCatchBlockRegex = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;

export type RflibLoggingAuraInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
};

export default class RflibLoggingAuraInstrument extends SfCommand<RflibLoggingAuraInstrumentResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    sourcepath: Flags.string({
      char: 's',
      required: true,
      summary: messages.getMessage('flags.sourcepath.summary'),
      description: messages.getMessage('flags.sourcepath.description'),
    }),
    dryrun: Flags.boolean({
      char: 'd',
      default: false,
      summary: messages.getMessage('flags.dryrun.summary'),
      description: messages.getMessage('flags.dryrun.description'),
    }),
    prettier: Flags.boolean({
      char: 'p',
      default: false,
      summary: messages.getMessage('flags.prettier.summary'),
      description: messages.getMessage('flags.prettier.description'),
    }),
  };

  private logger!: Logger;
  private processedFiles = 0;
  private modifiedFiles = 0;
  private formattedFiles = 0;

  private readonly prettierConfig: prettier.Options = {
    parser: 'babel',
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
    trailingComma: "none"
  };

  private static processMethodLogging(logger: Logger, content: string, loggerId: string, filePath: string): string {
    const isHelper = filePath.endsWith('Helper.js');

    return content.replace(methodRegex, (match: string, methodName: string, params: string, body: string) => {
      logger.trace(`Processing method: ${methodName}`);

      const paramList = params.split(',').map(p => p.trim()).filter(p => p);
      let loggerVar = 'logger';
      let bodyContent = body;

      // Prepare logging parameters
      const paramsToLog = isHelper ? paramList : paramList.slice(1, 2);
      const placeholders = paramsToLog.map((_, i) => `{${i}}`).join(', ');
      const logParams = paramsToLog.length > 0 ? `, [${paramsToLog.join(', ')}]` : '';

      // Find existing logger in function body
      const loggerMatch = body.match(loggerVarRegex);
      if (loggerMatch && loggerMatch[2] === loggerId) {
        loggerVar = loggerMatch[1];
        // Insert log after existing logger declaration
        const loggerIndex = body.indexOf(loggerMatch[0]) + loggerMatch[0].length;
        bodyContent = body.slice(0, loggerIndex) +
          `\n        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});` +
          body.slice(loggerIndex);
      } else {
        // Add new logger and log statement
        const loggerInit = `var ${loggerVar} = ${paramList[0]}.find('${loggerId}');\n`;
        bodyContent = `\n        ${loggerInit}        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});${body}`;
      }

      return `${methodName}: function(${params}) {${bodyContent}}`;
    });
  }

  private static processPromiseChains(content: string): string {
    return content.replace(promiseChainRegex, (match, type, param, blockBody, singleLineBody) => {
      const paramName = param?.trim() || (type === 'then' ? 'result' : 'error');

      let logStatement = '';
      switch (type) {
        case 'then':
          logStatement = `logger.info('Promise resolved. Result={0}', ${paramName});`;
          break;
        case 'catch':
          logStatement = `logger.error('An error occurred', ${paramName});`;
          break;
        case 'finally':
          logStatement = `logger.info('Promise chain completed');`;
          break;
      }

      if (singleLineBody) {
        return `.${type}(${param || paramName} => {
          ${logStatement}
          return ${singleLineBody};
        })`;
      }

      if (blockBody) {
        return `.${type}(${param || paramName} => {
          ${logStatement}${blockBody}
        })`;
      }

      return match;
    });
  }

  private static processTryCatchBlocks(content: string): string {
    return content.replace(tryCatchBlockRegex, (match: string, exceptionVar: string) => {
      const errorVar = exceptionVar.trim().split(' ')[0] || 'error';

      return match.replace(/catch\s*\(([^)]*)\)\s*{/,
        `catch(${exceptionVar}) {
          logger.error('An error occurred', ${errorVar});`
      );
    });
  }

  public async run(): Promise<RflibLoggingAuraInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingAuraInstrument);

    this.log(`Starting Aura component instrumentation in ${flags.sourcepath}`);
    this.logger.debug(`Dry run mode: ${flags.dryrun}`);

    this.spinner.start('Running...');
    await this.processDirectory(flags.sourcepath, flags.dryrun, flags.prettier);
    this.spinner.stop();

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
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      this.logger.debug(`Examining entry: ${entry.name}`);

      if (entry.isDirectory()) {
        if (entry.name === 'aura') {
          this.logger.info(`Found Aura directory: ${fullPath}`);
          await this.processAuraComponents(fullPath, isDryRun, usePrettier);
        } else {
          await this.processDirectory(fullPath, isDryRun, usePrettier);
        }
      }
    }
  }

  private async processAuraComponents(auraPath: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    const entries = await fs.promises.readdir(auraPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const componentPath = path.join(auraPath, entry.name);
        await this.processAuraComponent(componentPath, entry.name, isDryRun, usePrettier);
      }
    }
  }

  private async processAuraComponent(componentPath: string, componentName: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    this.logger.info(`Processing Aura component: ${componentName}`);
    const cmpPath = path.join(componentPath, `${componentName}.cmp`);
    const controllerPath = path.join(componentPath, `${componentName}Controller.js`);
    const helperPath = path.join(componentPath, `${componentName}Helper.js`);
    const rendererPath = path.join(componentPath, `${componentName}Renderer.js`);

    try {
      const loggerId = await this.instrumentCmpFile(cmpPath, componentName, isDryRun);
      this.logger.debug(`Using logger ID: ${loggerId}`);

      await this.instrumentJsFile(controllerPath, loggerId, isDryRun, usePrettier);
      await this.instrumentJsFile(helperPath, loggerId, isDryRun, usePrettier);
      await this.instrumentJsFile(rendererPath, loggerId, isDryRun, usePrettier);
    } catch (error) {
      this.logger.error(`Error processing Aura ${componentName}`, error);
    }
  }

  private async instrumentCmpFile(filePath: string, componentName: string, isDryRun: boolean): Promise<string> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Component file not found: ${filePath}`);
      return 'logger';
    }

    this.logger.debug(`Instrumenting component file: ${filePath}`);
    this.processedFiles++;
    let content = await fs.promises.readFile(filePath, 'utf8');
    const originalContent = content;

    const loggerMatch = content.match(loggerComponentRegex);
    if (loggerMatch) {
      return loggerMatch[1];
    }

    const lastAttributeMatch = [...content.matchAll(attributeRegex)].pop();
    if (lastAttributeMatch) {
      const insertPosition = lastAttributeMatch.index! + lastAttributeMatch[0].length;
      const loggerComponent = `\n    <c:rflibLoggerCmp aura:id="logger" name="${componentName}" appendComponentId="false" />`;
      content = content.slice(0, insertPosition) + loggerComponent + content.slice(insertPosition);
    }

    if (content !== originalContent && !isDryRun) {
      await fs.promises.writeFile(filePath, content, 'utf8');
      this.modifiedFiles++;
    }

    return 'logger';
  }

  private async instrumentJsFile(filePath: string, loggerId: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.debug(`JavaScript file not found: ${filePath}`);
      return;
    }

    this.logger.debug(`Instrumenting JavaScript file: ${filePath}`);
    this.processedFiles++;
    let content = await fs.promises.readFile(filePath, 'utf8');
    const originalContent = content;

    // Process methods
    content = RflibLoggingAuraInstrument.processMethodLogging(this.logger, content, loggerId, filePath);
    content = RflibLoggingAuraInstrument.processPromiseChains(content);
    content = RflibLoggingAuraInstrument.processTryCatchBlocks(content);

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
          this.logger.warn(`Failed to format ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          await fs.promises.writeFile(filePath, content);
          this.logger.info(`Modified without formatting: ${filePath}`);
        }
      } else {
        this.logger.info(`Would modify: ${filePath}`);
      }
    }
  }
}
