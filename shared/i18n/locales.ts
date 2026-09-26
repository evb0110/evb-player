import type {TLocale} from '../types';

export interface ILocaleOption {
  code: TLocale;
  language: string;
  nativeName: string;
  flagIcon: string;
}

export const LOCALE_OPTIONS: readonly ILocaleOption[] = [
  {code: 'en', language: 'en-US', nativeName: 'English', flagIcon: 'i-circle-flags-gb'},
  {code: 'ru', language: 'ru-RU', nativeName: 'Русский', flagIcon: 'i-circle-flags-ru'},
  {code: 'fr', language: 'fr-FR', nativeName: 'Français', flagIcon: 'i-circle-flags-fr'},
  {code: 'de', language: 'de-DE', nativeName: 'Deutsch', flagIcon: 'i-circle-flags-de'},
  {code: 'es', language: 'es-ES', nativeName: 'Español', flagIcon: 'i-circle-flags-es'},
  {code: 'it', language: 'it-IT', nativeName: 'Italiano', flagIcon: 'i-circle-flags-it'},
  {code: 'pt', language: 'pt-PT', nativeName: 'Português', flagIcon: 'i-circle-flags-pt'},
  {code: 'pt-BR', language: 'pt-BR', nativeName: 'Português (Brasil)', flagIcon: 'i-circle-flags-br'},
  {code: 'nl', language: 'nl-NL', nativeName: 'Nederlands', flagIcon: 'i-circle-flags-nl'},
];

const supportedLocaleCodes = new Set<string>(LOCALE_OPTIONS.map(({code}) => code));

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
      const exact = LOCALE_OPTIONS.find(({code}) => code.toLowerCase() === canonical.toLowerCase());
      if (exact) {
        return exact.code;
      }
      const language = canonical.split('-')[0]?.toLowerCase();
      if (!language) {
        continue;
      }
      const closest = LOCALE_OPTIONS.find(({code}) => code.toLowerCase() === language);
      if (closest) {
        return closest.code;
      }
    } catch {
      continue;
    }
  }
  return 'en';
}
