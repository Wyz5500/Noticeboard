ObjC.import('Foundation');

function readFile(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(
    path,
    $.NSUTF8StringEncoding,
    null
  );
  if (!text) throw new Error('Could not read ' + path);
  return ObjC.unwrap(text);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + '\nExpected: ' + expected + '\nActual: ' + actual);
}

eval(readFile('style-preferences.js'));

[
  'swiss-international',
  'neo-brutalism',
  'bauhaus',
  'y2k-cyber',
  'retro-terminal',
  'memphis',
  'editorial-magazine',
  'glassmorphism',
  'japanese-minimalism',
  'pixel-retro'
].forEach(function (styleId) {
  eval(readFile('style-configs/' + styleId + '.js'));
});

const expectedIds = [
  'swiss-international',
  'neo-brutalism',
  'bauhaus',
  'y2k-cyber',
  'retro-terminal',
  'memphis',
  'editorial-magazine',
  'glassmorphism',
  'japanese-minimalism',
  'pixel-retro'
];
const expectedTokenKeys = [
  '--ink', '--muted', '--line', '--soft-line', '--paper', '--white', '--panel',
  '--accent', '--accent-contrast', '--accent-soft', '--backdrop', '--border-width',
  '--radius-control', '--radius-surface', '--radius-pill', '--shadow', '--shadow-card',
  '--shadow-drawer', '--display-font', '--body-font', '--meta-font', '--max-width'
];

assertEqual(GuildStyle.STORAGE_KEY !== 'minecraft-guild-board-state', true, 'style preference uses an independent storage key');
assertEqual(GuildStyle.FALLBACK_STYLE_ID, 'swiss-international', 'Swiss International is the fallback style');
assertEqual(JSON.stringify(GuildStyle.OPTIONS.map(function (option) { return option.id; })), JSON.stringify(expectedIds), 'all new styles are registered in the intended order');
assertEqual(GuildStyle.OPTIONS.length, 10, 'the style selector contains exactly ten styles');
assertEqual(GuildStyle.TOKEN_KEYS.length, expectedTokenKeys.length, 'the registry defines the complete token contract');

expectedIds.forEach(function (styleId) {
  var config = GuildStyle.get(styleId);
  assert(config, styleId + ' has a registered configuration');
  expectedTokenKeys.forEach(function (tokenKey) {
    assert(Object.prototype.hasOwnProperty.call(config.tokens, tokenKey), styleId + ' defines ' + tokenKey);
  });
  assert(config.tokens['--display-font'], styleId + ' defines a display font');
  assert(config.tokens['--body-font'], styleId + ' defines a body font');
  assert(config.tokens['--meta-font'], styleId + ' defines a metadata font');
});

const displayFonts = expectedIds.map(function (styleId) { return GuildStyle.get(styleId).tokens['--display-font']; });
assertEqual(displayFonts.filter(function (font, index) { return displayFonts.indexOf(font) === index; }).length, expectedIds.length, 'each style has a distinct display font stack');

assertEqual(GuildStyle.normalize('not-a-style'), 'swiss-international', 'invalid style values fall back to Swiss International');
assertEqual(GuildStyle.normalize(''), 'swiss-international', 'empty style values fall back to Swiss International');
assertEqual(GuildStyle.normalize('default'), 'swiss-international', 'the removed default style falls back to Swiss International');
assertEqual(GuildStyle.normalize('swiss'), 'swiss-international', 'the removed Swiss style falls back to Swiss International');
assertEqual(GuildStyle.normalize('skeuomorphism'), 'swiss-international', 'the removed Skeuomorphism style falls back to Swiss International');
assertEqual(GuildStyle.normalize('art-deco'), 'swiss-international', 'the removed Art Deco style falls back to Swiss International');
expectedIds.forEach(function (styleId) {
  assertEqual(GuildStyle.normalize(styleId), styleId, 'legal style id is preserved: ' + styleId);
});

const memoryStorage = {
  values: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; },
  setItem(key, value) { this.values[key] = String(value); }
};
assertEqual(GuildStyle.load(memoryStorage), 'swiss-international', 'missing style preference falls back to Swiss International');
assertEqual(GuildStyle.save('pixel-retro', memoryStorage), 'pixel-retro', 'saving returns the normalized style id');
assertEqual(GuildStyle.load(memoryStorage), 'pixel-retro', 'saved style can be loaded from memory storage');
memoryStorage.values[GuildStyle.STORAGE_KEY] = 'invalid-after-save';
assertEqual(GuildStyle.load(memoryStorage), 'swiss-international', 'invalid persisted style falls back to Swiss International');
assertEqual(GuildStyle.save('invalid-before-save', memoryStorage), 'swiss-international', 'invalid style is normalized before saving');
assertEqual(memoryStorage.values[GuildStyle.STORAGE_KEY], 'swiss-international', 'normalized style is persisted');

const brokenStorage = {
  getItem() { throw new Error('storage unavailable'); },
  setItem() { throw new Error('storage unavailable'); }
};
assertEqual(GuildStyle.load(brokenStorage), 'swiss-international', 'storage read errors fall back safely');
assertEqual(GuildStyle.save('bauhaus', brokenStorage), 'bauhaus', 'storage write errors do not break switching');

const fakeRoot = {
  values: {},
  removeProperty(key) { delete this.values[key]; },
  setProperty(key, value) { this.values[key] = value; }
};
assertEqual(GuildStyle.apply('retro-terminal', fakeRoot), 'retro-terminal', 'apply returns the normalized style id');
assertEqual(fakeRoot.values['--display-font'], GuildStyle.get('retro-terminal').tokens['--display-font'], 'apply writes config tokens to the target');
assertEqual(fakeRoot.values['--radius-control'], '0', 'apply writes global control shape tokens');
assertEqual(GuildStyle.apply('glassmorphism', fakeRoot), 'glassmorphism', 'apply can replace a previously applied configuration');
assertEqual(fakeRoot.values['--display-font'], GuildStyle.get('glassmorphism').tokens['--display-font'], 'apply replaces the previous font token');

const page = readFile('index.html');
const app = readFile('app.js');
const styles = readFile('styles.css');
assert(page.indexOf('<script src="style-preferences.js"></script>') !== -1, 'style preferences load before the app');
assert(page.indexOf('<script src="style-configs/swiss-international.js"></script>') !== -1, 'the Swiss configuration is loaded by the page');
assert(page.indexOf('<script src="style-configs/pixel-retro.js"></script>') !== -1, 'the Pixel configuration is loaded by the page');
assert(page.indexOf('style-configs/skeuomorphism.js') === -1, 'the Skeuomorphism configuration is removed from the page');
assert(page.indexOf('style-configs/art-deco.js') === -1, 'the Art Deco configuration is removed from the page');
assert(page.indexOf('<label class="style-switcher" for="styleSelect">') !== -1, 'the topbar includes a style switcher');
assert(page.indexOf('class="identity-arrow"') === -1, 'the identity switcher does not include a redundant arrow');
assert(app.indexOf('var currentStyle = GuildStyle.load();') !== -1, 'the app loads the visual preference');
assert(app.indexOf('GuildStyle.apply(currentStyle, document.documentElement);') !== -1, 'the app applies configuration tokens to the document root');
assert(app.indexOf("document.documentElement.setAttribute('data-style', currentStyle);") !== -1, 'the app syncs the document root theme attribute');
assert(app.indexOf("document.body.setAttribute('data-style', currentStyle);") !== -1, 'the app syncs the body theme attribute');
assert(app.indexOf('applyStyle(event.target.value);') !== -1, 'style changes use the visual-only application flow');
assert(styles.indexOf('--radius-control:') !== -1, 'controls use a semantic radius token');
assert(styles.indexOf('--radius-surface:') !== -1, 'surfaces use a semantic radius token');
assert(styles.indexOf('border-radius: var(--radius-control)') !== -1, 'control shapes use the control radius token');
assert(styles.indexOf('border-radius: var(--radius-surface)') !== -1, 'surface shapes use the surface radius token');
assert(styles.indexOf('.topbar::before') !== -1, 'the topbar has a shared full-bleed background layer');
assert(styles.indexOf('width: 100vw') !== -1, 'the topbar background reaches both viewport edges');
assert(styles.indexOf("body[data-style='glassmorphism'] .topbar { background: transparent;") !== -1, 'Glassmorphism leaves the constrained topbar transparent');
assert(styles.indexOf("body[data-style='glassmorphism'] .topbar::before") !== -1, 'Glassmorphism applies its surface to the shared full-bleed layer');
assert(styles.indexOf('@media (prefers-reduced-motion: reduce)') !== -1, 'reduced motion is supported');
assert(styles.indexOf(':focus-visible') !== -1, 'theme controls retain visible focus states');
['default', 'swiss', 'editorial', 'minimal', 'y2k', 'skeuomorphism', 'art-deco'].forEach(function (oldStyleId) {
  assert(styles.indexOf("data-style='" + oldStyleId + "'") === -1, oldStyleId + ' is removed from the stylesheet');
});
assert(styles.indexOf("body[data-style='skeuomorphism']") === -1, 'Skeuomorphism visual rules are removed');
assert(styles.indexOf("body[data-style='art-deco']") === -1, 'Art Deco visual rules are removed');
assert(styles.indexOf("body[data-style='memphis'] .board-sidebar { padding: 20px 18px 18px; border: var(--border-width) solid var(--ink);") !== -1, 'Memphis gives the sidebar a readable framed panel');
assert(styles.indexOf("body[data-style='memphis'] .search-box { background: var(--white); border-color: var(--ink);") !== -1, 'Memphis gives the search box a readable solid background');
assert(styles.indexOf("body[data-style='memphis'] .search-box input::placeholder { color: var(--muted); opacity: 1;") !== -1, 'Memphis keeps the search placeholder readable');
assert(styles.indexOf("body[data-style='y2k-cyber'] .detail-drawer { background: var(--panel);") !== -1, 'Y2K keeps the detail drawer as bright as its task cards');
expectedIds.forEach(function (styleId) {
  assert(styles.indexOf("data-style='" + styleId + "'") !== -1, styleId + ' has visual theme rules');
});

console.log('style tests passed');
