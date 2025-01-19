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
  let instrumentedClassPath: string;
  let originalContent: string;
  let originalInstrumentedContent: string;

  before(async () => {
    testSession = await TestSession.create();
    testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'classes');
    fs.mkdirSync(testDir, { recursive: true });

    // Store paths and original content but don't execute command
    sampleClassPath = path.join(testDir, 'SampleApexClass.cls');
    originalContent = fs.readFileSync(path.join(__dirname, 'sample', 'SampleApexClass.cls'), 'utf8');

    instrumentedClassPath = path.join(testDir, 'InstrumentedClass.cls');
    originalInstrumentedContent = fs.readFileSync(path.join(__dirname, 'sample', 'InstrumentedClass.cls'), 'utf8');
  });

  // Reset the files before each test
  beforeEach(() => {
    fs.writeFileSync(sampleClassPath, originalContent);
    fs.writeFileSync(instrumentedClassPath, originalInstrumentedContent);
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should add class level logger declaration', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include(
      "private static final rflib_Logger LOGGER = rflib_LoggerUtil.getFactory().createLogger('SampleApexClass');"
    );
  });

  it('should add entry logging to methods with parameters', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include("LOGGER.info('getRecords({0}, {1})', new Object[] { filter, limit });");
    expect(modifiedContent).to.include(
      "LOGGER.info('processRecord({0}, {1})', new Object[] { JSON.serialize(record), JSON.serialize(userMap) });",
    );
  });

  it('should add error logging to catch blocks', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include("LOGGER.error('An error occurred in processRecord()', ex);");
  });

  it('should add log statements to simple if blocks', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include('LOGGER.debug(\'if (filter == null)');
  });

  it('should convert single line if statements to blocks', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.match(/if \(filter == null\) {\s+LOGGER\.debug.*\s+return new List<String>\(\);\s+}/);
  });

  it('should add log statements to if blocks with nested content', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include('LOGGER.debug(\'if (limit > 100)');
    expect(modifiedContent).to.match(/if \(limit > 100\) {\s+LOGGER\.debug.*\s+for \(Integer i = 0; i < 10; i\+\+\)/);
  });

  it('should add log statements to else blocks', async () => {
    await RflibLoggingApexInstrument.run(['--sourcepath', testDir]);
    const modifiedContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(modifiedContent).to.include('LOGGER.debug(\'else for if (limit > 50)\')');
    expect(modifiedContent).to.match(/else {\s+LOGGER\.debug.*\s+System.debug\('Small batch'\);\s+}/);
  });

  it('should skip if statement instrumentation when no-if flag is used', async () => {
    // Reset the test file
    fs.writeFileSync(sampleClassPath, originalContent);

    await RflibLoggingApexInstrument.run([
      '--sourcepath',
      testDir,
      '--no-if'
    ]);

    const contentWithNoIf = fs.readFileSync(sampleClassPath, 'utf8');

    // Should still have method and catch logging
    expect(contentWithNoIf).to.include("LOGGER.info('getRecords({0}, {1})'");
    expect(contentWithNoIf).to.include("LOGGER.error('An error occurred");

    // Should not have if statement logging
    expect(contentWithNoIf).not.to.include("LOGGER.debug('if (filter == null)");
    expect(contentWithNoIf).not.to.include("LOGGER.debug('if (limit > 100)");
    expect(contentWithNoIf).not.to.include("LOGGER.debug('else for if");
  });

  it('should skip instrumented classes when skip-instrumented flag is used', async () => {
    await RflibLoggingApexInstrument.run([
      '--sourcepath',
      testDir,
      '--skip-instrumented'
    ]);

    const instrumentedContent = fs.readFileSync(instrumentedClassPath, 'utf8');
    const regularContent = fs.readFileSync(sampleClassPath, 'utf8');

    expect(instrumentedContent).to.equal(originalInstrumentedContent);

    expect(regularContent).not.to.equal(originalContent);
    expect(regularContent).to.include('rflib_Logger');
    expect(regularContent).to.include("LOGGER.info('getRecords({0}, {1})', new Object[] { filter, limit });");
  });
});
