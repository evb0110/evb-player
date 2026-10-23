import assert from 'node:assert/strict';
import {join} from 'node:path';

// Run against seeded long names in the real library, including an unbroken name.
export async function testLibraryLayout(application, page, screenshotDirectory) {
  await page.getByRole('button', {name: 'Library', exact: true}).click();
  await page.getByRole('button', {name: 'Table', exact: true}).click();
  await page.locator('.folder-table-name').first().waitFor();
  const originalSize = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getContentSize());
  const originalMinimum = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getMinimumSize());
  try {
    for (const width of [1984, 1280, 800, 540]) {
      await application.evaluate(({BrowserWindow}, width) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setMinimumSize(0, 0);
        window.setContentSize(width, 800);
      }, width);
      await page.waitForFunction(width => window.innerWidth === width, width);
      await page.evaluate(() => document.fonts.ready);
      if (screenshotDirectory) await page.screenshot({path: join(screenshotDirectory, `library-${width}.png`)});
      const names = page.locator('.folder-table-name');
      for (const name of await names.all()) {
        const bounds = await name.evaluate(element => {
          const cell = element.closest('td').getBoundingClientRect();
          const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let right = element.querySelector('.iconify').getBoundingClientRect().right;
          while (textNodes.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(textNodes.currentNode);
            let textRight = range.getBoundingClientRect().right;
            for (let ancestor = textNodes.currentNode.parentElement; ancestor && ancestor.tagName !== 'TD'; ancestor = ancestor.parentElement) {
              if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) {
                textRight = Math.min(textRight, ancestor.getBoundingClientRect().right);
              }
            }
            right = Math.max(right, textRight);
          }
          return {right, cellRight: cell.right, iconWidth: element.querySelector('.iconify').getBoundingClientRect().width};
        });
        assert.ok(bounds.right <= bounds.cellRight + 1, `Folder name overlaps the next column at ${width}px: ${JSON.stringify(bounds)}`);
        assert.equal(bounds.iconWidth, 16, 'Folder icon keeps its size');
      }
      const longName = names.filter({hasText: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}).first();
      const label = longName.locator('.folder-table-name-label');
      await label.hover();
      const title = await label.getAttribute('title');
      assert.equal(title, (await longName.innerText()).trim(), 'Clipped names remain readable in a tooltip');
      console.log(`PASS folder list contains long names and preserves tooltips at ${width}px`);
    }
  } finally {
    await application.evaluate(({BrowserWindow}, {originalSize, originalMinimum}) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(...originalSize);
      window.setMinimumSize(...originalMinimum);
    }, {originalSize, originalMinimum});
  }
}
