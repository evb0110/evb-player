// Show the full text as a native tooltip on any text element that is clipped
// (ellipsis, line clamp, or hidden overflow), so truncated labels stay readable.
const AUTO_TITLE = 'data-auto-title';
const MAX_ANCESTOR_DEPTH = 3;
const CLIPPING_OVERFLOW = new Set(['hidden', 'clip']);

function hasOwnText(element: HTMLElement) {
  return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
}

function isClipped(element: HTMLElement) {
  const style = getComputedStyle(element);
  if (!CLIPPING_OVERFLOW.has(style.overflowX) && !CLIPPING_OVERFLOW.has(style.overflowY)) {
    return false;
  }
  return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
}

function syncTitle(element: HTMLElement) {
  const isAuto = element.hasAttribute(AUTO_TITLE);
  if (element.hasAttribute('title') && !isAuto) {
    return;
  }
  const text = element.textContent?.trim() ?? '';
  if (text && isClipped(element)) {
    element.setAttribute('title', text);
    element.setAttribute(AUTO_TITLE, '');
  } else if (isAuto) {
    element.removeAttribute('title');
    element.removeAttribute(AUTO_TITLE);
  }
}

export default defineNuxtPlugin(() => {
  document.addEventListener('pointerover', (event) => {
    let element = event.target instanceof HTMLElement ? event.target : null;
    for (let depth = 0; element && depth < MAX_ANCESTOR_DEPTH; depth++) {
      if (hasOwnText(element)) {
        syncTitle(element);
      }
      element = element.parentElement;
    }
  }, {passive: true});
});
