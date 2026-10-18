import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const native = createRequire(import.meta.url)(process.argv[2]);
const player = new native.MpvPlayer({mode: 'software'});
const avsync = [];
let paints = 0, skipped = 0, position = 0;
let finish, started;
const complete = new Promise((resolve, reject) => {
  finish = resolve;
  player.setEventCallback(() => {
    try {
      for (const event of player.pollEvents()) {
        if (event.error) throw new Error(event.error);
        if (event.type === 'file-loaded') {started = performance.now(); player.play();}
        if (event.name === 'time-pos' && typeof event.data === 'number') position = event.data;
        if (event.name === 'avsync' && typeof event.data === 'number') avsync.push(event.data);
      }
    } catch (error) {reject(error);}
  });
});
player.setUpdateCallback(() => {
  try {
    if (started && performance.now() - started >= 3500) {finish(); return;}
    const frame = player.renderFrame(320, 180);
    if (frame) paints++; else skipped++;
  } catch (error) {finish(Promise.reject(error));}
});
try {
  player.open(process.argv[3]);
  await complete;
  player.pause();
  const maximumAvDrift = Math.max(0, ...avsync.map(Math.abs));
  assert.ok(paints > 20, `Render under injected load: ${paints}`);
  assert.ok(skipped > 0, 'The client must discard expired frames under load');
  assert.ok(avsync.length > 10, 'Measure real decoded audio/video synchronization');
  assert.ok(maximumAvDrift < 0.2, `A/V drift under 70ms rendering load: ${maximumAvDrift}s`);
  assert.ok(position > 3, `Video must catch up with its audio clock: ${position}s`);
  console.log('PASS audio/video clock under rendering load', {paints, skipped, position, maximumAvDrift});
} finally {
  player.setUpdateCallback(); player.setEventCallback(); player.destroy();
}
