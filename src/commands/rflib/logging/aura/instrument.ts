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
const methodRegex = /(\b\w+)\s*:\s*function\s*\((.*?)\)\s*{((?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*})*?)}/g;
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
  };

  private static processMethodLogging(content: string): string {
    return content.replace(methodRegex, (match: string, methodName: string, args: string) => {
      const parameters = args.split(',').map(p => p.trim()).filter(p => p);
      const logArgs = parameters.length > 0 ? `, ${parameters.join(', ')}` : '';

      return `${match}
        logger.info('${methodName}(${parameters.map((_, i) => `{${i}}`).join(', ')})'${logArgs});`;
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

    this.logger.info(`Starting Aura component instrumentation in ${flags.sourcepath}`);
    this.logger.debug(`Dry run mode: ${flags.dryrun}`);

    await this.processDirectory(flags.sourcepath, flags.dryrun, flags.prettier);

    this.logger.info('Instrumentation complete');
    this.logger.info(`Stats: processed=${this.processedFiles}, modified=${this.modifiedFiles}`);

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

    try {
      const loggerId = await this.instrumentCmpFile(cmpPath, componentName, isDryRun);
      this.logger.debug(`Using logger ID: ${loggerId}`);

      await this.instrumentJsFile(controllerPath, loggerId, isDryRun, usePrettier);
      await this.instrumentJsFile(helperPath, loggerId, isDryRun, usePrettier);
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

    // Add logger initialization if not present
    if (!content.includes(`var logger = component.find('${loggerId}')`)) {
      const loggerInit = `\n    var logger = component.find('${loggerId}');\n`;
      content = loggerInit + content;
    }

    // Process methods
    content = RflibLoggingAuraInstrument.processMethodLogging(content);
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
