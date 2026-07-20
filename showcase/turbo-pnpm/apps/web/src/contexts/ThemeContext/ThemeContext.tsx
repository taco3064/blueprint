import { createContext } from 'react';
import type { ReactNode } from 'react';

export const ThemeContext = createContext({ theme: 'light' });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={{ theme: 'light' }}>{children}</ThemeContext.Provider>;
}
