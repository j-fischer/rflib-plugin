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
const messages = Messages.loadMessages('rflib-plugin', 'rflib.logging.lwc.instrument');

const importRegex = /import\s*{\s*createLogger\s*}\s*from\s*['"]c\/rflibLogger['"]/;
const loggerRegex = /const\s+(\w+)\s*=\s*createLogger\s*\(['"]([\w-]+)['"]\)/;
const methodRegex = /(?:async\s+)?(?!(?:if|switch|case|while|for|catch)\b)(\b\w+)\s*\((.*?)\)\s*{/g;
const exportDefaultRegex = /export\s+default\s+class\s+(\w+)/;
const ifStatementRegex = /if\s*\((.*?)\)\s*{([\s\S]*?)}|if\s*\((.*?)\)\s*([^{\n].*?)(?=\n|$)/g;
const elseRegex = /}\s*else\s*{([\s\S]*?)}|}\s*else\s+([^{\n].*?)(?=\n|$)/g;
const promiseChainRegex =
  /\.(then|catch|finally)\s*\(\s*(?:async\s+)?(?:\(?([^)]*)\)?)?\s*=>\s*(?:\{((?:[^{}]|`[^`]*`)*?)\}|([^{;]*(?:\([^)]*\))*)(?=(?:\)\))|\)|\.))/g;
const tryCatchBlockRegex = /try\s*{[\s\S]*?}\s*catch\s*\(([^)]*)\)\s*{/g;

type IfCondition = {
  condition: string;
  position: number;
};

export type RflibLoggingLwcInstrumentResult = {
  processedFiles: number;
  modifiedFiles: number;
  formattedFiles: number;
};

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

  private static detectExistingImport(content: string): boolean {
    return importRegex.test(content);
  }

  private static detectExistingLogger(content: string): { exists: boolean; loggerName: string } {
    const match = content.match(loggerRegex);
    return {
      exists: match !== null,
      loggerName: match ? match[1] : 'logger',
    };
  }

  private static addImportAndLogger(content: string, componentName: string): string {
    let modified = content;

    if (!this.detectExistingImport(content)) {
      modified = `import { createLogger } from 'c/rflibLogger';\n${modified}`;
    }

    const { exists, loggerName } = this.detectExistingLogger(content);
    if (!exists) {
      const exportMatch = content.match(exportDefaultRegex);
      const className = exportMatch ? exportMatch[1] : componentName;
      const loggerDeclaration = `\nconst ${loggerName} = createLogger('${className}');\n`;
      modified = modified.replace(exportDefaultRegex, `${loggerDeclaration}$&`);
    }

    return modified;
  }

  private static findEnclosingMethod(content: string, position: number): string {
    const beforeCatch = content.substring(0, position);
    const methods = [...beforeCatch.matchAll(methodRegex)].reverse();
    const closestMethod = methods[0];
    return closestMethod ? closestMethod[1] : 'unknown';
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

  private static processMethodLogging(content: string, loggerName: string): string {
    // First handle methods
    let modified = content.replace(methodRegex, (match: string, methodName: string, args: string) => {
      const parameters = args
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p);
      const placeholders = parameters.map((_, i) => `{${i}}`).join(', ');
      const logArgs = parameters.length > 0 ? `, ${parameters.join(', ')}` : '';

      return `${match}\n        ${loggerName}.info('${methodName}(${placeholders})'${logArgs});`;
    });

    // Then handle if statements
    modified = this.processIfStatements(modified, loggerName);

    return modified;
  }

  private static processPromiseChains(content: string, loggerName: string): string {
    return content.replace(promiseChainRegex, (match, type, param, blockBody, singleLineBody, offset: number) => {
      const methodName = this.findEnclosingMethod(content, offset);
      const paramName = typeof param === 'string' ? param.trim() : type === 'then' ? 'result' : 'error';
      const indentation = match.match(/\n\s*/)?.[0] || '\n        ';

      let logStatement;
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
        let trimmedSingleLineBody = (singleLineBody as string).trim();
        if (trimmedSingleLineBody.split(')').length > trimmedSingleLineBody.split('(').length) {
          trimmedSingleLineBody = trimmedSingleLineBody.slice(0, -1);
        }

        return `.${type}((${paramName}) => {
            ${logStatement}
            return ${trimmedSingleLineBody};
        }`;
      }

      if (blockBody) {
        return `.${type}((${paramName}) => {${indentation}${logStatement}${indentation}${blockBody}}`;
      }

      return match;
    });
  }

  private static processTryCatchBlocks(content: string, loggerName: string): string {
    return content.replace(tryCatchBlockRegex, (match: string, exceptionVar: string, offset: number) => {
      const methodName = this.findEnclosingMethod(content, offset);
      const errorVar = exceptionVar.trim().split(' ')[0] || 'error';

      return match.replace(
        /catch\s*\(([^)]*)\)\s*{/,
        `catch(${exceptionVar}) {
            ${loggerName}.error('An error occurred in function ${methodName}()', ${errorVar});`,
      );
    });
  }

  public async run(): Promise<RflibLoggingLwcInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingLwcInstrument);

    this.log(`Scanning LWC components in ${flags.sourcepath}...`);

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
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun, usePrettier);
      } else if (file.endsWith('.js') && !path.dirname(filePath).includes('aura') && !path.dirname(filePath).includes('__tests__')) {
        await this.instrumentLwcFile(filePath, isDryRun, usePrettier);
      }
    }
  }

  private async instrumentLwcFile(filePath: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    const componentName = path.basename(path.dirname(filePath));
    this.logger.debug(`Processing LWC: ${componentName}`);

    try {
      this.processedFiles++;
      let content = await fs.promises.readFile(filePath, 'utf8');
      const originalContent = content;

      const { loggerName } = RflibLoggingLwcInstrument.detectExistingLogger(content);
      content = RflibLoggingLwcInstrument.addImportAndLogger(content, componentName);
      content = RflibLoggingLwcInstrument.processMethodLogging(content, loggerName);
      content = RflibLoggingLwcInstrument.processTryCatchBlocks(content, loggerName);
      content = RflibLoggingLwcInstrument.processPromiseChains(content, loggerName);

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
    } catch (error) {
      this.logger.error(`Error processing LWC ${componentName}`, error);
      throw error;
    }
  }
}
