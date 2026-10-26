const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

let apps = [];
let revision = 1;
let version = '1';
let busy = false;
const nextSequence = {};
const inputs = [];
const releases = [];
const syncWaiters = new Set();
const controls = {
  speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1,
  speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1,
  micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1,
};
function sessions(ids) {
  return apps.filter(app => app.type === 'wheel' && ids.includes(app.id))
    .map(app => ({ widgetId: app.id, sessionId: 'session-' + app.id, nextSequence: nextSequence[app.id] || 1, expiresInMs: 30000 }));
}
function state(ids) {
  return {
    apps, revision, version, appVersion: '2.0-dev+test', computer: 'ホイールテストPC',
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
      apps = JSON.parse(body).apps.map((app, index) => ({ ...app, id: app.id || 'wheel-' + index }));
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
    res.end(JSON.stringify({ ok: true, acknowledged: input.sequence, duplicate: false, serverElapsedMs: 0 }));
    return;
  }
  if (path === '/api/input/release') { releases.push(JSON.parse(body)); res.end('{"ok":true}'); return; }
  if (path === '/api/input/keepalive') { res.end('{"ok":true}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/page') { res.end(JSON.stringify(state())); return; }
  const file = path === '/' || path === '/settings' ? 'index.html' : path.slice(1);
  if (!/^[\w.-]+$/.test(file)) { res.writeHead(404); res.end(); return; }
  try { res.end(fs.readFileSync('web/' + file)); } catch { res.writeHead(404); res.end(); }
});

function sumSteps(list) {
  return list.reduce((total, input) => total + input.events.filter(e => e.type === 'steps').reduce((sum, e) => sum + e.delta, 0), 0);
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
    await group.locator('.shortcut-row[data-action="widget-wheel-vertical"]').getByRole('button', { name: '追加', exact: true }).click();
    await admin.locator('#preview-deck .wheel-vertical').waitFor();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('追加して自動保存'));
    assert.equal(apps.length, 1);
    assert.equal(apps[0].type, 'wheel');
    assert.equal(apps[0].width, 1);
    assert.deepEqual(apps[0].options, { style: 'vertical', sensitivity: 24, multiplier: 1, reverse: false, ctrl: false, shift: false, alt: false, middleClick: false });

    const settings = admin.locator('.editor .wheel-settings');
    await settings.locator('select').selectOption('3');
    await settings.locator('input[data-option="ctrl"]').check();
    await settings.locator('input[data-option="reverse"]').check();
    await settings.locator('input[data-option="middleClick"]').check();
    await settings.locator('input[type="range"]').fill('30');
    await admin.locator('#save').click();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('保存しました'));
    assert.equal(apps[0].options.multiplier, 3);
    assert.equal(apps[0].options.ctrl, true);
    assert.equal(apps[0].options.reverse, true);
    assert.equal(apps[0].options.middleClick, true);
    assert.equal(apps[0].options.sensitivity, 30);
    assert.equal(await admin.locator('#preview-deck .wheel-caption').innerText(), 'Ctrl + ホイール ×3');
    assert.equal(await admin.locator('.editor .icon-select-button').count(), 0);

    const phone = await browser.newPage({ viewport: { width: 667, height: 375 } });
    phone.on('pageerror', error => errors.push(String(error)));
    await phone.goto(base + '/#connect=test');
    const wheel = phone.locator('#deck .wheel-widget');
    await wheel.waitFor();
    await phone.waitForFunction(() => document.querySelector('#deck .wheel-widget'));
    const box = await wheel.boundingBox();
    const x = box.x + box.width / 2, top = box.y + 6;
    // Swipe up 95px with 30px per step: three steps upward, sent as steps only.
    await phone.mouse.move(x, top + 95);
    await phone.mouse.down();
    for (let i = 1; i <= 19; i++) await phone.mouse.move(x, top + 95 - i * 5);
    await phone.mouse.up();
    await phone.waitForFunction(() => true);
    for (let i = 0; i < 40 && releases.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(sumSteps(inputs), 3, 'three swipe steps reach the PC');
    assert(inputs.every(input => input.events.every(e => e.type === 'steps' && Math.abs(e.delta) <= 20)), 'the device never sends modifiers or wheel amounts');
    assert(inputs.length < 19, 'moves are merged while a request is in flight');
    assert.equal(releases.length, 1, 'lifting the finger releases pointer ownership');

    const before = inputs.length;
    await phone.mouse.move(x, top + 40);
    await phone.mouse.down();
    await phone.mouse.up();
    for (let i = 0; i < 40 && releases.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
    const tap = inputs.slice(before).flatMap(input => input.events);
    assert.deepEqual(tap, [{ type: 'buttonDown', control: 'middle' }, { type: 'buttonUp', control: 'middle' }], 'tap sends a middle click when enabled');

    busy = true;
    await phone.mouse.move(x, top + 80);
    await phone.mouse.down();
    for (let i = 1; i <= 10; i++) await phone.mouse.move(x, top + 80 - i * 5);
    await phone.mouse.up();
    await phone.locator('#deck .wheel-widget.input-busy').waitFor({ timeout: 2000 });
    assert.equal(await phone.locator('#deck .wheel-widget .input-busy-label').innerText(), '他端末が操作中');
    busy = false;
    await phone.locator('#deck .wheel-widget.input-busy').waitFor({ state: 'detached', timeout: 3000 });

    if (!(await group.evaluate(node => node.open))) await group.locator('summary').click();
    await group.locator('.shortcut-row[data-action="widget-wheel-rotary"]').getByRole('button', { name: '追加', exact: true }).click();
    await admin.locator('#preview-deck .wheel-rotary').waitFor();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('追加して自動保存'));
    const rotaryApp = apps.find(app => app.options.style === 'rotary');
    assert.equal(rotaryApp.width, 2);
    assert.equal(rotaryApp.height, 2);
    assert.equal(rotaryApp.options.sensitivity, 18);
    assert.equal(await admin.locator('#preview-deck .wheel-rotary').evaluate(node => node.style.gridColumn.includes('span 2')), true);

    await phone.reload();
    const rotary = phone.locator('#deck .wheel-rotary');
    await rotary.waitFor();
    const dial = await rotary.boundingBox();
    const cx = dial.x + dial.width / 2, cy = dial.y + dial.height / 2, radius = Math.min(dial.width, dial.height) * 0.38;
    const rotaryInputs = () => inputs.filter(input => input.sessionId === 'session-' + rotaryApp.id);
    // Clockwise from 150 deg to 280 deg crosses the 180/-180 boundary: 130 deg / 18 = 7 steps down.
    const at = degrees => [cx + radius * Math.cos(degrees * Math.PI / 180), cy + radius * Math.sin(degrees * Math.PI / 180)];
    await phone.mouse.move(...at(150));
    await phone.mouse.down();
    for (let degrees = 155; degrees <= 280; degrees += 5) await phone.mouse.move(...at(degrees));
    await phone.mouse.up();
    const releasesBefore = releases.length;
    for (let i = 0; i < 40 && sumSteps(rotaryInputs()) !== -7; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(sumSteps(rotaryInputs()), -7, 'clockwise rotation scrolls down by swept angle across the 180 degree boundary');
    const turned = rotaryInputs().length;
    await phone.mouse.move(...at(280));
    await phone.mouse.down();
    for (let degrees = 275; degrees >= 185; degrees -= 5) await phone.mouse.move(...at(degrees));
    await phone.mouse.up();
    for (let i = 0; i < 40 && sumSteps(rotaryInputs().slice(turned)) !== 5; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(sumSteps(rotaryInputs().slice(turned)), 5, 'counter-clockwise rotation scrolls up');
    const beforeCenter = rotaryInputs().length;
    await phone.mouse.move(cx, cy);
    await phone.mouse.down();
    await phone.mouse.move(cx + 3, cy + 2);
    await phone.mouse.up();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(rotaryInputs().length, beforeCenter, 'the centre is a dead zone and middle click is off by default');
    assert(releases.length > releasesBefore);

    async function swipe(page) {
      const target = await page.locator('#deck .wheel-vertical').boundingBox();
      const sx = target.x + target.width / 2, sy = target.y + 6;
      await page.mouse.move(sx, sy + 95);
      await page.mouse.down();
      for (let i = 1; i <= 19; i++) { await page.mouse.move(sx, sy + 95 - i * 5); await page.waitForTimeout(20); }
      await page.mouse.up();
    }
    const android = await browser.newPage({ viewport: { width: 667, height: 375 } });
    android.on('pageerror', error => errors.push(String(error)));
    await android.addInitScript(() => {
      window.__vibrations = [];
      navigator.vibrate = ms => { window.__vibrations.push(ms); return true; };
    });
    await android.goto(base + '/#connect=test');
    await android.locator('#deck .wheel-vertical').waitFor();
    await swipe(android);
    const vibrations = await android.evaluate(() => window.__vibrations.length);
    assert(vibrations >= 1 && vibrations <= 3, 'Android vibrates once per finger step at most: ' + vibrations);
    await android.click('#device-menu-button');
    assert.match(await android.locator('#feedback-note').innerText(), /振動/);
    await android.locator('label.menu-switch', { hasText: '操作の手応え' }).click();
    assert.equal(await android.evaluate(() => localStorage.getItem('tapoard-feedback')), 'off');
    await android.click('#device-menu-close');
    await swipe(android);
    assert.equal(await android.evaluate(() => window.__vibrations.length), vibrations, 'feedback can be turned off on this device');
    await android.reload();
    await android.locator('#deck .wheel-vertical').waitFor();
    assert.equal(await android.locator('#feedback').isChecked(), false, 'the off setting is remembered per device');

    const iphone = await browser.newPage({ viewport: { width: 667, height: 375 } });
    iphone.on('pageerror', error => errors.push(String(error)));
    await iphone.addInitScript(() => {
      delete Navigator.prototype.vibrate;
      window.__clicks = 0;
      window.__contexts = 0;
      window.AudioContext = class {
        constructor() { window.__contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() { window.__clicks++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      };
    });
    await iphone.goto(base + '/#connect=test');
    await iphone.locator('#deck .wheel-vertical').waitFor();
    assert.equal(await iphone.evaluate(() => window.__contexts), 0, 'audio is prepared only after the first touch');
    await swipe(iphone);
    const clicks = await iphone.evaluate(() => window.__clicks);
    assert(clicks >= 1 && clicks <= 3, 'iPhone plays one click per finger step at most: ' + clicks);
    assert.equal(await iphone.evaluate(() => window.__contexts), 1);
    await iphone.click('#device-menu-button');
    assert.match(await iphone.locator('#feedback-note').innerText(), /消音モード/);
    assert.deepEqual(errors, []);
    console.log('PASS wheel UI: vertical and rotary wheels, settings, steps, middle-click tap, release, busy indicator and per-device vibration/click feedback');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
