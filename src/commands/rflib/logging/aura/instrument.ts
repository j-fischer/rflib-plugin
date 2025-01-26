/* eslint-disable no-await-in-loop */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import * as prettier from 'prettier';

interface IfCondition {
  readonly condition: string;
  readonly position: number;
}

interface InstrumentationOptions {
  readonly prettier: boolean;
  readonly noIf: boolean;
  readonly skipInstrumented: boolean;
}

export interface RflibLoggingAuraInstrumentResult {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
}

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.aura.instrument');

class AuraInstrumentationService {
  public static readonly ATTRIBUTE_REGEX = /<aura:attribute[^>]*>/g;
  public static readonly LOGGER_COMPONENT_REGEX = /<c:rflibLoggerCmp\s+aura:id="([^"]+)"\s+name="([^"]+)"\s+appendComponentId="([^"]+)"\s*\/>/;

  private static readonly LOGGER_VAR_REGEX = /var\s+(\w+)\s*=\s*\w+\.find\(['"](\w+)['"]\);/;
  private static readonly METHOD_REGEX = /(\b\w+)\s*:\s*function\s*\((.*?)\)\s*{((?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*})*})*?)}/g;
  private static readonly PROMISE_CHAIN_REGEX = /\.(then|catch|finally)\s*\(\s*function\s*\(([^)]*)\)\s*{([\s\S]*?)}/g;
  private static readonly TRY_CATCH_BLOCK_REGEX = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;
  private static readonly IF_STATEMENT_REGEX = /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
  private static readonly ELSE_REGEX = /}\s*else(?!\s+if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{].*?)(?=\n|;|$))/g;

  private static readonly PRETTIER_CONFIG: prettier.Options = {
    parser: 'babel',
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
    trailingComma: 'none'
  };

  public static isInstrumented(content: string, loggerId: string): boolean {
    return new RegExp(`\\.find\\(['"]${loggerId}['"]\\)`, 'g').test(content);
  }

  public static async formatContent(content: string): Promise<string> {
    try {
      return await prettier.format(content, this.PRETTIER_CONFIG);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Formatting failed: ${error.message}`);
      }
      throw new Error('Formatting failed with unknown error');
    }
  }

  public static processMethodLogging(
    content: string,
    loggerId: string,
    isHelper: boolean,
    noIf: boolean
  ): string {
    return content.replace(
      this.METHOD_REGEX,
      (match: string, methodName: string, params: string, body: string) => {
        const paramList = params.split(',').map((p) => p.trim()).filter(Boolean);
        let loggerVar = 'logger';
        let bodyContent = body;

        const paramsToLog = isHelper ? paramList : paramList.slice(1, 2);
        const placeholders = paramsToLog.map((_, i) => `{${i}}`).join(', ');
        const logParams = paramsToLog.length > 0 ? `, [${paramsToLog.join(', ')}]` : '';

        const loggerMatch = body.match(this.LOGGER_VAR_REGEX);
        if (loggerMatch && loggerMatch[2] === loggerId) {
          loggerVar = loggerMatch[1];
          const loggerIndex = body.indexOf(loggerMatch[0]) + loggerMatch[0].length;
          bodyContent = `${body.slice(0, loggerIndex)}\n        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});${body.slice(loggerIndex)}`;
        } else {
          const loggerInit = `var ${loggerVar} = ${paramList[0]}.find('${loggerId}');\n`;
          bodyContent = `\n        ${loggerInit}        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});${body}`;
        }

        if (!noIf) {
          bodyContent = this.processIfStatements(bodyContent, loggerVar);
        }

        bodyContent = AuraInstrumentationService.processPromiseChains(bodyContent, loggerVar);

        return `${methodName}: function(${params}) {${bodyContent}}`;
      }
    );
  }

  public static processPromiseChains(content: string, loggerVar: string): string {
    return content.replace(
      this.PROMISE_CHAIN_REGEX,
      (match: string, type: string, param: string, blockBody: string) => {
        const logStatement = this.processPromiseType(type, param?.trim() || '', loggerVar);

        return match.replace(blockBody, `\n        ${logStatement}\n        ${blockBody}`);
      }
    );
  }

  public static processTryCatchBlocks(content: string): string {
    return content.replace(
      this.TRY_CATCH_BLOCK_REGEX,
      (match: string, exceptionVar: string) => {
        const errorVar = exceptionVar.trim().split(' ')[0] || 'error';
        return match.replace(
          /catch\s*\(([^)]*)\)\s*{/,
          `catch(${exceptionVar}) {
            logger.error('An error occurred', ${errorVar});`
        );
      }
    );
  }

  private static processPromiseType(type: string, paramName: string, loggerVar: string): string {
    switch (type) {
      case 'then':
        return `${loggerVar}.info('Promise resolved. Result={0}', ${paramName});`;
      case 'catch':
        return `${loggerVar}.error('An error occurred', ${paramName});`;
      case 'finally':
        return `${loggerVar}.info('Promise chain completed');`;
      default:
        throw new Error(`Unsupported promise type: ${type}`);
    }
  }

  private static processIfStatements(content: string, loggerName: string): string {
    const conditions: IfCondition[] = [];

    let modified = content.replace(
      this.IF_STATEMENT_REGEX,
      (match: string, condition: string, blockBody: string, singleLineBody: string, offset: number) => {
        const cleanedUpCondition = condition.trim().replaceAll("'", "\\'");
        conditions.push({ condition: cleanedUpCondition, position: offset });

        const logStatement = `${loggerName}.debug('if (${cleanedUpCondition})');\n        `;

        if (blockBody) {
          return `if (${condition}) {\n        ${logStatement}${blockBody}}`;
        } else if (singleLineBody) {
          const cleanBody = singleLineBody.replace(/;$/, '').trim();
          return `if (${condition}) {\n        ${logStatement}${cleanBody};\n    }`;
        }
        return match;
      }
    );

    modified = modified.replace(
      this.ELSE_REGEX,
      (match: string, blockBody: string, singleLineBody: string, offset: number) => {
        const nearestIf = conditions
          .filter((c) => c.position < offset)
          .reduce((prev, curr) => (!prev || curr.position > prev.position ? curr : prev));

        const logStatement = nearestIf
          ? `${loggerName}.debug('else for if (${nearestIf.condition})');\n        `
          : `${loggerName}.debug('else statement');\n        `;

        if (blockBody) {
          return `} else {\n        ${logStatement}${blockBody}}`;
        } else if (singleLineBody) {
          return `} else {\n        ${logStatement}${singleLineBody};\n    }`;
        }
        return match;
      }
    );

    return modified;
  }
}

export default class RflibLoggingAuraInstrument extends SfCommand<RflibLoggingAuraInstrumentResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    sourcepath: Flags.string({
      char: 's',
      required: true,
      summary: messages.getMessage('flags.sourcepath.summary'),
      description: messages.getMessage('flags.sourcepath.description')
    }),
    dryrun: Flags.boolean({
      char: 'd',
      default: false,
      summary: messages.getMessage('flags.dryrun.summary'),
      description: messages.getMessage('flags.dryrun.description')
    }),
    prettier: Flags.boolean({
      char: 'p',
      default: false,
      summary: messages.getMessage('flags.prettier.summary'),
      description: messages.getMessage('flags.prettier.description')
    }),
    'no-if': Flags.boolean({
      summary: messages.getMessage('flags.no-if.summary'),
      description: messages.getMessage('flags.no-if.description'),
      default: false
    }),
    'skip-instrumented': Flags.boolean({
      summary: messages.getMessage('flags.skip-instrumented.summary'),
      description: messages.getMessage('flags.skip-instrumented.description'),
      default: false
    })
  };

  private logger!: Logger;
  private readonly stats: RflibLoggingAuraInstrumentResult = {
    processedFiles: 0,
    modifiedFiles: 0,
    formattedFiles: 0
  };

  public async run(): Promise<RflibLoggingAuraInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingAuraInstrument);

    const instrumentationOpts: InstrumentationOptions = {
      prettier: flags.prettier,
      noIf: flags['no-if'],
      skipInstrumented: flags['skip-instrumented']
    };

    this.log(`Starting Aura component instrumentation in ${flags.sourcepath}`);
    this.logger.debug(`Dry run mode: ${flags.dryrun}`);

    this.spinner.start('Running...');
    await this.processDirectory(flags.sourcepath, flags.dryrun, instrumentationOpts);
    this.spinner.stop();

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);
    this.log(`Formatted files: ${this.stats.formattedFiles}`);

    return { ...this.stats };
  }

  private async processDirectory(
    dirPath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions
  ): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);

    const dirName = path.basename(dirPath);
    const parentDir = path.basename(path.dirname(dirPath));

    if (parentDir === 'aura') {
      this.logger.info(`Processing single component: ${dirName}`);
      await this.processAuraComponent(dirPath, dirName, isDryRun, instrumentationOpts);
      return;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'aura') {
          await this.processAuraComponents(fullPath, isDryRun, instrumentationOpts);
        } else {
          await this.processDirectory(fullPath, isDryRun, instrumentationOpts);
        }
      }
    }
  }

  private async processAuraComponents(
    auraPath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions
  ): Promise<void> {
    if (path.basename(auraPath) !== 'aura') {
      this.logger.warn(`Not an aura directory: ${auraPath}`);
      return;
    }

    const entries = await fs.promises.readdir(auraPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const componentPath = path.join(auraPath, entry.name);
        await this.processAuraComponent(componentPath, entry.name, isDryRun, instrumentationOpts);
      }
    }
  }

  private async processAuraComponent(
    componentPath: string,
    componentName: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions
  ): Promise<void> {
    this.logger.info(`Processing Aura component: ${componentName}`);

    const cmpPath = path.join(componentPath, `${componentName}.cmp`);
    const controllerPath = path.join(componentPath, `${componentName}Controller.js`);
    const helperPath = path.join(componentPath, `${componentName}Helper.js`);
    const rendererPath = path.join(componentPath, `${componentName}Renderer.js`);

    try {
      const loggerId = await this.instrumentCmpFile(cmpPath, componentName, isDryRun);
      this.logger.debug(`Using logger ID: ${loggerId}`);

      await this.instrumentJsFile(controllerPath, loggerId, isDryRun, instrumentationOpts);
      await this.instrumentJsFile(helperPath, loggerId, isDryRun, instrumentationOpts);
      await this.instrumentJsFile(rendererPath, loggerId, isDryRun, instrumentationOpts);
    } catch (error) {
      this.logger.error(`Error processing Aura component ${componentName}`, error);
      throw error;
    }
  }

  private async instrumentCmpFile(
    filePath: string,
    componentName: string,
    isDryRun: boolean
  ): Promise<string> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Component file not found: ${filePath}`);
      return 'logger';
    }

    this.logger.debug(`Instrumenting component file: ${filePath}`);
    this.stats.processedFiles++;

    let content = await fs.promises.readFile(filePath, 'utf8');
    const originalContent = content;

    const loggerMatch = content.match(AuraInstrumentationService.LOGGER_COMPONENT_REGEX);
    if (loggerMatch) {
      return loggerMatch[1];
    }

    const lastAttributeMatch = [...content.matchAll(AuraInstrumentationService.ATTRIBUTE_REGEX)].pop();
    if (lastAttributeMatch) {
      const insertPosition = lastAttributeMatch.index + lastAttributeMatch[0].length;
      const loggerComponent = `\n    <c:rflibLoggerCmp aura:id="logger" name="${componentName}" appendComponentId="false" />`;
      content = content.slice(0, insertPosition) + loggerComponent + content.slice(insertPosition);
    }

    if (content !== originalContent) {
      this.stats.modifiedFiles++;
      if (!isDryRun) {
        await fs.promises.writeFile(filePath, content, 'utf8');
        this.logger.info(`Modified component file: ${filePath}`);
      } else {
        this.logger.info(`Would modify component file: ${filePath}`);
      }
    }

    return 'logger';
  }

  private async instrumentJsFile(
    filePath: string,
    loggerId: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.debug(`JavaScript file not found: ${filePath}`);
      return;
    }

    this.logger.debug(`Instrumenting JavaScript file: ${filePath}`);
    this.stats.processedFiles++;

    let content = await fs.promises.readFile(filePath, 'utf8');

    if (instrumentationOpts.skipInstrumented && AuraInstrumentationService.isInstrumented(content, loggerId)) {
      this.logger.info(`Skipping instrumented file: ${filePath}`);
      return;
    }

    const originalContent = content;
    const isHelper = filePath.endsWith('Helper.js');

    // Process methods and other patterns
    content = AuraInstrumentationService.processMethodLogging(
      content,
      loggerId,
      isHelper,
      instrumentationOpts.noIf
    );
    content = AuraInstrumentationService.processTryCatchBlocks(content);

    if (content !== originalContent) {
      this.stats.modifiedFiles++;
      if (!isDryRun) {
        try {
          const finalContent = instrumentationOpts.prettier
            ? await AuraInstrumentationService.formatContent(content)
            : content;

          await fs.promises.writeFile(filePath, finalContent);

          if (instrumentationOpts.prettier) {
            this.stats.formattedFiles++;
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