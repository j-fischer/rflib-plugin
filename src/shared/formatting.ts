/* eslint-disable no-param-reassign */
import * as fs from 'node:fs';
import * as prettier from 'prettier';
import { Logger } from '@salesforce/core';
import { InstrumentationOptions } from './types.js';

export async function formatContent(content: string, config: prettier.Options): Promise<string> {
  try {
    return await prettier.format(content, config);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Formatting failed: ${error.message}`);
    }
    throw new Error('Formatting failed with unknown error');
  }
}

export async function writeInstrumentedFile(
  filePath: string,
  content: string,
  originalContent: string,
  options: InstrumentationOptions,
  isDryRun: boolean,
  stats: { modifiedFiles: number; modifiedFilePaths?: string[]; formattedFiles: number },
  logger: Logger,
  logAction: (message: string) => void,
  prettierConfig: prettier.Options,
): Promise<void> {
  if (content !== originalContent) {
    stats.modifiedFiles++;
    stats.modifiedFilePaths?.push(filePath);

    if (!isDryRun) {
      try {
        const finalContent = options.prettier ? await formatContent(content, prettierConfig) : content;

        await fs.promises.writeFile(filePath, finalContent);

        if (options.prettier) {
          stats.formattedFiles++;
          logger.info(`Modified and formatted: ${filePath}`);
        } else {
          logger.info(`Modified: ${filePath}`);
        }
      } catch (error) {
        logger.warn(
          `Failed to format ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await fs.promises.writeFile(filePath, content);
        logger.info(`Modified without formatting: ${filePath}`);
      }
    } else {
      logger.info(`Would modify: ${filePath}`);
      if (options.verbose) {
        logAction(`Would modify: ${filePath}`);
      }
    }
  }
}
