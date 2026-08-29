var GuildStyle = (function () {
  var STORAGE_KEY = 'minecraft-guild-board-style';
  var FALLBACK_STYLE_ID = 'swiss-international';
  var TOKEN_KEYS = [
    '--ink', '--muted', '--line', '--soft-line', '--paper', '--white', '--panel',
    '--accent', '--accent-contrast', '--accent-soft', '--backdrop', '--border-width',
    '--radius-control', '--radius-surface', '--radius-pill', '--shadow', '--shadow-card',
    '--shadow-drawer', '--display-font', '--body-font', '--meta-font', '--max-width'
  ];
  var OPTIONS = [];
  var CONFIGS = {};

  function register(config) {
    if (!config || !config.id || !config.label || !config.tokens) throw new Error('Invalid style configuration');
    if (CONFIGS[config.id]) throw new Error('Duplicate style configuration: ' + config.id);
    TOKEN_KEYS.forEach(function (tokenKey) {
      if (!Object.prototype.hasOwnProperty.call(config.tokens, tokenKey)) throw new Error(config.id + ' is missing ' + tokenKey);
    });
    CONFIGS[config.id] = config;
    OPTIONS.push({ id: config.id, label: config.label });
    return config;
  }

  function normalize(styleId) {
    return CONFIGS[styleId] ? styleId : FALLBACK_STYLE_ID;
  }

  function get(styleId) {
    return CONFIGS[normalize(styleId)];
  }

  function getStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (error) {}
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (error) {}
    return null;
  }

  function load(storage) {
    var target = getStorage(storage);
    if (!target) return FALLBACK_STYLE_ID;
    try {
      return normalize(target.getItem(STORAGE_KEY));
    } catch (error) {
      return FALLBACK_STYLE_ID;
    }
  }

  function save(styleId, storage) {
    var normalized = normalize(styleId);
    var target = getStorage(storage);
    if (!target) return normalized;
    try {
      target.setItem(STORAGE_KEY, normalized);
    } catch (error) {}
    return normalized;
  }

  function apply(styleId, target) {
    var normalized = normalize(styleId);
    var node = target;
    if (!node) {
      try {
        if (typeof document !== 'undefined') node = document.documentElement;
      } catch (error) {}
    }
    if (!node) return normalized;
    var style = node.style || node;
    if (!style || typeof style.setProperty !== 'function') return normalized;
    TOKEN_KEYS.forEach(function (tokenKey) {
      if (typeof style.removeProperty === 'function') style.removeProperty(tokenKey);
      style.setProperty(tokenKey, CONFIGS[normalized].tokens[tokenKey]);
    });
    return normalized;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    FALLBACK_STYLE_ID: FALLBACK_STYLE_ID,
    TOKEN_KEYS: TOKEN_KEYS,
    OPTIONS: OPTIONS,
    register: register,
    get: get,
    normalize: normalize,
    load: load,
    save: save,
    apply: apply
  };
}());
