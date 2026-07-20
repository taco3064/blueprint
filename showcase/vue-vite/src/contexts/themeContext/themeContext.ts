import { provide, type InjectionKey } from 'vue';

export const ThemeKey: InjectionKey<{ theme: string }> = Symbol('theme');

export function provideTheme() {
  provide(ThemeKey, { theme: 'light' });
}
