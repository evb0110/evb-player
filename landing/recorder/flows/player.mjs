// Main landing film: open a course from the Library, play, mark an unwatched lesson complete,
// switch lessons, go full window, and return to the Library while the lesson keeps playing.
export const title = 'EVB Player';
export const size = { width: 1280, height: 800 };

const TS = 'TypeScript Fundamentals';
const SQL = 'Practical SQL';
const SPANISH = 'Spanish Listening Practice';
const TS_LESSONS = [
    '01 Getting started/01. Welcome to the course.mp4',
    '01 Getting started/02. Setting up your editor.mp4',
    '01 Getting started/03. Your first type.mp4',
];

/** Three courses in the Library, each with some progress; the TypeScript course resumes lesson 3. */
export function seed({ courses, courseId, lessonId }) {
    const done = (updatedAt, duration) => ({ position: duration, duration, completed: true, updatedAt });
    return {
        recentCourses: [
            { id: courseId(TS), name: TS, rootPath: `${courses}/${TS}`, mediaCount: 12, lastOpenedAt: 3 },
            { id: courseId(SQL), name: SQL, rootPath: `${courses}/${SQL}`, mediaCount: 6, lastOpenedAt: 2 },
            { id: courseId(SPANISH), name: SPANISH, rootPath: `${courses}/${SPANISH}`, mediaCount: 8, lastOpenedAt: 1 },
        ],
        progress: {
            [courseId(TS)]: {
                [lessonId(TS, TS_LESSONS[0])]: done(1, 134),
                [lessonId(TS, TS_LESSONS[1])]: done(2, 408),
                [lessonId(TS, TS_LESSONS[2])]: { position: 190, duration: 485, completed: false, updatedAt: 3 },
            },
            [courseId(SQL)]: {
                [lessonId(SQL, '01. Why SQL still matters.mp4')]: done(1, 245),
                [lessonId(SQL, '02. Filtering rows.mp4')]: done(2, 512),
            },
        },
        lastCoursePath: null,
    };
}

export default async function flow(win, rec, { courses }) {
    // Show home-relative folder paths instead of this machine's scratch folder.
    const tidy = () => win.evaluate((root) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeValue.includes(root)) node.nodeValue = node.nodeValue.replaceAll(root, '~/Courses');
        }
    }, courses);
    const snap = async (options) => {
        await tidy();
        await rec.snap(options);
    };

    const card = win.locator('.course-card-open', { hasText: TS });
    await card.waitFor();
    await win.mouse.move(640, 620);
    await snap({ dur: 40, cursor: [640, 620] });
    await snap({ dur: 22, cursor: await rec.center(card), click: true });
    await card.click();

    // The course resumes lesson 3 at 3:10.
    const stage = win.locator('.player-stage');
    await stage.waitFor();
    await win.waitForFunction(() => {
        const media = document.querySelector('video');
        return media && media.readyState >= 1 && media.currentTime > 180;
    });
    await win.waitForTimeout(600);
    const play = stage.getByRole('button', { name: 'Play', exact: true });
    await snap({ dur: 46, transition: 'dip', fade: 12, cursor: [560, 470] });
    await snap({ dur: 20, cursor: await rec.center(play), click: true });
    await play.click();
    await win.waitForTimeout(1300);
    await snap({ dur: 44 });

    // Mark lesson 4 complete without watching it: zoom into the playlist.
    const playlist = await rec.rect(win.locator('.playlist-panel'), 12);
    const row = await rec.rect(win.locator('.lesson-row', { hasText: 'Primitives and literals' }), 0);
    // A 1.6:1 frame around the row, kept inside the window.
    const rowCenter = Math.round(row[1] + row[3] / 2);
    const zoom = [Math.min(playlist[0] - 90, size.width - 500), rowCenter - 156, 500, 312];
    const markDone = win.getByRole('button', { name: 'Mark Primitives and literals as complete' });
    await markDone.hover();
    await win.waitForTimeout(250);
    await snap({ dur: 34, cursor: await rec.center(markDone), focus: zoom });
    await snap({ dur: 12, cursor: await rec.center(markDone), click: true, focus: zoom });
    await markDone.click();
    await win.mouse.move(820, 520);
    await win.waitForTimeout(400);
    await snap({ dur: 44, cursor: [playlist[0] + playlist[2] - 70, rowCenter + 64], focus: zoom });

    // Switch to lesson 6; it starts playing.
    const next = win.locator('.lesson-row-select', { hasText: 'Objects and interfaces' });
    await snap({ dur: 22, cursor: await rec.center(next), click: true });
    await next.click();
    await win.waitForFunction(() => {
        const media = document.querySelector('video');
        return media && !media.paused && media.currentTime > 0.8 && decodeURIComponent(media.currentSrc).includes('Objects and interfaces');
    });
    await snap({ dur: 50, cursor: await rec.center(next) });

    // Full window, then its idle state once the controls hide.
    await stage.hover();
    const fullWindow = win.getByRole('button', { name: 'Full window' });
    await snap({ dur: 22, cursor: await rec.center(fullWindow), click: true });
    await fullWindow.click();
    await win.waitForTimeout(500);
    await snap({ dur: 36, transition: 'fade', fade: 10, cursor: [700, 420] });
    await win.waitForSelector('.player-stage-controls-hidden', { timeout: 6000 });
    await win.waitForTimeout(400);
    await snap({ dur: 56, transition: 'fade', fade: 14 });
    await win.keyboard.press('Escape');
    await win.waitForTimeout(500);

    // Back to the Library: the lesson keeps playing in the compact player.
    const libraryTab = win.getByRole('button', { name: 'Library', exact: true });
    await snap({ dur: 30, cursor: await rec.center(libraryTab), click: true });
    await libraryTab.click();
    await win.locator('.library-player').waitFor();
    await win.waitForTimeout(800);
    await snap({ dur: 70, transition: 'dip', fade: 12, cursor: [760, 520] });
}
