/** Defines the Memphis visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const MEMPHIS = {
  id: 'memphis',
  label: '孟菲斯',
  tokens: {
    '--ink': '#251b35',
    '--muted': '#69587e',
    '--line': '#251b35',
    '--soft-line': '#d8c9ea',
    '--paper': '#fff5e8',
    '--white': '#fffdf8',
    '--panel': '#ffcf4a',
    '--accent': '#f05275',
    '--accent-contrast': '#ffffff',
    '--accent-soft': '#4fc6c0',
    '--backdrop': 'rgba(37, 27, 53, .32)',
    '--border-width': '2px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '999px',
    '--shadow': '5px 5px 0 #4fc6c0',
    '--shadow-card': '5px 5px 0 #f05275',
    '--shadow-drawer': '-8px 8px 0 #ffcf4a',
    '--display-font':
      '"Cooper Black", "Arial Rounded MT Bold", Arial, sans-serif',
    '--body-font':
      '"Trebuchet MS", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    '--meta-font': '"Arial Rounded MT Bold", Arial, sans-serif',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
