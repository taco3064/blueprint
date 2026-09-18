import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import AdoptWithAI from './AdoptWithAI.vue';
import EvidenceFeed from './EvidenceFeed.vue';
import VersionBadge from './VersionBadge.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-title-after': () => h(VersionBadge),
    }),
  enhanceApp({ app }) {
    app.component('AdoptWithAI', AdoptWithAI);
    app.component('EvidenceFeed', EvidenceFeed);
  },
};
