import { useContext } from 'react';
import { ThemeContext } from '~app/contexts/ThemeContext';

export function useTheme() {
  return useContext(ThemeContext);
}
