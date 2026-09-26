import {UI_LOCALES} from './locales';
import type {TLocale} from '../types';

export function createLocalePluralRule(locale: TLocale) {
  const pluralRules = new Intl.PluralRules(locale);
  const {pluralCategories} = pluralRules.resolvedOptions();

  return (choice: number, choicesLength: number) => {
    const category = pluralRules.select(choice);
    const categoryIndex = pluralCategories.indexOf(category);
    return Math.min(Math.max(categoryIndex, 0), choicesLength - 1);
  };
}

export const pluralRules = Object.fromEntries(
  UI_LOCALES.map(({code}) => [code, createLocalePluralRule(code)]),
) as Record<TLocale, ReturnType<typeof createLocalePluralRule>>;
