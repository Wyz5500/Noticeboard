/** Defines the Retro Terminal visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const RETRO_TERMINAL = {
  id: 'retro-terminal',
  label: '复古终端',
  tokens: {
    '--ink': '#b8ff9c',
    '--muted': '#6abf69',
    '--line': '#276b35',
    '--soft-line': '#173d22',
    '--paper': '#071109',
    '--white': '#0d1d11',
    '--panel': '#0b1a0f',
    '--accent': '#b8ff9c',
    '--accent-contrast': '#071109',
    '--accent-soft': '#e6b85c',
    '--backdrop': 'rgba(0, 0, 0, .72)',
    '--border-width': '1px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '0',
    '--shadow': '0 0 18px rgba(89, 255, 115, .16)',
    '--shadow-card': '0 0 12px rgba(89, 255, 115, .1)',
    '--shadow-drawer': '-8px 0 20px rgba(0, 0, 0, .5)',
    '--display-font': '"Lucida Console", Monaco, "Courier New", monospace',
    '--body-font': '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    '--meta-font': 'Monaco, "Courier New", monospace',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
