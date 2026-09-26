import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const outputDir = join(process.cwd(), '.output', 'public');
// A static preset keeps the output in .output/public; on Vercel, Nitro would otherwise pick vercel-static and write .vercel/output.
const webEnvironment = {...process.env, EVB_PLAYER_WEB: '1', NITRO_PRESET: 'static'};

for (const [command, arguments_] of [
  ['nuxi', ['generate']],
  [process.execPath, ['scripts/check-icons.mjs']],
]) {
  const result = spawnSync(command, arguments_, {
    env: webEnvironment,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'nuxi',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Nuxt inlines its import map, runtime config and color-mode script. Each page gets a CSP meta tag that allows
// exactly those scripts by hash, so script-src never needs 'unsafe-inline'. vercel.json adds the header-only
// directives. Inline styles stay allowed because the UI sets style attributes at runtime.
for (const name of (await readdir(outputDir)).filter((file) => file.endsWith('.html'))) {
  const path = join(outputDir, name);
  const html = await readFile(path, 'utf8');
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/gu)]
    .map(([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
  ].join('; ');
  await writeFile(path, html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`));
}
