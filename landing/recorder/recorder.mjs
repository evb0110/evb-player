// Records a real app flow as SVG states plus a manifest for the RealFilm composition.
// Each snap() captures the live DOM with dom-to-svg (see capture-dom.js). Adapted from the
// evb-stack portfolio films.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LANDING = path.resolve(HERE, '..');

const bundle = (await build({ entryPoints: [path.join(HERE, 'd2s-entry.js')], bundle: true, write: false, format: 'iife' })).outputFiles[0].text;
const captureDom = readFileSync(path.join(HERE, 'capture-dom.js'), 'utf8');

/** Drops dom-to-svg bookkeeping attributes and ids nobody references. */
function clean(svg) {
    const used = new Set([...svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((m) => m[1]));
    let out = svg
        .replace(/<!--[\s\S]*?-->/g, '')
        // Fonts are served from the film folder (manifest), not the original app.
        .replace(/<style>[\s\S]*?<\/style>|<style\/>/g, '')
        .replace(/<text\b[^>]*?fill="rgba\(0, 0, 0, 0\)"[^>]*?(?:\/>|>[\s\S]*?<\/text>)/g, '')
        .replace(
            /\s(?:color="[^"]*"|font-size-adjust="none"|font-stretch="100%"|font-variant="normal"|font-style="normal"|direction="ltr"|letter-spacing="normal"|text-decoration="none"|text-rendering="[^"]*"|unicode-bidi="normal"|word-spacing="0px"|writing-mode="horizontal-tb"|user-select="[^"]*"|text-anchor="start"|aria-[a-z]+="[^"]*"|tabindex="[^"]*")/g,
            '',
        )
        .replace(/\s(?:data-[a-z-]+|aria-owns|aria-hidden|role|class)="[^"]*"/g, '')
        .replace(/\sid="([^"]+)"/g, (all, id) => (used.has(id) ? all : ''))
        .replace(/<text\b[^>]*?\/>|<text\b[^>]*>\s*<\/text>/g, '');
    for (let pass = 0; pass < 4; pass++) out = out.replace(/(?:<g>\s*<\/g>|<g\/>)+/g, '');
    return out;
}

export class FilmRecorder {
    /**
     * @param {import('playwright-core').Page} page
     * @param {string} film film id, also the folder name under public/films
     * @param {{ width?: number, height?: number, qaDir: string }} options
     */
    constructor(page, film, { width = 1280, height = 800, qaDir }) {
        this.page = page;
        this.film = film;
        this.width = width;
        this.height = height;
        this.steps = [];
        this.families = new Set();
        this.dir = path.join(LANDING, 'public/films', film);
        this.qaDir = path.join(qaDir, film);
        rmSync(this.dir, { recursive: true, force: true });
        rmSync(this.qaDir, { recursive: true, force: true });
        mkdirSync(this.dir, { recursive: true });
        mkdirSync(this.qaDir, { recursive: true });
    }

    /** Moves large embedded raster images into shared files (deduplicated by content hash). */
    externalise(svg) {
        return svg.replace(/(href|xlink:href)="data:image\/(png|jpeg|webp);base64,([^"]+)"/g, (all, attr, type, b64) => {
            if (b64.length < 16000) return all;
            const hash = createHash('sha1').update(b64).digest('hex').slice(0, 12);
            const file = `img-${hash}.${type === 'jpeg' ? 'jpg' : type}`;
            const target = path.join(this.dir, file);
            if (!existsSync(target)) writeFileSync(target, Buffer.from(b64, 'base64'));
            return `${attr}="/films/${this.film}/${file}"`;
        });
    }

    /** Centre of the first element matching the locator, in viewport pixels. */
    async center(locator) {
        const box = await locator.first().boundingBox();
        return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
    }

    /** Bounding rect with padding, clamped to the viewport. */
    async rect(locator, pad = 24) {
        const b = await locator.first().boundingBox();
        const x = Math.max(0, b.x - pad);
        const y = Math.max(0, b.y - pad);
        return [Math.round(x), Math.round(y), Math.round(Math.min(this.width - x, b.width + pad * 2)), Math.round(Math.min(this.height - y, b.height + pad * 2))];
    }

    /**
     * Captures the current page state.
     * @param {object} o
     * @param {number} [o.dur] frames this state is shown (30 fps)
     * @param {'cut' | 'fade' | 'dip'} [o.transition] how this state replaces the previous one
     * @param {number} [o.fade] transition frames
     * @param {[number, number]} [o.cursor] where the pointer rests during this state
     * @param {boolean} [o.click] click ripple at the end of this state
     * @param {[number, number, number, number]} [o.focus] camera rect for this state
     * @param {[[number, number, number, number], [number, number, number, number]]} [o.pan] camera pan from/to
     */
    async snap({ dur = 30, fade = 8, transition, cursor, click = false, focus, pan } = {}) {
        const index = this.steps.length;
        const name = `${String(index).padStart(2, '0')}.svg`;
        // Reference screenshot of the untouched page, for review and the poster.
        await this.page.screenshot({ path: path.join(this.qaDir, `${String(index).padStart(2, '0')}.png`) }).catch(() => {});
        await this.page.evaluate(`${bundle};true`);
        await this.page.evaluate(`${captureDom};true`);
        const result = await this.page.evaluate((opts) => window.__filmCapture(opts), {
            width: this.width,
            height: this.height,
            prefix: `${this.film}-${index}-`,
            fullPage: false,
        });
        if (result.canvasInfo.some((info) => info.startsWith('video without'))) console.warn(`  #${index}`, result.canvasInfo.join(' '));
        const body = this.externalise(clean(result.svg));
        // Reuse an identical earlier state (ids are namespaced per state, so compare without prefixes).
        const key = body.replaceAll(`${this.film}-${index}-`, '');
        this.seen ??= new Map();
        let file = this.seen.get(key);
        if (!file) {
            file = name;
            this.seen.set(key, name);
            writeFileSync(path.join(this.dir, name), body);
        }
        for (const f of result.families) this.families.add(f);
        this.background ??= result.background;
        this.steps.push({
            svg: file,
            dur,
            transition: transition ?? 'cut',
            fade,
            cursor: cursor ?? null,
            click,
            focus: focus ?? null,
            pan: pan ?? null,
            height: result.height,
            caret: null,
        });
    }

    /** Copies the @font-face files used by the captured SVGs, fetched from inside the app. */
    async collectFonts() {
        const wanted = [...this.families].flatMap((f) => f.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')));
        const faces = await this.page.evaluate(async (names) => {
            const out = [];
            const visit = (rules, base) => {
                for (const rule of rules) {
                    if (rule instanceof CSSFontFaceRule) {
                        const family = rule.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '');
                        const unicodeRange = rule.style.getPropertyValue('unicode-range') || undefined;
                        // Latin and Latin Extended cover every string the films show. Chrome serialises
                        // ranges in short form (U+0-FF), so leading zeros are optional.
                        if (!names.includes(family) || (unicodeRange && !/U\+0+-0*FF\b|U\+0*100-/i.test(unicodeRange))) continue;
                        const match = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/);
                        if (!match) continue;
                        out.push({
                            family,
                            url: new URL(match[1], base).href,
                            weight: rule.style.getPropertyValue('font-weight') || '400',
                            style: rule.style.getPropertyValue('font-style') || 'normal',
                            unicodeRange,
                        });
                    } else if (rule.cssRules) {
                        visit(rule.cssRules, base);
                    }
                }
            };
            for (const sheet of document.styleSheets) {
                try {
                    visit(sheet.cssRules, sheet.href || location.href);
                } catch {
                    // Cross-origin stylesheet.
                }
            }
            for (const face of out) {
                const bytes = new Uint8Array(await (await fetch(face.url)).arrayBuffer());
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                face.base64 = btoa(binary);
            }
            return out;
        }, wanted);
        mkdirSync(path.join(this.dir, 'fonts'), { recursive: true });
        return faces.map(({ base64, url, ...face }, i) => {
            const file = `fonts/${i}${path.extname(new URL(url).pathname) || '.woff2'}`;
            writeFileSync(path.join(this.dir, file), Buffer.from(base64, 'base64'));
            return { ...face, url: file };
        });
    }

    async save({ title }) {
        const fonts = await this.collectFonts();
        const manifest = { film: this.film, title, width: this.width, height: this.height, background: this.background ?? '#ffffff', fonts, steps: this.steps };
        const out = path.join(LANDING, 'app/films/manifests', `${this.film}.json`);
        mkdirSync(path.dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(manifest, null, 1)}\n`);
        const frames = this.steps.reduce((n, s) => n + s.dur, 0);
        console.log(`${this.film}: ${this.steps.length} states, ${frames} frames (${(frames / 30).toFixed(1)} s), ${fonts.length} font files`);
    }
}
