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

const loggerComponentRegex =
  /<c:rflibLoggerCmp\s+aura:id="([^"]+)"\s+name="([^"]+)"\s+appendComponentId="([^"]+)"\s*\/>/;
const attributeRegex = /<aura:attribute[^>]*>/g;
const loggerVarRegex = /var\s+(\w+)\s*=\s*\w+\.find\(['"](\w+)['"]\)/;
const methodRegex =
  /(\b\w+)\s*:\s*function\s*\((.*?)\)\s*{((?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*})*})*?)}/g;
const promiseChainRegex =
  /\.(then|catch|finally)\s*\(\s*(?:async\s+)?(?:\(?([^)]*)\)?)?\s*=>\s*(?:{([\s\S]*?)}|([^{].*?)(?=\.|\)|\n|;|$))/g;
const tryCatchBlockRegex = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;
const ifStatementRegex = /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
const elseRegex = /}\s*else(?!\s+if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{].*?)(?=\n|;|$))/g;

type IfCondition = {
  condition: string;
  position: number;
};

type InstrumentationFlags = {
  prettier: boolean;
  noIf: boolean;
  skipInstrumented: boolean;
};

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
    trailingComma: 'none',
  };

  private static processMethodLogging(
    logger: Logger,
    content: string,
    loggerId: string,
    filePath: string,
    flags: InstrumentationFlags,
  ): string {
    const isHelper = filePath.endsWith('Helper.js');

    return content.replace(methodRegex, (match: string, methodName: string, params: string, body: string) => {
      logger.trace(`Processing method: ${methodName}`);

      const paramList = params
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p);
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
        bodyContent =
          body.slice(0, loggerIndex) +
          `\n        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});` +
          body.slice(loggerIndex);
      } else {
        // Add new logger and log statement
        const loggerInit = `var ${loggerVar} = ${paramList[0]}.find('${loggerId}');\n`;
        bodyContent = `\n        ${loggerInit}        ${loggerVar}.info('${methodName}(${placeholders})'${logParams});${body}`;
      }

      // Then handle if statements
      if (!flags.noIf) {
        bodyContent = this.processIfStatements(bodyContent, loggerVar);
      }

      return `${methodName}: function(${params}) {${bodyContent}}`;
    });
  }

  private static processPromiseChains(content: string): string {
    return content.replace(promiseChainRegex, (match, type, param, blockBody, singleLineBody) => {
      const paramName = (param as string | undefined)?.trim() || (type === 'then' ? 'result' : 'error');

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

      return match.replace(
        /catch\s*\(([^)]*)\)\s*{/,
        `catch(${exceptionVar}) {
          logger.error('An error occurred', ${errorVar});`,
      );
    });
  }

  private static processIfStatements(content: string, loggerName: string): string {
    const conditions: IfCondition[] = [];

    // Process if statements and store conditions with positions
    let modified = content.replace(
      ifStatementRegex,
      (match: string, condition: string, blockBody: string, singleLineBody: string, offset: number) => {
        const cleanedUpCondition = condition.trim().replaceAll("'", "\\'");
        conditions.push({
          condition: cleanedUpCondition,
          position: offset,
        });

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

    // Process else blocks using nearest if condition
    modified = modified.replace(elseRegex, (match, blockBody, singleLineBody, offset) => {
      // Find last if statement before this else
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
    });

    return modified;
  }

  private static isInstrumented(content: string, loggerId: string): boolean {
    return new RegExp(`\\.find\\(['"]${loggerId}['"]\\)`, 'g').test(content);
  }

  public async run(): Promise<RflibLoggingAuraInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingAuraInstrument);

    const instrumentationFlags = {
      prettier: flags.prettier,
      noIf: flags['no-if'],
      skipInstrumented: flags['skip-instrumented'],
    };

    this.log(`Starting Aura component instrumentation in ${flags.sourcepath}`);
    this.logger.debug(`Dry run mode: ${flags.dryrun}`);

    this.spinner.start('Running...');
    await this.processDirectory(flags.sourcepath, flags.dryrun, instrumentationFlags);
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

  private async processDirectory(dirPath: string, isDryRun: boolean, flags: InstrumentationFlags): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);

    // Check if path is direct component
    const dirName = path.basename(dirPath);
    const parentDir = path.basename(path.dirname(dirPath));
    if (parentDir === 'aura') {
      this.logger.info(`Processing single component: ${dirName}`);
      await this.processAuraComponent(dirPath, dirName, isDryRun, flags);
      return;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      this.logger.debug(`Examining entry: ${entry.name}`);

      if (entry.isDirectory()) {
        if (entry.name === 'aura') {
          this.logger.info(`Found Aura directory: ${fullPath}`);
          await this.processAuraComponents(fullPath, isDryRun, flags);
        } else {
          await this.processDirectory(fullPath, isDryRun, flags);
        }
      }
    }
  }

  private async processAuraComponents(auraPath: string, isDryRun: boolean, flags: InstrumentationFlags): Promise<void> {
    // Check if path is already an aura directory
    if (path.basename(auraPath) !== 'aura') {
      this.logger.warn(`Not an aura directory: ${auraPath}`);
      return;
    }

    const entries = await fs.promises.readdir(auraPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const componentPath = path.join(auraPath, entry.name);
        await this.processAuraComponent(componentPath, entry.name, isDryRun, flags);
      }
    }
  }

  private async processAuraComponent(
    componentPath: string,
    componentName: string,
    isDryRun: boolean,
    flags: InstrumentationFlags,
  ): Promise<void> {
    this.logger.info(`Processing Aura component: ${componentName}`);

    const cmpPath = path.join(componentPath, `${componentName}.cmp`);
    const controllerPath = path.join(componentPath, `${componentName}Controller.js`);
    const helperPath = path.join(componentPath, `${componentName}Helper.js`);
    const rendererPath = path.join(componentPath, `${componentName}Renderer.js`);

    try {
      const loggerId = await this.instrumentCmpFile(cmpPath, componentName, isDryRun);
      this.logger.debug(`Using logger ID: ${loggerId}`);

      await this.instrumentJsFile(controllerPath, loggerId, isDryRun, flags);
      await this.instrumentJsFile(helperPath, loggerId, isDryRun, flags);
      await this.instrumentJsFile(rendererPath, loggerId, isDryRun, flags);
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
      const insertPosition = lastAttributeMatch.index + lastAttributeMatch[0].length;
      const loggerComponent = `\n    <c:rflibLoggerCmp aura:id="logger" name="${componentName}" appendComponentId="false" />`;
      content = content.slice(0, insertPosition) + loggerComponent + content.slice(insertPosition);
    }

    if (content !== originalContent) {
      this.modifiedFiles++;
      if (!isDryRun) {
        await fs.promises.writeFile(filePath, content, 'utf8');
      }
    }

    return 'logger';
  }

  private async instrumentJsFile(
    filePath: string,
    loggerId: string,
    isDryRun: boolean,
    flags: InstrumentationFlags,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.debug(`JavaScript file not found: ${filePath}`);
      return;
    }

    this.logger.debug(`Instrumenting JavaScript file: ${filePath}`);
    this.processedFiles++;
    let content = await fs.promises.readFile(filePath, 'utf8');

    // Check if component is already instrumented
    if (flags.skipInstrumented && RflibLoggingAuraInstrument.isInstrumented(content, loggerId)) {
      this.logger.info(`Skipping instrumented component: ${filePath}`);
      return;
    }

    const originalContent = content;

    const usePrettier = flags.prettier;

    // Process methods
    content = RflibLoggingAuraInstrument.processMethodLogging(this.logger, content, loggerId, filePath, flags);
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
