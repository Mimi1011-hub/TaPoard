const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const inputRequests = [];
const releases = [];
const views = [];
let inputMode = 'ok';
const sessionDefinitions = [
  ['wheel-v', 'session-v'], ['wheel-r', 'session-r'], ['touch-1', 'session-t'], ['keypad-1', 'session-k'],
];

function item(id, type, row, column, width, height, options) {
  return { id, type, name: id, row, column, width, height, options: options || null, hideLabel: false, keyClear: null };
}

function sessions(ids) {
  return sessionDefinitions.filter(([id]) => !ids || ids.includes(id)).map(([widgetId, sessionId]) => ({ widgetId, sessionId, nextSequence: 1 }));
}

function state() {
  const items = [
    item('wheel-v', 'wheel', 0, 0, 1, 2, { sensitivity: 12 }),
    item('wheel-r', 'wheel', 0, 1, 2, 2, { style: 'rotary', sensitivity: 15, middleClick: true }),
    item('touch-1', 'touchpad', 2, 0, 3, 2, { speed: 5, acceleration: false, tapToClick: true, twoFingerScroll: true }),
    item('clock-1', 'clock', 2, 3, 2, 1), item('keypad-1', 'keypad', 4, 0, 4, 5),
  ];
  const orientation = { columns: 5, rows: 9, faders: { speaker: { off: true }, mic: { off: true } }, pages: [{ faders: null, items }, { faders: null, items: [item('clock-2', 'clock', 0, 0, 2, 1)] }] };
  return { schemaVersion: 3, revision: 1, version: 'input-one', current: { portrait: 0, landscape: 0 }, deck: { keepAwake: false, portrait: orientation, landscape: orientation },
    widgetDefinitions: ['wheel', 'touchpad', 'keypad', 'clock'].map((type) => ({ type, displayOnly: true })), inputSessions: sessions(), audio: {}, metrics: {}, weather: {}, background: null };
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
    if (url.pathname === '/api/sync') { setTimeout(() => json(response, 200, { revision: 1, version: 'input-one', inputSessions: sessions() }), 80); return; }
    if (url.pathname === '/api/view') {
      const value = JSON.parse(body); views.push(value); json(response, 200, { inputSessions: sessions(value.visibleIds) }); return;
    }
    if (url.pathname === '/api/input') {
      const value = JSON.parse(body); inputRequests.push(value);
      if (inputMode === 'busy') { inputMode = 'ok'; json(response, 409, { error: '他の端末が操作中です。' }); return; }
      const blocked = inputMode === 'blocked'; inputMode = 'ok'; json(response, 200, { acknowledged: value.sequence, foregroundBlocked: blocked }); return;
    }
    if (url.pathname === '/api/input/release') { releases.push(JSON.parse(body)); json(response, 200, { ok: true }); return; }
    if (url.pathname === '/api/input/keepalive') { json(response, 200, { ok: true }); return; }
    if (url.pathname === '/api/page') { json(response, 200, { ok: true }); return; }
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
function eventsSince(index) { return inputRequests.slice(index).flatMap((request) => request.events); }

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const context = await browser.newContext({ viewport: { width: 500, height: 900 }, locale: 'ja-JP', hasTouch: true, isMobile: true });
    await context.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {} }) } }));
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${base}/v4/#connect=test`); await page.locator('.wheel-widget').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.keypad-key').length === 17);
    assert(views.some((view) => view.visibleIds.includes('wheel-v') && view.visibleIds.includes('touch-1') && !view.visibleIds.includes('clock-1')));

    let start = inputRequests.length;
    const vertical = await page.locator('[data-widget-id="wheel-v"]').boundingBox();
    await page.mouse.move(vertical.x + vertical.width / 2, vertical.y + vertical.height - 8); await page.mouse.down();
    await page.mouse.move(vertical.x + vertical.width / 2, vertical.y + 8, { steps: 10 }); await page.mouse.up(); await wait(250);
    assert(eventsSince(start).some((event) => event.type === 'steps' && event.delta > 0), 'vertical wheel sends positive steps upward');
    assert(releases.some((value) => value.sessionId === 'session-v'));
    const wheelSequences = inputRequests.filter((value) => value.sessionId === 'session-v').map((value) => value.sequence);
    assert(wheelSequences.every((value, index) => index === 0 || value > wheelSequences[index - 1]), 'stale sessions do not rewind sequence');

    start = inputRequests.length;
    const rotary = await page.locator('[data-widget-id="wheel-r"]').boundingBox();
    assert.equal(await page.locator('[data-widget-id="wheel-r"]').getAttribute('class'), 'deck-tile widget-tile wheel-widget wheel-rotary');
    assert.equal(await page.locator('[data-widget-id="wheel-r"] .wheel-center').innerText(), '中');
    const cx = rotary.x + rotary.width / 2; const cy = rotary.y + rotary.height / 2; const radius = Math.min(rotary.width, rotary.height) * .38;
    await page.mouse.move(cx + radius, cy); await page.mouse.down();
    for (const angle of [45, 90, 135, 180, 225]) await page.mouse.move(cx + Math.cos(angle * Math.PI / 180) * radius, cy + Math.sin(angle * Math.PI / 180) * radius);
    await page.mouse.up(); await wait(180);
    assert(eventsSince(start).some((event) => event.type === 'steps'), 'rotary wheel sends steps');
    const center = await page.locator('[data-widget-id="wheel-r"] .wheel-center').boundingBox();
    start = inputRequests.length; await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2); await wait(150);
    assert.deepEqual(eventsSince(start).filter((event) => event.type.startsWith('button')).map((event) => `${event.type}:${event.control}`), ['buttonDown:middle', 'buttonUp:middle']);

    const pad = await page.locator('[data-widget-id="touch-1"]').boundingBox(); const px = pad.x + pad.width / 2; const py = pad.y + pad.height / 2;
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    start = inputRequests.length; await touch('touchStart', [[px - 30, py]]); await touch('touchMove', [[px + 30, py]]); await touch('touchEnd', []); await wait(150);
    assert(eventsSince(start).some((event) => event.type === 'move' && event.dx > 0));
    start = inputRequests.length; await wait(350); await touch('touchStart', [[px, py]]); await touch('touchEnd', []); await wait(150);
    assert(eventsSince(start).some((event) => event.type === 'buttonDown' && event.control === 'left'));
    start = inputRequests.length; await wait(350); await touch('touchStart', [[px - 15, py], [px + 15, py]]); await touch('touchEnd', []); await wait(150);
    assert(eventsSince(start).some((event) => event.type === 'buttonDown' && event.control === 'right'));
    start = inputRequests.length; await wait(350); await touch('touchStart', [[px - 15, py - 20], [px + 15, py - 20]]); await touch('touchMove', [[px - 15, py + 20], [px + 15, py + 20]]); await touch('touchEnd', []); await wait(150);
    assert(eventsSince(start).some((event) => event.type === 'wheel'));

    const numlock = page.locator('.keypad-key[data-control="numpad-numlock"]'); const enter = page.locator('.keypad-key[data-control="numpad-enter"]');
    start = inputRequests.length; await numlock.click(); await enter.click(); await wait(180);
    assert(eventsSince(start).some((event) => event.type === 'keyTap' && event.control === 'numpad-numlock'));
    assert(eventsSince(start).some((event) => event.type === 'keyTap' && event.control === 'numpad-enter'));
    inputMode = 'busy'; await numlock.click(); await page.waitForFunction(() => document.querySelector('.keypad-widget').classList.contains('input-busy'));
    assert.match(await page.locator('.keypad-widget .input-notice').innerText(), /他端末/); await wait(2100);
    assert.equal(await page.locator('.keypad-widget').evaluate((node) => node.classList.contains('input-busy')), false);
    inputMode = 'blocked'; await enter.click(); await page.waitForFunction(() => document.querySelector('.keypad-widget').classList.contains('input-busy'));
    assert.match(await page.locator('.keypad-widget .input-notice').innerText(), /管理者権限/);
    assert.deepEqual(errors, []);
    console.log('PASS v4 input: ordered wheel, rotary, touchpad, keypad, notices and sessions');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
