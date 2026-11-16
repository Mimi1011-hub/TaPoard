const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');

let version = 1;
const posts = [];
let shortcutPacks = [];
let iconPack = null;
const faders = () => ({
  speaker: { row: 3, column: 0, width: 1, height: 1, off: true },
  mic: { row: 3, column: 1, width: 1, height: 1, off: true },
});
let deck = {
  keepAwake: false,
  background: {},
  landscape: { columns: 5, rows: 4, faders: faders(), pages: [{ name: '', faders: null, items: [] }] },
  portrait: { columns: 3, rows: 4, faders: faders(), pages: [{ name: '', faders: null, items: [] }] },
};
const definitions = [
  { type: 'hotkey', sizes: ['1x1'] },
  { type: 'url', sizes: ['1x1'] },
  { type: 'clipboard', sizes: ['1x1'] },
  { type: 'audioDevice', sizes: ['1x1'] },
  { type: 'clock', sizes: ['2x1', '2x2'] },
  { type: 'weather', sizes: ['1x1', '2x2'] },
  { type: 'metrics', sizes: ['1x1', '2x2'] },
  { type: 'wheel', sizes: ['1x1', '1x2', '2x2'] },
  { type: 'touchpad', sizes: ['3x2', '2x3'] },
  { type: 'slideshow', sizes: ['3x3'] },
  { type: 'keypad', sizes: ['4x4', '4x5'] },
];
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};
const state = () => ({
  version: String(version),
  revision: version,
  appVersion: 'test',
  computer: 'TEST-PC',
  phoneConnected: false,
  pcWindowOpen: false,
  audio: {},
  metrics: {},
  weather: {},
  background: {},
});
function makePng() {
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const output = Buffer.alloc(body.length + 8);
    output.writeUInt32BE(data.length, 0);
    body.copy(output, 4);
    output.writeUInt32BE(crc(body), body.length + 4);
    return output;
  };
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
  const rows = Buffer.from([0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') return json(res, 401, { error: 'key' });
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const name = url.pathname.slice(5);
    if (name === 'v3/language') return json(res, 200, {
      preference: 'ja', language: 'ja', languages: [{ id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }],
    });
    if (name === 'v3/deck' && req.method === 'GET') {
      return json(res, 200, { version: String(version), deck, widgetDefinitions: definitions });
    }
    if (name === 'v3/deck') {
      const items = ['landscape', 'portrait'].flatMap((orientation) => body.deck[orientation].pages.flatMap((page) => page.items));
      const invalid = items.some((item) => (item.type === 'url' && !/^https?:\/\//.test(item.url || ''))
        || (item.type === 'clipboard' && !item.text)
        || (item.type === 'audioDevice' && !item.deviceId));
      if (invalid) return json(res, 400, { error: 'invalid custom action' });
      deck = body.deck;
      version += 1;
      posts.push(body);
      return json(res, 200, { ok: true, version: String(version), deck });
    }
    if (name === 'v3/state' || name === 'sync') return json(res, 200, state());
    if (name === 'devices') return json(res, 200, { devices: [
      { id: 'speaker-1', name: 'Speakers', target: 'speaker' },
      { id: 'mic-1', name: 'Microphone', target: 'mic' },
    ] });
    if (name === 'shortcut-packs' && req.method === 'GET') {
      return json(res, 200, { packs: shortcutPacks, maxPacks: 20, maxShortcuts: 300 });
    }
    if (name === 'shortcut-packs/save') {
      shortcutPacks = [{ ...body, id: 'pack12345', created: '2026-01-01' }];
      return json(res, 200, { id: 'pack12345' });
    }
    if (name === 'shortcut-packs/delete') {
      shortcutPacks = [];
      return json(res, 200, { ok: true });
    }
    if (name === 'icon-packs/create') {
      iconPack = { id: '1234567890abcdef1234567890abcdef', icons: [] };
      return json(res, 200, { id: iconPack.id });
    }
    if (name === 'icon-packs/add') {
      iconPack.icons.push(...body.icons);
      return json(res, 200, { ok: true });
    }
    if (name === 'icon-packs/get') return json(res, 200, iconPack);
    if (name === 'icon-packs') return json(res, 200, { packs: [], maxPacks: 50, maxIcons: 5000 });
    if (name === 'presets') return json(res, 200, { presets: [] });
    if (name === 'icon-styles') return json(res, 200, { styles: [], maxStyles: 20 });
    if (name === 'backups') return json(res, 200, { backups: [] });
    return json(res, 404, { error: 'missing' });
  }
  let file = url.pathname === '/qrcode.js' ? 'web/qrcode.js' : '';
  if (url.pathname.startsWith('/v4/')) file = `web/v4/${url.pathname.slice(4)}`;
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'text/html'}; charset=utf-8` });
  res.end(fs.readFileSync(file));
});
const waitFor = async (check, message) => {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${message}`);
};

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/v4/settings.html#admin=test`);
    await page.locator('.catalog-card').first().waitFor();
    const shot = async (name) => {
      if (!process.env.UI_SHOTS) return;
      fs.mkdirSync(process.env.UI_SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.UI_SHOTS, `catalog-${name}.png`) });
    };
    assert.equal(await page.locator('.catalog-card').count(), 4, 'four top categories');
    await shot('top');
    await page.getByRole('button', { name: 'アプリ別', exact: false }).click();
    await page.getByRole('button', { name: /VS Code/ }).click();
    assert((await page.locator('.catalog-path').innerText()).includes('アプリ別 › VS Code'));
    await shot('items');
    await page.locator('.catalog-back').click();
    assert((await page.locator('.catalog-path').innerText()).includes('アプリ別'));
    await page.locator('.catalog-card').first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.catalog-card').count(), 4, 'Escape returns to top');
    await page.locator('.settings-catalog-search').fill('コマンドパレット');
    assert.equal(await page.locator('[data-action="vscode-commandPalette"]').count(), 1, 'searches every category');
    await page.locator('[data-action="vscode-commandPalette"]').dblclick();
    await waitFor(() => posts.length === 1, 'VS Code shortcut save');
    assert(posts[0].deck.landscape.pages[0].items.some((item) => item.action === 'key-custom' && item.hotkey === 'Ctrl+Shift+P'));
    await page.locator('.settings-catalog-search').fill('');
    assert((await page.locator('.catalog-recent').innerText()).includes('コマンドパレット'));
    await shot('recent');

    await page.getByRole('button', { name: /部品/ }).click();
    await page.getByRole('button', { name: /時計・PC情報/ }).click();
    const clock = page.locator('[data-action="widget-clock-digital-wide"]');
    await clock.click();
    assert.equal(await clock.locator('xpath=..').locator('.catalog-sizes button').count(), 2, 'multi-size widget shows size choices');
    const sizeBefore = posts.length;
    await clock.locator('xpath=..').getByRole('button', { name: '2×2' }).click();
    await waitFor(() => posts.length === sizeBefore + 1, 'chosen widget size save');
    assert(posts.at(-1).deck.landscape.pages[0].items.some((entry) => entry.type === 'clock' && entry.width === 2 && entry.height === 2));
    await page.locator('.catalog-back').click();
    await page.getByRole('button', { name: /キーボード/ }).click();
    await page.locator('[data-action="widget-keypad"]').click();
    assert.equal(await page.getByRole('button', { name: '4×5', exact: true }).isDisabled(), true, 'size that does not fit is disabled');
    await page.locator('.catalog-back').focus();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /起動・その他/ }).click();
    await page.locator('.catalog-back').click();
    assert.equal(await page.locator('.catalog-card').count(), 4, 'launch back button returns to the top categories');
    await page.getByRole('button', { name: /起動・その他/ }).click();
    let before = posts.length;
    await page.locator('[data-action="custom-url"]').dblclick();
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();
    assert.equal(posts.length, before, 'cancel does not place a custom action');
    await page.locator('[data-action="custom-url"]').dblclick();
    const urlDialog = page.getByRole('dialog');
    await urlDialog.locator('input[type="url"]').fill('not-a-url');
    await urlDialog.getByRole('button', { name: '置く' }).click();
    assert.match(await urlDialog.locator('.catalog-dialog-error').innerText(), /http:\/\//);
    await urlDialog.locator('input[type="url"]').fill('https://example.com/');
    await urlDialog.getByRole('button', { name: '置く' }).click();
    await waitFor(() => posts.length === before + 1, 'URL action save');
    assert(posts.at(-1).deck.landscape.pages[0].items.some((item) => item.url === 'https://example.com/'));
    await page.locator('.deck-button').filter({ hasText: 'URLを開く' }).click({ force: true });
    before = posts.length;
    await page.locator('.settings-inspector input[type="url"]').fill('');
    await page.locator('.settings-inspector input[type="url"]').blur();
    assert.match(await page.locator('.settings-inspector .catalog-dialog-error').innerText(), /URL/);
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(posts.length, before, 'invalid URL detail is not sent');
    assert.equal(await page.locator('.deck-button').filter({ hasText: 'URLを開く' }).count(), 1, 'invalid detail does not remove the item');

    before = posts.length;
    await page.locator('[data-action="custom-clipboard"]').dblclick();
    const textDialog = page.getByRole('dialog');
    await textDialog.locator('textarea').fill('Copied text');
    await textDialog.getByRole('button', { name: '置く' }).click();
    await waitFor(() => posts.length === before + 1, 'clipboard action save');
    assert(posts.at(-1).deck.landscape.pages[0].items.some((item) => item.text === 'Copied text'));

    for (const action of ['custom-audio-output', 'custom-audio-input']) {
      before = posts.length;
      await page.locator(`[data-action="${action}"]`).dblclick();
      const audioDialog = page.getByRole('dialog');
      await audioDialog.locator('select').selectOption(action.endsWith('output') ? 'speaker-1' : 'mic-1');
      await audioDialog.getByRole('button', { name: '置く' }).click();
      await waitFor(() => posts.length === before + 1, `${action} save`);
      const expected = action.endsWith('output') ? 'speaker-1' : 'mic-1';
      assert(posts.at(-1).deck.landscape.pages[0].items.some((item) => item.deviceId === expected));
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(await page.locator('.deck-button').count(), 5, 'configured custom actions remain after saving');
    await page.locator('.catalog-back').focus();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'アプリ別', exact: false }).click();
    const input = page.locator('input[accept=".tpshortcuts,.json"]');
    const evil = '<img src=x onerror="window.hacked=1">';
    await input.setInputFiles({ name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'tapoard-shortcuts', version: 1, name: evil, app: 'Test', shortcuts: [{ name: 'Run', keys: 'F5' }],
    })) });
    await page.getByRole('button', { name: new RegExp(evil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).waitFor();
    assert.equal(await page.evaluate(() => window.hacked), undefined, 'pack text is inert');
    await page.getByRole('button', { name: new RegExp(evil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    before = posts.length;
    await page.locator('[data-action="pack:pack12345:0"]').dblclick();
    await waitFor(() => posts.length === before + 1, 'pack shortcut save');
    await page.locator('.catalog-back').click();
    await shot('groups');
    await page.locator('.catalog-pack-delete').click();
    await page.getByRole('dialog').getByRole('button', { name: '実行' }).click();
    await waitFor(() => shortcutPacks.length === 0, 'pack deleted');
    const { buildZip } = await import('../web/v4/settings/zip.js');
    const manifest = {
      format: 'tapoard-shortcuts',
      version: 1,
      name: 'Zip Pack',
      shortcuts: [{ name: 'Picture shortcut', keys: 'F6', icon: 'one.png' }],
    };
    const png = makePng();
    const zip = buildZip([
      { name: 'shortcuts.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'icons/one.png', bytes: png },
    ]);
    await input.setInputFiles({ name: 'pack.tpshortcuts', mimeType: 'application/zip', buffer: Buffer.from(await zip.arrayBuffer()) });
    await waitFor(() => shortcutPacks.length === 1 && Boolean(shortcutPacks[0].iconPack), 'zip pack with icon imported');
    assert.equal(iconPack.icons.length, 1, 'only the referenced picture is imported');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    if (process.env.UI_SHOTS) {
      fs.mkdirSync(process.env.UI_SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.UI_SHOTS, 'settings-catalog.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS v4 settings catalog: levels, search, VS Code, packs, safety and width');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
