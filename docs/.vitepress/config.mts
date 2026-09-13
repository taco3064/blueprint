import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import typedocSidebar from '../api/typedoc-sidebar.json';

// The nav-bar version badge states which release these docs were built
// against — read once at build time, injected as a compile-time constant.
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string };

// The API reference is generated once (in English) but mounted under both
// locales — otherwise entering /api/ silently flips the reader into the
// root locale and every link after that stays English.
interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

const withZhPrefix = (items: SidebarItem[]): SidebarItem[] =>
  items.map((item) => ({
    ...item,
    ...(item.link ? { link: `/zh-TW${item.link}` } : {}),
    ...(item.items ? { items: withZhPrefix(item.items) } : {}),
  }));

// https://vitepress.dev/reference/site-config
// withMermaid renders ```mermaid blocks (e.g. the layer-flow diagram) as SVG,
// matching the flowcharts the emitted handbook itself produces.
export default withMermaid(defineConfig({
  vite: { define: { __BP_VERSION__: JSON.stringify(version) } },
  title: '@kekkai/blueprint',
  description:
    'Architecture as Code — one Blueprint compiles into lint, docs, and agent contracts.',
  base: '/blueprint/',
  srcExclude: ['publication/**'],
  appearance: 'force-dark',
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/blueprint/favicon.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '@kekkai/blueprint — Architecture as Code' }],
    ['meta', {
      property: 'og:description',
      content: 'Translates your frontend design philosophy into ESLint rules, '
        + 'a human-readable handbook, and ground rules for AI agents.',
    }],
    ['meta', { property: 'og:image', content: 'https://taco3064.github.io/blueprint/logo.png' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:image', content: 'https://taco3064.github.io/blueprint/logo.png' }],
  ],
  lastUpdated: true,

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Commands', link: '/commands' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Generated Files', link: '/generated-files' },
          { text: 'Philosophy', link: '/philosophy/' },
        ],
        sidebar: {
          '/': [
            { text: 'Home', link: '/' },
            { text: 'Commands', link: '/commands' },
            { text: 'Configuration', link: '/configuration' },
            { text: 'Generated Files', link: '/generated-files' },
            { text: 'Philosophy', link: '/philosophy/' },
          ],
          '/philosophy/': [
            { text: 'The Operating Contract', link: '/philosophy/' },
            { text: 'Core Beliefs', link: '/philosophy/beliefs' },
            { text: 'Layer Architecture', link: '/philosophy/layers' },
            { text: 'Component Shape', link: '/philosophy/component-shape' },
            { text: 'Working Discipline', link: '/philosophy/discipline' },
          ],
          '/api/': [{ text: 'API Reference', items: typedocSidebar }],
        },
      },
    },
    'zh-TW': {
      label: '繁體中文',
      lang: 'zh-TW',
      link: '/zh-TW/',
      themeConfig: {
        nav: [
          { text: '首頁', link: '/zh-TW/' },
          { text: '指令', link: '/zh-TW/commands' },
          { text: '設定', link: '/zh-TW/configuration' },
          { text: '產出檔案', link: '/zh-TW/generated-files' },
          { text: '工程理念', link: '/zh-TW/philosophy/' },
        ],
        sidebar: {
          '/zh-TW/': [
            { text: '首頁', link: '/zh-TW/' },
            { text: '指令', link: '/zh-TW/commands' },
            { text: '設定', link: '/zh-TW/configuration' },
            { text: '產出檔案', link: '/zh-TW/generated-files' },
            { text: '工程理念', link: '/zh-TW/philosophy/' },
          ],
          '/zh-TW/philosophy/': [
            { text: '運作守則', link: '/zh-TW/philosophy/' },
            { text: '核心信念', link: '/zh-TW/philosophy/beliefs' },
            { text: '分層架構', link: '/zh-TW/philosophy/layers' },
            { text: '元件設計', link: '/zh-TW/philosophy/component-shape' },
            { text: '工作紀律', link: '/zh-TW/philosophy/discipline' },
          ],
          '/zh-TW/api/': [{ text: 'API Reference', items: withZhPrefix(typedocSidebar) }],
        },
        outline: { label: '本頁目錄' },
        docFooter: { prev: '上一頁', next: '下一頁' },
        returnToTopLabel: '回到頂端',
      },
    },
  },

  themeConfig: {
    logo: '/logo.png',
    socialLinks: [{ icon: 'github', link: 'https://github.com/taco3064/blueprint' }],
    search: { provider: 'local' },
  },
}));
