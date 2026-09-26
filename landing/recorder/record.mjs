// Records landing films from the real app. By default the player flow records every locale/theme pair.
// Needs the app built at the repository root (pnpm build) and demo folders (pnpm films:demo).
// On macOS, point FILM_ELECTRON at an Electron copy whose Info.plist sets LSUIElement.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { FilmRecorder, LANDING } from './recorder.mjs';

const REPO = path.resolve(LANDING, '..');
const FILMS = path.join(REPO, '.devkit/films');
const args = process.argv.slice(2);
const flowName = args[0] && !args[0].startsWith('--') ? args.shift() : 'player';
const { default: flow, title, seed, size = { width: 1280, height: 800 } } = await import(`./flows/${flowName}.mjs`);
const locales = ['en', 'ru', 'fr', 'de', 'es', 'it', 'pt', 'pt-BR', 'nl'];
const themes = ['light', 'dark'];

let localeFilter;
let themeFilter;
for (let index = 0; index < args.length; index++) {
    const option = args[index];
    const value = args[index + 1];
    if (option === '--locale' && value) {
        localeFilter = value;
        index++;
    } else if (option === '--theme' && value) {
        themeFilter = value;
        index++;
    } else if (option === '--help') {
        console.log('Usage: node recorder/record.mjs [flow] [--locale <code>] [--theme <light|dark>]');
        process.exit(0);
    } else {
        throw new Error(`Unknown option: ${option}`);
    }
}
if (localeFilter && !locales.includes(localeFilter)) {
    throw new Error(`Unsupported locale: ${localeFilter}. Choose ${locales.join(', ')}.`);
}
if (themeFilter && !themes.includes(themeFilter)) {
    throw new Error(`Unsupported theme: ${themeFilter}. Choose light or dark.`);
}

const folders = realpathSync(path.join(FILMS, 'folders'));
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const folderId = (name) => hash(path.join(folders, name));
const lessonId = (name, relativePath) => hash(`${folderId(name)}:${relativePath}`);
const variants = (localeFilter ? [localeFilter] : locales).flatMap((locale) =>
    (themeFilter ? [themeFilter] : themes).map((theme) => ({ locale, theme })),
);

const frames = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(path.join(FILMS, 'video-frames.json'), 'utf8'))).map(([file, image]) => [
        file,
        `data:image/jpeg;base64,${readFileSync(image).toString('base64')}`,
    ]),
);
const executablePath = process.env.FILM_ELECTRON ?? createRequire(path.join(REPO, 'package.json'))('electron');

for (const { locale, theme } of variants) {
    const variant = `${locale}-${theme}`;
    const profile = path.join(FILMS, 'profile', flowName, variant);
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(profile, { recursive: true });
    if (seed) {
        writeFileSync(path.join(profile, 'evb-player-state.json'), JSON.stringify(seed({ folders, folderId, lessonId }), null, 2));
    }
    writeFileSync(path.join(profile, 'evb-player-settings.json'), JSON.stringify({ theme, locale }, null, 2));

    console.log(`Recording ${flowName}: ${locale} / ${theme}`);
    const app = await electron.launch({
        executablePath,
        args: [REPO, `--user-data-dir=${profile}`],
        // A hidden Wayland window gets no frames, so Linux recordings show it inside a nested compositor.
        env: { ...process.env, EVB_PLAYER_HIDE_WINDOW: process.env.FILM_SHOW_WINDOW === '1' ? '0' : '1', EVB_PLAYER_DISABLE_UPDATES: '1' },
        timeout: 60_000,
    });
    try {
        const win = await app.firstWindow();
        await app.evaluate(({ BrowserWindow }, { width, height }) => {
            BrowserWindow.getAllWindows()[0].setContentSize(width, height);
        }, size);
        await win.waitForLoadState('load');
        await win.waitForTimeout(1500);
        await win.evaluate((map) => {
            window.__filmVideoFrames = map;
        }, frames);
        const rec = new FilmRecorder(win, flowName, {
            ...size,
            qaDir: path.join(FILMS, 'qa'),
            locale,
            theme,
        });
        await flow(win, rec, { app, folders });
        await rec.save({ title });
        // The first state as a still: shown until the player has loaded, and to visitors who prefer reduced motion.
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(rec.qaDir, '00.png'),
            '-vf', `scale=${size.width * 2}:-1`, '-q:v', '3', path.join(rec.dir, 'poster.jpg')]);
    } finally {
        await app.close().catch(() => {});
    }
}
