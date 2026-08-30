/** Defines the Neo-Brutalism visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const NEO_BRUTALISM = {
  id: 'neo-brutalism',
  label: 'Neo-Brutalism',
  tokens: {
    '--ink': '#171717',
    '--muted': '#3f3f3f',
    '--line': '#171717',
    '--soft-line': '#b8b8b8',
    '--paper': '#fff8e9',
    '--white': '#ffffff',
    '--panel': '#ffe44d',
    '--accent': '#d6ff38',
    '--accent-contrast': '#171717',
    '--accent-soft': '#ff7bd4',
    '--backdrop': 'rgba(23, 23, 23, .45)',
    '--border-width': '3px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '999px',
    '--shadow': '6px 6px 0 #171717',
    '--shadow-card': '6px 6px 0 #171717',
    '--shadow-drawer': '-8px 8px 0 #171717',
    '--display-font':
      'Impact, "Arial Black", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    '--body-font':
      'Verdana, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    '--meta-font': '"Arial Black", Arial, sans-serif',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
