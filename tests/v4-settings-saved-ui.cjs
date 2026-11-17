// The "saved" section of the settings window: presets, saved looks, backups and the PC-side undo.
const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let version = 1;
let revision = 1;
const calls = [];
const evil = '<img src=x onerror="window.hacked=1">';

const item = (id, name, row, column) => ({
  id, name, type: 'hotkey', action: 'media-play', category: 'music', iconKey: '', iconColor: '', customIcon: '',
  row, column, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45, keyClear: null, hideLabel: false,
});
const faders = () => ({
  speaker: { row: 2, column: 0, width: 1, height: 1, off: true },
  mic: { row: 2, column: 1, width: 1, height: 1, off: true },
});
const orientation = (columns, rows, items) => ({ columns, rows, faders: faders(), pages: [{ name: '', faders: null, items }, { name: '', faders: null, items: [] }] });
let deck = {
  background: {},
  landscape: orientation(4, 3, [item('one', 'First', 0, 0)]),
  portrait: orientation(3, 4, [item('two', 'Second', 0, 0)]),
};
const presetLayout = (columns, rows) => ({
  columns, rows,
  speaker: { row: rows - 1, column: 0, width: 2, height: 1 },
  mic: { row: rows - 1, column: 2, width: 2, height: 1 },
  items: [
    { name: 'Clock', type: 'clock', style: 'digital', row: 0, column: 0, width: 2, height: 1 },
    { name: 'Weather', type: 'weather', view: 'days', row: 0, column: 2, width: 2, height: 2 },
    { name: 'PC', type: 'metrics', metric: 'overview', row: 1, column: 0, width: 2, height: 2 },
    { name: 'Mute', type: 'hotkey', icon: 'mute', key: true, sends: 'Ctrl+Shift+M', description: evil,
      row: 0, column: columns - 1, width: 1, height: 1 },
  ],
});
const presets = [
  { id: 'streamer', name: `Streamer ${evil}`, note: 'For streaming', setup: 'Set the same keys.', landscape: presetLayout(5, 3), portrait: presetLayout(3, 5) },
  { id: 'simple', name: 'Simple', note: 'Just the basics', setup: '', landscape: presetLayout(4, 3), portrait: presetLayout(3, 4) },
];
let customPresets = [];
let styles = [{ id: 'style-1', name: `Old ${evil}`, created: '2026-11-01T10:05:00', count: 3, customCount: 0, color: '#14213d', color2: '', hasImage: false }];
const backups = [{ id: 'backup-1', time: '2026/10/01 12:00', landscape: 4, portrait: 2 }];

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
const state = () => ({ version: String(version), revision, phoneConnected: false, pcWindowOpen: false, audio: {}, metrics: {}, weather: {}, background: {} });
function changed(res, extra) {
  version += 1;
  revision += 1;
  json(res, 200, Object.assign({ ok: true, version: String(version) }, extra));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') return json(res, 401, { error: 'key' });
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const name = url.pathname.slice(5);
    if (name === 'v3/language') {
      const language = String(req.headers['accept-language'] || '').startsWith('en') ? 'en' : 'ja';
      return json(res, 200, {
        preference: language, language, languages: [{ id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }],
      });
    }
    if (req.method === 'POST' || name === 'v3/deck') calls.push({ name: `${req.method} ${name}`, body });
    if (name === 'v3/deck' && req.method === 'GET') return json(res, 200, { version: String(version), deck, widgetDefinitions: [{ type: 'hotkey', sizes: ['1x1'] }] });
    if (name === 'v3/deck') { deck = body.deck; return changed(res); }
    if (name === 'v3/state') return json(res, 200, state());
    if (name === 'sync') return setTimeout(() => json(res, 200, state()), 30);
    if (name === 'icon-packs') return json(res, 200, { packs: [], maxPacks: 50, maxIcons: 5000 });
    if (name === 'shortcut-packs') return json(res, 200, { packs: [], maxPacks: 20, maxShortcuts: 300 });
    if (name === 'presets') return json(res, 200, { presets: presets.concat(customPresets) });
    if (name === 'presets/save') {
      const layout = presetLayout(deck[body.orientation].columns, deck[body.orientation].rows);
      customPresets.push({ id: '1234567890abcdef1234567890abcdef', name: body.name, note: '', setup: '', custom: true,
        orientation: body.orientation, [body.orientation]: layout });
      return json(res, 200, { ok: true });
    }
    if (name === 'presets/rename') {
      customPresets.find((preset) => preset.id === body.id).name = body.name;
      return json(res, 200, { ok: true });
    }
    if (name === 'presets/delete') { customPresets = customPresets.filter((preset) => preset.id !== body.id); return json(res, 200, { ok: true }); }
    if (name === 'presets/apply') {
      deck[body.orientation].pages[body.page].items = [item('preset', 'Mute', 0, 0)];
      return changed(res);
    }
    if (name === 'presets/export') {
      const value = JSON.stringify({ format: 'tapoard-preset', version: 1, presets: [] });
      return json(res, 200, { name: 'My preset.tppreset', data: Buffer.from(value).toString('base64') });
    }
    if (name === 'presets/import' && !body.selected) {
      return json(res, 200, {
        presets: [
          { index: 0, name: 'Imported', orientation: 'landscape', columns: 4, rows: 3, buttons: 1 },
          { index: 1, name: 'Second import', orientation: 'portrait', columns: 3, rows: 4, buttons: 2 },
        ],
        safety: { apps: 1, urls: 1, texts: 0, paths: ['C:\\Apps\\stream.exe'] },
        available: 1,
      });
    }
    if (name === 'presets/import') {
      const added = body.selected.map((index) => ({
        id: `imported-${index}`,
        name: index ? 'Second import' : 'Imported',
        note: '',
        setup: '',
        custom: true,
        orientation: index ? 'portrait' : 'landscape',
        [index ? 'portrait' : 'landscape']: presetLayout(index ? 3 : 4, index ? 4 : 3),
      }));
      customPresets.push(...added);
      return json(res, 200, { presets: added });
    }
    if (name === 'icon-styles' && req.method === 'GET') return json(res, 200, { styles, maxStyles: 20 });
    if (name === 'icon-styles/save') {
      styles = styles.concat({ id: `style-${styles.length + 1}`, name: body.name, created: '2026-11-15T22:00:00', count: 1, color: '', color2: '', hasImage: false });
      return json(res, 200, { ok: true });
    }
    if (name === 'icon-styles/rename') { styles.find((style) => style.id === body.id).name = body.name; return json(res, 200, { ok: true }); }
    if (name === 'icon-styles/delete') { styles = styles.filter((style) => style.id !== body.id); return json(res, 200, { ok: true }); }
    if (name === 'icon-styles/apply') return changed(res, { changed: 3 });
    if (name === 'backups') return json(res, 200, { backups });
    if (name === 'backups/restore') return changed(res, { buttons: 6 });
    if (name === 'page/undo') return changed(res);
    if (name === 'pc-window') return json(res, 200, { options: { previewMode: 'pc', previewRatio: 'auto' }, phoneWidth: 0, phoneHeight: 0 });
    return json(res, 404, { error: 'not found' });
  }
  let file = url.pathname.startsWith('/v4/') ? `web/v4/${url.pathname.slice(4)}` : '';
  if (url.pathname === '/qrcode.js') file = 'web/qrcode.js';
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'text/html'}; charset=utf-8` });
  res.end(fs.readFileSync(file));
});

async function waitFor(check, message, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${message}`);
}
const names = (from) => calls.slice(from).map((call) => call.name);

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    let promptAnswer = 'Renamed';
    page.on('dialog', (dialog) => (dialog.type() === 'prompt' ? dialog.accept(promptAnswer) : dialog.accept()));
    await page.goto(`${base}/v4/settings.html#admin=test`);
    await page.locator('.preview-hit[data-kind="item"]').first().waitFor();

    // Presets have their own section; choosing one replaces the preview with a read-only sample.
    await page.locator('.preview-hit[data-kind="item"]').first().click();
    await page.locator('#settings-inspector textarea').first().fill('Edited');
    await page.locator('.settings-nav [data-section="saved"]').click();
    assert.equal(await page.locator('#settings-section-saved .preset-tab').count(), 0, 'saved section has no presets');
    await page.locator('.settings-nav [data-section="layout"]').click();
    await page.locator('.settings-page-tab').nth(1).locator('.settings-page-name').click();
    await page.locator('.settings-nav [data-section="presets"]').click();
    await page.locator('.preset-tab').first().waitFor();
    assert.equal(await page.locator('.preset-tab').count(), 2);
    assert(await page.locator('.preset-tab').first().innerText().then((text) => text.includes('<img')), 'preset names are shown as text');
    await page.locator('.preset-tab').first().click();
    assert.match(await page.locator('#settings-preview-title').innerText(), /Streamer/);
    assert.equal(await page.locator('.preview-hit').count(), 0, 'preset sample cannot be selected or dragged');
    assert((await page.locator('.settings-preview .deck-tile').count()) > 0, 'preset sample uses the real preview');
    const sampleBox = await page.locator('.settings-preview-screen').boundingBox();
    assert(sampleBox.height >= 150, `preset preview keeps a useful height: ${sampleBox.height}`);
    assert(Math.abs(sampleBox.width / sampleBox.height - 5 / 3) < 0.08, 'preset preview keeps the preset grid ratio');
    await page.locator('#settings-preset-back').click();
    assert((await page.locator('.preview-hit, .preview-empty').count()) > 0, 'back restores the own-page preview');
    await page.locator('.preset-tab').first().click();
    let from = calls.length;
    await page.getByRole('button', { name: 'このページに使う' }).click();
    const dialog = page.locator('.look-dialog[open]');
    await dialog.waitFor();
    const reason = await dialog.locator('.look-dialog-reason').innerText();
    assert(reason.includes('2 ページ目') && reason.includes('4×3') && reason.includes('5×3'), `preset confirm names the page and the grid change: ${reason}`);
    await dialog.locator('.look-dialog-name').fill('Before preset');
    await dialog.getByRole('button', { name: '保存して進む' }).click();
    await waitFor(() => names(from).includes('POST page/undo') || names(from).includes('POST presets/apply'), 'preset applied');
    const order = names(from).filter((name) => name.startsWith('POST'));
    assert.deepEqual(order, ['POST v3/deck', 'POST icon-styles/save', 'POST presets/apply'], `order: ${order.join(', ')}`);
    assert.equal(calls.find((call) => call.name === 'POST v3/deck').body.deck.landscape.pages[0].items[0].name, 'Edited');
    assert.equal(calls.find((call) => call.name === 'POST icon-styles/save').body.name, 'Before preset');
    assert.deepEqual(calls.find((call) => call.name === 'POST presets/apply').body, { id: 'streamer', orientation: 'landscape', page: 1 });
    await waitFor(() => names(from).lastIndexOf('GET v3/deck') > names(from).indexOf('POST presets/apply'), 'layout read again');
    await page.locator('.settings-notice-action').waitFor();
    assert.equal(await page.locator('#settings-undo').isDisabled(), true, 'local undo is empty after a PC-side change');
    assert.equal(await page.locator('.settings-page-tab.is-active').count(), 1);
    await waitFor(async () => (await page.locator('.preview-hit[data-kind="item"]').count()) === 1, 'preview shows the preset page');

    // The notice offers one undo on the PC.
    from = calls.length;
    await page.locator('.settings-notice-action').click();
    await waitFor(() => names(from).includes('POST page/undo') && names(from).includes('GET v3/deck'), 'PC-side undo and reload');

    // Custom presets can be added, renamed and deleted.
    await page.locator('.settings-nav [data-section="presets"]').click();
    promptAnswer = 'My preset';
    from = calls.length;
    await page.getByRole('button', { name: '今のページをプリセットに追加' }).click();
    await waitFor(() => names(from).includes('POST presets/save'), 'custom preset saved');
    await waitFor(async () => (await page.locator('.preset-tab').count()) === 3, 'custom preset listed');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '書き出す' }).last().click();
    assert.equal((await download).suggestedFilename(), 'My preset.tppreset');
    const presetFile = Buffer.from(JSON.stringify({ format: 'tapoard-preset', version: 1, presets: [] }));
    await page.locator('input[type="file"][accept*="tppreset"]').setInputFiles({
      name: 'shared.tppreset', mimeType: 'application/json', buffer: presetFile,
    });
    const importDialog = page.locator('.preset-import-dialog');
    await importDialog.waitFor();
    assert.equal(await importDialog.locator('input:checked').count(), 1, 'capacity checks only the number that can be added');
    assert.equal(await importDialog.locator('input:disabled').count(), 1, 'capacity disables additional presets');
    assert.match(await importDialog.innerText(), /Imported.*横向き 4×3.*ボタン 1 個/s);
    assert.match(await importDialog.innerText(), /stream\.exe/);
    await importDialog.getByRole('button', { name: '読み込む', exact: true }).click();
    await waitFor(() => names(from).includes('POST presets/import'), 'preset file imported');
    await waitFor(async () => (await page.locator('.preset-tab').count()) === 4, 'imported preset listed');
    assert.equal(await page.locator('.preset-tab[aria-pressed="true"] strong').innerText(), 'Imported');
    promptAnswer = 'Preset renamed';
    await page.getByRole('button', { name: '名前を変える' }).last().click();
    await waitFor(() => names(from).includes('POST presets/rename'), 'custom preset renamed');
    await waitFor(async () => (await page.locator('.preset-tab').last().innerText()).includes('Preset renamed'), 'renamed preset shown');
    await page.getByRole('button', { name: '削除' }).last().click();
    await waitFor(() => names(from).includes('POST presets/delete'), 'custom preset deleted');
    await waitFor(async () => (await page.locator('.preset-tab').count()) === 3, 'custom preset removed');
    promptAnswer = 'Renamed';
    await page.locator('.settings-nav [data-section="saved"]').click();

    // Saved looks: listed as text, saved, renamed, used and deleted.
    await waitFor(async () => (await page.locator('.saved-row').count()) === 3, 'two looks and one backup');
    assert(await page.locator('.saved-row').first().innerText().then((text) => text.includes('<img')), 'look names are shown as text');
    from = calls.length;
    await page.locator('.looks-form input').fill('Evening');
    await page.getByRole('button', { name: '今の画面を保存' }).click();
    await waitFor(() => names(from).includes('POST icon-styles/save'), 'look saved');
    assert.equal(calls.at(-1).body.name, 'Evening');
    await waitFor(async () => (await page.locator('.saved-row').count()) === 4, 'saved look listed');
    await page.locator('.saved-row').first().getByRole('button', { name: '名前を変える' }).click();
    await waitFor(() => names(from).includes('POST icon-styles/rename'), 'look renamed');
    await waitFor(async () => (await page.locator('.saved-row').first().locator('strong').innerText()) === 'Renamed', 'new name shown');

    from = calls.length;
    await page.locator('.saved-row').first().getByRole('button', { name: 'この画面に戻す' }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '保存せずに進む' }).click();
    await waitFor(() => names(from).includes('POST icon-styles/apply'), 'look applied');
    assert(!names(from).includes('POST icon-styles/save'), 'skipping does not save a look');
    assert.deepEqual(calls.find((call, index) => index >= from && call.name === 'POST icon-styles/apply').body, { id: 'style-1' });
    await page.locator('.settings-notice-action').waitFor();

    from = calls.length;
    await page.locator('.saved-row').first().getByRole('button', { name: '削除' }).click();
    await waitFor(() => names(from).includes('POST icon-styles/delete'), 'look deleted');
    await waitFor(async () => (await page.locator('.saved-row').count()) === 3, 'deleted look is gone');

    // Backups: cancel does nothing; going on restores.
    from = calls.length;
    await page.getByRole('button', { name: 'この時点に戻す' }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'やめる' }).click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert(!names(from).some((name) => name.startsWith('POST')), 'cancel calls nothing');
    await page.getByRole('button', { name: 'この時点に戻す' }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '保存せずに進む' }).click();
    await waitFor(() => names(from).includes('POST backups/restore'), 'backup restored');
    assert.deepEqual(calls.find((call) => call.name === 'POST backups/restore').body, { id: 'backup-1' });

    // The preset text follows the preview's orientation.
    await page.locator('.settings-nav [data-section="presets"]').click();
    await page.locator('.preset-tab').first().click();
    await page.locator('[data-orientation="portrait"]').click();
    await waitFor(async () => (await page.locator('.preset-card .saved-note').first().innerText()).includes('3×5'), 'portrait preset layout');

    assert.equal(await page.evaluate(() => window.hacked), undefined, 'names from the PC never run as HTML');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal scroll at 1100px');
    const english = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 700 } });
    await english.goto(`${base}/v4/settings.html#admin=test&section=presets`);
    await english.getByRole('button', { name: 'Add this page as a preset' }).waitFor();
    assert.equal(await english.getByRole('button', { name: 'Import presets' }).count(), 1);
    assert.equal(await english.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await english.close();
    assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`);
    console.log('PASS v4 settings saved: presets, looks, backups, save-first order, PC-side undo and text safety');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
