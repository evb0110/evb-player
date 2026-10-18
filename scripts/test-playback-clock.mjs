import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const native = createRequire(import.meta.url)(process.argv[2]);
const player = new native.MpvPlayer({mode: 'software'});
let phase, finish, fail, started, renderPending = false, closed = false;
let avsync, paints, skipped, position;
function scheduleRender() {
  if (renderPending || closed) return;
  renderPending = true;
  // Yield to property events before expensive rendering, as the asynchronous
  // application client does; rendering inside a TSFN callback starves them.
  setImmediate(() => {
    renderPending = false;
    if (closed || !started) return;
    try {
      if (performance.now() - started >= 3500) {started = undefined; finish(); return;}
      const frame = player.renderFrame(320, 180);
      if (frame) paints++; else skipped++;
    } catch (error) {fail(error);}
  });
}
player.setUpdateCallback(scheduleRender);
player.setEventCallback(() => {
  try {
    for (const event of player.pollEvents()) {
      if (event.error) throw new Error(event.error);
      if (event.type === 'file-loaded') {
        started = performance.now();
        if (phase === 'initial') player.play();
        scheduleRender();
      }
      if (started && event.name === 'time-pos' && typeof event.data === 'number') position = event.data;
      if (started && event.name === 'avsync' && typeof event.data === 'number') avsync.push(event.data);
    }
  } catch (error) {fail(error);}
});
try {
  for (const label of ['initial', 'replacement']) {
    phase = label;
    avsync = []; paints = 0; skipped = 0; position = 0; started = undefined;
    await new Promise((resolve, reject) => {
      finish = resolve; fail = reject;
      // The second open retains mpv's unpaused state and deliberately does
      // not issue another play command, exercising source replacement.
      player.open(process.argv[3]);
    });
    const maximumAvDrift = Math.max(0, ...avsync.map(Math.abs));
    assert.ok(paints > 20, `Render under injected load: ${paints}`);
    assert.ok(skipped > 0, 'The client must discard expired frames under load');
    assert.ok(avsync.length > 10, 'Measure real decoded audio/video synchronization');
    assert.ok(maximumAvDrift < 0.2, `A/V drift under 70ms rendering load: ${maximumAvDrift}s`);
    assert.ok(position > 3, `Video must catch up with its audio clock: ${position}s`);
    console.log('PASS audio/video clock under rendering load', {phase, paints, skipped, position, maximumAvDrift});
  }
} finally {
  closed = true;
  player.pause(); player.setUpdateCallback(); player.setEventCallback(); player.destroy();
}
