/** Defines the Editorial Magazine visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const EDITORIAL_MAGAZINE = {
  id: 'editorial-magazine',
  label: '编辑杂志',
  tokens: {
    '--ink': '#28231f',
    '--muted': '#786d63',
    '--line': '#cfc4b7',
    '--soft-line': '#e6ddd3',
    '--paper': '#f4eee5',
    '--white': '#fffdf8',
    '--panel': '#ebe1d4',
    '--accent': '#a23d2c',
    '--accent-contrast': '#fffaf1',
    '--accent-soft': '#ead2c7',
    '--backdrop': 'rgba(40, 35, 31, .3)',
    '--border-width': '1px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '999px',
    '--shadow': 'none',
    '--shadow-card': '0 10px 0 rgba(162, 61, 44, .06)',
    '--shadow-drawer': '-12px 0 30px rgba(40, 35, 31, .12)',
    '--display-font': 'Baskerville, Georgia, "Songti SC", "STSong", serif',
    '--body-font':
      '"Avenir Next", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    '--meta-font': '"Avenir Next", Arial, sans-serif',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
