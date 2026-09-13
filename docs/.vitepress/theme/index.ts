import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import VersionBadge from './VersionBadge.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // The package version rides right after the site title in the nav bar
      // (both locales share the nav) — visitors see at a glance which
      // release the docs describe.
      'nav-bar-title-after': () => h(VersionBadge),
    }),
};
