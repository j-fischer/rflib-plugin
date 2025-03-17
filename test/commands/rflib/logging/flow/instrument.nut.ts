import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';

describe('rflib logging flow instrument NUTs', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  it('should execute in dry run mode', () => {
    const command = `rflib logging flow instrument --sourcepath force-app --dryrun`;
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.contain('Scanning Flow files');
    expect(output).to.contain('Instrumentation complete');
  });
});