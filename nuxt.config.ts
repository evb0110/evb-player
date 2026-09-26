import {fileURLToPath} from 'node:url';

const isBrowserBuild = process.env.EVB_PLAYER_WEB === '1';

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  devtools: {enabled: false},
  ui: {colorMode: false},
  // Ship every icon inside the app. The default provider for ssr: false fetches icons from the Iconify API at runtime.
  icon: {
    provider: 'none',
    clientBundle: {scan: {globInclude: ['app/**/*.{vue,ts}', 'shared/ui/**/*.{vue,ts}', 'shared/i18n/locales.ts']}},
  },
  compatibilityDate: '2026-09-22',
  app: {
    baseURL: process.env.EVB_PLAYER_WEB === '1' || process.env.EVB_PLAYER_DEV_SERVER_URL || process.env.NODE_ENV === 'development' ? '/' : './',
    head: {
      title: 'EVB Player',
      link: [{rel: 'icon', type: 'image/png', href: './favicon.png'}],
      meta: [
        {name: 'viewport', content: 'width=device-width, initial-scale=1'},
        {name: 'theme-color', content: '#101214'},
      ],
      // The desktop preload provides the theme the main process chose, so the first frame paints in it.
      // The browser version's server renders the class instead.
      script: isBrowserBuild ? [] : [{innerHTML: "document.documentElement.classList.add(window.evbPlayerInitialTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))"}],
    },
  },
  nitro: {
    preset: isBrowserBuild ? 'vercel' : 'static',
    plugins: isBrowserBuild ? [fileURLToPath(new URL('./server/browser-shell.ts', import.meta.url))] : [],
    // Vercel serves a Build Output API directory as built, so response headers belong here rather than in vercel.json.
    routeRules: isBrowserBuild ? {'/**': {headers: {'x-content-type-options': 'nosniff'}}} : {},
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
});
