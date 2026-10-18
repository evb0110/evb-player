import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {prepareHiddenLaunch} from './hidden-launch.mjs';

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(process.env.TMPDIR || join(root, '.devkit/'), 'playback-test-'));
const folder = join(work, 'media');
const profile = join(work, 'profile');
mkdirSync(folder, {recursive: true});
mkdirSync(profile, {recursive: true});
const encode = (name, args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-y', join(folder, name.replace(/^(\d+) /u, '$1. '))], {stdio: 'inherit'});
// Deliberately broken composition timestamps with B frames, matching the real
// failure. Every decoded frame gets brighter, so backwards images are measurable.
encode('01 Broken timing.mp4', ['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=30:d=6,geq=lum=16+N:cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-bf', '2', '-g', '60', '-bsf:v', 'setts=pts=DTS']);
for (const [name, codec] of [['02 AVI.avi', 'mpeg4'], ['03 Windows Media.wmv', 'wmv2'], ['04 MPEG.mpg', 'mpeg2video'], ['05 Flash.flv', 'flv1'], ['06 HEVC.mkv', 'libx265']]) {
  encode(name, ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=6', '-c:v', codec, ...(codec === 'libx265' ? ['-x265-params', 'log-level=error:pools=1'] : [])]);
}
encode('07 Audio.flac', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'flac']);
const folderId = createHash('sha256').update(folder).digest('hex').slice(0, 16);
writeFileSync(join(profile, 'evb-player-state.json'), JSON.stringify({recentFolders: [{id: folderId, name: 'Playback fixtures', rootPath: folder, mediaCount: 7, lastOpenedAt: Date.now()}], progress: {}, lastFolderPath: folder}));
const executablePath = process.env.EVB_PLAYER_TEST_EXECUTABLE || join(root, 'node_modules/electron/dist', process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'electron.exe' : 'electron');
const launch = prepareHiddenLaunch({executablePath, workDirectory: work});
launch.env.EVB_PLAYER_TEST_AUDIO_OUTPUT = 'null';
let application;
try {
  application = await _electron.launch({...launch, args: [...(process.env.EVB_PLAYER_TEST_EXECUTABLE ? [] : [root]), `--user-data-dir=${profile}`, ...(process.env.NESTED_RUN ? ['--ozone-platform=wayland'] : [])]});
  const isolation = await application.evaluate(({app, BrowserWindow}) => ({profile: app.getPath('userData'), visible: BrowserWindow.getAllWindows().some(window => window.isVisible())}));
  assert.equal(isolation.profile, profile);
  assert.equal(isolation.visible, process.platform === 'linux' && Boolean(process.env.NESTED_RUN));
  const page = await application.firstWindow();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
  page.on('console', message => {if (message.type() === 'error') console.error(message.text());});
  await page.waitForFunction(() => document.querySelector('evb-media')?.readyState === 4).catch(async error => {
    console.error(await page.evaluate(() => ({text: document.body.innerText, media: [...document.querySelectorAll('evb-media')].map(v => ({src: v.src, ready: v.readyState, duration: v.duration, player: v.playerId, renderer: v.rendererName}))})));
    throw error;
  });
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
    media.addEventListener('error', () => errors.push('media error'));
    await media.pause();
    media.muted = true;
    media.currentTime = 0;
    const values = [];
    const sample = document.createElement('canvas');
    sample.width = 1; sample.height = 1;
    const context = sample.getContext('2d', {willReadFrequently: true});
    let active = true;
    const frame = () => {
      const canvas = media.shadowRoot ? [...media.shadowRoot.querySelectorAll('canvas')].find(canvas => !canvas.hidden) : media;
      if (canvas) {
        context.drawImage(canvas, (canvas.videoWidth || canvas.width) / 2, (canvas.videoHeight || canvas.height) / 2, 1, 1, 0, 0, 1, 1);
        values.push(context.getImageData(0, 0, 1, 1).data[0]);
      }
      if (active) requestAnimationFrame(frame);
    };
    await media.play();
    requestAnimationFrame(frame);
    await new Promise(resolve => setTimeout(resolve, 3500));
    active = false;
    await media.pause();
    return {values, errors, time: media.currentTime, duration: media.duration, renderer: media.rendererName};
  }, process.env.EVB_PLAYER_TEST_ENGINE);
  assert.deepEqual(motion.errors, []);
  assert.ok(motion.time > 3 && motion.time < 4.5, JSON.stringify(motion));
  const visible = motion.values.filter(value => value > 4);
  const backwards = visible.filter((value, index) => index && value + 1 < visible[index - 1]);
  const changes = visible.filter((value, index) => index && value !== visible[index - 1]);
  console.log('Frame measurements', {backwards: backwards.length, changes: changes.length, samples: visible.length});
  assert.ok(visible.length > 40, 'Playback must paint frames');
  assert.equal(backwards.length, 0, `Images went backwards ${backwards.length} times`);
  assert.ok(changes.length >= 85, `Only ${changes.length} distinct frame transitions in 3.5 seconds of 30fps video`);
  assert.ok(visible.at(-1) - visible[0] > 75, 'The video must advance through its images');
  console.log('PASS broken B-frame timestamps: images stay in display order', {samples: visible.length, renderer: motion.renderer});

  await page.locator('evb-media').evaluate(media => {media.currentTime = 1.25;});
  await page.waitForFunction(() => Math.abs(document.querySelector('evb-media').currentTime - 1.25) < 0.15);
  await page.locator('evb-media').evaluate(async media => {media.playbackRate = 2; await media.play();});
  await page.waitForFunction(() => document.querySelector('evb-media').currentTime > 2.4);
  await page.locator('evb-media').evaluate(media => media.pause());
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
  assert.deepEqual(errors, []);
  console.log('PASS source authorization and renderer lifecycle');
  await application.close();
  application = null;
  const state = JSON.parse(readFileSync(join(profile, 'evb-player-state.json'), 'utf8'));
  assert.ok(Object.keys(state.progress[folderId]).length > 0);
  assert.ok(state.recentFolders.some(folder => folder.id === folderId));
  console.log('PASS existing progress-file format');
} finally {
  if (application) await application.close();
  rmSync(work, {recursive: true, force: true});
}
