import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {build} from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist-native/mpv');
const native = join(root, 'vendor/electron-mpv-video/native/mpv-addon');
const run = (command, args, options = {}) => execFileSync(command, args, {cwd: root, stdio: 'inherit', ...options});
const capture = (command, args) => execFileSync(command, args, {encoding: 'utf8'}).trim();
rmSync(output, {recursive: true, force: true});
mkdirSync(output, {recursive: true});

let library = process.env.MPV_LIB;
if (process.platform === 'darwin') library ||= '/opt/homebrew/lib/libmpv.dylib';
if (process.platform === 'win32') library ||= join(root, '.devkit/mpv-sdk/mpv.lib');
if (library && !existsSync(library)) throw new Error(`libmpv development library missing: ${library}. See README.md.`);
run(process.execPath, [join(root, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild', '--directory', native], {
  env: {...process.env, ...(library ? {MPV_LIB: library} : {}), ...(process.platform === 'win32' ? {MPV_INCLUDE_DIR: process.env.MPV_INCLUDE_DIR || join(root, '.devkit/mpv-sdk/include')} : {})},
});
const addon = join(output, 'mpv_addon.node');
copyFileSync(join(native, 'build/Release/mpv_addon.node'), addon);

if (process.platform === 'darwin') {
  const staged = new Map();
  const stage = source => {
    source = realpathSync(source);
    const target = join(output, basename(source));
    if (staged.has(source)) return target;
    staged.set(source, target);
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    if (capture('lipo', ['-archs', source]).split(/\s+/u).length > 1) run('lipo', [source, '-thin', architecture, '-output', target]);
    else copyFileSync(source, target);
    const dependencies = capture('otool', ['-L', source]).split('\n').slice(1).map(line => line.trim().split(' (')[0]);
    const id = capture('otool', ['-D', source]).split('\n')[1]?.trim();
    for (const dependency of dependencies) {
      if (dependency === id || dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/')) continue;
      let candidate = dependency;
      if (candidate.startsWith('@')) candidate = join(dirname(source), basename(candidate));
      if (!existsSync(candidate)) throw new Error(`Cannot resolve ${dependency} required by ${source}`);
      const child = stage(candidate);
      run('install_name_tool', ['-change', dependency, `@loader_path/${basename(child)}`, target]);
    }
    run('install_name_tool', ['-id', `@loader_path/${basename(target)}`, target]);
    return target;
  };
  const stagedLibrary = stage(library);
  const installName = capture('otool', ['-D', library]).split('\n')[1].trim();
  run('install_name_tool', ['-change', installName, `@loader_path/${basename(stagedLibrary)}`, addon]);
  for (const file of [...staged.values(), addon]) run('codesign', ['--force', '--sign', '-', file]);
  writeFileSync(join(output, 'runtime.json'), JSON.stringify({platform: process.platform, files: [...staged.keys()]}, null, 2));
} else if (process.platform === 'win32') {
  const sdk = process.env.MPV_RUNTIME_DIR || join(root, '.devkit/mpv-sdk');
  for (const name of readdirSync(sdk)) if (name.endsWith('.dll')) copyFileSync(join(sdk, name), join(output, name));
} else {
  // Bundle the libmpv dependency closure built on the oldest supported distribution.
  // Each library resolves its private dependencies beside itself, independently of the host.
  const staged = new Set();
  const stage = file => {
    if (staged.has(file)) return;
    staged.add(file);
    for (const line of capture('ldd', [file]).split('\n')) {
      const match = /^(\S+)\s+=>\s+(\/\S+)/u.exec(line.trim());
      if (!match || /^(?:libc\.|libm\.|libpthread\.|libdl\.|librt\.|libstdc\+\+\.|libgcc_s\.|libresolv\.|libnss_|libGL|libEGL|libgbm|libdrm|libX|libwayland|libvulkan)/u.test(match[1])) continue;
      const target = join(output, match[1]);
      if (!existsSync(target)) copyFileSync(match[2], target);
      stage(match[2]);
      run('patchelf', ['--set-rpath', '$ORIGIN', target]);
    }
  };
  // The addon resolves libmpv in an isolated ELF namespace, so it deliberately
  // has no DT_NEEDED entry for libmpv. Stage that explicit runtime root too.
  const linuxLibrary = library || join(capture('pkg-config', ['--variable=libdir', 'mpv']), 'libmpv.so');
  const soname = /\(SONAME\).*\[([^\]]+)\]/u.exec(capture('readelf', ['-d', linuxLibrary]))?.[1];
  if (!soname || !/^libmpv\.so\.[12]$/u.test(soname)) throw new Error(`Unsupported libmpv soname: ${soname}`);
  const runtime = join(output, soname);
  copyFileSync(linuxLibrary, runtime);
  stage(linuxLibrary);
  run('patchelf', ['--set-rpath', '$ORIGIN', runtime]);
  stage(addon);
  run('patchelf', ['--set-rpath', '$ORIGIN', addon]);
}
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(output, 'THIRD_PARTY_NOTICES.md'));
await build({entryPoints: [join(root, 'electron/preload.ts')], outfile: join(root, 'dist-electron/electron/preload.js'), platform: 'node', format: 'cjs', bundle: true, external: ['electron']});
console.log(`Bundled libmpv runtime in ${output}`);
