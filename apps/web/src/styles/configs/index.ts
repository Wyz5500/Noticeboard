/** Registers all ten typed visual themes in the preserved selector order. */
import { BAUHAUS } from './bauhaus.js';
import { EDITORIAL_MAGAZINE } from './editorial-magazine.js';
import { GLASSMORPHISM } from './glassmorphism.js';
import { JAPANESE_MINIMALISM } from './japanese-minimalism.js';
import { MEMPHIS } from './memphis.js';
import { NEO_BRUTALISM } from './neo-brutalism.js';
import { PIXEL_RETRO } from './pixel-retro.js';
import { RETRO_TERMINAL } from './retro-terminal.js';
import { SWISS_INTERNATIONAL } from './swiss-international.js';
import { Y2K_CYBER } from './y2k-cyber.js';

export const THEMES = [
  SWISS_INTERNATIONAL,
  NEO_BRUTALISM,
  BAUHAUS,
  Y2K_CYBER,
  RETRO_TERMINAL,
  MEMPHIS,
  EDITORIAL_MAGAZINE,
  GLASSMORPHISM,
  JAPANESE_MINIMALISM,
  PIXEL_RETRO,
] as const;
