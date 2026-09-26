import {setDocumentTheme} from '../../shared/theme';
import type {TTheme} from '../../shared/types';

export function useActiveTheme() {
  const theme = useState<TTheme>('evb-player-theme', () => 'light');
  const explicitTheme = useState<TTheme | null>('evb-player-explicit-theme', () => null);

  function setActiveTheme(value: TTheme) {
    theme.value = value;
    if (import.meta.client) {
      setDocumentTheme(value);
    }
  }

  function setExplicitTheme(value: TTheme | null) {
    explicitTheme.value = value;
  }

  function chooseTheme(value: TTheme) {
    explicitTheme.value = value;
    setActiveTheme(value);
  }

  return {theme, explicitTheme, setActiveTheme, setExplicitTheme, chooseTheme};
}
