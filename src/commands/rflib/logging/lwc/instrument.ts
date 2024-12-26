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
const methodRegex = /(?:async\s+)?(\w+)\s*\((.*?)\)\s*{/g;
const catchBlockRegex = /catch\s*\(([^)]*)\)\s*{/g;
const promiseCatchRegex = /\.catch\s*\(\s*(?:async\s+)?\(?([^)]*)\)?\s*=>\s*{/g;
const exportDefaultRegex = /export\s+default\s+class\s+(\w+)/;

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
    })
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
    singleQuote: true
  };

  private static detectExistingImport(content: string): boolean {
    return importRegex.test(content);
  }

  private static detectExistingLogger(content: string): { exists: boolean; loggerName: string } {
    const match = content.match(loggerRegex);
    return {
      exists: match !== null,
      loggerName: match ? match[1] : 'logger'
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

  private static processMethodLogging(content: string, loggerName: string): string {
    return content.replace(methodRegex, (match: string, methodName: string, args: string) => {
      const parameters = args.split(',').map(p => p.trim()).filter(p => p);
      const logArgs = parameters.length > 0
        ? `, { ${parameters.map(p => `${p}: ${p}`).join(', ')} }`
        : '';

      return `${match}\n        ${loggerName}.info('${methodName}()'${logArgs});`;
    });
  }

  private static processCatchBlocks(content: string, loggerName: string): string {
    let modified = content.replace(catchBlockRegex, (match: string, exceptionVar: string) => {
      const methodMatch = content.substring(0, content.indexOf(match)).match(methodRegex);
      const methodName = methodMatch ? methodMatch[1] : 'unknown';
      const errorVar = exceptionVar.trim().split(' ')[0] || 'e';

      return `${match}\n        ${loggerName}.error('An error occurred in function ${methodName}()', ${errorVar});`;
    });

    modified = modified.replace(promiseCatchRegex, (match: string, param: string) => {
      const methodMatch = content.substring(0, content.indexOf(match)).match(methodRegex);
      const methodName = methodMatch ? methodMatch[1] : 'unknown';
      const errorVar = param.trim().split(' ')[0] || 'e';

      return `${match}\n        ${loggerName}.error('An error occurred in function ${methodName}()', ${errorVar});`;
    });

    return modified;
  }

  public async run(): Promise<RflibLoggingLwcInstrumentResult> {
    this.logger = await Logger.child(this.ctor.name);
    const { flags } = await this.parse(RflibLoggingLwcInstrument);

    this.log(`Scanning LWC components in ${flags.sourcepath}...`);

    await this.processDirectory(flags.sourcepath, flags.dryrun, flags.prettier);

    return {
      processedFiles: this.processedFiles,
      modifiedFiles: this.modifiedFiles,
      formattedFiles: this.formattedFiles
    };
  }

  private async processDirectory(dirPath: string, isDryRun: boolean, usePrettier: boolean): Promise<void> {
    const files = await fs.promises.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        await this.processDirectory(filePath, isDryRun, usePrettier);
      } else if (file.endsWith('.js') && !path.dirname(filePath).includes('aura')) {
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
      content = RflibLoggingLwcInstrument.processCatchBlocks(content, loggerName);

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