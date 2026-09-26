// The app renders icons from the client bundle only (icon.provider = 'none' in nuxt.config.ts),
// so an icon that the build cannot see or resolve renders blank. This check runs after
// `nuxi generate` and fails the build when an icon name is assembled at runtime, does not exist
// in its installed @iconify-json collection, or is missing from the generated client bundle.
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join, relative} from 'node:path';

const root = process.argv[2] ?? process.cwd();
const sourceDir = join(root, 'app');
const bundleDir = join(root, '.output', 'public', '_nuxt');
const require = createRequire(join(process.cwd(), 'package.json'));

const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
const collections = new Map();
for (const name of Object.keys({...packageJson.dependencies, ...packageJson.devDependencies})) {
  if (name.startsWith('@iconify-json/')) {
    const data = require(`${name}/icons.json`);
    collections.set(data.prefix, new Set([...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})]));
  }
}
// Longest prefix first so that `i-lucide-lab-x` never resolves as `lucide:lab-x`.
const prefixes = [...collections.keys()].sort((a, b) => b.length - a.length);
const prefixPattern = prefixes.join('|');

async function listFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true, recursive: true});
  return entries.filter((entry) => entry.isFile() && /\.(vue|ts)$/u.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

const problems = [];
const used = new Map();
for (const file of await listFiles(sourceDir)) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    const location = `${relative(root, file)}:${index + 1}`;
    if (new RegExp(`\\bi-(?:${prefixPattern})-[a-z0-9-]*(?:\\$\\{|['"\`]\\s*\\+)`, 'u').test(line)) {
      problems.push(`${location}: icon name is assembled at runtime, so it cannot be bundled. Write each full icon name as a literal.`);
    }
    for (const match of line.matchAll(new RegExp(`\\bi-(${prefixPattern})-([a-z0-9]+(?:-[a-z0-9]+)*)\\b`, 'gu'))) {
      const icon = `${match[1]}:${match[2]}`;
      if (!used.has(icon)) used.set(icon, location);
    }
  });
}

const bundled = new Set();
for (const file of (await readdir(bundleDir)).filter((name) => name.endsWith('.js'))) {
  const source = await readFile(join(bundleDir, file), 'utf8');
  for (const chunk of source.split('{"prefix":"').slice(1)) {
    const prefix = chunk.slice(0, chunk.indexOf('"'));
    for (const match of chunk.matchAll(/"([a-z0-9-]+)":\{"(?:width|height|body|parent)"/gu)) {
      bundled.add(`${prefix}:${match[1]}`);
    }
  }
}
if (!bundled.size) {
  problems.push(`${relative(root, bundleDir)}: no bundled icon collection found. Run this after \`nuxi generate\`.`);
}

for (const [icon, location] of used) {
  const [prefix, name] = icon.split(':');
  if (!collections.get(prefix)?.has(name)) {
    problems.push(`${location}: ${icon} does not exist in @iconify-json/${prefix}.`);
  } else if (bundled.size && !bundled.has(icon)) {
    problems.push(`${location}: ${icon} is missing from the client bundle and would render blank.`);
  }
}

if (problems.length) {
  console.error(`Icon check failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Icon check passed: ${used.size} icons used in app/, all bundled.`);
