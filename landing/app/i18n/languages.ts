export const LOCALE_OPTIONS = [
  { code: 'en', language: 'en-US', name: 'English', icon: 'i-circle-flags-gb' },
  { code: 'ru', language: 'ru-RU', name: 'Русский', icon: 'i-circle-flags-ru' },
  { code: 'fr', language: 'fr-FR', name: 'Français', icon: 'i-circle-flags-fr' },
  { code: 'de', language: 'de-DE', name: 'Deutsch', icon: 'i-circle-flags-de' },
  { code: 'es', language: 'es-ES', name: 'Español', icon: 'i-circle-flags-es' },
  { code: 'it', language: 'it-IT', name: 'Italiano', icon: 'i-circle-flags-it' },
  { code: 'pt', language: 'pt-PT', name: 'Português', icon: 'i-circle-flags-pt' },
  { code: 'pt-BR', language: 'pt-BR', name: 'Português (Brasil)', icon: 'i-circle-flags-br' },
  { code: 'nl', language: 'nl-NL', name: 'Nederlands', icon: 'i-circle-flags-nl' },
] as const;

export type TLocale = typeof LOCALE_OPTIONS[number]['code'];
