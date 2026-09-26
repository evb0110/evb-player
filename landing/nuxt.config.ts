import { transform } from 'esbuild';
import { LOCALE_OPTIONS } from './app/i18n/languages';

const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://evb-player.vercel.app';

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-09-22',
  ui: { fonts: false },
  colorMode: { preference: 'system', fallback: 'light' },
  // Icons ship with the page instead of loading from the Iconify API.
  icon: {
    provider: 'none',
    clientBundle: { scan: { globInclude: ['app/**/*.{vue,ts}'] } },
    serverBundle: 'local',
  },
  runtimeConfig: {
    public: { siteUrl },
  },
  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/png', href: '/favicon.png' }],
      meta: [
        { name: 'theme-color', content: '#f4f1ea', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#17150f', media: '(prefers-color-scheme: dark)' },
      ],
    },
  },
  // The page embeds the latest release; Vercel regenerates it at most every ten minutes.
  routeRules: {
    '/': { isr: 600 },
    ...Object.fromEntries(LOCALE_OPTIONS.flatMap(({ code }) => code === 'en' ? [] : [
      [`/${code}`, { isr: 600 }],
      [`/${code}/**`, { isr: 600 }],
    ])),
    '/films/**': { headers: { 'cache-control': 'public, max-age=86400' } },
  },
  i18n: {
    restructureDir: 'i18n',
    locales: LOCALE_OPTIONS.map(({ code, name }) => ({ code, language: code, name, file: `${code}.json` })),
    defaultLocale: 'en',
    langDir: 'locales',
    strategy: 'prefix_except_default',
    baseUrl: siteUrl,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      cookieSecure: process.env.NODE_ENV === 'production',
      redirectOn: 'root',
    },
  },
  vite: {
    // Films in app/films are React (Remotion); keep Vue's JSX plugin away from them.
    vueJsx: { exclude: [/app\/films\//] },
    plugins: [
      {
        name: 'films-react-jsx',
        enforce: 'pre',
        async transform(code, id) {
          if (!/app\/films\/.*\.tsx$/.test(id)) {
            return null;
          }
          // An empty tsconfig: the nearest one on disk belongs to the Electron app and extends its .nuxt folder.
          const result = await transform(code, {
            loader: 'tsx',
            jsx: 'automatic',
            jsxImportSource: 'react',
            sourcefile: id,
            sourcemap: true,
            tsconfigRaw: {},
          });
          return { code: result.code, map: result.map };
        },
      },
    ],
  },
  typescript: { strict: true },
});
