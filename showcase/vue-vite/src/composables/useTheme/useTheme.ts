import { inject } from 'vue';
import { ThemeKey } from '~app/contexts/themeContext';

export function useTheme() {
  return inject(ThemeKey, { theme: 'light' });
}
