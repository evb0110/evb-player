import type {TLocale} from '../types';

export interface ILocaleOption {
  code: TLocale;
  nativeName: string;
}

export const UI_LOCALES: readonly ILocaleOption[] = [
  {code: 'en', nativeName: 'English'},
  {code: 'ru', nativeName: 'Русский'},
  {code: 'fr', nativeName: 'Français'},
  {code: 'de', nativeName: 'Deutsch'},
  {code: 'es', nativeName: 'Español'},
  {code: 'it', nativeName: 'Italiano'},
  {code: 'pt', nativeName: 'Português'},
  {code: 'pt-BR', nativeName: 'Português (Brasil)'},
  {code: 'nl', nativeName: 'Nederlands'},
];

const supportedLocaleCodes = new Set<string>(UI_LOCALES.map(({code}) => code));

export function isSupportedLocale(value: unknown): value is TLocale {
  return typeof value === 'string' && supportedLocaleCodes.has(value);
}

export function resolveSupportedLocale(candidates: readonly string[]): TLocale {
  for (const candidate of candidates) {
    try {
      const canonical = Intl.getCanonicalLocales(candidate)[0];
      if (!canonical) {
        continue;
      }
      const exact = UI_LOCALES.find(({code}) => code.toLowerCase() === canonical.toLowerCase());
      if (exact) {
        return exact.code;
      }
      const language = canonical.split('-')[0]?.toLowerCase();
      if (!language) {
        continue;
      }
      const closest = UI_LOCALES.find(({code}) => code.toLowerCase() === language);
      if (closest) {
        return closest.code;
      }
    } catch {
      continue;
    }
  }
  return 'en';
}
