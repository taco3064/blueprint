import { ThemeProvider } from '~app/contexts/ThemeContext';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <ThemeProvider><Component {...pageProps} /></ThemeProvider>;
}
