const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const inputs = [];
let revision = 1;
let version = 'pc-one';
const current = { portrait: 0, landscape: 0 };

function item(id, type, row, column, width, height, options) {
  return { id, type, name: id, row, column, width, height, options: options || null, hideLabel: false, keyClear: null };
}

function orientation() {
  return {
    columns: 5, rows: 4, faders: { speaker: { off: true }, mic: { off: true } }, pages: [
      { name: '配信', faders: null, items: [item('action-1', 'launch', 0, 0, 1, 1), item('wheel-1', 'wheel', 0, 1, 1, 2, { sensitivity: 12 })] },
      { name: '作業', faders: null, items: [item('action-2', 'launch', 0, 0, 1, 1)] },
      { name: '', faders: null, items: [item('action-3', 'launch', 0, 0, 1, 1)] },
    ],
  };
}

function state() {
  const deck = orientation();
  return {
    schemaVersion: 3, revision, version, current: { ...current },
    deck: { keepAwake: false, portrait: deck, landscape: deck },
    widgetDefinitions: [{ type: 'wheel', displayOnly: true }],
    inputSessions: [{ widgetId: 'wheel-1', sessionId: 'pc-wheel-session', nextSequence: 1 }],
    audio: {}, metrics: {}, weather: {}, background: null,
  };
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    if (request.headers.authorization !== 'Bearer test') { json(response, 401, { error: 'unauthorized' }); return; }
    if (url.pathname === '/api/v3/state') { json(response, 200, state()); return; }
    if (url.pathname === '/api/sync') {
      setTimeout(() => json(response, 200, { revision, version, inputSessions: state().inputSessions }), 60); return;
    }
    if (url.pathname === '/api/view') { json(response, 200, { inputSessions: state().inputSessions }); return; }
    if (url.pathname === '/api/input') {
      const value = JSON.parse(body); inputs.push(value); json(response, 200, { acknowledged: value.sequence, foregroundBlocked: false }); return;
    }
    if (url.pathname === '/api/page') {
      const value = JSON.parse(body); current[value.orientation] = value.page; revision += 1; version = `pc-${revision}`;
      json(response, 200, { ok: true }); return;
    }
    if (url.pathname === '/api/ping') { json(response, 200, { ok: true }); return; }
    json(response, 200, { ok: true }); return;
  }
  let file;
  if (url.pathname === '/v4' || url.pathname === '/v4/') file = 'web/v4/index.html';
  else if (url.pathname.startsWith('/v4/')) file = `web/v4/${url.pathname.slice(4)}`;
  else if (url.pathname === '/nosleep.min.js') file = 'web/nosleep.min.js';
  if (!file || !fs.existsSync(file)) { response.writeHead(url.pathname === '/favicon.ico' ? 204 : 404); response.end(); return; }
  const extension = path.extname(file);
  const type = extension === '.js' ? 'application/javascript' : extension === '.css' ? 'text/css' : extension === '.json' ? 'application/json' : 'text/html';
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); response.end(fs.readFileSync(file));
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const context = await browser.newContext({ viewport: { width: 700, height: 500 }, locale: 'ja-JP' });
    await context.addInitScript(() => {
      window.__hostMessages = [];
      window.chrome = window.chrome || {};
      window.chrome.webview = { postMessage: (value) => window.__hostMessages.push(value) };
      try { localStorage.setItem('tapoard-swipe', 'off'); } catch (error) {}
    });
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${base}/v4/?view=pc#connect=test`);
    await page.waitForFunction(() => !!window.tapoardPc && document.querySelector('[data-widget-id="wheel-1"]'));
    assert.equal(await page.locator('#topbar').isHidden(), true);
    assert.equal(await page.evaluate(() => typeof window.tapoardPc.set), 'function');
    await page.waitForFunction(() => window.__hostMessages.includes('page:1/3'));
    await page.waitForFunction(() => window.__hostMessages.includes('pagename:配信'));

    await page.evaluate(() => { window.__hostMessages = []; });
    await page.mouse.move(15, 250); await page.mouse.down(); await page.mouse.move(42, 270, { steps: 3 }); await page.mouse.up();
    const dragMessages = await page.evaluate(() => window.__hostMessages.filter((value) => value === 'raise' || value.startsWith('drag:') || value.startsWith('move:') || value === 'dragend'));
    assert.equal(dragMessages[0], 'raise'); assert.match(dragMessages[1], /^drag:/); assert(dragMessages.some((value) => value.startsWith('move:'))); assert.equal(dragMessages.at(-1), 'dragend');

    await page.evaluate(() => window.tapoardPc.set({ resizable: true, barVisible: false }));
    await page.mouse.move(698, 498); await page.mouse.down(); await page.mouse.up();
    assert((await page.evaluate(() => window.__hostMessages)).includes('resize:bottomright'));

    await page.evaluate(() => window.tapoardPc.page(1));
    await page.waitForFunction(() => window.__hostMessages.includes('page:2/3'));
    await page.waitForFunction(() => window.__hostMessages.includes('pagename:作業'));
    const button = page.locator('.deck-button').filter({ hasText: 'action-2' }); await button.hover(); await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => window.__hostMessages.includes('page:3/3'));
    await page.waitForFunction(() => window.__hostMessages.includes('pagename:'));
    await page.evaluate(() => window.tapoardPc.page(-1)); await page.waitForFunction(() => window.__hostMessages.includes('page:2/3'));
    await page.evaluate(() => window.tapoardPc.page(-1)); await page.waitForFunction(() => window.__hostMessages.includes('page:1/3'));

    await page.evaluate(() => window.tapoardPc.set({ info: true, aspect: 'fill', viewOnly: true, resizable: true, barVisible: false }));
    await page.waitForFunction(() => !document.querySelector('.pc-info').hidden && document.querySelector('.pc-info').textContent.includes('接続中'));
    assert.match(await page.locator('.pc-info').innerText(), /描画.*PC との往復.*最後の操作/s);
    assert.equal(await page.locator('.pc-view-only').isVisible(), true);
    assert.equal(await page.locator('.pc-view-only').innerText(), '見るだけモード　Ctrl+Alt+V で戻す');
    assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('pc-fill')), true);
    assert.equal(await page.locator('.deck-shell').evaluate((node) => node.style.width), '');

    const beforeInput = inputs.length; await page.locator('[data-widget-id="wheel-1"]').hover(); await page.mouse.wheel(0, 100); await wait(180);
    assert(inputs.slice(beforeInput).some((request) => request.events.some((event) => event.type === 'steps' && event.delta === -1)));
    await page.evaluate(() => window.tapoardPc.menu()); await page.locator('.phone-menu').waitFor();
    const menuText = await page.locator('.phone-menu').innerText();
    assert.match(menuText, /スワイプでページ送り/); assert.match(menuText, /言語/);
    assert.doesNotMatch(menuText, /接続を切る|画面を維持|振動/);
    assert.deepEqual(errors, []);
    console.log('PASS v4 PC window: host messages, resize, pages, info, wheel and menu');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
