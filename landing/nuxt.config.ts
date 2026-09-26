import { transformWithOxc } from 'vite';

const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://evb-player.vercel.app';

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-09-22',
  ui: { fonts: false },
  colorMode: { preference: 'light', fallback: 'light' },
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
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/png', href: '/favicon.png' }],
      meta: [{ name: 'theme-color', content: '#f4f1ea' }],
    },
  },
  // The page embeds the latest release; Vercel regenerates it at most every ten minutes.
  routeRules: {
    '/': { isr: 600 },
    '/films/**': { headers: { 'cache-control': 'public, max-age=86400' } },
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
          return transformWithOxc(code, id, { lang: 'tsx', jsx: { runtime: 'automatic', importSource: 'react' } });
        },
      },
    ],
  },
  typescript: { strict: true },
});
