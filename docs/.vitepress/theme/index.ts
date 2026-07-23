import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import VersionBadge from './VersionBadge.vue';
import ProblemCards from './ProblemCards.vue';
import CompileFlow from './CompileFlow.vue';
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
  // The homepage problem cards are authored in markdown as <ProblemCards />;
  // register the component globally so both locales' index.md can mount it.
  enhanceApp({ app }) {
    app.component('ProblemCards', ProblemCards);
    app.component('CompileFlow', CompileFlow);
  },
};
