import {COLOR_SCHEME_HINT_COOKIE, isTheme, resolveTheme, setDocumentTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE} from '../../../shared/theme';
import type {TTheme} from '../../../shared/types';

export function useTheme() {
  const cookieOptions = {
    maxAge: THEME_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax' as const,
    secure: import.meta.client ? location.protocol === 'https:' : useRequestURL().protocol === 'https:',
  };
  const themeCookie = useCookie<string | null>(THEME_COOKIE, cookieOptions);
  const hintCookie = useCookie<string | null>(COLOR_SCHEME_HINT_COOKIE, cookieOptions);
  const explicitTheme = useState<TTheme | null>('landing-explicit-theme', () => isTheme(themeCookie.value) ? themeCookie.value : null);
  const theme = useState<TTheme>('landing-active-theme', () => resolveTheme(themeCookie.value, hintCookie.value));

  function chooseTheme(value: TTheme) {
    explicitTheme.value = value;
    themeCookie.value = value;
    theme.value = value;
    if (import.meta.client) {
      setDocumentTheme(value);
    }
  }

  function followSystem(value: TTheme) {
    if (explicitTheme.value) {
      return;
    }
    theme.value = value;
    hintCookie.value = value;
    if (import.meta.client) {
      setDocumentTheme(value);
    }
  }

  return {theme, explicitTheme, chooseTheme, followSystem};
}
