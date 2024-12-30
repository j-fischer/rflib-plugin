import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import RflibLoggingApexInstrument from '../../../../../src/commands/rflib/logging/apex/instrument.js';

/* eslint-disable no-underscore-dangle */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* eslint-enable no-underscore-dangle */

describe('rflib logging apex instrument', () => {
  let testSession: TestSession;
  let testDir: string;
  let sampleClassPath: string;
  let originalContent: string;
  let modifiedContent: string;

  before(async () => {
    testSession = await TestSession.create();
    testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'classes');
    fs.mkdirSync(testDir, { recursive: true });

    // Copy sample class to test directory
    sampleClassPath = path.join(testDir, 'SampleApexClass.cls');
    originalContent = fs.readFileSync(path.join(__dirname, 'sample', 'SampleApexClass.cls'), 'utf8');
    fs.writeFileSync(sampleClassPath, originalContent);

    // Run command once for all tests
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should add class level logger declaration', () => {
    expect(modifiedContent).to.include(
      "private static final rflib_Logger LOGGER = rflib_LoggerUtil.getFactory().createLogger('SampleApexClass');",
    );
  });

  it('should add entry logging to methods with parameters', () => {
    expect(modifiedContent).to.include("LOGGER.info('getRecords({0}, {1})', new Object[] { filter, limit });");
    expect(modifiedContent).to.include(
      "LOGGER.info('processRecord({0}, {1})', new Object[] { JSON.serialize(record), JSON.serialize(userMap) });",
    );
  });

  it('should add error logging to catch blocks', () => {
    expect(modifiedContent).to.include("LOGGER.error('An error occurred in processRecord()', ex);");
  });
});
