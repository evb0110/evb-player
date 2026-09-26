import { transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { LOCALE_OPTIONS } from '../shared/i18n/locales';

const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://evb-player.vercel.app';
const sourceTsconfig = fileURLToPath(new URL('./tsconfig.json', import.meta.url));

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-09-22',
  ui: { fonts: false, colorMode: false },
  // Icons ship with the page instead of loading from the Iconify API.
  icon: {
    provider: 'none',
    clientBundle: { scan: { globInclude: ['app/**/*.{vue,ts}', '../shared/ui/**/*.{vue,ts}', '../shared/i18n/locales.ts'] } },
    serverBundle: 'local',
  },
  runtimeConfig: {
    public: { siteUrl },
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
  routeRules: {
    '/films/**': { headers: { 'cache-control': 'public, max-age=86400' } },
  },
  i18n: {
    restructureDir: 'i18n',
    locales: LOCALE_OPTIONS.map(({ code, language, nativeName }) => ({ code, language, name: nativeName, file: `${code}.json` })),
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
    tsconfig: sourceTsconfig,
    resolve: { dedupe: ['vue', '@nuxt/ui'] },
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
