// Generates the demo folders the landing films are recorded with:
// node landing/recorder/demo-media.mjs [out-dir]   (default .devkit/films)
// Video lessons are rendered slides encoded as still-image videos of realistic length, so the
// playlist shows real durations while each file stays small. Audio lessons are quiet tones.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(process.argv[2] ?? '.devkit/films');
const FOLDERS = path.join(ROOT, 'folders');
const SLIDES = path.join(ROOT, 'slides');

const typescript = {
    name: 'TypeScript Fundamentals',
    accent: '#f0784e',
    lessons: [
        ['01 Getting started', '01. Welcome', 134, 'const plan = {\n  title: "TypeScript Fundamentals",\n  parts: 12,\n  level: "beginner",\n};'],
        ['01 Getting started', '02. Setting up your editor', 408, '// tsconfig.json\n{\n  "compilerOptions": {\n    "strict": true,\n    "target": "ES2022"\n  }\n}'],
        ['01 Getting started', '03. Your first type', 485, 'let title: string = "Hello";\nlet count: number = 3;\nlet done: boolean = false;'],
        ['02 Core types', '04. Primitives and literals', 572, 'type Direction = "up" | "down";\n\nconst move = (to: Direction) =>\n  console.log(`Moving ${to}`);'],
        ['02 Core types', '05. Arrays and tuples', 461, 'const scores: number[] = [9, 7, 10];\nconst point: [number, number] = [4, 2];'],
        ['02 Core types', '06. Objects and interfaces', 680, 'interface Lesson {\n  title: string;\n  minutes: number;\n  done?: boolean;\n}'],
        ['02 Core types', '07. Unions and narrowing', 777, 'function label(id: string | number) {\n  if (typeof id === "number") {\n    return `#${id.toFixed(0)}`;\n  }\n  return id.toUpperCase();\n}'],
        ['02 Core types', '08. Q&A - common questions', 843, null],
        ['03 Going further', '09. Generics', 816, 'function first<T>(items: T[]): T | undefined {\n  return items[0];\n}\n\nconst part = first(plan.parts);'],
        ['03 Going further', '10. Utility types', 612, 'type Draft = Partial<Lesson>;\ntype Summary = Pick<Lesson, "title">;\ntype Locked = Readonly<Lesson>;'],
        ['03 Going further', '11. Modules and packages', 524, 'export function formatMinutes(m: number) {\n  return `${Math.floor(m / 60)}h ${m % 60}m`;\n}'],
        ['03 Going further', '12. Wrapping up', 185, 'const next = [\n  "Build a small project",\n  "Read the handbook",\n  "Try strict mode everywhere",\n];'],
    ],
};

const sql = {
    name: 'Practical SQL',
    accent: '#91c5b1',
    lessons: [
        ['', '01. Why SQL still matters', 245, 'SELECT title, minutes\nFROM tracks\nORDER BY minutes DESC;'],
        ['', '02. Filtering rows', 512, 'SELECT *\nFROM tracks\nWHERE minutes > 10\n  AND done = false;'],
        ['', '03. Joining tables', 734, 'SELECT p.name, t.title\nFROM playlists p\nJOIN tracks t ON t.playlist_id = p.id;'],
        ['', '04. Grouping and aggregates', 618, 'SELECT playlist_id, COUNT(*)\nFROM tracks\nGROUP BY playlist_id;'],
        ['', '05. Indexes', 689, 'CREATE INDEX tracks_playlist_idx\n  ON tracks (playlist_id);'],
        ['', '06. Transactions', 571, 'BEGIN;\nUPDATE tracks SET done = true WHERE id = 7;\nCOMMIT;'],
    ],
};

const spanish = {
    name: 'Spanish Listening Practice',
    lessons: [
        ['01. En el mercado', 402],
        ['02. Una llamada', 365],
        ['03. El tiempo', 318],
        ['04. Direcciones', 447],
        ['05. En el restaurante', 521],
        ['06. Planes para el fin de semana', 489],
        ['07. En la estación', 356],
        ['08. Repaso', 612],
    ],
};

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A small hand-rolled highlighter: comments, strings, keywords and numbers. */
function highlight(code) {
    return escape(code)
        .replace(/(\/\/[^\n]*)/g, '<i class="c">$1</i>')
        .replace(/("[^"\n]*"|`[^`\n]*`)/g, '<i class="s">$1</i>')
        .replace(/\b(const|let|function|return|if|type|interface|export|typeof|SELECT|FROM|WHERE|AND|ORDER BY|DESC|JOIN|ON|GROUP BY|CREATE INDEX|BEGIN|UPDATE|SET|COMMIT)\b/g, '<i class="k">$1</i>')
        .replace(/\b(\d+)\b/g, '<i class="n">$1</i>');
}

function slide(folder, title, code) {
    const [number, ...words] = title.split('. ');
    return `<!doctype html><html><head><style>
        * { margin: 0; box-sizing: border-box; }
        body { width: 1280px; height: 720px; display: grid; grid-template-columns: 1fr 1.25fr; gap: 56px; align-items: center;
            padding: 72px 80px; font-family: -apple-system, "Segoe UI", Inter, sans-serif; color: #f3efe7;
            background: radial-gradient(circle at 18% 20%, #2c3439 0%, #171c1f 58%, #111416 100%); }
        .kicker { font: 600 15px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .18em; color: ${folder.accent}; }
        h1 { margin-top: 22px; font-size: 50px; line-height: 1.08; font-weight: 700; letter-spacing: -.02em; }
        .folder { margin-top: 26px; font-size: 18px; color: #9aa3a8; }
        .bar { margin-top: 34px; width: 72px; height: 5px; border-radius: 3px; background: ${folder.accent}; }
        pre { padding: 34px 36px; border-radius: 18px; background: #0d1012; border: 1px solid #2a3135;
            font: 22px/1.55 ui-monospace, "SF Mono", Menlo, monospace; color: #e8e4da; white-space: pre; box-shadow: 0 30px 60px rgb(0 0 0 / 35%); }
        i { font-style: normal; } .k { color: #f0784e; } .s { color: #91c5b1; } .n { color: #e6c07b; } .c { color: #6b757a; }
    </style></head><body>
        <div><div class="kicker">LESSON ${number}</div><h1>${escape(words.join('. '))}</h1><div class="folder">${escape(folder.name)}</div><div class="bar"></div></div>
        <pre>${highlight(code)}</pre>
    </body></html>`;
}

function ffmpeg(args) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}

function encodeStill(png, seconds, file) {
    ffmpeg(['-loop', '1', '-framerate', '1', '-i', png, '-t', String(seconds), '-c:v', 'libx264', '-tune', 'stillimage',
        '-preset', 'veryslow', '-crf', '30', '-pix_fmt', 'yuv420p', '-r', '1', '-movflags', '+faststart', file]);
}

function encodeAudio(seconds, file, frequency) {
    ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=8000`, '-af', 'volume=0.02', '-t', String(seconds),
        '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '8k', file]);
}

rmSync(FOLDERS, { recursive: true, force: true });
rmSync(SLIDES, { recursive: true, force: true });
mkdirSync(SLIDES, { recursive: true });
// Installed Chrome, so no Playwright browser download is needed.
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const frames = {};
for (const folder of [typescript, sql]) {
    for (const [section, title, seconds, code] of folder.lessons) {
        const dir = path.join(FOLDERS, folder.name, section);
        mkdirSync(dir, { recursive: true });
        if (!code) {
            encodeAudio(seconds, path.join(dir, `${title}.mp3`), 220);
            continue;
        }
        const png = path.join(SLIDES, `${folder.name} - ${title}.png`);
        await page.setContent(slide(folder, title, code));
        await page.screenshot({ path: png });
        encodeStill(png, seconds, path.join(dir, `${title}.mp4`));
        // The films show a JPEG of the slide, which is a fraction of the PNG's size.
        const jpg = png.replace(/\.png$/, '.jpg');
        await page.screenshot({ path: jpg, type: 'jpeg', quality: 86 });
        frames[`${title}.mp4`] = jpg;
    }
}
await browser.close();
for (const [title, seconds] of spanish.lessons) {
    const dir = path.join(FOLDERS, spanish.name);
    mkdirSync(dir, { recursive: true });
    encodeAudio(seconds, path.join(dir, `${title}.mp3`), 180 + (seconds % 60));
}
// The recorder draws these slides in place of the <video> element, keyed by file name.
writeFileSync(path.join(ROOT, 'video-frames.json'), JSON.stringify(frames, null, 2));
console.log(`Demo folders in ${FOLDERS}`);
