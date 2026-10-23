import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {prepareHiddenLaunch} from './hidden-launch.mjs';
import {testPlayerControls} from './test-player-controls.mjs';
import {testLibraryLayout} from './test-library-layout.mjs';

const root = resolve(import.meta.dirname, '..');
const temporary = process.env.TMPDIR || join(root, '.devkit');
mkdirSync(temporary, {recursive: true});
const work = realpathSync(mkdtempSync(join(temporary, 'playback-test-')));
const folder = join(work, 'media');
const profile = join(work, 'profile');
mkdirSync(folder, {recursive: true});
mkdirSync(profile, {recursive: true});
const encode = (name, args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-y', join(folder, name.replace(/^(\d+) /u, '$1. '))], {stdio: 'inherit'});
// Deliberately broken composition timestamps with B frames, matching the real
// failure. Every decoded frame gets brighter, so backwards images are measurable.
encode('01 Broken timing.mp4', ['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=30:d=6,geq=lum=16+N:cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-bf', '2', '-g', '60', '-bsf:v', 'setts=pts=DTS']);
const timingFixture = readFileSync(join(folder, '01. Broken timing.mp4'));
console.log('Timing fixture', {sha256: createHash('sha256').update(timingFixture).digest('hex'), bytes: timingFixture.length});
if (process.env.CI && process.platform === 'darwin') console.log('TIMING_FIXTURE_BASE64', timingFixture.toString('base64'));
for (const [name, codec] of [['02 AVI.avi', 'mpeg4'], ['03 Windows Media.wmv', 'wmv2'], ['04 MPEG.mpg', 'mpeg2video'], ['05 Flash.flv', 'flv1'], ['06 HEVC.mkv', 'libx265']]) {
  encode(name, ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=6', '-c:v', codec, ...(codec === 'libx265' ? ['-x265-params', 'log-level=error:pools=1'] : [])]);
}
encode('07 Audio.flac', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'flac']);
encode('08 Sync check.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-bf', '2', '-c:a', 'aac', '-shortest']);
encode('09 Seek controls.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=2:d=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '2']);
const folderId = createHash('sha256').update(folder).digest('hex').slice(0, 16);
const layoutFolders = ['Programming workshops with exercises and bonus projects', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5)].map((name, index) => ({
  id: String(index + 1).padStart(16, '0'), name, rootPath: join(work, name), mediaCount: 24, lastOpenedAt: Date.now() - 86_400_000,
}));
writeFileSync(join(profile, 'evb-player-state.json'), JSON.stringify({recentFolders: [{id: folderId, name: 'Playback fixtures', rootPath: folder, mediaCount: 9, lastOpenedAt: Date.now()}, ...layoutFolders], progress: {}, lastFolderPath: folder}));
// Electron 44 lazily installs its executable when this package API is loaded.
// A guessed dist path bypasses that installer on fresh CI machines.
const require = createRequire(import.meta.url);
const executablePath = process.env.EVB_PLAYER_TEST_EXECUTABLE || require('electron');
const launch = prepareHiddenLaunch({executablePath, workDirectory: work});
launch.env.EVB_PLAYER_TEST_AUDIO_OUTPUT = 'null';
launch.env.EVB_PLAYER_TEST_DIAGNOSTICS = '1';
if (process.platform === 'linux' && process.env.EVB_PLAYER_TEST_BACKTRACE) {
  const wrapper = join(work, 'electron-backtrace.sh');
  const shellQuote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
  writeFileSync(wrapper, `#!/bin/sh\nexec gdb --batch -ex run -ex 'thread apply all bt 12' --args ${shellQuote(launch.executablePath)} "$@"\n`);
  chmodSync(wrapper, 0o700);
  launch.executablePath = wrapper;
}
let application;
let nativeLogs = '';
const nativePolicyLines = [];
let nativeSample;
const nativeSamplePath = join(work, 'native-playback-sample.txt');
try {
  application = await _electron.launch({...launch, args: [...(process.env.EVB_PLAYER_TEST_EXECUTABLE ? [] : [root]), `--user-data-dir=${profile}`, ...(process.env.NESTED_RUN ? ['--ozone-platform=wayland'] : [])]});
  for (const stream of [application.process().stdout, application.process().stderr]) {
    let pendingLine = '';
    stream.on('data', chunk => {
      const text = chunk.toString();
      nativeLogs = (nativeLogs + text).slice(-65_536);
      const lines = (pendingLine + text).split('\n');
      pendingLine = lines.pop();
      // Keep lifecycle receipts even when frame diagnostics evict the log tail.
      nativePolicyLines.push(...lines.filter(line => /Native playback policy|policy restored:/u.test(line)));
    });
  }
  application.process().on('exit', (code, signal) => {if (signal || code) console.error('Electron exited', {code, signal});});
  const isolation = await application.evaluate(({app, BrowserWindow}) => ({profile: app.getPath('userData'), visible: BrowserWindow.getAllWindows().some(window => window.isVisible())}));
  assert.equal(isolation.profile, profile);
  assert.equal(isolation.visible, process.platform === 'linux' && Boolean(process.env.NESTED_RUN));
  const page = await application.firstWindow();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
  page.on('console', message => {if (message.type() === 'error') console.error(message.text());});
  await page.waitForFunction(() => document.querySelector('evb-media')?.readyState === 4).catch(async error => {
    console.error(await page.evaluate(() => ({text: document.body.innerText, media: [...document.querySelectorAll('evb-media')].map(v => ({src: v.src, ready: v.readyState, duration: v.duration, player: v.playerId, renderer: v.rendererName, loads: v.loadGeneration, opened: v.openedSource, status: v.status, connected: v.isConnected, state: v.state}))})));
    throw error;
  });
  if (process.env.EVB_PLAYER_TEST_RENDER_MODE) await page.locator('evb-media').evaluate((media, mode) => media.setRenderMode(mode), process.env.EVB_PLAYER_TEST_RENDER_MODE);
  // Vue can call the ref's load method while its suspense fragment is still
  // detached. Loading must survive the later connection to the document.
  await page.evaluate(async () => {
    const media = document.createElement('evb-media');
    media.dataset.detachedTest = 'true';
    media.style.width = '4000px';
    media.style.height = '1000px';
    media.setAttribute('render-mode', 'canvas2d');
    media.src = document.querySelector('evb-media').src;
    media.load();
    await Promise.resolve();
    await Promise.resolve();
    document.body.append(media);
  });
  await page.waitForFunction(() => document.querySelector('[data-detached-test]')?.readyState === 4);
  await page.locator('[data-detached-test]').evaluate(media => media.play());
  await page.waitForFunction(() => {
    const media = document.querySelector('[data-detached-test]');
    const canvas = [...media.shadowRoot.querySelectorAll('canvas')].find(canvas => !canvas.hidden);
    return media.currentTime > 0.3 && canvas?.getContext('2d')?.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[0] > 2;
  });
  const softwareSize = await page.locator('[data-detached-test]').evaluate(media => {
    const canvas = [...media.shadowRoot.querySelectorAll('canvas')].find(canvas => !canvas.hidden);
    return {width: canvas.width, height: canvas.height};
  });
  assert.equal(softwareSize.width / softwareSize.height, 4, 'Rendering caps must preserve the viewport aspect ratio');
  assert.ok(softwareSize.width <= 1920 && softwareSize.height <= 1080);
  await page.locator('[data-detached-test]').evaluate(media => media.remove());
  console.log('PASS load before DOM connection and software-rendered pixels');
  // Keep the diagnostic surface at the fixture's native size. Measuring native
  // paint callbacks avoids hidden/virtual desktop requestAnimationFrame limits.
  await page.locator('evb-media').evaluate(media => {media.style.width = '320px'; media.style.height = '180px';});
  if (process.platform === 'darwin' && process.env.EVB_PLAYER_TEST_SAMPLE === '1') {
    const mainPid = application.process().pid;
    const worker = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], {encoding: 'utf8'}).split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line)).find(match => match && Number(match[2]) === mainPid && match[3].includes('/dist-native/mpv/node') && match[3].includes('mpv-worker.js'));
    if (worker) {
      const sampler = spawn('sample', [worker[1], '3', '10', '-file', nativeSamplePath], {stdio: 'ignore'});
      nativeSample = new Promise(resolve => {sampler.once('error', resolve); sampler.once('close', resolve);});
    }
  }
  const motion = await page.evaluate(async engine => {
    let media = document.querySelector('evb-media');
    if (engine === 'chromium') {
      await media.pause();
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = media.src;
      document.body.append(video);
      await new Promise((resolve, reject) => {video.addEventListener('loadeddata', resolve, {once: true}); video.addEventListener('error', reject, {once: true});});
      media = video;
    }
    const errors = [];
    const timing = {};
    media.addEventListener('mpv-event', event => {
      const {name, data} = event.detail;
      if (['estimated-vf-fps', 'decoder-frame-drop-count', 'frame-drop-count'].includes(name)) timing[name] = data;
    });
    media.addEventListener('error', () => errors.push('media error'));
    await media.pause();
    media.muted = true;
    media.currentTime = 0;
    const values = [];
    const sample = document.createElement('canvas');
    sample.width = 1; sample.height = 1;
    const context = sample.getContext('2d', {willReadFrequently: true});
    let active = true;
    const sampleFrame = frame => {
      // Software frames already contain the exact pixels passed to the canvas.
      // Reading a GPU canvas back on every frame stalls virtual GPU runners.
      if (frame?.rgba) {
        values.push(new Uint8Array(frame.rgba)[(Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2)) * 4]);
        return;
      }
      const canvas = media.shadowRoot ? [...media.shadowRoot.querySelectorAll('canvas')].find(canvas => !canvas.hidden) : media;
      if (canvas) {
        context.drawImage(canvas, (canvas.videoWidth || canvas.width) / 2, (canvas.videoHeight || canvas.height) / 2, 1, 1, 0, 0, 1, 1);
        values.push(context.getImageData(0, 0, 1, 1).data[0]);
      }
    };
    let restore;
    if (engine === 'chromium') {
      const frame = () => {sampleFrame(); if (active) media.requestVideoFrameCallback(frame);};
      media.requestVideoFrameCallback(frame);
      restore = () => {};
    } else {
      const renderer = media.activeSharedRenderer || media.activeRenderer;
      const method = media.activeSharedRenderer ? 'drawVideoFrame' : 'draw';
      const draw = renderer[method];
      renderer[method] = method === 'draw' ? function (...args) {
        const result = draw.apply(this, args);
        sampleFrame(args[0]);
        return result;
      } : async function (...args) {
        await draw.apply(this, args);
        sampleFrame(args[0]);
      };
      restore = () => {renderer[method] = draw;};
    }
    try {
      await media.play();
      await new Promise(resolve => setTimeout(resolve, 3500));
      active = false;
      await media.pause();
    } finally {
      restore();
    }
    const gl = media.activeRenderer?.gl;
    const gpuInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpu = gpuInfo ? gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : undefined;
    return {values, errors, timing, gpu, time: media.currentTime, duration: media.duration, renderer: media.rendererName, state: media.state, size: {width: media.activeRenderer?.canvas.width, height: media.activeRenderer?.canvas.height}};
  }, process.env.EVB_PLAYER_TEST_ENGINE);
  assert.deepEqual(motion.errors, []);
  assert.ok(motion.time > 3 && motion.time < 4.5, JSON.stringify(motion));
  const visible = motion.values.filter(value => value > 4);
  const backwards = visible.filter((value, index) => index && value + 1 < visible[index - 1]);
  const changes = visible.filter((value, index) => index && value !== visible[index - 1]);
  console.log('Playback diagnostics', {time: motion.time, duration: motion.duration, state: motion.state, size: motion.size, timing: motion.timing, gpu: motion.gpu});
  console.log('Frame measurements', {backwards: backwards.length, changes: changes.length, samples: visible.length, renderer: motion.renderer});
  assert.ok(visible.length > 40, 'Playback must paint frames');
  assert.equal(backwards.length, 0, `Images went backwards ${backwards.length} times`);
  assert.ok(changes.length >= 85, `Only ${changes.length} distinct frame transitions in 3.5 seconds of 30fps video`);
  assert.ok(visible.at(-1) - visible[0] > 75, 'The video must advance through its images');
  console.log('PASS broken B-frame timestamps: images stay in display order', {samples: visible.length, renderer: motion.renderer});
  if (process.platform === 'darwin') {
    const mainPid = application.process().pid;
    const ownsDisplayWake = () => execFileSync('pmset', ['-g', 'assertions'], {encoding: 'utf8'}).split('\n').some(line => line.includes(`pid ${mainPid}(`) && /PreventUserIdleDisplaySleep|NoDisplaySleepAssertion/u.test(line));
    await page.exposeFunction('playbackOwnsDisplayWake', ownsDisplayWake);
    const start = await page.locator('evb-media').evaluate(media => media.currentTime);
    await page.locator('evb-media').evaluate(media => media.play());
    await page.waitForFunction(start => document.querySelector('evb-media').currentTime > start + 0.1, start);
    await page.waitForFunction(async () => await window.playbackOwnsDisplayWake(), null, {polling: 100});
    await page.locator('evb-media').evaluate(media => media.pause());
    await page.waitForFunction(async () => !await window.playbackOwnsDisplayWake(), null, {polling: 100});
    console.log('PASS active playback power assertion and pause cleanup');
    await application.evaluate(({powerSaveBlocker}) => {
      globalThis.restorePlaybackPower = powerSaveBlocker.start;
      globalThis.playbackPowerAttempts = 0;
      powerSaveBlocker.start = () => {globalThis.playbackPowerAttempts++; throw new Error('Injected unavailable power management');};
    });
    try {
      const start = await page.locator('evb-media').evaluate(media => media.currentTime);
      await page.locator('evb-media').evaluate(media => media.play());
      await page.waitForFunction(start => document.querySelector('evb-media').currentTime > start + 0.1, start);
      assert.equal(await application.evaluate(() => globalThis.playbackPowerAttempts), 1, 'An unavailable assertion must not be requested on every frame');
      await page.locator('evb-media').evaluate(media => media.pause());
      console.log('PASS playback survives unavailable OS power management');
    } finally {
      await application.evaluate(({powerSaveBlocker}) => {
        powerSaveBlocker.start = globalThis.restorePlaybackPower;
        delete globalThis.restorePlaybackPower;
        delete globalThis.playbackPowerAttempts;
      });
    }
  }

  const combinedSeek = await page.locator('evb-media').evaluate(media => {
    media.currentTime = 0.25;
    media.currentTime += 0.5;
    return media.currentTime;
  });
  assert.equal(combinedSeek, 0.75, 'Consecutive seeks must build on the most recent target');

  await page.locator('evb-media').evaluate(media => {media.currentTime = 1.25;});
  await page.waitForFunction(() => Math.abs(document.querySelector('evb-media').currentTime - 1.25) < 0.15);
  await page.locator('evb-media').evaluate(async media => {media.playbackRate = 2; await media.play();});
  await page.waitForFunction(() => document.querySelector('evb-media').currentTime > 2.4);
  await page.locator('evb-media').evaluate(media => media.pause());
  await page.locator('evb-media').evaluate(async media => {
    await media.setRenderMode('canvas2d');
    await media.play();
  });
  const speedAfterSwitch = await page.locator('evb-media').evaluate(async media => {
    const start = media.currentTime;
    await new Promise(resolve => setTimeout(resolve, 500));
    await media.pause();
    return media.currentTime - start;
  });
  assert.ok(speedAfterSwitch > 0.75 && speedAfterSwitch < 1.25, `Pipeline switch lost 2x speed: ${speedAfterSwitch}`);
  console.log('PASS exact seek and playback speed');

  for (const title of ['AVI', 'Windows Media', 'MPEG', 'Flash', 'HEVC', 'Audio']) {
    await page.getByText(title, {exact: true}).first().click();
    await page.waitForFunction(title => document.querySelector('evb-media')?.src.includes(encodeURIComponent(title)) && document.querySelector('evb-media')?.readyState === 4, title);
    await page.locator('evb-media').evaluate(async media => {media.muted = true; await media.play();});
    await page.waitForFunction(() => document.querySelector('evb-media').currentTime > 0.3);
    await page.locator('evb-media').evaluate(media => media.pause());
    assert.equal(await page.getByRole('alert').count(), 0);
    console.log(`PASS ${title} playback`);
  }
  for (const title of ['AVI', 'MPEG', 'HEVC', 'AVI', 'HEVC']) await page.getByText(title, {exact: true}).first().click();
  await page.waitForFunction(() => document.querySelector('evb-media')?.src.includes('HEVC') && document.querySelector('evb-media')?.readyState === 4);
  await page.locator('evb-media').evaluate(async media => {media.currentTime = media.duration - 0.25; await media.play();});
  await page.waitForFunction(() => document.querySelector('evb-media')?.src.includes('Audio') && document.querySelector('evb-media')?.currentTime > 0.1);
  await page.locator('evb-media').evaluate(media => media.pause());
  assert.ok(Object.values(await page.evaluate(id => window.evbPlayer.getFolderProgress(id), folderId)).some(track => track.completed));
  console.log('PASS rapid track switching and automatic advance');
  // The native bridge must retain the main process's authorization boundary.
  const denied = await page.evaluate(async () => {
    const session = await window._electronMpvVideo.create({renderMode: 'canvas2d', width: 320, height: 180});
    try {await session.open('file:///etc/passwd'); return false;} catch {return true;} finally {await session.destroy();}
  });
  assert.equal(denied, true);
  for (let reload = 0; reload < 5; reload += 1) {
    await page.reload();
    await page.waitForFunction(() => document.querySelector('evb-media')?.readyState === 4);
  }
  console.log('PASS native sessions are released across renderer reloads');
  await page.getByText('Seek controls', {exact: true}).first().click();
  await page.waitForFunction(() => document.querySelector('evb-media')?.src.includes('Seek%20controls') && document.querySelector('evb-media')?.readyState === 4);
  await testPlayerControls(page);
  await testLibraryLayout(application, page);
  assert.deepEqual(errors, []);
  console.log('PASS source authorization and renderer lifecycle');
  const helperPids = [];
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const mainPid = await application.evaluate(() => process.pid);
    const children = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], {encoding: 'utf8'});
    for (const line of children.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      if (match && Number(match[2]) === mainPid && match[3].includes('/dist-native/mpv/node') && match[3].includes('mpv-worker.js')) helperPids.push(Number(match[1]));
    }
    assert.ok(helperPids.length > 0, 'Playback must run in its bundled helper');
  }
  await application.close();
  application = null;
  for (const pid of helperPids) assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'});
  const state = JSON.parse(readFileSync(join(profile, 'evb-player-state.json'), 'utf8'));
  assert.ok(Object.keys(state.progress[folderId]).length > 0);
  assert.ok(state.recentFolders.some(folder => folder.id === folderId));
  console.log('PASS existing progress-file format');
  const runtime = process.env.EVB_PLAYER_TEST_EXECUTABLE
    ? resolve(dirname(launch.executablePath), ...(process.platform === 'darwin' ? ['..', 'Resources'] : ['resources']), 'dist-native/mpv')
    : resolve(root, 'dist-native/mpv');
  const clockNode = process.platform === 'win32' ? process.execPath : join(runtime, 'node');
  const clockArgs = [join(root, 'scripts/test-playback-clock.mjs'), join(runtime, 'mpv_addon.node'), join(folder, '08. Sync check.mp4')];
  const clockResult = execFileSync(process.platform === 'darwin' ? '/usr/sbin/taskpolicy' : clockNode,
    process.platform === 'darwin' ? ['-a', clockNode, ...clockArgs] : clockArgs,
    {encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, ELECTRON_RUN_AS_NODE: undefined, EVB_PLAYER_TEST_AUDIO_OUTPUT: 'null', EVB_PLAYER_TEST_DIAGNOSTICS: '1', EVB_PLAYER_TEST_RENDER_DELAY_MS: '70'}});
  console.log(clockResult.trim());

  const qosStatuses = [...new Set([...nativeLogs.matchAll(/producer QoS status=(\d+)/gu)].map(match => Number(match[1])))];
  const wakeDelays = [...nativeLogs.matchAll(/max-wake-us=(\d+)/gu)].map(match => Number(match[1]));
  if (qosStatuses.length || wakeDelays.length) console.log('Native scheduling diagnostics', {qosStatuses, maxWakeMs: Math.max(0, ...wakeDelays) / 1000});
  const nativePolicies = nativePolicyLines.join('\n');
  const restoredPolicies = [...nativePolicies.matchAll(/policy restored: expected-background=(\d+) background=(\d+) expected-role=(-?\d+) role=(-?\d+) status=(\d+)/gu)];
  if (process.platform === 'darwin') {
    assert.match(nativePolicies, /Native playback policy: background=[01] role=7 reset=0 foreground=0/u, 'Decoder must start with application scheduling and accept the playback boost');
    if (process.env.EVB_PLAYER_TEST_BACKGROUND_DECODER === '1') {
      assert.match(nativePolicies, /Native playback policy: background=1/u, 'Decoder must inherit the injected background state');
    }
    assert.ok(restoredPolicies.length > 0, 'Playback must restore its OS scheduling policy');
    for (const match of restoredPolicies) {
      assert.equal(match[2], match[1], 'Restore inherited background state');
      assert.equal(match[4], match[3], 'Restore previous task role');
      assert.equal(match[5], '0', 'OS scheduling policy must remain readable');
    }
    console.log('PASS restored OS scheduling policy', {restorations: restoredPolicies.length});
  }
} catch (error) {
  console.error(nativeLogs);
  await nativeSample;
  try {console.error(readFileSync(nativeSamplePath, 'utf8'));} catch {}
  throw error;
} finally {
  await nativeSample;
  if (application) await application.close().catch(() => undefined);
  rmSync(work, {recursive: true, force: true});
}
