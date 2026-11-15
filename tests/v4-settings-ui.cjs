const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let version = 1;
let revision = 1;
let nextPost = 0;
let deckGets = 0;
const posts = [];
const actionRequests = [];
const audioRequests = [];
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
});
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') return json(res, 401, { error: 'unauthorized' });
    if (url.pathname === '/api/v3/deck' && req.method === 'GET') { deckGets += 1; return json(res, 200, response()); }
    if (url.pathname === '/api/v3/deck' && req.method === 'POST') {
      const value = JSON.parse(body); posts.push(value);
      if (nextPost) { const status = nextPost; nextPost = 0; return json(res, status, { error: status === 409 ? 'conflict' : 'invalid deck' }); }
      deck = value.deck; version += 1; revision += 1; return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/v3/state') return json(res, 200, state());
    if (url.pathname === '/api/sync') return setTimeout(() => json(res, 200, state()), 30);
    if (url.pathname === '/api/action') { actionRequests.push(body); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/audio') { audioRequests.push(body); return json(res, 200, { ok: true, audio: state().audio }); }
    return json(res, 404, { error: 'not found' });
  }
  let file = url.pathname === '/v4/settings.html' ? 'web/v4/settings.html' : null;
  if (url.pathname.startsWith('/v4/')) file = file || `web/v4/${url.pathname.slice(4)}`;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const extension = path.extname(file);
  const type = extension === '.js' ? 'application/javascript' : extension === '.css' ? 'text/css' : extension === '.json' ? 'application/json' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(fs.readFileSync(file));
});

async function waitFor(check, message, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 30)); }
  throw new Error(`Timed out: ${message}`);
}
async function dragToCell(page, locator, row, column, columns = 4, rows = 3) {
  const box = await locator.boundingBox();
  const overlay = await page.locator('.preview-overlay').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(overlay.x + (column + 0.5) * overlay.width / columns, overlay.y + (row + 0.5) * overlay.height / rows, { steps: 8 });
  await page.mouse.up();
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

    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/v4/settings.html#admin=test`);
    await page.locator('.preview-hit[data-kind="item"]').waitFor();
    assert(!page.url().includes('#'), 'admin hash is removed');
    assert.equal(await page.locator('.deck-button').count(), 1, 'preview contains the configured button');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '1100px has no horizontal scroll');

    await page.locator('.deck-button').click({ force: true });
    await page.locator('.audio-mute').first().click({ force: true });
    assert.equal(actionRequests.length, 0, 'preview button does not call action API');
    assert.equal(audioRequests.length, 0, 'preview fader does not call audio API');

    const firstPost = posts.length;
    const firstGets = deckGets;
    await dragToCell(page, page.locator('.preview-hit[data-kind="item"]'), 0, 2);
    await waitFor(() => posts.length === firstPost + 1, 'drag save');
    assert.equal(posts.at(-1).baseVersion, '1');
    assert.equal(posts.at(-1).deck.landscape.pages[0].items[0].column, 2);
    await waitFor(() => deckGets > firstGets, 'GET after POST');

    const overlapPosts = posts.length;
    await dragToCell(page, page.locator('.preview-hit[data-kind="item"]'), 2, 0);
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(posts.length, overlapPosts, 'overlap does not save');

    const catalogPosts = posts.length;
    await page.locator('.settings-catalog-item[data-action="common-copy"]').dblclick();
    await waitFor(() => posts.length === catalogPosts + 1, 'catalog save');
    assert(posts.at(-1).deck.landscape.pages[0].items.some((value) => value.action === 'common-copy'));
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()) === '保存しました', 'catalog GET');
    const allCatalogItems = await page.locator('.settings-catalog-item').count();
    await page.locator('.settings-catalog-search').fill('貼り付け');
    const filteredCatalogItems = await page.locator('.settings-catalog-item').count();
    assert(filteredCatalogItems > 0 && filteredCatalogItems < allCatalogItems, 'catalog search filters items');
    await page.locator('.settings-catalog-search').fill('');

    const pagePosts = posts.length;
    await page.getByRole('button', { name: 'ページを追加' }).click();
    await page.locator('.settings-page-tab.is-active .settings-page-name').dblclick();
    await page.locator('.settings-page-input').fill('Work');
    await page.locator('.settings-page-input').press('Enter');
    await waitFor(() => posts.length === pagePosts + 1, 'page save');
    assert.equal(posts.at(-1).deck.landscape.pages[1].name, 'Work');

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
    await waitFor(() => posts.length === conflictPosts + 1, '409 POST');
    assert.equal(await page.evaluate(() => document.querySelector('#settings-conflict').hidden), false, '409 shows conflict band');
    await page.locator('[data-conflict="reload"]').click();
    await waitFor(() => page.evaluate(() => document.querySelector('#settings-conflict').hidden), 'conflict closes');

    await page.locator('.preview-hit[data-kind="item"]').first().click();
    const name = page.locator('.settings-inspector textarea').first();
    nextPost = 400;
    await name.fill('Invalid'); await name.blur();
    await waitFor(async () => (await page.locator('#settings-save-status').innerText()).includes('invalid deck'), '400 error');
    assert.notEqual(await page.locator('.settings-inspector textarea').first().inputValue(), 'Invalid', '400 restores saved deck');

    await page.locator('.settings-inspector textarea').first().fill('Unsaved');
    await page.locator('.settings-inspector textarea').first().blur();
    version += 1; revision += 1;
    await page.locator('#settings-conflict:not([hidden])').waitFor();
    assert.equal(await page.locator('.settings-inspector textarea').first().inputValue(), 'Unsaved', 'external version does not overwrite dirty edit');

    await page.getByRole('button', { name: '見た目' }).click();
    assert((await page.locator('#settings-notice').innerText()).includes('次の更新'));
    const unexpectedErrors = errors.filter((value) => !value.includes('Failed to load resource'));
    assert.deepEqual(unexpectedErrors, [], `console errors: ${unexpectedErrors.join('\n')}`);
    console.log('PASS v4 settings UI: auth, layout edits, save, conflict, validation, preview safety and 1100px width');
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    server.close();
    if (server.closeAllConnections) server.closeAllConnections();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
