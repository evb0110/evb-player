export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  devtools: {enabled: false},
  colorMode: {preference: 'dark', fallback: 'dark'},
  // Ship every icon inside the app. The default provider for ssr: false fetches icons from the Iconify API at runtime.
  icon: {
    provider: 'none',
    clientBundle: {scan: {globInclude: ['app/**/*.{vue,ts}']}},
  },
  compatibilityDate: '2026-09-22',
  app: {
    baseURL: process.env.EVB_PLAYER_DEV_SERVER_URL ? '/' : './',
    head: {
      title: 'EVB Player',
      link: [{rel: 'icon', type: 'image/png', href: './favicon.png'}],
      meta: [
        {name: 'viewport', content: 'width=device-width, initial-scale=1'},
        {name: 'theme-color', content: '#101214'},
      ],
    },
  },
  nitro: {
    preset: 'static',
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
});
