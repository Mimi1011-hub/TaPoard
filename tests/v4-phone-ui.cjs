const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let revision = 1;
const pageRequests = [];
const actionRequests = [];
const layoutRequests = [];
const current = { landscape: 0, portrait: 0 };
const malicious = '<img src=x onerror=window.__injected=1>';

function faders() {
  return {
    speaker: { row: 0, column: 0, width: 1, height: 1, off: false },
    mic: { row: 0, column: 1, width: 1, height: 1, off: false },
  };
}

function item(id, name, row, column, width, height) {
  return {
    id, name, icon: null, iconKey: 'star', iconColor: '#3569c8', customIcon: null,
    type: 'app', action: null, category: 'common', deviceId: null, deviceTarget: null,
    row, column, width, height, fontSize: 11, iconScale: 82, labelOpacity: 45,
    keyClear: null, hideLabel: false, options: null,
  };
}

function state() {
  return {
    schemaVersion: 3, revision, version: String(revision), appVersion: '4.0.0', computer: 'UI test PC',
    deck: {
      keepAwake: false,
      landscape: {
        columns: 5, rows: 3, faders: faders(),
        pages: [
          { faders: null, items: [item('landscape-main', malicious, 1, 2, 2, 1)] },
          { faders: null, items: [item('landscape-two', 'Second', 1, 1, 1, 1)] },
        ],
      },
      portrait: {
        columns: 3, rows: 5, faders: faders(),
        pages: [
          { faders: null, items: [item('portrait-main', malicious, 2, 1, 2, 1)] },
          { faders: null, items: [item('portrait-two', 'Second', 1, 1, 1, 1)] },
        ],
      },
    },
    widgetDefinitions: [], current: { ...current }, background: null,
    audio: {}, metrics: {}, weather: {}, phoneConnected: true, pcWindowOpen: false, inputSessions: [],
  };
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    if (url.pathname === '/api/v3/state') { json(res, 200, state()); return; }
    if (url.pathname === '/api/sync') {
      setTimeout(() => json(res, 200, { revision, version: String(revision) }), 120);
      return;
    }
    if (url.pathname === '/api/page') {
      const value = JSON.parse(body);
      pageRequests.push(value);
      current[value.orientation] = value.page;
      revision += 1;
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/action') {
      actionRequests.push(JSON.parse(body));
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/layout') {
      layoutRequests.push(JSON.parse(body));
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/view') { json(res, 200, { ok: true }); return; }
    json(res, 404, { error: 'not found' });
    return;
  }
  let file;
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/v4' || url.pathname === '/v4/') file = 'web/v4/index.html';
  else if (url.pathname.indexOf('/v4/') === 0) file = 'web/v4/' + url.pathname.slice(4);
  else if (url.pathname === '/nosleep.min.js') file = 'web/nosleep.min.js';
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const extension = path.extname(file);
  const type = extension === '.js' ? 'application/javascript' : extension === '.css' ? 'text/css' : extension === '.json' ? 'application/json' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(fs.readFileSync(file));
});

function collectErrors(page, errors, authFailureExpected) {
  page.on('pageerror', (error) => errors.push(String(error)));
  if (!authFailureExpected)
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  // Headless browsers refuse the screen wake lock; give every page the same working one.
  return page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {} }) } });
  });
}

async function assertPlacement(page, id, row, column, width, height) {
  const grid = page.locator('#deck');
  const tile = page.locator('.deck-button');
  const gridBox = await grid.boundingBox();
  const tileBox = await tile.boundingBox();
  const style = await grid.evaluate((node) => {
    const value = getComputedStyle(node);
    return { columns: Number(value.getPropertyValue('--deck-columns')), rows: Number(value.getPropertyValue('--deck-rows')), columnGap: parseFloat(value.columnGap), rowGap: parseFloat(value.rowGap) };
  });
  const cellWidth = (gridBox.width - style.columnGap * (style.columns - 1)) / style.columns;
  const cellHeight = (gridBox.height - style.rowGap * (style.rows - 1)) / style.rows;
  assert(Math.abs(tileBox.x - (gridBox.x + column * (cellWidth + style.columnGap))) < 2, `${id} column`);
  assert(Math.abs(tileBox.y - (gridBox.y + row * (cellHeight + style.rowGap))) < 2, `${id} row`);
  assert(Math.abs(tileBox.width - (cellWidth * width + style.columnGap * (width - 1))) < 2, `${id} width`);
  assert(Math.abs(tileBox.height - (cellHeight * height + style.rowGap * (height - 1))) < 2, `${id} height`);
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const portrait = await browser.newPage({ locale: 'ja-JP', viewport: { width: 375, height: 667 } });
    await collectErrors(portrait, errors);
    await portrait.goto(`${base}/v4/#connect=test`);
    await portrait.locator('.deck-button').waitFor();
    await assertPlacement(portrait, 'portrait-main', 2, 1, 2, 1);
    assert.equal(await portrait.locator('.deck-button img').count(), 0, 'server name is not parsed as an image');
    assert.equal(await portrait.evaluate(() => window.__injected), undefined, 'server name cannot execute markup');
    assert.equal(await portrait.locator('.deck-label').innerText(), malicious, 'server name stays literal text');

    const landscape = await browser.newPage({ locale: 'ja-JP', viewport: { width: 667, height: 375 } });
    await collectErrors(landscape, errors);
    await landscape.goto(`${base}/v4/#connect=test`);
    await landscape.locator('.deck-button').waitFor();
    await assertPlacement(landscape, 'landscape-main', 1, 2, 2, 1);
    await landscape.close();

    const next = portrait.getByRole('button', { name: '次のページ' });
    await next.click();
    await portrait.waitForFunction(() => document.querySelector('.deck-label').textContent === 'Second');
    assert.deepEqual(pageRequests.at(-1), { page: 1, orientation: 'portrait' });
    await portrait.getByRole('button', { name: '前のページ' }).click();
    await portrait.waitForFunction(() => document.querySelector('.deck-label').textContent.startsWith('<img'));

    const beforeSwipe = pageRequests.length;
    const deckBox = await portrait.locator('#deck').boundingBox();
    await portrait.mouse.move(deckBox.x + deckBox.width * 0.8, deckBox.y + deckBox.height / 2);
    await portrait.mouse.down();
    await portrait.mouse.move(deckBox.x + deckBox.width * 0.2, deckBox.y + deckBox.height / 2, { steps: 8 });
    await portrait.mouse.up();
    for (let count = 0; count < 30 && pageRequests.length === beforeSwipe; count += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(pageRequests.length, beforeSwipe + 1, 'swipe sends one page request');
    assert.deepEqual(pageRequests.at(-1), { page: 1, orientation: 'portrait' });

    await portrait.evaluate(() => localStorage.setItem('tapoard-swipe', 'off'));
    await portrait.getByRole('button', { name: '前のページ' }).click();
    const disabledSwipeCount = pageRequests.length;
    await portrait.mouse.move(deckBox.x + deckBox.width * 0.8, deckBox.y + deckBox.height / 2);
    await portrait.mouse.down();
    await portrait.mouse.move(deckBox.x + deckBox.width * 0.2, deckBox.y + deckBox.height / 2, { steps: 8 });
    await portrait.mouse.up();
    await portrait.waitForTimeout(180);
    assert.equal(pageRequests.length, disabledSwipeCount, 'tapoard-swipe=off disables swiping');

    await portrait.locator('.deck-button').click();
    for (let count = 0; count < 30 && actionRequests.length === 0; count += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(actionRequests.at(-1), { action: 'launch', id: 'portrait-main' });

    await portrait.getByRole('button', { name: '画面と接続の設定' }).click();
    const layoutCount = layoutRequests.length;
    const writeCount = pageRequests.length + actionRequests.length + layoutRequests.length;
    await portrait.locator('label.menu-toggle').filter({ hasText: '画面を維持' }).click();
    assert.equal(await portrait.evaluate(() => localStorage.getItem('tapoard-keep-awake')), '1');
    assert.equal(layoutRequests.length, layoutCount, 'keep-awake never writes server layout');
    assert.equal(pageRequests.length + actionRequests.length + layoutRequests.length, writeCount, 'keep-awake makes no server write');
    const urlBeforeLanguage = portrait.url();
    await portrait.locator('.language-row select').selectOption('en');
    await portrait.waitForFunction(() => document.querySelector('.menu-header h2').textContent === 'Display & Connection');
    assert.equal(portrait.url(), urlBeforeLanguage, 'language changes without a reload');
    await portrait.close();

    const narrow = await browser.newPage({ locale: 'ja-JP', viewport: { width: 320, height: 568 } });
    await collectErrors(narrow, errors);
    await narrow.goto(`${base}/v4/#connect=test`);
    await narrow.locator('.deck-button').waitFor();
    assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '320px has no horizontal scrolling');
    await narrow.close();

    const unauthorized = await browser.newPage({ locale: 'ja-JP', viewport: { width: 375, height: 667 } });
    await collectErrors(unauthorized, errors, true);
    await unauthorized.goto(`${base}/v4/#connect=bad`);
    await unauthorized.locator('#disconnected:not([hidden])').waitFor();
    assert.equal(await unauthorized.locator('#disconnected h1').innerText(), '接続されていません');
    await unauthorized.close();
    assert.deepEqual(errors, []);
    console.log('PASS v4 phone UI: v3 grid positions, paging, swipe preference, action, local keep-awake, live language, auth loss, text safety and 320px width');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
