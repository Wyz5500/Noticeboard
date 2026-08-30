/** Defines the Pixel Retro Game UI visual tokens. */
import type { ThemeConfig } from '../style-registry.js';

export const PIXEL_RETRO = {
  id: 'pixel-retro',
  label: 'Pixel / Retro Game UI',
  tokens: {
    '--ink': '#f8f4d8',
    '--muted': '#a9aa83',
    '--line': '#f8f4d8',
    '--soft-line': '#49543b',
    '--paper': '#24283b',
    '--white': '#303650',
    '--panel': '#343b5c',
    '--accent': '#ffce5c',
    '--accent-contrast': '#24283b',
    '--accent-soft': '#ff6b8a',
    '--backdrop': 'rgba(18, 20, 31, .72)',
    '--border-width': '3px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '0',
    '--shadow': '4px 4px 0 #111522',
    '--shadow-card': '4px 4px 0 #111522',
    '--shadow-drawer': '-6px 6px 0 #111522',
    '--display-font':
      '"Press Start 2P", "Pixel Emulator", "Courier New", monospace',
    '--body-font': '"Courier New", "Lucida Console", monospace',
    '--meta-font': '"Press Start 2P", "Courier New", monospace',
    '--max-width': '1440px',
  },
} satisfies ThemeConfig;
