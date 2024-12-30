import * as fs from 'node:fs';
import * as path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { RflibLoggingApexInstrumentResult } from '../../../../../src/commands/rflib/logging/apex/instrument.js';

let testSession: TestSession;

describe('rflib logging apex instrument NUTs', () => {
  before('prepare session', async () => {
    testSession = await TestSession.create();
    const sampleClass = `public with sharing class SampleApexClass {
      @AuraEnabled
      public static List<String> getRecords(String filter, Integer limit) {
          return new List<String>();
      }
    }`;
    const testDir = path.join(testSession.dir, 'force-app', 'main', 'default', 'classes');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'SampleApexClass.cls'), sampleClass);
  });

  after(async () => {
    await testSession?.clean();
  });

  it('should process apex class in dry run mode', () => {
    const result = execCmd<RflibLoggingApexInstrumentResult>(
      'rflib logging apex instrument --sourcepath force-app/main/default/classes --dryrun --json',
      {
        ensureExitCode: 0,
        cwd: testSession.dir,
      },
    ).jsonOutput?.result;

    expect(result?.processedFiles).to.equal(1);
    expect(result?.modifiedFiles).to.equal(1);
    expect(result?.formattedFiles).to.equal(0);
  });
});
