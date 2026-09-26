// Records a landing film from the real app: node recorder/record.mjs [flow]
// Needs the app built at the repository root (pnpm build) and the demo courses (pnpm films:courses).
// The app runs from source with its window hidden and an isolated profile. On macOS, point
// FILM_ELECTRON at an Electron copy whose Info.plist sets LSUIElement so no Dock icon appears.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { FilmRecorder, LANDING } from './recorder.mjs';

const REPO = path.resolve(LANDING, '..');
const FILMS = path.join(REPO, '.devkit/films');
const flowName = process.argv[2] ?? 'player';
const { default: flow, title, seed, size = { width: 1280, height: 800 } } = await import(`./flows/${flowName}.mjs`);

const courses = realpathSync(path.join(FILMS, 'courses'));
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const courseId = (name) => hash(path.join(courses, name));
const lessonId = (name, relativePath) => hash(`${courseId(name)}:${relativePath}`);

const profile = path.join(FILMS, 'profile', flowName);
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
if (seed) {
    writeFileSync(path.join(profile, 'evb-player-state.json'), JSON.stringify(seed({ courses, courseId, lessonId }), null, 2));
}

const frames = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(path.join(FILMS, 'video-frames.json'), 'utf8'))).map(([file, image]) => [
        file,
        `data:image/jpeg;base64,${readFileSync(image).toString('base64')}`,
    ]),
);

const executablePath = process.env.FILM_ELECTRON ?? createRequire(path.join(REPO, 'package.json'))('electron');
const app = await electron.launch({
    executablePath,
    args: [REPO, `--user-data-dir=${profile}`],
    env: { ...process.env, EVB_PLAYER_HIDE_WINDOW: '1', EVB_PLAYER_DISABLE_UPDATES: '1' },
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
    const rec = new FilmRecorder(win, flowName, { ...size, qaDir: path.join(FILMS, 'qa') });
    await flow(win, rec, { app, courses });
    await rec.save({ title });
    // The first state as a still: shown until the player has loaded, and to visitors who prefer reduced motion.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(rec.qaDir, '00.png'),
        '-vf', `scale=${size.width * 2}:-1`, '-q:v', '3', path.join(rec.dir, 'poster.jpg')]);
} finally {
    await app.close().catch(() => {});
}
