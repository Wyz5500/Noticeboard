/** Validates, persists, and atomically applies typed visual theme configurations. */

export const STYLE_STORAGE_KEY = 'minecraft-guild-board-style';
export const FALLBACK_STYLE_ID = 'swiss-international';
export const STYLE_TOKEN_KEYS = [
  '--ink',
  '--muted',
  '--line',
  '--soft-line',
  '--paper',
  '--white',
  '--panel',
  '--accent',
  '--accent-contrast',
  '--accent-soft',
  '--backdrop',
  '--border-width',
  '--radius-control',
  '--radius-surface',
  '--radius-pill',
  '--shadow',
  '--shadow-card',
  '--shadow-drawer',
  '--display-font',
  '--body-font',
  '--meta-font',
  '--max-width',
] as const;

export type StyleToken = (typeof STYLE_TOKEN_KEYS)[number];

export interface ThemeConfig {
  id: string;
  label: string;
  tokens: Record<StyleToken, string>;
}

export interface StyleTarget {
  cssText: string;
}

export interface StyleStorage {
  /** Reads one stored preference. */
  getItem(key: string): string | null;

  /** Writes one stored preference. */
  setItem(key: string, value: string): void;
}

export class StyleRegistry {
  readonly options: ReadonlyArray<{ id: string; label: string }>;
  private readonly configurations = new Map<string, ThemeConfig>();

  /** Validates completeness and uniqueness while preserving registration order. */
  constructor(configurations: readonly ThemeConfig[]) {
    for (const configuration of configurations) {
      if (this.configurations.has(configuration.id)) {
        throw new Error(`Duplicate style configuration: ${configuration.id}`);
      }
      for (const token of STYLE_TOKEN_KEYS) {
        if (
          !Object.prototype.hasOwnProperty.call(configuration.tokens, token)
        ) {
          throw new Error(`${configuration.id} is missing ${token}`);
        }
      }
      this.configurations.set(configuration.id, configuration);
    }
    this.options = configurations.map(({ id, label }) => ({ id, label }));
  }

  /** Normalizes unknown or removed IDs to Swiss International. */
  normalize(styleId: string | null): string {
    return styleId && this.configurations.has(styleId)
      ? styleId
      : FALLBACK_STYLE_ID;
  }

  /** Returns one normalized configuration. */
  get(styleId: string | null): ThemeConfig {
    const normalized = this.normalize(styleId);
    const configuration = this.configurations.get(normalized);
    if (!configuration)
      throw new Error(`Missing fallback style configuration: ${normalized}`);
    return configuration;
  }

  /** Applies all CSS variables in one assignment and restores prior cssText on failure. */
  apply(styleId: string, target: StyleTarget): string {
    const normalized = this.normalize(styleId);
    const previousCssText = target.cssText;
    const declarations = STYLE_TOKEN_KEYS.map(
      (token) => `${token}: ${this.get(normalized).tokens[token]};`,
    ).join('');
    try {
      target.cssText = declarations;
    } catch (error) {
      try {
        target.cssText = previousCssText;
      } catch {
        // Preserve the original application error when even rollback is rejected by the browser.
      }
      throw error;
    }
    return normalized;
  }
}

/** Loads a normalized style preference and survives unavailable browser storage. */
export function loadStyleId(
  storage: StyleStorage,
  registry: StyleRegistry,
): string {
  try {
    return registry.normalize(storage.getItem(STYLE_STORAGE_KEY));
  } catch {
    return FALLBACK_STYLE_ID;
  }
}

/** Persists only normalized theme identifiers after selection. */
export function saveStyleId(
  storage: StyleStorage,
  registry: StyleRegistry,
  styleId: string,
): string {
  const normalized = registry.normalize(styleId);
  try {
    storage.setItem(STYLE_STORAGE_KEY, normalized);
  } catch {
    // Style application remains useful even when browser preference storage is unavailable.
  }
  return normalized;
}
