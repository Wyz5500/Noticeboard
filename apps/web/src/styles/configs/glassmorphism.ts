/** Defines the Glassmorphism visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const GLASSMORPHISM = {
  id: 'glassmorphism',
  label: '玻璃拟态',
  tokens: {
    '--ink': '#17243b',
    '--muted': '#5f6f86',
    '--line': 'rgba(255, 255, 255, .72)',
    '--soft-line': 'rgba(255, 255, 255, .4)',
    '--paper': '#cbd8f0',
    '--white': 'rgba(255, 255, 255, .7)',
    '--panel': 'rgba(255, 255, 255, .34)',
    '--accent': '#635bff',
    '--accent-contrast': '#ffffff',
    '--accent-soft': '#9de7ff',
    '--backdrop': 'rgba(31, 47, 83, .28)',
    '--border-width': '1px',
    '--radius-control': '999px',
    '--radius-surface': '24px',
    '--radius-pill': '999px',
    '--shadow': '0 18px 40px rgba(55, 74, 125, .2)',
    '--shadow-card': '0 12px 30px rgba(55, 74, 125, .16)',
    '--shadow-drawer': '-12px 0 34px rgba(55, 74, 125, .22)',
    '--display-font': '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    '--body-font':
      '"Segoe UI", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    '--meta-font': '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
