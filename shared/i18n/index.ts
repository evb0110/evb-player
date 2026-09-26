import de from './de';
import en from './en';
import es from './es';
import fr from './fr';
import it from './it';
import nl from './nl';
import pt from './pt';
import ptBR from './pt-BR';
import ru from './ru';
import type {TLocale} from '../types';

export {UI_LOCALES, isSupportedLocale, resolveSupportedLocale} from './locales';
export {pluralRules, createLocalePluralRule} from './plural-rules';

export const messages = {
  en,
  ru,
  fr,
  de,
  es,
  it,
  pt,
  'pt-BR': ptBR,
  nl,
} satisfies Record<TLocale, typeof en>;

export type TMessages = typeof en;
