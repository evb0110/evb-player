export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  devtools: {enabled: false},
  compatibilityDate: '2026-09-22',
  app: {
    baseURL: process.env.COURSE_SHELF_DEV_SERVER_URL ? '/' : './',
    head: {
      title: 'Course Shelf',
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
