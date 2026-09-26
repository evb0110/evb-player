import { mkdtemp, readFile, readdir, mkdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const landingDir = fileURLToPath(new URL('../', import.meta.url));
const localesDir = join(landingDir, 'i18n', 'locales');
const publicDir = join(landingDir, 'public');
const socialDir = join(publicDir, 'social');
const frameName = '06.svg';
const MAX_CARD_BYTES = 150_000;
const OUTPUT_SIZE = { width: 1200, height: 630 };
const localeArg = process.argv.slice(2);

if (localeArg.length && (localeArg.length !== 2 || localeArg[0] !== '--locale')) {
    throw new Error('Usage: node recorder/social-cards.mjs [--locale <code>]');
}

const availableLocales = (await readdir(localesDir))
    .filter((name) => extname(name) === '.json')
    .map((name) => basename(name, '.json'))
    .sort();
const selectedLocales = localeArg.length ? [localeArg[1]] : availableLocales;
if (selectedLocales.some((locale) => !availableLocales.includes(locale))) {
    throw new Error(`Unsupported locale. Available locales: ${availableLocales.join(', ')}`);
}

function readCssVariable(source, name) {
    const value = source.match(new RegExp(`--${name}:\\s*([^;]+);`, 'u'))?.[1]?.trim();
    if (!value) {
        throw new Error(`Could not find --${name} in landing/app/assets/css/main.css`);
    }
    return value;
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/gu, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

function mimeType(filePath) {
    switch (extname(filePath).toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.woff2':
            return 'font/woff2';
        default:
            throw new Error(`Unsupported social-card asset: ${filePath}`);
    }
}

async function asDataUrl(filePath) {
    const data = await readFile(filePath);
    return `data:${mimeType(filePath)};base64,${data.toString('base64')}`;
}

async function inlineFilmAssets(svg, filmDir) {
    const baseDir = resolve(filmDir);
    const references = [...svg.matchAll(/((?:xlink:)?href)="\/films\/player\/[^/"]+\/([^"]+)"/gu)];
    for (const reference of references) {
        const assetPath = resolve(baseDir, decodeURIComponent(reference[2]));
        if (!assetPath.startsWith(`${baseDir}${sep}`)) {
            throw new Error(`Film asset escapes its locale folder: ${reference[2]}`);
        }
        const dataUrl = await asDataUrl(assetPath);
        svg = svg.replaceAll(reference[0], `${reference[1]}="${dataUrl}"`);
    }
    return svg;
}

const landingCss = await readFile(join(landingDir, 'app', 'assets', 'css', 'main.css'), 'utf8');
const darkVariables = landingCss.match(/:root\.dark\s*\{([^}]+)\}/u)?.[1];
if (!darkVariables) {
    throw new Error('Could not find the dark theme variables in landing/app/assets/css/main.css');
}
const cardColors = {
    paper: readCssVariable(darkVariables, 'paper'),
    raised: readCssVariable(darkVariables, 'paper-raised'),
    ink: readCssVariable(darkVariables, 'ink'),
    muted: readCssVariable(darkVariables, 'ink-muted'),
    subtle: readCssVariable(darkVariables, 'ink-subtle'),
    line: readCssVariable(darkVariables, 'line'),
    accent: readCssVariable(darkVariables, 'accent'),
    sans: readCssVariable(landingCss.match(/:root\s*\{([^}]+)\}/u)?.[1] ?? '', 'sans'),
};

const iconDataUrl = await asDataUrl(join(publicDir, 'icon.png'));
await mkdir(socialDir, { recursive: true });
const tempDir = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'social-cards-'));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
    const page = await browser.newPage({ viewport: OUTPUT_SIZE, deviceScaleFactor: 1 });

    for (const locale of selectedLocales) {
        const localeMessages = JSON.parse(await readFile(join(localesDir, `${locale}.json`), 'utf8'));
        const tagline = localeMessages.seo.cardTagline ?? localeMessages.seo.ogDescription;
        const filmDir = join(publicDir, 'films', 'player', `${locale}-dark`);
        const manifest = JSON.parse(await readFile(join(filmDir, 'manifest.json'), 'utf8').catch(async () => {
            const filmManifests = join(landingDir, 'app', 'films', 'manifests');
            return await readFile(join(filmManifests, `player.${locale}.dark.json`), 'utf8');
        }));
        const fontFaces = await Promise.all(manifest.fonts.map(async (font) => {
            const fontUrl = await asDataUrl(join(filmDir, font.url));
            return `@font-face { font-family: "${font.family}"; src: url("${fontUrl}") format("woff2"); font-style: ${font.style}; font-weight: ${font.weight}; unicode-range: ${font.unicodeRange}; }`;
        }));
        const framePath = join(filmDir, frameName);
        let svg = await readFile(framePath, 'utf8');
        svg = svg.replace('viewBox="0 0 1280 800"', 'viewBox="0 0 1040 700"');
        svg = await inlineFilmAssets(svg, filmDir);

        const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <style>
    ${fontFaces.join('\n')}
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body { color: ${cardColors.ink}; background: ${cardColors.paper}; font-family: ${cardColors.sans}; -webkit-font-smoothing: antialiased; }
    .card { position: relative; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(circle at 81% 9%, rgb(245 160 118 / 12%), transparent 34%), ${cardColors.paper}; }
    .brand { position: absolute; z-index: 2; top: 68px; left: 76px; display: flex; align-items: center; gap: 18px; }
    .icon { display: block; width: 62px; height: 62px; border-radius: 15px; }
    .brand-name { color: ${cardColors.ink}; font-size: 31px; font-weight: 680; letter-spacing: -1.2px; }
    .brand-label { margin-top: 4px; color: ${cardColors.subtle}; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; }
    .tagline { position: absolute; z-index: 2; top: 220px; left: 80px; width: 385px; margin: 0; color: ${cardColors.ink}; font-size: 33px; font-weight: 590; line-height: 1.19; letter-spacing: -1.05px; text-wrap: pretty; }
    .accent { position: absolute; top: 474px; left: 80px; width: 48px; height: 4px; border-radius: 3px; background: ${cardColors.accent}; }
    .frame { position: absolute; top: 106px; right: 34px; width: 650px; height: 438px; overflow: hidden; border: 1px solid ${cardColors.line}; border-radius: 15px; background: ${cardColors.raised}; box-shadow: 0 22px 58px rgb(0 0 0 / 42%); }
    .frame svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <img class="icon" src="${iconDataUrl}" alt="">
      <div><div class="brand-name">EVB Player</div><div class="brand-label">${escapeHtml(localeMessages.seo.cardLabel)}</div></div>
    </div>
    <h1 class="tagline">${escapeHtml(tagline)}</h1>
    <div class="accent"></div>
    <div class="frame">${svg}</div>
  </main>
</body>
</html>`;
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
        await page.goto(dataUrl, { waitUntil: 'load' });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
            const element = document.querySelector('.tagline');
            let size = Number.parseFloat(getComputedStyle(element).fontSize);
            while (element.scrollHeight > 198 && size > 27) {
                element.style.fontSize = `${--size}px`;
            }
        });

        const tempPath = join(tempDir, `${locale}.jpg`);
        let quality = 86;
        await page.screenshot({ path: tempPath, type: 'jpeg', quality });
        while ((await stat(tempPath)).size > MAX_CARD_BYTES && quality > 60) {
            quality -= 4;
            await page.screenshot({ path: tempPath, type: 'jpeg', quality });
        }
        const bytes = (await stat(tempPath)).size;
        if (bytes > MAX_CARD_BYTES) {
            throw new Error(`${locale} social card is ${bytes} bytes, above ${MAX_CARD_BYTES}`);
        }
        await rename(tempPath, join(socialDir, `${locale}.jpg`));
        console.log(`${locale}: ${bytes} bytes`);
    }
} finally {
    await browser.close();
    await rm(tempDir, { recursive: true, force: true });
}
