import {execFileSync, spawnSync} from 'node:child_process';
import {closeSync, mkdirSync, mkdtempSync, openSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const targets = {
  web: 'evb-player-web',
  landing: 'evb-player',
};
const target = targets[process.argv[2]];
if (!target) throw new Error('Choose web or landing');
const root = fileURLToPath(new URL('..', import.meta.url));
if (execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim()) {
  throw new Error('Commit changes before deploying');
}
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const temporary = join(root, '.devkit');
mkdirSync(temporary, {recursive: true});
const work = mkdtempSync(join(temporary, 'vercel-deploy-'));
try {
  // Upload committed files only. The CLI does not honor .gitignore, and this
  // checkout also contains private test profiles, SDKs, and build artifacts.
  const archive = join(work, 'source.tar');
  const descriptor = openSync(archive, 'w');
  try {
    execFileSync('git', ['archive', '--format=tar', sha], {cwd: root, stdio: ['ignore', descriptor, 'inherit']});
  } finally {
    closeSync(descriptor);
  }
  const source = join(work, 'source');
  mkdirSync(source);
  execFileSync('tar', ['-xf', archive, '-C', source]);
  console.log(`Deploying ${target} from ${sha} to production`);
  // Both projects have their root directory configured in Vercel. Upload the
  // repository root for either target; Vercel selects landing/ where required.
  const result = spawnSync('pnpm', [
    'dlx', 'vercel@54.20.1', 'deploy', '--prod', '--yes',
    '--project', target, '--scope', 'eugenes-projects-23020cc6',
    '--meta', `sourceCommit=${sha}`,
  ], {cwd: source, stdio: 'inherit', shell: process.platform === 'win32'});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(work, {recursive: true, force: true});
}
