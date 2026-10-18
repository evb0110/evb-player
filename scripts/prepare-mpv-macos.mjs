// IINA's published runtime retains support for older macOS releases, while
// Homebrew bottles inherit the build host's deployment target.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {appendFile, copyFile, mkdir, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sdk = join(root, '.devkit/mpv-sdk/macos');
const archive = join(sdk, 'IINA.v1.4.4.dmg');
const mount = join(sdk, 'mount');
const runtime = join(sdk, 'lib');
const headers = join(sdk, 'include/mpv');
const url = 'https://github.com/iina/iina/releases/download/v1.4.4/IINA.v1.4.4.dmg';
const checksum = 'dd0fc0bd4b37fb57a1c8d30d6e3201b3a64bafd29959fe56953964613237beb1';
await Promise.all([mkdir(runtime, {recursive: true}), mkdir(headers, {recursive: true}), mkdir(mount, {recursive: true})]);
execFileSync('curl', ['-fsSL', url, '-o', archive], {stdio: 'inherit'});
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
if (hash.digest('hex') !== checksum) throw new Error('IINA runtime checksum mismatch');
execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, archive], {stdio: 'inherit'});
try {
  const frameworks = join(mount, 'IINA.app/Contents/Frameworks');
  for (const name of await readdir(frameworks)) if (name.endsWith('.dylib')) await copyFile(join(frameworks, name), join(runtime, name));
} finally {
  execFileSync('hdiutil', ['detach', mount], {stdio: 'inherit'});
}
const headerCommit = 'c111221ea027466b79b40bfca054772d4851e06f';
const headerChecksums = {
  'client.h': 'c34c436b54201ba84655dcbb6226f937b53d04fa0abcceaa08886565a569bd88',
  'render.h': 'f00a31d46896c691922196c932c94140d206cb4c16cfa4bb6bdf3a9d0d3d4a29',
  'render_gl.h': '48662c0ed9872a14dd9e1684105c97f69f94a0414709c254c5d372adc41d2e69',
};
for (const [name, checksum] of Object.entries(headerChecksums)) {
  const target = join(headers, name);
  execFileSync('curl', ['-fsSL', `https://raw.githubusercontent.com/iina/iina/${headerCommit}/deps/include/mpv/${name}`, '-o', target], {stdio: 'inherit'});
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  if (hash.digest('hex') !== checksum) throw new Error(`libmpv header checksum mismatch: ${name}`);
}
await writeFile(join(sdk, 'runtime.json'), JSON.stringify({url, sha256: checksum, version: 'IINA 1.4.4'}, null, 2));
const settings = `MPV_LIB=${join(runtime, 'libmpv.2.dylib')}\nMPV_INCLUDE_DIR=${join(sdk, 'include')}\n`;
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, settings);
console.log(settings);
