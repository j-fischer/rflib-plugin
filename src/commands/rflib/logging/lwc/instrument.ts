/* eslint-disable no-await-in-loop */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import * as prettier from 'prettier';
import { minimatch } from 'minimatch';
import { processWithConcurrency } from '../../../../shared/concurrency.js';

import { IfCondition, InstrumentationOptions, LoggerInfo } from '../../../../shared/types.js';
import { writeInstrumentedFile } from '../../../../shared/formatting.js';

export type RflibLoggingLwcInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
  modifiedFilePaths?: string[];
}

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.lwc.instrument');

class LwcInstrumentationService {
  public static readonly PRETTIER_CONFIG: prettier.Options = {
    parser: 'babel',
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
  };

  private static readonly IMPORT_REGEX = /import\s*{\s*createLogger\s*}\s*from\s*['"]c\/rflibLogger['"]/;
  private static readonly LOGGER_REGEX = /const\s+(\w+)\s*=\s*createLogger\s*\(['"]([\w-]+)['"]\)/;
  private static readonly METHOD_REGEX =
    /(?:async\s+)?(?!(?:if|switch|case|while|for|catch)\b)(\b\w+)\s*(?:\((.*?)\)\s*{|=\s*(?:async\s+)?(?:\((.*?)\)|(\w+))\s*=>\s*{)/g;
  private static readonly EXPORT_DEFAULT_REGEX = /export\s+default\s+class\s+(\w+)/;
  private static readonly IF_STATEMENT_REGEX =
    /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
  private static readonly ELSE_REGEX =
    /}\s*else(?!\s+if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{].*?)(?=\n|;|$))/g;
  private static readonly PROMISE_CHAIN_REGEX =
    /\.(then|catch|finally)\s*\(\s*(?:async\s+)?(?:\(?([^)]*)\)?)?\s*=>\s*(?:\{((?:[^{}]|`[^`]*`)*?)\}|([^{;]*?(?:\.[^{;]*?)*(?:\([^)]*\))?)(?=\s*(?:\)\)|\.|\))))/g;
  private static readonly TRY_CATCH_BLOCK_REGEX = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;
  private static readonly CONSOLE_LOG_REGEX = /console\.(log|debug|info|warn|error)\s*\(\s*([^)]+)\s*\)\s*;?/g;





  public static isInstrumented(content: string): boolean {
    return this.IMPORT_REGEX.test(content);
  }

  public static detectLogger(content: string): LoggerInfo {
    const match = content.match(this.LOGGER_REGEX);
    return {
      exists: match !== null,
      variableName: match ? match[1] : 'logger',
    };
  }

  public static addImportAndLogger(content: string, componentName: string): string {
    let modified = content;

    if (!this.IMPORT_REGEX.test(content)) {
      modified = `import { createLogger } from 'c/rflibLogger';\n${modified}`;
    }

    const { exists, variableName } = this.detectLogger(content);
    if (!exists) {
      const exportMatch = content.match(this.EXPORT_DEFAULT_REGEX);
      const className = exportMatch ? exportMatch[1] : componentName;
      const loggerDeclaration = `\nconst ${variableName} = createLogger('${className}');\n`;
      modified = modified.replace(this.EXPORT_DEFAULT_REGEX, `${loggerDeclaration}$&`);
    }

    return modified;
  }

  public static processIfStatements(content: string, loggerName: string): string {
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
          .filter((c) => c.position <= (offset ?? 0))
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

  public static processMethodLogging(content: string, loggerName: string, options: InstrumentationOptions): string {
    let modified = content.replace(this.METHOD_REGEX, (match: string, methodName: string, namedArgs: string, arrowArgsParens: string, arrowArgNoParens: string) => {
      const rawArgs = namedArgs ?? arrowArgsParens ?? arrowArgNoParens ?? '';
      const parameters = rawArgs
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p);
      const placeholders = parameters.map((_, i) => `{${i}}`).join(', ');
      const logArgs = parameters.length > 0 ? `, ${parameters.join(', ')}` : '';

      return `${match}\n        ${loggerName}.info('${methodName}(${placeholders})'${logArgs});`;
    });

    if (!options.noIf) {
      modified = this.processIfStatements(modified, loggerName);
    }

    return modified;
  }

  public static processTryCatchBlocks(content: string, loggerName: string): string {
    return content.replace(this.TRY_CATCH_BLOCK_REGEX, (match: string, exceptionVar: string, offset: number) => {
      const methodName = this.findEnclosingMethod(content, offset);
      const errorVar = exceptionVar.trim().split(' ')[0] || 'error';

      return match.replace(
        /catch\s*\(([^)]*)\)\s*{/,
        `catch(${exceptionVar}) {
            ${loggerName}.error('An error occurred in function ${methodName}()', ${errorVar});`,
      );
    });
  }

  public static processPromiseChains(content: string, loggerName: string): string {
    return content.replace(
      this.PROMISE_CHAIN_REGEX,
      (match, type, param, blockBody, singleLineBody, offset: number) => {
        const methodName = this.findEnclosingMethod(content, offset);
        const paramName = typeof param === 'string' ? param.trim() : type === 'then' ? 'result' : 'error';
        const indentation = match.match(/\n\s*/)?.[0] ?? '\n        ';

        let logStatement: string;
        switch (type) {
          case 'then':
            logStatement = `${loggerName}.info('${methodName}() promise resolved. Result={0}', ${paramName});`;
            break;
          case 'catch':
            logStatement = `${loggerName}.error('An error occurred in function ${methodName}()', ${paramName});`;
            break;
          case 'finally':
            logStatement = `${loggerName}.info('${methodName}() promise chain completed');`;
            break;
          default:
            logStatement = '';
        }

        if (singleLineBody) {
          const trimmedBody = (singleLineBody as string).trim();
          const adjustedBody =
            trimmedBody.split(')').length > trimmedBody.split('(').length ? trimmedBody.slice(0, -1) : trimmedBody;

          return `.${type}((${paramName}) => {
              ${logStatement}
              return ${adjustedBody};
          }`;
        }

        if (blockBody) {
          return `.${type}((${paramName}) => {${indentation}${logStatement}${indentation}${blockBody}}`;
        }

        return match;
      },
    );
  }

  public static processConsoleStatements(methodBody: string, loggerName: string): string {
    return methodBody.replace(this.CONSOLE_LOG_REGEX, (match: string, logType: string, argument: string) => {
      const logLevel = logType === 'info' || logType === 'warn' || logType === 'error' ? logType : 'debug';
      return `${loggerName}.${logLevel}(${argument});`;
    });
  }

  private static findEnclosingMethod(content: string, position: number): string {
    const beforeCatch = content.substring(0, position);
    const methods = [...beforeCatch.matchAll(this.METHOD_REGEX)].reverse();
    const closestMethod = methods[0];
    return closestMethod ? closestMethod[1] : 'unknown';
  }
}

export default class RflibLoggingLwcInstrument extends SfCommand<RflibLoggingLwcInstrumentResult> {
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
  private readonly stats: RflibLoggingLwcInstrumentResult = {
    processedFiles: 0,
    modifiedFiles: 0,
    formattedFiles: 0,
    modifiedFilePaths: [],
  };

  public async run(): Promise<RflibLoggingLwcInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingLwcInstrument);

    const instrumentationOpts: InstrumentationOptions = {
      prettier: flags.prettier,
      noIf: flags['no-if'],
      skipInstrumented: flags['skip-instrumented'],
      verbose: flags.verbose,
      exclude: flags.exclude,
    };

    this.log(`Scanning LWC components in ${flags.sourcepath}...`);

    this.spinner.start('Running...');

    const files = await this.findAllLwcFiles(flags.sourcepath, instrumentationOpts.exclude);
    await processWithConcurrency(
      files,
      flags.concurrency,
      async (filePath) => {
        await this.instrumentLwcFile(filePath, flags.dryrun, instrumentationOpts);
      }
    );

    this.spinner.stop();

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);
    this.log(`Formatted files: ${this.stats.formattedFiles}`);

    return { ...this.stats };
  }

  private async findAllLwcFiles(dirPath: string, excludePattern?: string): Promise<string[]> {
    this.logger.debug(`Scanning directory: ${dirPath}`);
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);

        if (excludePattern && minimatch(filePath, excludePattern, { matchBase: true })) {
          this.logger.debug(`Skipping excluded path: ${filePath}`);
          return [];
        }

        if (entry.isDirectory()) {
          return this.findAllLwcFiles(filePath, excludePattern);
        }

        const parentDir = path.dirname(filePath);
        if (
          entry.name.endsWith('.js') &&
          !parentDir.includes('aura') &&
          !parentDir.includes('__tests__')
        ) {
          return [filePath];
        }

        return [];
      })
    );

    return results.flat();
  }

  private async instrumentLwcFile(
    filePath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
  ): Promise<void> {
    const componentName = path.basename(path.dirname(filePath));
    this.logger.debug(`Processing LWC: ${componentName}`);

    try {
      this.stats.processedFiles++;
      let content = await fs.promises.readFile(filePath, 'utf8');
      const originalContent = content;

      if (instrumentationOpts.skipInstrumented && LwcInstrumentationService.isInstrumented(content)) {
        this.logger.info(`Skipping instrumented component: ${componentName}`);
        return;
      }

      const { variableName } = LwcInstrumentationService.detectLogger(content);
      content = LwcInstrumentationService.addImportAndLogger(content, componentName);
      content = LwcInstrumentationService.processMethodLogging(content, variableName, instrumentationOpts);
      content = LwcInstrumentationService.processTryCatchBlocks(content, variableName);
      content = LwcInstrumentationService.processPromiseChains(content, variableName);
      content = LwcInstrumentationService.processConsoleStatements(content, variableName);

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
          LwcInstrumentationService.PRETTIER_CONFIG,
        );
      }
    } catch (error) {
      this.logger.error(`Error processing LWC ${componentName}`, error);
      throw error;
    }
  }
}
