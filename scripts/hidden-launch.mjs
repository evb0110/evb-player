// Prepares an agent-owned Electron launch that never shows a window, takes focus, or appears in
// the Dock. On macOS the Dock icon is registered before any app code runs, so window flags alone
// can't prevent it: the launch uses an APFS clone of the app bundle with LSUIElement set, resealed
// ad hoc, and the original bundle is never touched. The caller owns the process and removes
// `bundleDirectory` after it exits.
//
//   import {prepareHiddenLaunch} from './scripts/hidden-launch.mjs';
//   const launch = prepareHiddenLaunch({executablePath, workDirectory: '.devkit/my-task'});
//   // spawn or _electron.launch launch.executablePath with launch.env, then rmSync(launch.bundleDirectory)
//
// A hidden copy tests the app's behavior, not the original signature, Gatekeeper, Dock
// activation, or installing an update: the ad hoc seal fails Squirrel's signature check.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';

function plist(args) {
  return execFileSync('/usr/bin/plutil', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

export function prepareHiddenLaunch({executablePath, workDirectory, env = process.env, platform = process.platform}) {
  const launchEnv = {...env, EVB_PLAYER_HIDE_WINDOW: '1'};
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  const executable = resolve(executablePath);
  if (platform !== 'darwin') {
    return {executablePath: executable, env: launchEnv, bundleDirectory: null};
  }

  const sourceApp = dirname(dirname(dirname(executable)));
  if (!sourceApp.endsWith('.app') || dirname(executable) !== join(sourceApp, 'Contents', 'MacOS')) {
    throw new Error(`Not an executable inside an .app bundle: ${executable}`);
  }
  mkdirSync(workDirectory, {recursive: true});
  const bundleDirectory = mkdtempSync(join(realpathSync(workDirectory), 'hidden-app-'));
  try {
    const app = join(bundleDirectory, basename(sourceApp));
    // cp -c clones through APFS, so a 300 MB bundle costs almost nothing until a file changes.
    try {
      execFileSync('/bin/cp', ['-Rc', realpathSync(sourceApp), app], {stdio: 'ignore'});
    } catch {
      rmSync(app, {recursive: true, force: true});
      execFileSync('/usr/bin/ditto', [realpathSync(sourceApp), app], {stdio: 'ignore'});
    }
    const infoPlist = join(app, 'Contents', 'Info.plist');
    try {
      plist(['-replace', 'LSUIElement', '-bool', 'YES', infoPlist]);
    } catch {
      plist(['-insert', 'LSUIElement', '-bool', 'YES', infoPlist]);
    }
    // The edit breaks a Developer ID seal, and macOS kills a hardened app whose Info.plist no longer
    // matches about two seconds after launch; an ad hoc seal keeps the copy launchable.
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], {stdio: 'ignore'});
    execFileSync('/usr/bin/codesign', ['--verify', '--strict', app], {stdio: 'ignore'});
    if (plist(['-extract', 'LSUIElement', 'raw', '-expect', 'bool', '-o', '-', infoPlist]) !== 'true') {
      throw new Error('The hidden copy lost LSUIElement; refusing to launch a regular app.');
    }
    return {
      executablePath: join(app, 'Contents', 'MacOS', basename(executable)),
      env: launchEnv,
      bundleDirectory,
    };
  } catch (error) {
    rmSync(bundleDirectory, {recursive: true, force: true});
    throw error;
  }
}
