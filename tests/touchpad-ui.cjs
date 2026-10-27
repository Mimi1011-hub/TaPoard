const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

let apps = [];
let revision = 1;
let version = '1';
let busy = false;
let elevated = false;
const nextSequence = {};
const inputs = [];
const releases = [];
const keepalives = [];
const syncWaiters = new Set();
const controls = {
  speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1,
  speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1,
  micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1,
};
function sessions(ids) {
  return apps.filter(app => (app.type === 'wheel' || app.type === 'touchpad') && ids.includes(app.id))
    .map(app => ({ widgetId: app.id, sessionId: 'session-' + app.id, nextSequence: nextSequence[app.id] || 1, expiresInMs: 30000 }));
}
function state(ids) {
  return {
    apps, revision, version, appVersion: '2.0', computer: 'タッチパッドテストPC',
    landscapeGrid: { columns: 5, rows: 3 }, portraitGrid: { columns: 3, rows: 5 },
    landscapeControls: controls, portraitControls: controls,
    landscapePage: 0, portraitPage: 0, landscapePages: 1, portraitPages: 1,
    columns: 5, rows: 3, speakerSlot: 0, micSlot: 1, keepAwake: false, phoneConnected: false,
    audio: { speakerVolume: 50, micVolume: 50, speakerAvailable: true, micAvailable: true, devices: [] },
    inputSessions: ids ? sessions(ids) : undefined,
  };
}
function bump() {
  revision++;
  version = String(Number(version) + 1);
  for (const waiter of [...syncWaiters]) {
    clearTimeout(waiter.timer);
    syncWaiters.delete(waiter);
    if (!waiter.res.writableEnded) waiter.res.end(JSON.stringify(state()));
  }
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.startsWith('/api/') ? 'application/json' : 'text/html');
  if (path === '/api/sync') {
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => { syncWaiters.delete(waiter); if (!res.writableEnded) res.end(JSON.stringify(state())); }, 20000);
    syncWaiters.add(waiter);
    res.on('close', () => { clearTimeout(waiter.timer); syncWaiters.delete(waiter); });
    return;
  }
  if (path === '/api/settings') {
    if (req.method === 'POST') {
      apps = JSON.parse(body).apps.map((app, index) => ({ ...app, id: app.id || 'pad-' + index }));
      bump();
      res.end('{"ok":true}');
    } else res.end(JSON.stringify({ ...state(), token: 'test', lanUrl: 'http://example.local/', ipUrls: [], networkStatus: 'テスト', qrUrl: 'http://example.local/#connect=test' }));
    return;
  }
  if (path === '/api/state') {
    const visible = url.searchParams.get('visibleIds');
    res.end(JSON.stringify(state(visible ? visible.split(',') : [])));
    return;
  }
  if (path === '/api/view') { res.end(JSON.stringify({ ok: true, inputSessions: sessions(JSON.parse(body).visibleIds) })); return; }
  if (path === '/api/input') {
    const input = JSON.parse(body);
    inputs.push(input);
    if (busy) { res.writeHead(400); res.end(JSON.stringify({ error: '他の端末が操作中です。' })); return; }
    const widgetId = input.sessionId.slice('session-'.length);
    assert.equal(input.sequence, nextSequence[widgetId] || 1, 'the device sends consecutive sequences');
    nextSequence[widgetId] = input.sequence + 1;
    await new Promise(resolve => setTimeout(resolve, 30));
    res.end(JSON.stringify({ ok: true, acknowledged: input.sequence, duplicate: false, serverElapsedMs: 0, foregroundBlocked: elevated }));
    return;
  }
  if (path === '/api/input/release') { releases.push(JSON.parse(body)); res.end('{"ok":true}'); return; }
  if (path === '/api/input/keepalive') { keepalives.push(JSON.parse(body)); res.end('{"ok":true}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/page') { res.end(JSON.stringify(state())); return; }
  const file = path === '/' || path === '/settings' ? 'index.html' : path.slice(1);
  if (!/^[\w.-]+$/.test(file)) { res.writeHead(404); res.end(); return; }
  try { res.end(fs.readFileSync('web/' + file)); } catch { res.writeHead(404); res.end(); }
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle(count) {
  for (let i = 0; i < 60 && releases.length < count; i++) await wait(50);
  assert(releases.length >= count, 'lifting the fingers releases pointer ownership');
}
const eventsSince = index => inputs.slice(index).flatMap(input => input.events);
const buttons = list => list.filter(e => e.type === 'buttonDown' || e.type === 'buttonUp').map(e => e.type + ':' + e.control);

// Waits for the explicit save and the settings reload that follows it, not for an older notice.
async function save(page) {
  let posted = false;
  const refreshed = page.waitForResponse(response => {
    const path = new URL(response.url()).pathname, method = response.request().method();
    if (path === '/api/settings' && method === 'POST') posted = true;
    return posted && path === '/api/settings' && method === 'GET';
  });
  await page.locator('#save').click();
  await refreshed;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    admin.on('pageerror', error => errors.push(String(error)));
    await admin.goto(base + '/settings#test');
    const group = admin.locator('.shortcut-group').filter({ hasText: 'マウス操作' });
    await group.locator('summary').click();
    await group.locator('.shortcut-row[data-action="widget-touchpad-wide"]').getByRole('button', { name: '追加', exact: true }).click();
    await admin.locator('#preview-deck .touchpad-widget').waitFor();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('追加して自動保存'));
    assert.equal(apps.length, 1);
    assert.equal(apps[0].type, 'touchpad');
    assert.equal(apps[0].width, 3);
    assert.equal(apps[0].height, 2);
    assert.deepEqual(apps[0].options, { speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' });
    assert.equal(await admin.locator('#preview-deck .touchpad-widget').evaluate(node => node.style.gridColumn.includes('span 3') && node.style.gridRow.includes('span 2')), true);
    const settings = admin.locator('.editor .touchpad-settings');
    await settings.locator('select').selectOption('rightClick');
    await settings.locator('input[data-option="acceleration"]').uncheck();
    await save(admin);
    assert.equal(apps[0].options.longPress, 'rightClick');
    assert.equal(apps[0].options.acceleration, false);

    const context = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    phone.on('pageerror', error => errors.push(String(error)));
    await phone.goto(base + '/#connect=test');
    const pad = phone.locator('#deck .touchpad-widget');
    await pad.waitFor();
    const box = await pad.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(phone);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })) });

    let start = inputs.length;
    await touch('touchStart', [[x - 60, y]]);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', [[x - 60 + i * 5, y]]); await wait(16); }
    await touch('touchEnd', []);
    await settle(1);
    let events = eventsSince(start);
    const dx = events.filter(e => e.type === 'move').reduce((sum, e) => sum + e.dx, 0);
    const dy = events.filter(e => e.type === 'move').reduce((sum, e) => sum + e.dy, 0);
    assert.equal(dx, 90, 'one finger moves the pointer by speed 5 (1.5x) without acceleration');
    assert.equal(dy, 0);
    assert.deepEqual(buttons(events), [], 'moving does not click');
    assert(inputs.length - start < 12, 'pointer movement is merged into at most 20 requests per second');

    await wait(400);
    start = inputs.length;
    await touch('touchStart', [[x, y]]);
    await touch('touchEnd', []);
    await settle(2);
    assert.deepEqual(buttons(eventsSince(start)), ['buttonDown:left', 'buttonUp:left'], 'tap is a left click');

    await wait(400);
    start = inputs.length;
    await touch('touchStart', [[x - 20, y], [x + 20, y]]);
    await touch('touchEnd', []);
    await settle(3);
    assert.deepEqual(buttons(eventsSince(start)), ['buttonDown:right', 'buttonUp:right'], 'two-finger tap is a right click');

    await wait(400);
    start = inputs.length;
    await touch('touchStart', [[x - 20, y - 30], [x + 20, y - 30]]);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', [[x - 20, y - 30 + i * 5], [x + 20, y - 30 + i * 5]]); await wait(16); }
    await touch('touchEnd', []);
    await settle(4);
    events = eventsSince(start);
    assert.equal(events.filter(e => e.type === 'wheel').reduce((sum, e) => sum + e.delta, 0), 240, 'two fingers moving down 60px scroll up two notches');
    assert.deepEqual(buttons(events), []);
    assert.equal(events.filter(e => e.type === 'move').length, 0, 'two-finger scrolling does not move the pointer');

    await wait(400);
    start = inputs.length;
    const keepalivesBefore = keepalives.length;
    await touch('touchStart', [[x, y]]);
    await touch('touchEnd', []);
    await wait(120);
    await touch('touchStart', [[x, y]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[x + i * 5, y]]); await wait(16); }
    await wait(1300);
    await touch('touchEnd', []);
    await settle(6);
    events = eventsSince(start);
    assert.deepEqual(buttons(events), ['buttonDown:left', 'buttonUp:left', 'buttonDown:left', 'buttonUp:left'], 'tap then touch-and-move drags with the left button');
    const dragDown = events.findIndex((e, i) => i > 1 && e.type === 'buttonDown');
    assert(events.slice(dragDown).some(e => e.type === 'move'), 'the pointer moves while the button is held');
    assert(keepalives.length > keepalivesBefore, 'a motionless held drag keeps ownership alive');

    await wait(400);
    start = inputs.length;
    await touch('touchStart', [[x, y]]);
    await wait(650);
    await touch('touchEnd', []);
    await settle(7);
    assert.deepEqual(buttons(eventsSince(start)), ['buttonDown:right', 'buttonUp:right'], 'long press can be set to right click');

    busy = true;
    await touch('touchStart', [[x, y]]);
    await touch('touchMove', [[x + 20, y]]);
    await touch('touchEnd', []);
    await phone.locator('#deck .touchpad-widget.input-busy').waitFor({ timeout: 2000 });
    busy = false;
    assert.equal(await phone.locator('#deck .touchpad-widget .input-busy-label').innerText(), '他端末が操作中');
    await phone.waitForFunction(() => !document.querySelector('#deck .touchpad-widget.input-busy'), null, { timeout: 4000 });

    elevated = true;
    await touch('touchStart', [[x, y]]);
    await touch('touchMove', [[x + 20, y]]);
    await touch('touchEnd', []);
    await phone.locator('#deck .touchpad-widget.input-busy').waitFor({ timeout: 2000 });
    assert.match(await phone.locator('#deck .touchpad-widget .input-busy-label').innerText(), /管理者権限の画面には\s*操作できません/, 'input dropped by an elevated window is explained on the phone');
    elevated = false;
    assert.deepEqual(errors, []);
    console.log('PASS touchpad UI: 3x2 settings, move, tap, two-finger tap and scroll, tap-drag with keepalive, long press, busy and elevated-window indicators');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
