import * as readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';

const TMP_DIR = path.resolve('tmp');
const DEMO_DIR = path.join(TMP_DIR, 'rflib-demo');

function runCmd(cmd: string, args: string[], cwd?: string, abortOnError = true): void {
  console.log(`Executing: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: cwd || process.cwd(),
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    console.error(`Error executing ${cmd}: ${result.error.message}`);
    if (abortOnError) process.exit(1);
  } else if (result.status !== null && result.status !== 0) {
    console.error(`Command failed with status ${result.status}`);
    if (abortOnError) process.exit(1);
  }
}

async function fetchLatestPackages(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    https.get('https://raw.githubusercontent.com/j-fischer/rflib/master/README.md', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const packages: string[] = [];
        // Look for patterns like: sf package install --package 04tKY000000ygWuYAI
        const regex = /sf package install --package (04t[a-zA-Z0-9]+)/g;
        let match = regex.exec(data);
        while (match !== null) {
          if (!packages.includes(match[1])) {
            packages.push(match[1]);
          }
          match = regex.exec(data);
        }
        resolve(packages);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await rl.question(query);
  rl.close();
  return answer;
}

async function main() {
  const isAutoCleanup = process.argv.includes('--auto-cleanup');

  const devHubAlias = await askQuestion('Enter DevHub alias (leave empty for default): ');
  const scratchOrgAlias = 'rflib-e2e-org';
  console.log(`Using scratch org alias: ${scratchOrgAlias}`);

  if (fs.existsSync(DEMO_DIR)) {
    console.log('Demo directory already exists. Skipping org creation and package installation...');
    console.log('Resetting changes in project folder...');
    runCmd('git', ['checkout', '.'], DEMO_DIR);
    runCmd('git', ['clean', '-fd'], DEMO_DIR);
  } else {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR);
    }
    console.log('Cloning rflib-demo...');
    runCmd('git', ['clone', 'https://github.com/j-fischer/rflib-demo.git', DEMO_DIR]);

    console.log('Creating scratch org...');
    const orgCreateArgs = ['org', 'create', 'scratch', '-a', scratchOrgAlias, '-d', '-f', 'config/project-scratch-def.json', '-y', '1'];
    if (devHubAlias.trim()) {
      orgCreateArgs.push('--target-dev-hub', devHubAlias.trim());
    }
    runCmd('sf', orgCreateArgs, DEMO_DIR);

    console.log('Fetching latest RFLIB packages...');
    const packages = await fetchLatestPackages();
    if (packages.length === 0) {
      console.error('No packages found in RFLIB README.');
      process.exit(1);
    }

    console.log('Installing packages...');
    for (const pkg of packages) {
      // -r flag is to avoid prompting "Are you sure you want to install?" and just accept
      runCmd('sf', ['package', 'install', '-p', pkg, '-o', scratchOrgAlias, '-w', '10', '-r']);
    }
  }

  console.log('Deploying uninstrumented demo source...');
  runCmd('sf', ['project', 'deploy', 'start', '-o', scratchOrgAlias, '--ignore-conflicts'], DEMO_DIR);

  console.log('Running plugin instrumentation...');
  const sourcePath = path.join(DEMO_DIR, 'force-app');

  // Instrumentation commands based on user request (with --prettier flag)
  const devExecutable = path.resolve('bin', 'dev.js');
  const nodeArgs = ['--loader', 'ts-node/esm', '--no-warnings=ExperimentalWarning', devExecutable];

  runCmd('node', [...nodeArgs, 'rflib', 'logging', 'apex', 'instrument', '--sourcepath', sourcePath, '--prettier']);
  runCmd('node', [...nodeArgs, 'rflib', 'logging', 'aura', 'instrument', '--sourcepath', sourcePath, '--prettier']);
  runCmd('node', [...nodeArgs, 'rflib', 'logging', 'lwc', 'instrument', '--sourcepath', sourcePath, '--prettier']);
  runCmd('node', [...nodeArgs, 'rflib', 'logging', 'flow', 'instrument', '--sourcepath', sourcePath]);

  console.log('Deploying instrumented demo source...');
  // Notice --ignore-conflicts might be needed again or not depending on scratch org tracking,
  // but deploying changed files is usually just 'deploy start'. We'll use --ignore-conflicts just in case.
  runCmd('sf', ['project', 'deploy', 'start', '-o', scratchOrgAlias, '--ignore-conflicts'], DEMO_DIR);

  console.log('E2E Test Completed Successfully!');

  let cleanup = 'y';
  if (!isAutoCleanup) {
    cleanup = await askQuestion('Do you want to delete the scratch org and clean up the demo folder? (Y/n): ');
  } else {
    console.log('Auto-cleanup enabled, proceeding with termination...');
  }

  if (cleanup.toLowerCase() !== 'n') {
    console.log('Deleting scratch org...');
    runCmd('sf', ['org', 'delete', 'scratch', '-o', scratchOrgAlias, '-p'], DEMO_DIR, false);

    console.log('Cleaning up existing demo directory...');
    try {
      fs.rmSync(DEMO_DIR, { recursive: true, force: true });
    } catch (e: any) {
      console.log(`Fallback cleanup due to: ${e.message}`);
      if (process.platform === 'win32') {
        runCmd('cmd.exe', ['/c', 'rmdir', '/s', '/q', DEMO_DIR], undefined, false);
      } else {
        runCmd('rm', ['-rf', DEMO_DIR], undefined, false);
      }
    }
  }
}

main().catch(err => {
  console.error('An unexpected error occurred:', err);
  process.exit(1);
});
