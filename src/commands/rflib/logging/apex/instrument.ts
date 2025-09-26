import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import * as prettier from 'prettier';

type ApexMethodMatch = {
  auraEnabled?: string;
  access: string;
  isStatic?: string;
  returnType: string;
  methodName: string;
  args: string;
}

type IfCondition = {
  condition: string;
  position: number;
}

type InstrumentationOptions = {
  readonly prettier: boolean;
  readonly noIf: boolean;
  readonly skipInstrumented: boolean;
}

type LoggerInfo = {
  readonly exists: boolean;
  readonly variableName: string;
}

type ProcessedParameters = {
  readonly paramList: readonly string[];
  readonly logArgs: string;
}

export type RflibLoggingApexInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
}

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.apex.instrument');

class ApexInstrumentationService {
  public static readonly TEST_SETUP_REGEX =
    /@TestSetup\s+((public|private|protected|global)s+)?(?:static\s+)?void\s+(\w+)\s*\([^)]*\)\s*{/g;

  private static readonly METHOD_REGEX =
    /(@AuraEnabled\s*[\s\S]*?)?\b(public|private|protected|global)\s+(static\s+)?(?:(\w+(?:\s*<(?:[^<>]|<[^<>]*>)*>)?)|void)\s+(\w+)\s*\(([\s\S]*?)\)\s*{/g;
  private static readonly CLASS_REGEX = /\bclass\s+\w+\s*{/;
  private static readonly CLASS_LOGGER_REGEX = /\bprivate\s+(?:static\s+)?(?:final\s+)?rflib_Logger\s+(\w+)\b/;
  private static readonly GENERIC_ARGS_REGEX = /<[^>]+>/g;
  private static readonly CATCH_REGEX = /catch\s*\(\s*\w+\s+(\w+)\s*\)\s*{/g;
  private static readonly IF_STATEMENT_REGEX =
    /if\s*\((.*?)\)\s*(?:{([^]*?(?:(?<!{){(?:[^]*?)}(?!})[^]*?)*)}|([^{].*?)(?=\s*(?:;|$));)/g;
  private static readonly ELSE_REGEX = /\s*else(?!\s*if\b)\s*(?:{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*)}|([^{;]*(?:;|$)))/g;
  private static readonly IS_INSTRUMENTED_REGEX = /(\brflib_Logger\b|\brflib_TestUtil\b)/;
  private static readonly SYSTEM_DEBUG_IDENTIFIER = 'System.debug';

  private static readonly LOGGING_LEVEL_METHOD_MAP: Record<string, string> = {
    ERROR: 'error',
    FATAL: 'error',
    WARN: 'warn',
    WARNING: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    FINE: 'debug',
    FINER: 'debug',
    FINEST: 'debug',
    TRACE: 'debug',
    ALL: 'debug',
    NONE: 'debug',
  };

  private static readonly PRIMITIVE_TYPES = new Set([
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

  private static readonly PRETTIER_CONFIG: prettier.Options = {
    parser: 'apex',
    plugins: ['prettier-plugin-apex'],
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
  };

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

  public static isInstrumented(content: string): boolean {
    return this.IS_INSTRUMENTED_REGEX.test(content);
  }

  public static detectLogger(content: string): LoggerInfo {
    const match = content.match(this.CLASS_LOGGER_REGEX);
    return {
      exists: this.CLASS_LOGGER_REGEX.test(content),
      variableName: match ? match[1] : 'LOGGER',
    };
  }

  public static addLoggerDeclaration(content: string, className: string): string {
    const { exists, variableName } = this.detectLogger(content);
    if (!exists) {
      const loggerDecl = `private static final rflib_Logger ${variableName} = rflib_LoggerUtil.getFactory().createLogger('${className}');`;
      return content.replace(this.CLASS_REGEX, `$&\n    ${loggerDecl}`);
    }
    return content;
  }

  public static processMethodDeclarations(content: string, loggerName: string): string {
    return content.replace(this.METHOD_REGEX, (match: string, ...args: unknown[]) => {
      const methodInfo: ApexMethodMatch = {
        auraEnabled: args[0] as string,
        access: args[1] as string,
        isStatic: args[2] as string,
        returnType: args[3] as string,
        methodName: args[4] as string,
        args: args[5] as string,
      };

      const { paramList, logArgs } = this.processParameters(methodInfo.args);

      return `${match}\n        ${loggerName}.info('${methodInfo.methodName}(${paramList
        .map((_, i) => `{${i}}`)
        .join(', ')})'${logArgs});\n`;
    });
  }

  public static processCatchBlocks(content: string, loggerName: string): string {
    return content.replace(this.CATCH_REGEX, (match: string, exceptionVar: string, offset: number) => {
      const contentBeforeCatch = content.substring(0, offset);
      const methodMatches = [...contentBeforeCatch.matchAll(this.METHOD_REGEX)];
      const lastMethodMatch = methodMatches[methodMatches.length - 1];
      const methodName = lastMethodMatch ? lastMethodMatch[5] : 'unknown';

      return `${match}\n            ${loggerName}.error('An error occurred in ${methodName}()', ${exceptionVar.trim()});`;
    });
  }

  public static processIfStatements(content: string, loggerName: string): string {
    const conditions: IfCondition[] = [];

    let modified = content.replace(
      this.IF_STATEMENT_REGEX,
      (match: string, condition: string, blockBody: string, singleLineBody: string, offset: number) => {
        const cleanedUpCondition = condition.trim().replaceAll("'", "\\'");
        conditions.push({
          condition: cleanedUpCondition,
          position: offset,
        });

        const logStatement = `${loggerName}.debug('if (${cleanedUpCondition})');\n        `;

        if (blockBody) {
          return `if (${condition}) {\n        ${logStatement}${blockBody}}\n`;
        } else if (singleLineBody) {
          const cleanBody = singleLineBody.replace(/;$/, '').trim();
          return `if (${condition}) {\n        ${logStatement}${cleanBody};\n    }\n`;
        }
        return match;
      },
    );

    modified = modified.replace(
      this.ELSE_REGEX,
      (match: string, blockBody?: string, singleLineBody?: string, offset?: number) => {
        const nearestIf = conditions
          .filter((c) => c.position < (offset ?? 0))
          .reduce((prev, curr) => (!prev || curr.position > prev.position ? curr : prev));

        const logStatement = nearestIf
          ? `${loggerName}.debug('else for if (${nearestIf.condition})');\n        `
          : `${loggerName}.debug('else statement');\n        `;

        if (blockBody) {
          return ` else {\n        ${logStatement}${blockBody}}`;
        } else if (singleLineBody) {
          return ` else {\n        ${logStatement}${singleLineBody}\n    }`;
        }
        return match;
      },
    );

    return modified;
  }

  public static processSystemDebugStatements(content: string, loggerName: string): string {
    let result = '';
    let searchIndex = 0;

    while (searchIndex < content.length) {
      const debugIndex = content.indexOf(this.SYSTEM_DEBUG_IDENTIFIER, searchIndex);

      if (debugIndex === -1) {
        result += content.slice(searchIndex);
        break;
      }

      result += content.slice(searchIndex, debugIndex);

      const openParenIndex = content.indexOf('(', debugIndex + this.SYSTEM_DEBUG_IDENTIFIER.length);
      if (openParenIndex === -1) {
        result += content.slice(debugIndex);
        break;
      }

      const parsedCall = this.extractSystemDebugCall(content, openParenIndex + 1);
      if (!parsedCall) {
        // Unable to safely parse the call, keep the original content.
        result += content.slice(debugIndex, openParenIndex + 1);
        searchIndex = openParenIndex + 1;
        continue;
      }

      const { args, endIndex } = parsedCall;
      const argList = this.splitArguments(args);

      if (argList.length === 0) {
        // No arguments found, keep the original content.
        result += content.slice(debugIndex, endIndex);
        searchIndex = endIndex;
        continue;
      }

      let loggerMethod = 'debug';
      let messageExpression = argList[0];

      if (argList.length > 1 && /^LoggingLevel\./i.test(argList[0])) {
        const level = argList[0].split('.')[1]?.trim().toUpperCase();
        loggerMethod = this.mapLoggingLevelToLoggerMethod(level);
        messageExpression = argList.slice(1).join(', ');
      } else if (argList.length > 1) {
        // Unexpected number of arguments; retain the original statement.
        result += content.slice(debugIndex, endIndex);
        searchIndex = endIndex;
        continue;
      }

      result += `${loggerName}.${loggerMethod}(${messageExpression.trim()});`;
      searchIndex = endIndex;
    }

    return result;
  }

  private static extractSystemDebugCall(
    content: string,
    argsStartIndex: number,
  ): { args: string; endIndex: number } | undefined {
    let index = argsStartIndex;
    let depth = 1;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    while (index < content.length && depth > 0) {
      const char = content[index];

      if (inSingleQuote) {
        if (char === '\\' && index + 1 < content.length) {
          index += 2;
          continue;
        }
        if (char === "'") {
          inSingleQuote = false;
        }
      } else if (inDoubleQuote) {
        if (char === '\\' && index + 1 < content.length) {
          index += 2;
          continue;
        }
        if (char === '"') {
          inDoubleQuote = false;
        }
      } else {
        if (char === "'") {
          inSingleQuote = true;
        } else if (char === '"') {
          inDoubleQuote = true;
        } else if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }

      index++;
    }

    if (depth !== 0) {
      return undefined;
    }

    const args = content.slice(argsStartIndex, index).trim();
    let endIndex = index + 1; // Skip the closing parenthesis

    while (endIndex < content.length && /\s/.test(content[endIndex])) {
      endIndex++;
    }

    if (content[endIndex] !== ';') {
      return undefined;
    }

    endIndex += 1; // Move past the semicolon

    return { args, endIndex };
  }

  private static splitArguments(args: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < args.length; i++) {
      const char = args[i];

      if (inSingleQuote) {
        current += char;
        if (char === '\\' && i + 1 < args.length) {
          current += args[i + 1];
          i++;
          continue;
        }
        if (char === "'") {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        current += char;
        if (char === '\\' && i + 1 < args.length) {
          current += args[i + 1];
          i++;
          continue;
        }
        if (char === '"') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (char === "'") {
        inSingleQuote = true;
        current += char;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = true;
        current += char;
        continue;
      }

      if (char === '(' || char === '[' || char === '{' || char === '<') {
        depth++;
        current += char;
        continue;
      }

      if (char === ')' || char === ']' || char === '}' || char === '>') {
        if (depth > 0) {
          depth--;
        }
        current += char;
        continue;
      }

      if (char === ',' && depth === 0) {
        if (current.trim() !== '') {
          result.push(current.trim());
        }
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim() !== '') {
      result.push(current.trim());
    }

    return result;
  }

  private static mapLoggingLevelToLoggerMethod(level?: string): string {
    if (!level) {
      return 'debug';
    }

    return this.LOGGING_LEVEL_METHOD_MAP[level] ?? 'debug';
  }

  private static isComplexType(paramType: string): boolean {
    return (
      paramType.includes('<') ||
      paramType.includes('[') ||
      paramType === 'Object' ||
      !this.PRIMITIVE_TYPES.has(paramType.toUpperCase())
    );
  }

  private static processParameters(args: string): ProcessedParameters {
    const parameters = args
      ? args
          .replaceAll(this.GENERIC_ARGS_REGEX, '')
          .split(',')
          .map((param) => param.trim())
      : [];

    const logArgs =
      parameters.length > 0 && parameters[0] !== ''
        ? `, new Object[] { ${parameters
            .map((p) => {
              const [paramType, ...rest] = p.split(' ');
              const paramName = rest.length > 0 ? rest.join(' ') : paramType;
              return this.isComplexType(paramType) ? `JSON.serialize(${paramName})` : paramName;
            })
            .join(', ')} }`
        : '';

    return { paramList: parameters, logArgs };
  }
}

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
  private readonly stats: RflibLoggingApexInstrumentResult = {
    processedFiles: 0,
    modifiedFiles: 0,
    formattedFiles: 0,
  };

  public async run(): Promise<RflibLoggingApexInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const startTime = Date.now();

    const { flags } = await this.parse(RflibLoggingApexInstrument);
    const sourcePath = flags.sourcepath;
    const isDryRun = flags.dryrun;

    const instrumentationOpts: InstrumentationOptions = {
      prettier: flags.prettier,
      noIf: flags['no-if'],
      skipInstrumented: flags['skip-instrumented'],
    };

    this.log(`Scanning Apex classes in ${sourcePath} and sub directories`);
    this.logger.debug(`Dry run mode: ${isDryRun}`);

    this.spinner.start('Running...');
    await this.processDirectory(sourcePath, isDryRun, instrumentationOpts);
    this.spinner.stop();

    const duration = Date.now() - startTime;
    this.logger.debug(`Completed instrumentation in ${duration}ms`);

    this.log('\nInstrumentation complete.');
    this.log(`Processed files: ${this.stats.processedFiles}`);
    this.log(`Modified files: ${this.stats.modifiedFiles}`);
    this.log(`Formatted files: ${this.stats.formattedFiles}`);

    return { ...this.stats };
  }

  private async processDirectory(
    dirPath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
  ): Promise<void> {
    this.logger.debug(`Processing directory: ${dirPath}`);
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.processDirectory(filePath, isDryRun, instrumentationOpts);
          return;
        }

        if (entry.name.includes('Test') && entry.name.endsWith('.cls')) {
          await this.processTestFile(filePath, isDryRun, instrumentationOpts);
          return;
        }

        if (entry.name.endsWith('.cls')) {
          await this.instrumentApexClass(filePath, isDryRun, instrumentationOpts);
        }
      }),
    );
  }

  private async processTestFile(
    filePath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
  ): Promise<void> {
    this.logger.debug(`Processing test file: ${filePath}`);
    let content = await fs.promises.readFile(filePath, 'utf8');
    const originalContent = content;

    if (instrumentationOpts.skipInstrumented && ApexInstrumentationService.isInstrumented(content)) {
      this.logger.info(`Skipping instrumented test class: ${filePath}`);
      return;
    }

    content = content.replace(
      ApexInstrumentationService.TEST_SETUP_REGEX,
      (match) => `${match}\n        rflib_TestUtil.prepareLoggerForUnitTests();`,
    );

    if (content !== originalContent) {
      this.stats.modifiedFiles++;
      if (!isDryRun) {
        try {
          const finalContent = instrumentationOpts.prettier
            ? await ApexInstrumentationService.formatContent(content)
            : content;

          await fs.promises.writeFile(filePath, finalContent);

          if (instrumentationOpts.prettier) {
            this.stats.formattedFiles++;
            this.logger.info(`Modified and formatted test file: ${filePath}`);
          } else {
            this.logger.info(`Modified test file: ${filePath}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to format ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          await fs.promises.writeFile(filePath, content);
          this.logger.info(`Modified test file without formatting: ${filePath}`);
        }
      } else {
        this.logger.info(`Would modify test file: ${filePath}`);
      }
    }
  }

  private async instrumentApexClass(
    filePath: string,
    isDryRun: boolean,
    instrumentationOpts: InstrumentationOptions,
  ): Promise<void> {
    const className = path.basename(filePath, '.cls');
    this.logger.debug(`Processing class: ${className}`);

    try {
      this.stats.processedFiles++;
      let content = await fs.promises.readFile(filePath, 'utf8');
      const originalContent = content;

      if (instrumentationOpts.skipInstrumented && ApexInstrumentationService.isInstrumented(content)) {
        this.logger.info(`Skipping instrumented class: ${className}`);
        return;
      }

      const { variableName } = ApexInstrumentationService.detectLogger(content);
      content = ApexInstrumentationService.addLoggerDeclaration(content, className);
      content = ApexInstrumentationService.processMethodDeclarations(content, variableName);
      content = ApexInstrumentationService.processSystemDebugStatements(content, variableName);
      content = ApexInstrumentationService.processCatchBlocks(content, variableName);

      if (!instrumentationOpts.noIf) {
        content = ApexInstrumentationService.processIfStatements(content, variableName);
      }

      if (content !== originalContent) {
        this.stats.modifiedFiles++;
        if (!isDryRun) {
          try {
            const finalContent = instrumentationOpts.prettier
              ? await ApexInstrumentationService.formatContent(content)
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
    } catch (error) {
      this.logger.error(`Error processing class ${className}`, error);
      throw error;
    }
  }
}
