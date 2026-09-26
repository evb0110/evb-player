import {watch} from 'vue';
import {createI18n} from 'vue-i18n';
import {messages, pluralRules, resolveSupportedLocale} from '../../shared/i18n';

export default defineNuxtPlugin(async (nuxtApp) => {
  const colorMode = useColorMode();
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages,
    pluralRules,
  });
  nuxtApp.vueApp.use(i18n);

  let theme: 'system' | 'light' | 'dark' = 'dark';
  let locale = resolveSupportedLocale(navigator.languages.length ? navigator.languages : [navigator.language]);
  if (window.evbPlayer) {
    try {
      const settings = await window.evbPlayer.getSettings();
      theme = settings.theme;
      locale = settings.locale;
    } catch {
      // Keep a usable browser-language interface if settings IPC is unavailable.
    }
  }

  colorMode.preference = theme;
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  watch(i18n.global.locale, (activeLocale) => {
    document.documentElement.lang = activeLocale;
  });
});
