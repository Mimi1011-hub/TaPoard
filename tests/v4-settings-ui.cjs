const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let version = 1;
let revision = 1;
let nextPost = 0;
let postDelay = 0;
let deckGets = 0;
let generatedId = 1;
const posts = [];
const actionRequests = [];
const audioRequests = [];
const backgroundRequests = [];
const packCreates = [];
const packAdds = [];
const imageRequests = [];
let background = { color: '', color2: '', image: '', landscape: { fit: 'cover', x: 50, y: 50, zoom: 1 }, portrait: { fit: 'cover', x: 50, y: 50, zoom: 1 }, keys: '', dim: 0, blur: 0, keyClear: 0 };
let packs = [];
let pcOptions = { previewMode: 'pc', previewRatio: 'auto' };
const faders = () => ({
  speaker: { row: 2, column: 0, width: 1, height: 1, off: false },
  mic: { row: 2, column: 1, width: 1, height: 1, off: false },
});
const item = (id, name, row, column) => ({
  id, name, type: 'app', category: 'common', action: null, path: '', args: '', url: '', text: '', hotkey: '',
  deviceId: null, deviceTarget: null, icon: null, iconKey: 'star', iconColor: '#3569c8', customIcon: '', iconPack: null,
  iconPackItem: null, row, column, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45,
  keyClear: null, hideLabel: false, options: null, steps: null,
});
let deck = {
  background: {},
  landscape: { columns: 4, rows: 3, faders: faders(), pages: [{ name: 'Home', faders: null, items: [item('one', 'First', 0, 0)] }] },
  portrait: { columns: 3, rows: 4, faders: faders(), pages: [{ name: 'Home', faders: null, items: [item('portrait', 'First', 0, 0)] }] },
};
const definitions = [
  { type: 'app', sizes: ['1x1', '2x1'] }, { type: 'hotkey', sizes: ['1x1', '2x1'] },
  { type: 'url', sizes: ['1x1'] }, { type: 'clipboard', sizes: ['1x1'] },
  { type: 'clock', sizes: ['2x1', '2x2'] }, { type: 'weather', sizes: ['1x1', '2x2'] },
  { type: 'metrics', sizes: ['1x1', '2x2'] }, { type: 'wheel', sizes: ['1x1', '1x2', '2x2'] },
  { type: 'touchpad', sizes: ['3x2', '2x3'] }, { type: 'keypad', sizes: ['4x4', '4x5'] },
  { type: 'slideshow', sizes: ['3x3'] }, { type: 'audioDevice', sizes: ['1x1'] },
];
const response = () => ({ version: String(version), deck, widgetDefinitions: definitions });
const state = () => ({
  version: String(version), revision, phoneConnected: true, pcWindowOpen: true,
  audio: { speakerVolume: 30, micVolume: 40, speakerAvailable: true, micAvailable: true }, metrics: {}, weather: {},
  background,
});
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/v3/language') {
      const language = String(req.headers['accept-language'] || '').startsWith('en') ? 'en' : 'ja';
      return json(res, 200, {
        preference: language, language, languages: [{ id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }],
      });
    }
    if (req.headers.authorization !== 'Bearer test') return json(res, 401, { error: 'unauthorized' });
    if (url.pathname === '/api/v3/deck' && req.method === 'GET') { deckGets += 1; return json(res, 200, response()); }
    if (url.pathname === '/api/v3/deck' && req.method === 'POST') {
      const value = JSON.parse(body); posts.push(JSON.parse(JSON.stringify(value)));
      if (nextPost) { const status = nextPost; nextPost = 0; return json(res, status, { error: status === 409 ? 'conflict' : 'invalid deck' }); }
      const invalidBox = (entry) => ['row', 'column', 'width', 'height'].some((key) => !Number.isInteger(entry[key]));
      const invalidDeck = ['landscape', 'portrait'].some((name) => {
        const orientation = value.deck[name];
        const faders = (source) => Object.values(source || {}).filter((entry) => entry && typeof entry === 'object');
        const invalidGlobalFader = faders(orientation.faders).some(invalidBox);
        return invalidGlobalFader || orientation.pages.some((page) => {
          return page.items.some(invalidBox) || faders(page.faders).some(invalidBox);
        });
      });
      if (invalidDeck) return json(res, 400, { error: 'invalid deck' });
      ['landscape', 'portrait'].forEach((orientation) => value.deck[orientation].pages.forEach((page) => page.items.forEach((entry) => {
        if (!entry.id) entry.id = `generated-${generatedId++}`;
      })));
      deck = value.deck; version += 1; revision += 1;
      const delay = postDelay; postDelay = 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/v3/state') return json(res, 200, state());
    if (url.pathname === '/api/v3/connect') {
      return json(res, 200, { iphoneUrl: 'http://test/#connect=one', androidUrl: 'http://127.0.0.1/#connect=one', urls: [] });
    }
    if (url.pathname === '/api/pair/manage') return json(res, 200, { revision: 1, pending: [], devices: [] });
    if (url.pathname === '/api/firewall') {
      return json(res, 200, { profile: 'private', rulesChecked: true, httpRule: true, mdnsRule: true, scriptAvailable: true });
    }
    if (url.pathname === '/api/pc-window') {
      if (req.method === 'POST') pcOptions = { ...pcOptions, ...JSON.parse(body || '{}') };
      return json(res, 200, { options: pcOptions, phoneWidth: 390, phoneHeight: 844, open: false, runtimeAvailable: false });
    }
    if (url.pathname === '/api/import') return json(res, 200, { id: 'none', result: { cancelled: true } });
    if (url.pathname === '/api/devices') return json(res, 200, { devices: [] });
    if (url.pathname === '/api/rotate') return json(res, 200, { ok: true });
    if (url.pathname === '/api/sync') return setTimeout(() => json(res, 200, state()), 30);
    if (url.pathname === '/api/action') { actionRequests.push(body); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/audio') { audioRequests.push(body); return json(res, 200, { ok: true, audio: state().audio }); }
    if (url.pathname === '/api/icon-packs' && req.method === 'GET') return json(res, 200, { packs: packs.map((pack) => ({ id: pack.id, name: pack.name, author: pack.author, source: pack.source, count: pack.icons.length, mapped: pack.icons.filter((icon) => icon.key).length })), maxPacks: 50, maxIcons: 5000 });
    if (url.pathname === '/api/shortcut-packs' && req.method === 'GET') return json(res, 200, { packs: [], maxPacks: 20, maxShortcuts: 300 });
    if (url.pathname === '/api/icon-packs/get') { const pack = packs.find((value) => value.id === url.searchParams.get('id')); return json(res, pack ? 200 : 404, pack || { error: 'missing' }); }
    if (url.pathname === '/api/icon-packs/create') { const value = JSON.parse(body), pack = { id: `pack-${packs.length + 1}`, name: value.name, author: value.author, source: value.source, icons: [] }; packs.push(pack); packCreates.push(value); return json(res, 200, { id: pack.id }); }
    if (url.pathname === '/api/icon-packs/add') { const value = JSON.parse(body), pack = packs.find((entry) => entry.id === value.id); pack.icons.push(...value.icons); packAdds.push(value); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/icon-packs/rename') { const value = JSON.parse(body), pack = packs.find((entry) => entry.id === value.id); Object.assign(pack, { name: value.name, author: value.author }); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/icon-packs/delete') { const value = JSON.parse(body); packs = packs.filter((entry) => entry.id !== value.id); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/background' && req.method === 'POST') {
      const value = JSON.parse(body);
      const rotations = [0, 90, 180, 270];
      if (['landscape', 'portrait'].some((side) => value[side] && !rotations.includes(value[side].rotate || 0))) {
        return json(res, 400, { error: 'invalid background rotation' });
      }
      background = { ...background, ...value };
      backgroundRequests.push(background);
      return json(res, 200, { background });
    }
    if (url.pathname === '/api/background/image' && req.method === 'POST') { const value = JSON.parse(body); imageRequests.push(value); background = { ...background, image: 'image-1', imageWidth: 2000, imageHeight: 1000 }; return json(res, 200, { background }); }
    if (url.pathname === '/api/background/image' && req.method === 'GET') return json(res, 200, { data: '' });
    if (url.pathname === '/api/background/image/delete') { background = { ...background, image: '' }; return json(res, 200, { background }); }
    if (url.pathname === '/api/presets') return json(res, 200, { presets: [] });
    if (url.pathname === '/api/icon-styles') return json(res, 200, { styles: [], maxStyles: 20 });
    if (url.pathname === '/api/backups') return json(res, 200, { backups: [] });
    return json(res, 404, { error: 'not found' });
  }
  let file = url.pathname === '/v4/settings.html' ? 'web/v4/settings.html' : null;
  if (url.pathname === '/qrcode.js') file = 'web/qrcode.js';
  if (url.pathname.startsWith('/v4/')) file = file || `web/v4/${url.pathname.slice(4)}`;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const extension = path.extname(file);
  const type = extension === '.js' ? 'application/javascript' : extension === '.css' ? 'text/css' : extension === '.json' ? 'application/json' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(fs.readFileSync(file));
});

// A valid 2x2 red PNG (strict decoders reject pictures with a wrong checksum).
function makePng() {
  const zlib = require('zlib');
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
  const rows = Buffer.from([0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function waitFor(check, message, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 30)); }
  throw new Error(`Timed out: ${message}`);
}
async function dragToCell(page, locator, row, column, columns = 4, rows = 3) {
  await locator.first().waitFor({ state: 'visible' });
  let box = null;
  for (let attempt = 0; attempt < 10 && !box; attempt += 1) { box = await locator.first().boundingBox(); if (!box) await new Promise((resolve) => setTimeout(resolve, 20)); }
  assert(box, 'drag source is visible');
  const overlay = await page.locator('.preview-overlay').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(overlay.x + (column + 0.5) * overlay.width / columns, overlay.y + (row + 0.5) * overlay.height / rows, { steps: 8 });
  await page.mouse.up();
}
async function assertPreviewChromeFits(page, label) {
  const result = await page.evaluate(() => {
    const column = document.querySelector('.settings-preview-column').getBoundingClientRect();
    const toolbar = document.querySelector('.settings-preview-toolbar').getBoundingClientRect();
    const tools = document.querySelector('.settings-layout-tools').getBoundingClientRect();
    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => !node.hidden)
      .map((node) => node.getBoundingClientRect());
    const boxes = visible('.settings-preview-toolbar button, .settings-preview-toolbar select, .settings-layout-tools > *');
    return {
      oneLine: toolbar.height <= 48 && tools.height <= 42 && boxes.every((box) => box.height <= 38),
      inside: boxes.every((box) => box.right <= column.right + 1),
    };
  });
  assert(result.oneLine && result.inside, `${label}: ${JSON.stringify(result)}`);
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const missing = await browser.newPage({ locale: 'ja-JP' });
    await missing.goto(`${base}/v4/settings.html`);
    await missing.locator('#settings-missing:not([hidden])').waitFor();
    assert.equal(await missing.locator('#settings-app:visible').count(), 0, 'missing key only shows guidance');
    await missing.close();

    const pcSection = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    await pcSection.goto(`${base}/v4/settings.html#admin=test&section=pc`);
    await pcSection.locator('#settings-section-pc:not([hidden])').waitFor();
    assert.equal(await pcSection.locator('[data-section="pc"].is-active').count(), 1, 'section=pc opens PC settings');
    await pcSection.close();

    const presetSection = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    await presetSection.goto(`${base}/v4/settings.html#admin=test&section=presets`);
    await presetSection.locator('#settings-section-presets:not([hidden])').waitFor();
    assert.equal(await presetSection.locator('[data-section="presets"].is-active').count(), 1, 'section=presets opens presets');
    await presetSection.close();

    const oldAppearance = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    await oldAppearance.goto(`${base}/v4/settings.html#admin=test&section=appearance`);
    await oldAppearance.locator('#settings-section-background:not([hidden])').waitFor();
    assert.equal(await oldAppearance.locator('[data-section="background"].is-active').count(), 1, 'old appearance link opens background');
    await oldAppearance.close();

    const originalDeck = JSON.parse(JSON.stringify(deck));
    deck = {
      ...originalDeck,
      landscape: {
        columns: 4,
        rows: 3,
        faders: {
          speaker: { row: 0, column: 0, width: 1, height: 1, off: true },
          mic: { row: 0, column: 1, width: 1, height: 1, off: true },
        },
        pages: [
          { name: 'First', faders: { speakerHidden: true, micHidden: true }, items: [] },
          {
            name: 'Second',
            faders: { speaker: { row: 0, column: 0, width: 4, height: 2 }, micHidden: true },
            items: [],
          },
        ],
      },
    };
    const overflowOptions = { locale: 'ja-JP', viewport: { width: 1100, height: 640 } };
    const faderOverflow = await browser.newPage(overflowOptions);
    await faderOverflow.goto(`${base}/v4/settings.html#admin=test&section=layout`);
    const faderColumns = faderOverflow.locator('.settings-grid-size select').first();
    await faderColumns.selectOption('3', { force: true });
    await waitFor(
      async () => (await faderOverflow.locator('#settings-notice').innerText()).includes('ページ 2'),
      'fader page warning',
    );
    assert.match(await faderOverflow.locator('#settings-notice').innerText(), /フェーダーが新しい枠に入りません/);
    assert.equal(await faderOverflow.locator('.settings-grid-size select').first().inputValue(), '4');
    await faderOverflow.close();

    deck.landscape.pages[1].faders = { speakerHidden: true, micHidden: true };
    deck.landscape.pages[0].items = [item('edge-one', 'Edge one', 0, 3)];
    deck.landscape.pages[1].items = [item('edge-two', 'Edge two', 0, 3)];
    const buttonOverflow = await browser.newPage(overflowOptions);
    await buttonOverflow.goto(`${base}/v4/settings.html#admin=test&section=layout`);
    const dialogPromise = buttonOverflow.waitForEvent('dialog');
    const buttonColumns = buttonOverflow.locator('.settings-grid-size select').first();
    const selectPromise = buttonColumns.selectOption('3', { force: true });
    const overflowDialog = await dialogPromise;
    assert.match(overflowDialog.message(), /ページ 1（First）・2（Second） がはみ出します/);
    await overflowDialog.dismiss();
    await selectPromise;
    assert.equal(await buttonOverflow.locator('.settings-grid-size select').first().inputValue(), '4');
    await buttonOverflow.close();
    deck = originalDeck;

    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 640 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/v4/settings.html#admin=test`);
    await page.locator('.preview-hit[data-kind="item"]').waitFor();
    assert(!page.url().includes('#'), 'admin hash is removed');
    assert.equal(await page.locator('.deck-button').count(), 1, 'preview contains the configured button');
    await assertPreviewChromeFits(page, 'Japanese PC preview chrome');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '1100px has no horizontal scroll');
    const glyphBounds = await page.evaluate(async () => {
      const { presetIconNode } = await import('/v4/deck/icons.js');
      return ['chat', 'previous', 'copy'].flatMap((key) => [40, 70, 100].map((size) => {
        const icon = presetIconNode(key, '#3569c8');
        icon.style.cssText += `;position:fixed;left:0;top:0;width:${size}px;height:${size}px;font-size:${size}px`;
        document.body.appendChild(icon);
        const box = icon.getBoundingClientRect();
        const glyph = icon.querySelector('.glyph-wide').getBoundingClientRect();
        icon.remove();
        return { key, size, width: glyph.width, height: glyph.height, fits: glyph.width <= box.width && glyph.height <= box.height };
      }));
    });
    assert(glyphBounds.every((value) => value.fits), `wide preset glyphs stay inside the icon square: ${JSON.stringify(glyphBounds)}`);

    const pcAspect = await page.locator('.settings-preview-screen').evaluate((node) => node.getBoundingClientRect().width / node.getBoundingClientRect().height);
    await page.locator('#settings-preview-mode').selectOption('phone');
    assert.match(await page.locator('#settings-preview-ratio option[value="auto"]').innerText(), /390×844/);
    assert.equal(await page.locator('#settings-inspector h2').innerText(), 'スマホの画面比率');
    assert.match(await page.locator('#settings-inspector').innerText(), /最後につないだスマホ（390×844）/);
    await page.locator('#settings-preview-ratio').selectOption('16:9');
    assert.match(await page.locator('#settings-inspector').innerText(), /iPhone 8/);
    assert.equal(await page.locator('.phone-ratio-grids button').count(), 3);
    const phoneAspect = await page.locator('.settings-preview-screen').evaluate((node) => node.getBoundingClientRect().width / node.getBoundingClientRect().height);
    assert(phoneAspect > pcAspect, 'smartphone view changes the preview ratio');
    await assertPreviewChromeFits(page, 'Japanese phone preview chrome');
    await waitFor(() => pcOptions.previewMode === 'phone', 'preview view stored');
    const phoneDragPosts = posts.length;
    await dragToCell(page, page.locator('.preview-hit[data-kind="item"]'), 0, 1);
    await waitFor(() => posts.length === phoneDragPosts + 1, 'smartphone-ratio drag save');
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].column, 1, 'smartphone-ratio drag uses the intended cell');
    assert.match(await page.locator('#settings-grid-warning').innerText(), /横長/);
    await page.locator('.preview-hit[data-kind="item"]').click();
    assert.equal(await page.locator('.settings-inspector textarea').count() > 0, true, 'selecting a button restores its details');
    await page.locator('#settings-preview-ratio').selectOption('18:9');
    assert.equal(await page.locator('#settings-inspector h2').innerText(), 'スマホの画面比率');
    await page.locator('.preview-hit[data-kind="item"]').click();
    assert.equal(await page.locator('.settings-inspector textarea').count() > 0, true, 'selecting the button again restores details');
    await page.locator('#settings-preview-ratio').selectOption('16:9');
    const advicePosts = posts.length;
    await page.locator('.phone-ratio-grids button:not(:disabled)').first().click();
    await waitFor(() => posts.length === advicePosts + 1, 'recommended grid save');
    assert.equal(posts.at(-1).deck.landscape.columns, 7);
    assert.equal(posts.at(-1).deck.landscape.rows, 4);
    assert.equal(await page.locator('.phone-ratio-grids button:disabled').count(), 1, 'current recommended grid is disabled');
    await page.locator('#settings-undo').click();
    await waitFor(() => posts.length === advicePosts + 2, 'recommended grid undo');
    await page.locator('#settings-preview-mode').selectOption('pc');

    await page.locator('.deck-button').click({ force: true });
    await page.locator('.audio-mute').first().click({ force: true });
    assert.equal(actionRequests.length, 0, 'preview button does not call action API');
    assert.equal(audioRequests.length, 0, 'preview fader does not call audio API');

    const firstPost = posts.length;
    const firstGets = deckGets;
    await dragToCell(page, page.locator('.preview-hit[data-kind="item"]'), 0, 2);
    await waitFor(() => posts.length === firstPost + 1, 'drag save');
    assert.equal(posts.at(-1).baseVersion, String(version - 1));
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].column, 2);
    await waitFor(() => deckGets > firstGets, 'GET after POST');

    const overlapPosts = posts.length;
    await dragToCell(page, page.locator('.preview-hit[data-kind="item"]'), 2, 0);
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(posts.length, overlapPosts, 'overlap does not save');

    const catalogPosts = posts.length;
    await page.locator('.catalog-card').filter({ hasText: /^操作/ }).click();
    await page.getByRole('button', { name: /よく使う操作/ }).click();
    await page.locator('.settings-catalog-item[data-action="common-copy"]').dblclick();
    assert.equal(await page.locator('.catalog-sizes').count(), 0, 'a button has no size choices');
    await waitFor(() => posts.length === catalogPosts + 1, 'catalog save');
    assert(posts.at(-1).deck.landscape.pages[0].items.some((value) => value.action === 'common-copy'));
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'catalog GET');
    const allCatalogItems = await page.locator('.settings-catalog-item').count();
    await page.locator('.settings-catalog-search').fill('貼り付け');
    const filteredCatalogItems = await page.locator('.settings-catalog-item').count();
    assert(filteredCatalogItems > 0 && filteredCatalogItems < allCatalogItems, 'catalog search filters items');
    await page.locator('.settings-catalog-search').fill('');

    let customPosts = posts.length;
    postDelay = 500;
    await page.locator('.settings-catalog-search').fill('カスタムキー');
    await page.locator('.settings-catalog-item').filter({ hasText: 'カスタムキー' }).dblclick();
    await waitFor(() => posts.length === customPosts + 1, 'custom key save starts');
    await page.locator('.deck-button').filter({ hasText: 'カスタムキー' }).click({ force: true });
    await page.getByRole('button', { name: 'このボタンを削除' }).click();
    await page.locator('.settings-catalog-search').fill('貼り付け');
    await page.locator('.settings-catalog-item[data-action="common-paste"]').dblclick();
    await waitFor(() => posts.length === customPosts + 2, 'replacement key save');
    const replacement = posts.at(-1).deck.landscape.pages[0].items.find((entry) => entry.action === 'common-paste');
    assert.equal(replacement.id, '', 'a replacement key does not inherit the deleted custom key ID');
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'replacement key GET');
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(await page.locator('.deck-button').filter({ hasText: '貼り付け' }).count(), 1, 'replacement key remains after save');
    customPosts = posts.length;
    await page.locator('#settings-undo').click();
    await waitFor(() => posts.length === customPosts + 1, 'replacement key undo save');
    assert.equal(await page.locator('.deck-button').filter({ hasText: '貼り付け' }).count(), 0, 'undo removes the replacement key');
    await page.locator('.settings-catalog-search').fill('');

    await page.locator('.preview-hit[data-kind="item"]').first().click();
    let appearancePosts = posts.length;
    await page.getByRole('button', { name: 'アイコンを変える' }).click();
    await page.getByTitle('赤').click();
    await page.locator('.icon-search').fill('ハート');
    await page.locator('.icon-choice').filter({ hasText: 'ハート' }).click();
    await waitFor(() => posts.length === appearancePosts + 1, 'built-in icon save');
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].iconKey, 'heart');
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].iconColor, '#b53846');
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'icon GET');

    appearancePosts = posts.length;
    await page.locator('.preview-hit[data-kind="item"]').first().click();
    await page.getByRole('button', { name: 'アイコンを変える' }).click();
    const png = makePng();
    await page.locator('.icon-picker input[type="file"]').setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer: png });
    await waitFor(() => posts.length === appearancePosts + 1, 'custom icon save');
    assert(posts.at(-1).deck.landscape.pages[0].items[0].customIcon.startsWith('data:image/png'));
    assert(posts.at(-1).deck.landscape.pages[0].items[0].customIcon.length <= 60000);
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'custom icon GET');

    await page.getByRole('button', { name: 'アイコンパック' }).click();
    const { buildZip } = await import('../web/v4/settings/zip.js');
    const packName = 'Very Long Test Icon Pack Name That Stays On One Line Beside Its Buttons';
    const manifest = {
      format: 'tapoard-icons',
      name: packName,
      author: 'TaPoard',
      icons: [{ file: 'icons/heart.png', name: 'Pack Heart', key: 'heart' }],
    };
    const packBlob = buildZip([
      { name: 'icons.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'icons/heart.png', bytes: png },
    ]);
    await page.locator('#settings-section-icon-packs input[accept*="tpicons"]').setInputFiles({
      name: 'test.tpicons',
      mimeType: 'application/zip',
      buffer: Buffer.from(await packBlob.arrayBuffer()),
    });
    await waitFor(() => packCreates.length === 1 && packAdds.length === 1, 'pack import');
    assert.equal(packCreates[0].source, 'file');
    assert.equal(await page.getByText('TaPoard のアイコン', { exact: true }).count(), 1);
    assert.equal(await page.getByText('そのほかのパック', { exact: true }).count(), 0);
    assert.equal(await page.getByText('画像から作ったもの', { exact: true }).count(), 0);
    const packRow = page.locator('.pack-row').filter({ hasText: packName });
    await packRow.waitFor({ timeout: 15000 });
    assert.equal(await packRow.locator('strong').getAttribute('title'), packName, 'full pack name is available as a tooltip');
    assert.equal(
      await packRow.locator('strong').evaluate((node) => getComputedStyle(node).whiteSpace),
      'nowrap',
      'long pack name stays on one line',
    );
    assert.equal(await packRow.evaluate((node) => node.scrollWidth <= node.clientWidth), true, 'pack row does not overflow');
    assert.equal(
      await packRow.locator('.pack-actions').evaluate((node) => node.scrollWidth <= node.clientWidth),
      true,
      'pack buttons stay in the row',
    );
    await page.getByRole('button', { name: 'AI でアイコンファイルを作る方法' }).click();
    assert.equal(await page.locator('#settings-icon-ai-guide .icon-ai-steps li').count(), 5, 'AI icon guide shows five local steps');
    assert((await page.locator('#settings-icon-ai-guide').evaluate((node) => node.getBoundingClientRect().height)) > 150, 'AI icon guide uses the preview height');
    assert.equal(await page.locator('#settings-icon-ai-guide a[href^="http"]').count(), 0, 'AI icon guide has no external link');
    assert.match(await page.locator('.icon-ai-prompt').innerText(), /512×512/);
    await page.getByRole('button', { name: '戻る' }).click();
    assert.equal(await page.locator('#settings-preview').isVisible(), true, 'back returns to the layout preview');
    const englishGuide = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 640 } });
    await englishGuide.goto(`${base}/v4/settings.html#admin=test&section=iconPacks`);
    await assertPreviewChromeFits(englishGuide, 'English PC preview chrome');
    await englishGuide.locator('#settings-preview-mode').selectOption('phone');
    await assertPreviewChromeFits(englishGuide, 'English phone preview chrome');
    assert.equal(await englishGuide.locator('#settings-inspector').evaluate((node) => node.scrollWidth <= node.clientWidth), true,
      'English phone ratio panel fits the inspector');
    await englishGuide.getByRole('button', { name: 'How to make icon files with AI' }).click();
    assert.equal(await englishGuide.locator('#settings-icon-ai-guide').evaluate((node) => node.scrollWidth <= node.clientWidth), true,
      'English AI guide fits at 1100px');
    await englishGuide.close();
    await page.getByRole('button', { name: '配置' }).click();
    await page.locator('.preview-hit[data-kind="item"]').first().click();
    appearancePosts = posts.length;
    await page.getByRole('button', { name: 'アイコンを変える' }).click();
    await page.getByRole('button', { name: packName }).click();
    await page.locator('.icon-choice').filter({ hasText: 'Pack Heart' }).click();
    await waitFor(() => posts.length === appearancePosts + 1, 'pack icon save');
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].iconPack, 'pack-1');
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'pack icon GET');

    const deckPostsBeforeBackground = posts.length;
    await page.getByRole('button', { name: '背景' }).click();
    await page.locator('.background-swatches').first().locator('button').nth(1).click();
    await waitFor(() => backgroundRequests.length === 1, 'background save');
    assert.equal(posts.length, deckPostsBeforeBackground, 'background does not save the deck');
    assert.equal(backgroundRequests[0].color, '#000000');
    const backgroundPanel = await page.evaluate(() => { const node = document.querySelector('.background-swatches'); node.dataset.kept = '1'; return true; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await page.locator('.background-swatches[data-kept="1"]').count(), backgroundPanel ? 1 : 0, 'sync alone does not redraw the background controls');

    await page.locator('#settings-section-background input[accept="image/*"]').setInputFiles({
      name: 'wide.png', mimeType: 'image/png', buffer: png,
    });
    await waitFor(() => imageRequests.length === 1, 'background image upload');
    assert(imageRequests[0].data.startsWith('data:image/jpeg'));
    await page.getByRole('button', { name: '完了' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '完了' }).click();
    await waitFor(async () => (await page.getByRole('button', { name: '左右反転' }).count()) === 1, 'transform buttons shown');
    let transformRequests = backgroundRequests.length;
    await page.getByRole('button', { name: '左右反転' }).click();
    await waitFor(() => backgroundRequests.length === transformRequests + 1, 'horizontal flip save');
    assert.equal(backgroundRequests.at(-1).landscape.flipX, true);
    transformRequests = backgroundRequests.length;
    await page.getByRole('button', { name: '上下反転' }).click();
    await waitFor(() => backgroundRequests.length === transformRequests + 1, 'vertical flip save');
    assert.equal(backgroundRequests.at(-1).landscape.flipY, true);
    transformRequests = backgroundRequests.length;
    await page.getByRole('button', { name: '上下反転' }).click();
    await waitFor(() => backgroundRequests.length === transformRequests + 1, 'vertical flip reset');
    assert.equal(backgroundRequests.at(-1).landscape.flipY, false);
    transformRequests = backgroundRequests.length;
    await page.getByRole('button', { name: '左に回す' }).click();
    await waitFor(() => backgroundRequests.length === transformRequests + 1, 'left rotation save');
    assert.equal(backgroundRequests.at(-1).landscape.rotate, 270);
    transformRequests = backgroundRequests.length;
    await page.getByRole('button', { name: '右に回す' }).click();
    await waitFor(() => backgroundRequests.length === transformRequests + 1, 'right rotation save');
    assert.equal(backgroundRequests.at(-1).landscape.rotate, 0);
    await page.getByRole('button', { name: '右に回す' }).click();
    await waitFor(() => backgroundRequests.at(-1).landscape.rotate === 90, 'rotation for adjusted drag');
    await page.getByRole('button', { name: 'プレビューで位置を調整' }).click();
    const screenBox = await page.locator('.settings-preview-screen').boundingBox();
    const adjustRequests = backgroundRequests.length;
    await page.mouse.move(screenBox.x + screenBox.width / 2, screenBox.y + screenBox.height / 2);
    await page.mouse.wheel(0, -200);
    await page.mouse.move(screenBox.x + screenBox.width / 2, screenBox.y + screenBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(screenBox.x + screenBox.width / 2 + 80, screenBox.y + screenBox.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal(posts.length, deckPostsBeforeBackground, 'adjusting the picture never moves buttons');
    await page.getByRole('button', { name: '完了' }).click();
    await waitFor(() => backgroundRequests.length === adjustRequests + 1, 'adjusted position save');
    assert(backgroundRequests.at(-1).landscape.y > 50,
      `dragging right follows the picture after a 90 degree rotation: ${JSON.stringify(backgroundRequests.at(-1).landscape)}`);
    assert(backgroundRequests.at(-1).landscape.zoom > 1, 'wheel zooms in');
    assert.equal(backgroundRequests.at(-1).portrait.rotate || 0, 0, 'the other orientation keeps its own transform');
    await page.getByRole('button', { name: '画像を外す' }).click();
    await waitFor(async () => (await page.getByRole('button', { name: '画像を外す' }).count()) === 0, 'image removed');

    background = { ...background, color: '#14213d', color2: '' }; revision += 1;
    await waitFor(async () => (await page.locator('.background-swatches button[aria-pressed="true"]').getAttribute('title')) === '濃紺', 'background changed elsewhere is shown');
    assert.equal(posts.length, deckPostsBeforeBackground, 'background changes never save the deck');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true,
      'background has no horizontal scroll at 1100px');
    await page.getByRole('button', { name: '配置' }).click();

    const pagePosts = posts.length;
    await page.getByRole('button', { name: 'ページを追加' }).click();
    await page.locator('.settings-page-tab.is-active .settings-page-name').dblclick();
    await page.locator('.settings-page-input').fill('Work');
    await page.locator('.settings-page-input').press('Enter');
    await waitFor(() => posts.length === pagePosts + 1, 'page save');
    assert.equal(posts.at(-1).deck.landscape.pages[1].name, 'Work');
    assert.deepEqual(posts.at(-1).deck.landscape.pages[1].faders, { speakerHidden: true, micHidden: true });
    assert.equal(await page.locator('.preview-hit[data-kind="fader"]').count(), 0, 'a new page starts without faders');
    assert.match(await page.locator('.settings-page-tab.is-active .settings-page-name').innerText(), /^2 Work$/);
    const firstPageName = await page.locator('.settings-page-tab').first().locator('.settings-page-name').boundingBox();
    await page.mouse.click(firstPageName.x + firstPageName.width - 2, firstPageName.y + firstPageName.height / 2);
    assert.equal(await page.locator('.settings-page-tab.is-active').getAttribute('class'), 'settings-page-tab is-active');
    assert.equal(await page.locator('.settings-page-tab.is-active .settings-page-name').innerText(), '1 Home');
    const secondPageName = await page.locator('.settings-page-tab').nth(1).locator('.settings-page-name').boundingBox();
    await page.mouse.click(secondPageName.x + secondPageName.width - 2, secondPageName.y + secondPageName.height / 2);
    assert.match(await page.locator('.settings-page-tab.is-active .settings-page-name').innerText(), /^2 Work$/);
    assert.equal(await page.locator('.settings-page-more').first().getAttribute('title'), 'ページのメニュー');
    await page.getByRole('button', { name: 'ページ一覧' }).click();
    assert.equal(await page.locator('.settings-page-list-row').count(), 2, 'page list shows every numbered page');
    assert.match(await page.locator('.settings-page-list-row').last().innerText(), /2 Work · 0/);
    const onTop = (selector) => page.locator(selector).evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.height > 40 && node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    });
    assert.equal(await onTop('.settings-page-list'), true, 'page list is not clipped by the toolbar');
    await page.getByRole('button', { name: 'ページ一覧' }).click();
    await page.locator('.settings-page-tab').nth(1).locator('.settings-page-more').click();
    assert.equal(await onTop('.settings-page-menu'), true, 'page menu is not clipped by the scrolling tab strip');
    await page.locator('.settings-page-tab').nth(1).locator('.settings-page-more').click();
    assert.equal(await page.locator('.settings-page-menu').count(), 0, 'the ⋮ button closes its menu again');

    const undoPosts = posts.length;
    await page.keyboard.press('Control+Z');
    await waitFor(() => posts.length === undoPosts + 1, 'undo save');
    assert.equal(posts.at(-1).deck.landscape.pages[1].name, '');
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'undo GET');
    assert.deepEqual(errors, [], `console errors before expected HTTP failures: ${errors.join('\n')}`);

    await page.locator('.settings-page-tab').first().locator('.settings-page-name').click();
    await page.locator('.preview-hit[data-kind="item"]').first().click();
    const conflictPosts = posts.length;
    nextPost = 409;
    await page.locator('.settings-inspector textarea').first().fill('Conflict');
    await page.locator('.settings-inspector textarea').first().blur();
    await waitFor(() => page.evaluate(() => !document.querySelector('#settings-conflict').hidden), '409 conflict shown');
    assert.equal(posts.length, conflictPosts + 1, '409 POST');
    assert.equal(await page.evaluate(() => document.querySelector('#settings-conflict').hidden), false, '409 shows conflict band');
    await page.locator('[data-conflict="reload"]').click();
    await waitFor(() => page.evaluate(() => document.querySelector('#settings-conflict').hidden), 'conflict closes');

    await page.locator('.preview-hit[data-kind="item"]').first().click();
    const name = page.locator('.settings-inspector textarea').first();
    nextPost = 400;
    await name.fill('Invalid'); await name.blur();
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()).includes('invalid deck'), '400 error');
    assert.notEqual(await page.locator('.settings-inspector textarea').first().inputValue(), 'Invalid', '400 restores saved deck');
    assert.equal(await page.locator('#settings-undo').isDisabled(), true, '400 removes rejected edits from undo history');
    assert.match(await page.locator('#settings-notice').innerText(), /保存できなかったので元に戻しました：invalid deck/);

    await page.locator('.settings-inspector textarea').first().fill('Unsaved');
    await page.locator('.settings-inspector textarea').first().blur();
    version += 1; revision += 1;
    await page.locator('#settings-conflict:not([hidden])').waitFor();
    assert.equal(await page.locator('.settings-inspector textarea').first().inputValue(), 'Unsaved', 'external version does not overwrite dirty edit');

    await page.getByRole('button', { name: '接続' }).click();
    await page.locator('.connect-qr').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.connect-url').textContent === 'http://test/');
    const unexpectedErrors = errors.filter((value) => !value.includes('Failed to load resource'));
    assert.deepEqual(unexpectedErrors, [], `console errors: ${unexpectedErrors.join('\n')}`);
    console.log('PASS v4 settings UI: auth, layout edits, save, conflict, validation, preview safety and 1100px width');
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    server.close();
    if (server.closeAllConnections) server.closeAllConnections();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
