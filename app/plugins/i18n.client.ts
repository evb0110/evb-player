import {watch} from 'vue';
import {createI18n} from 'vue-i18n';
import {messages, pluralRules, resolveSupportedLocale} from '../../shared/i18n';
import {COLOR_SCHEME_HINT_COOKIE, writeBrowserCookie} from '../../shared/theme';
import type {TTheme} from '../../shared/types';
import {useActiveTheme} from '../composables/useActiveTheme';
import {getPlayerApi} from '../utils/playerApi';

export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages,
    pluralRules,
  });
  nuxtApp.vueApp.use(i18n);

  const themeState = useActiveTheme();
  // In the browser the server renders the theme from cookies, so the system preference cookie stays current.
  const followsBrowserSystem = !window.evbPlayer;
  let theme: TTheme | undefined;
  let locale = resolveSupportedLocale(navigator.languages.length ? navigator.languages : [navigator.language]);
  try {
    const api = await getPlayerApi();
    const settings = await api.getSettings();
    theme = settings.theme;
    locale = settings.locale;
    themeState.setExplicitTheme(theme ?? null);
  } catch {
    // Keep a usable browser-language interface if platform settings are unavailable.
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyActiveTheme = themeState.setActiveTheme;
  applyActiveTheme(theme ?? (media.matches ? 'dark' : 'light'));
  if (!theme && followsBrowserSystem) {
    writeBrowserCookie(COLOR_SCHEME_HINT_COOKIE, media.matches ? 'dark' : 'light');
  }
  media.addEventListener('change', (event) => {
    if (themeState.explicitTheme.value) {
      return;
    }
    const nextTheme = event.matches ? 'dark' : 'light';
    if (followsBrowserSystem) {
      writeBrowserCookie(COLOR_SCHEME_HINT_COOKIE, nextTheme);
    }
    applyActiveTheme(nextTheme);
  });

  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  watch(i18n.global.locale, (activeLocale) => {
    document.documentElement.lang = activeLocale;
  });
});
