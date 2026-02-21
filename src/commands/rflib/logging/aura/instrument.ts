import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import * as prettier from 'prettier';
import { minimatch } from 'minimatch';
import { processWithConcurrency } from '../../../../shared/concurrency.js';

import { IfCondition, InstrumentationOptions } from '../../../../shared/types.js';
import { writeInstrumentedFile } from '../../../../shared/formatting.js';

export type RflibLoggingAuraInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
  modifiedFilePaths?: string[];
}

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.aura.instrument');

class AuraInstrumentationService {
  public static readonly ATTRIBUTE_REGEX = /<aura:attribute[^>]*>/g;
  public static readonly LOGGER_COMPONENT_REGEX =
    /<c:rflibLoggerCmp\s+aura:id="([^"]+)"\s+name="([^"]+)"\s+appendComponentId="([^"]+)"\s*\/>/;

  public static readonly PRETTIER_CONFIG: prettier.Options = {
    parser: 'babel',
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
    trailingComma: 'none',
  };

  private static readonly LOGGER_VAR_REGEX = /var\s+(\w+)\s*=\s*\w+\.find\(['"](\w+)['"]\);/;
  private static readonly METHOD_REGEX =
    /(\b\w+)\s*:\s*function\s*\((.*?)\)\s*{((?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*})*})*?)}/g;
  private static readonly PROMISE_CHAIN_REGEX = /\.(then|catch|finally)\s*\(\s*function\s*\(([^)]*)\)\s*{([\s\S]*?)}/g;
  private static readonly TRY_CATCH_BLOCK_REGEX = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;
  private static readonly IF_STATEMENT_REGEX =
    /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
  private static readonly ELSE_REGEX =
    /}\s*else(?!\s+if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{].*?)(?=\n|;|$))/g;
  private static readonly CONSOLE_LOG_REGEX = /console\.(log|debug|info|warn|error)\s*\(\s*([^)]+)\s*\)\s*;?/g;



  public static isInstrumented(content: string, loggerId: string): boolean {
    return new RegExp(`\\.find\\(['"]${loggerId}['"]\\)`, 'g').test(content);
  }



  public static processMethodLogging(content: string, loggerId: string, isHelper: boolean, noIf: boolean): string {
    return content.replace(this.METHOD_REGEX, (match: string, methodName: string, params: string, body: string) => {
      const paramList = params
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
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
      bodyContent = AuraInstrumentationService.processConsoleStatements(bodyContent, loggerVar);

      return `${methodName}: function(${params}) {${bodyContent}}`;
    });
  }

  public static processPromiseChains(content: string, loggerVar: string): string {
    return content.replace(
      this.PROMISE_CHAIN_REGEX,
      (match: string, type: string, param: string, blockBody: string) => {
        const logStatement = this.processPromiseType(type, param?.trim() || '', loggerVar);

        return match.replace(blockBody, `\n        ${logStatement}\n        ${blockBody}`);
      },
    );
  }

  public static processTryCatchBlocks(content: string): string {
    return content.replace(this.TRY_CATCH_BLOCK_REGEX, (match: string, exceptionVar: string) => {
      const errorVar = exceptionVar.trim().split(' ')[0] || 'error';
      return match.replace(
        /catch\s*\(([^)]*)\)\s*{/,
        `catch(${exceptionVar}) {
            logger.error('An error occurred', ${errorVar});`,
      );
    });
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
      },
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
      },
    );

    return modified;
  }

  private static processConsoleStatements(methodBody: string, loggerName: string): string {
    return methodBody.replace(this.CONSOLE_LOG_REGEX, (match: string, logType: string, argument: string) => {
      const logLevel = logType === 'info' || logType === 'warn' || logType === 'error' ? logType : 'debug';
      return `${loggerName}.${logLevel}(${argument});`;
    });
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
    'no-if': Flags.boolean({
      summary: messages.getMessage('flags.no-if.summary'),
      description: messages.getMessage('flags.no-if.description'),
      default: false,
    }),
    'skip-instrumented': Flags.boolean({
      summary: messages.getMessage('flags.skip-instrumented.summary'),
      description: messages.getMessage('flags.skip-instrumented.description'),
      default: false,
    }),
    verbose: Flags.boolean({
      summary: messages.getMessage('flags.verbose.summary'),
      description: messages.getMessage('flags.verbose.description'),
      char: 'v',
      default: false,
    }),
    exclude: Flags.string({
      summary: messages.getMessage('flags.exclude.summary'),
      description: messages.getMessage('flags.exclude.description'),
      char: 'e',
    }),
    concurrency: Flags.integer({
      summary: messages.getMessage('flags.concurrency.summary'),
      description: messages.getMessage('flags.concurrency.description'),
      char: 'c',
      default: 10,
    }),
  };

  private logger!: Logger;
  private readonly stats: RflibLoggingAuraInstrumentResult = {
    processedFiles: 0,
    modifiedFiles: 0,
    formattedFiles: 0,
    modifiedFilePaths: [],
  };

  public async run(): Promise<RflibLoggingAuraInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingAuraInstrument);

    const instrumentationOpts: InstrumentationOptions = {
      prettier: flags.prettier,
      noIf: flags['no-if'],
      skipInstrumented: flags['skip-instrumented'],
      verbose: flags.verbose,
      exclude: flags.exclude,
    };

    this.log(`Starting Aura component instrumentation in ${flags.sourcepath}`);
    this.logger.debug(`Dry run mode: ${flags.dryrun}`);

    this.spinner.start('Running...');

    const components = await this.findAllAuraComponents(flags.sourcepath, instrumentationOpts.exclude);
    await processWithConcurrency(
      components,
      flags.concurrency,
      async (component) => {
        await this.processAuraComponent(component.path, component.name, flags.dryrun, instrumentationOpts);
      }
    );

    this.spinner.stop();

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);
    this.log(`Formatted files: ${this.stats.formattedFiles}`);

    return { ...this.stats };
  }

  private async findAllAuraComponents(dirPath: string, excludePattern?: string): Promise<Array<{ path: string; name: string }>> {
    this.logger.debug(`Scanning directory: ${dirPath}`);

    const dirName = path.basename(dirPath);
    const parentName = path.basename(path.dirname(dirPath));

    // Case 1: The sourcepath points directly to a component (inside an 'aura' folder)
    if (parentName === 'aura') {
      if (excludePattern && minimatch(dirPath, excludePattern, { matchBase: true })) {
        this.logger.debug(`Skipping excluded path: ${dirPath}`);
        return [];
      }
      return [{
        path: dirPath,
        name: dirName
      }];
    }

    // Case 2: The sourcepath points to an 'aura' folder
    if (dirName === 'aura') {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const components = await Promise.all(
        entries
          .filter(entry => entry.isDirectory())
          .map(entry => {
            const cmpPath = path.join(dirPath, entry.name);
            if (excludePattern && minimatch(cmpPath, excludePattern, { matchBase: true })) {
              this.logger.debug(`Skipping excluded path: ${cmpPath}`);
              return null;
            }
            return {
              path: cmpPath,
              name: entry.name
            };
          })
      );
      return components.filter((c): c is { path: string; name: string } => c !== null);
    }

    // Case 3: Recursion
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          return this.findAllAuraComponents(path.join(dirPath, entry.name), excludePattern);
        }
        return [];
      })
    );

    return results.flat();
  }

  private async processAuraComponent(
    componentPath: string,
    componentName: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
  ): Promise<void> {
    this.logger.info(`Processing Aura component: ${componentName}`);

    const cmpPath = path.join(componentPath, `${componentName}.cmp`);
    const controllerPath = path.join(componentPath, `${componentName}Controller.js`);
    const helperPath = path.join(componentPath, `${componentName}Helper.js`);
    const rendererPath = path.join(componentPath, `${componentName}Renderer.js`);

    try {
      const loggerId = await this.instrumentCmpFile(cmpPath, componentName, isDryRun, instrumentationOpts);
      this.logger.debug(`Using logger ID: ${loggerId}`);

      await Promise.all([
        this.instrumentJsFile(controllerPath, loggerId, isDryRun, instrumentationOpts),
        this.instrumentJsFile(helperPath, loggerId, isDryRun, instrumentationOpts),
        this.instrumentJsFile(rendererPath, loggerId, isDryRun, instrumentationOpts),
      ]);
    } catch (error) {
      this.logger.error(`Error processing Aura component ${componentName}`, error);
      throw error;
    }
  }

  private async instrumentCmpFile(filePath: string, componentName: string, isDryRun: boolean, instrumentationOpts: InstrumentationOptions): Promise<string> {
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
      this.stats.modifiedFilePaths?.push(filePath);
      if (!isDryRun) {
        await fs.promises.writeFile(filePath, content, 'utf8');
        this.logger.info(`Modified component file: ${filePath}`);
      } else {
        this.logger.info(`Would modify component file: ${filePath}`);
        if (instrumentationOpts.verbose) {
          this.log(`Would modify component file: ${filePath}`);
        }
      }
    }

    return 'logger';
  }

  private async instrumentJsFile(
    filePath: string,
    loggerId: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
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
    content = AuraInstrumentationService.processMethodLogging(content, loggerId, isHelper, instrumentationOpts.noIf);
    content = AuraInstrumentationService.processTryCatchBlocks(content);

    if (content !== originalContent) {
      await writeInstrumentedFile(
        filePath,
        content,
        originalContent,
        instrumentationOpts,
        isDryRun,
        this.stats,
        this.logger,
        (msg) => this.log(msg),
        AuraInstrumentationService.PRETTIER_CONFIG,
      );
    }
  }
}
