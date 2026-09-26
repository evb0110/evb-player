import type {TTheme} from './types';

export const THEME_COOKIE = 'theme';
export const COLOR_SCHEME_HINT_COOKIE = 'CH-prefers-color-scheme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is TTheme {
  return value === 'light' || value === 'dark';
}

export function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }
  const prefix = `${name}=`;
  const value = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveTheme(choice: unknown, systemHint: unknown): TTheme {
  return isTheme(choice) ? choice : systemHint === 'dark' ? 'dark' : 'light';
}

export function setDocumentTheme(theme: TTheme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function writeBrowserCookie(name: string, value: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

export const CLIENT_HINT_CHECK_SCRIPT = `(()=>{
  const readCookie=(name)=>document.cookie.split(/;\\s*/u).find((part)=>part.startsWith(name+'='))?.slice(name.length+1);
  const explicitTheme=readCookie('theme');
  if(explicitTheme==='light'||explicitTheme==='dark')return;
  const preferred=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  if(readCookie('CH-prefers-color-scheme')===preferred)return;
  const secure=location.protocol==='https:'?'; Secure':'';
  document.cookie='CH-prefers-color-scheme='+preferred+'; Max-Age=31536000; Path=/; SameSite=Lax'+secure;
  if(readCookie('CH-prefers-color-scheme')!==preferred||document.documentElement.classList.contains(preferred))return;
  location.reload();
})();`;
