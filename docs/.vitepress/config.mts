import { defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';

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
export default defineConfig({
  title: '@kekkai/blueprint',
  description:
    'Architecture as Code — one Blueprint compiles into lint, docs, agent contracts, and CI.',
  base: '/blueprint/',
  appearance: 'force-dark',
  head: [['link', { rel: 'icon', type: 'image/png', href: '/blueprint/favicon.png' }]],
  lastUpdated: true,

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Philosophy', link: '/philosophy/' },
          { text: 'API', link: '/api/' },
          { text: 'Changelog', link: '/changelog' },
        ],
        sidebar: {
          '/guide/': [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'AI-Assisted Adoption', link: '/guide/ai-adoption' },
            { text: 'Field-Tested Setups', link: '/guide/field-tested' },
            { text: 'Security & Trust', link: '/guide/security' },
          ],
          '/philosophy/': [
            { text: 'The Operating Contract', link: '/philosophy/' },
            { text: 'Ten Core Beliefs', link: '/philosophy/beliefs' },
            { text: 'Layer Architecture', link: '/philosophy/layers' },
            { text: 'Component Shape — 7 Axes', link: '/philosophy/component-shape' },
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
          { text: '指南', link: '/zh-TW/guide/getting-started' },
          { text: '工程理念', link: '/zh-TW/philosophy/' },
          { text: 'API', link: '/zh-TW/api/' },
          { text: '版本紀錄', link: '/zh-TW/changelog' },
        ],
        sidebar: {
          '/zh-TW/guide/': [
            { text: '快速上手', link: '/zh-TW/guide/getting-started' },
            { text: 'AI 協助導入', link: '/zh-TW/guide/ai-adoption' },
            { text: '實測相容性', link: '/zh-TW/guide/field-tested' },
            { text: '安全與信任', link: '/zh-TW/guide/security' },
          ],
          '/zh-TW/philosophy/': [
            { text: '運作契約', link: '/zh-TW/philosophy/' },
            { text: '十條核心信念', link: '/zh-TW/philosophy/beliefs' },
            { text: '分層架構', link: '/zh-TW/philosophy/layers' },
            { text: '元件形狀 · 七條軸線', link: '/zh-TW/philosophy/component-shape' },
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
});
