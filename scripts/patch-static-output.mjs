import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const outputDir = join(process.cwd(), '.output', 'public');
const htmlFiles = ['index.html', '200.html', '404.html'];

for (const fileName of htmlFiles) {
  const filePath = join(outputDir, fileName);
  let html = await readFile(filePath, 'utf8');

  // Nuxt's static runtime normalises './' to '/', which is correct for a web
  // host but breaks the file:// renderer used by the packaged Electron app.
  html = html
    .replaceAll('"/_nuxt/', '"./_nuxt/')
    .replaceAll("'/_nuxt/", "'./_nuxt/")
    .replace('baseURL:"/"', 'baseURL:"./"')
    .replace('buildAssetsDir:"/_nuxt/"', 'buildAssetsDir:"_nuxt/"');

  await writeFile(filePath, html);
}
