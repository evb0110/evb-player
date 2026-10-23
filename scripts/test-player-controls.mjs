import assert from 'node:assert/strict';

// Exercise the shared UI against either libmpv or the browser media element.
// The caller supplies a paused track longer than 60 seconds in an isolated profile.
export async function testPlayerControls(page, selector = 'evb-media') {
  const media = page.locator(selector);
  const seek = page.getByRole('slider', {name: 'Seek', exact: true});
  const expectTime = expected => page.waitForFunction(({selector, expected}) => Math.abs(document.querySelector(selector).currentTime - expected) < 0.15, {selector, expected});
  await media.evaluate(media => {media.pause(); media.currentTime = 30;});
  await expectTime(30);
  await seek.focus();
  await page.keyboard.press('ArrowLeft');
  await expectTime(25);
  await page.keyboard.press('ArrowRight');
  await expectTime(30);
  await page.keyboard.press('j');
  await expectTime(20);
  await page.keyboard.press('l');
  await expectTime(30);
  console.log('PASS default YouTube seek shortcuts with seek-bar focus');

  await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arrow keys (← / →)', {exact: true}).selectOption('15');
  await dialog.getByLabel('Skip buttons and J / L', {exact: true}).selectOption('30');
  await page.keyboard.press('Escape');
  await seek.focus();
  await page.keyboard.press('ArrowLeft');
  await expectTime(15);
  await page.keyboard.press('ArrowRight');
  await expectTime(30);
  await page.keyboard.press('j');
  await expectTime(0);
  await page.keyboard.press('l');
  await expectTime(30);
  await page.getByRole('button', {name: 'Back 30 seconds', exact: true}).click();
  await expectTime(0);
  await page.getByRole('button', {name: 'Forward 30 seconds', exact: true}).click();
  await expectTime(30);
  await page.keyboard.press('Control+ArrowRight');
  await expectTime(30);
  const volume = page.getByRole('slider', {name: 'Volume', exact: true});
  await volume.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(await volume.inputValue() < 1, 'Focused volume slider keeps its native arrow control');
  await expectTime(30);
  const search = page.getByRole('searchbox', {name: 'Search tracks', exact: true});
  await search.fill('j');
  await page.keyboard.press('ArrowLeft');
  await expectTime(30);
  await search.fill('');
  await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
  await page.keyboard.press('l');
  await expectTime(30);
  await page.keyboard.press('Escape');
  await seek.focus();
  await page.keyboard.press('?');
  assert.match(await dialog.innerText(), /Back \/ forward 15 seconds/u);
  assert.match(await dialog.innerText(), /Back \/ forward 30 seconds/u);
  await page.keyboard.press('Escape');
  console.log('PASS configurable shortcuts, buttons, help, and input/dialog guards');

  await page.reload();
  await page.waitForFunction(selector => document.querySelector(selector)?.readyState === 4, selector);
  await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
  assert.equal(await dialog.getByLabel('Arrow keys (← / →)', {exact: true}).inputValue(), '15');
  assert.equal(await dialog.getByLabel('Skip buttons and J / L', {exact: true}).inputValue(), '30');
  await page.keyboard.press('Escape');
  await media.evaluate(media => {media.pause(); media.currentTime = 5;});
  await expectTime(5);
  await seek.focus();
  await page.keyboard.press('ArrowLeft');
  await expectTime(0);
  await media.evaluate(media => {media.currentTime = media.duration - 5;});
  const duration = await media.evaluate(media => media.duration);
  await page.keyboard.press('ArrowRight');
  await expectTime(duration);
  assert.ok(await media.evaluate(media => media.paused), 'Seeking preserves pause state');
  console.log('PASS saved seek preferences and track boundaries');

  await page.evaluate(() => {
    localStorage.setItem('evb-player-arrow-seek-seconds', '-10');
    localStorage.setItem('evb-player-skip-seconds', 'invalid');
  });
  await page.reload();
  await page.waitForFunction(selector => document.querySelector(selector)?.readyState === 4, selector);
  await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
  assert.equal(await dialog.getByLabel('Arrow keys (← / →)', {exact: true}).inputValue(), '5');
  assert.equal(await dialog.getByLabel('Skip buttons and J / L', {exact: true}).inputValue(), '10');
  await page.keyboard.press('Escape');
  console.log('PASS invalid seek preferences restore safe defaults');
}
