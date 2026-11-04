const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

let apps = [];
let revision = 1;
let version = '1';
let grid = { columns: 5, rows: 3 };
const viewCalls = [];
const stateVisibleIds = [];
const syncWaiters = new Set();
const controls = {
  speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1,
  speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1,
  micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1,
};
function state() {
  return {
    apps, revision, version, appVersion: '2.0', computer: '時計テストPC',
    landscapeGrid: grid, portraitGrid: { columns: 3, rows: 5 },
    landscapeControls: controls, portraitControls: controls,
    landscapePage: 0, portraitPage: 0, landscapePages: 1, portraitPages: 1,
    columns: 5, rows: 3, speakerSlot: 0, micSlot: 1, keepAwake: false, phoneConnected: false,
    audio: { speakerVolume: 50, micVolume: 50, speakerAvailable: true, micAvailable: true, devices: [] },
  };
}
function sendSync(res) {
  if (!res.writableEnded) res.end(JSON.stringify(state()));
}
function bump() {
  revision++;
  version = String(Number(version) + 1);
  for (const waiter of [...syncWaiters]) {
    clearTimeout(waiter.timer);
    syncWaiters.delete(waiter);
    sendSync(waiter.res);
  }
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.startsWith('/api/') ? 'application/json' : 'text/html');
  if (path === '/api/sync') {
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => { syncWaiters.delete(waiter); sendSync(res); }, 20000);
    syncWaiters.add(waiter);
    res.on('close', () => { clearTimeout(waiter.timer); syncWaiters.delete(waiter); });
    return;
  }
  if (path === '/api/settings') {
    if (req.method === 'POST') {
      apps = JSON.parse(body).apps.map((app, index) => ({ ...app, id: app.id || 'clock-' + index }));
      bump();
      res.end('{"ok":true}');
    } else {
      res.end(JSON.stringify({ ...state(), token: 'test', lanUrl: 'http://example.local/', ipUrls: [], networkStatus: 'テスト', qrUrl: 'http://example.local/#connect=test' }));
    }
    return;
  }
  if (path === '/api/state') {
    const visible = new URL(req.url, 'http://127.0.0.1').searchParams.get('visibleIds');
    if (visible !== null) stateVisibleIds.push(visible);
    res.end(JSON.stringify(state()));
    return;
  }
  if (path === '/api/view') { viewCalls.push(JSON.parse(body)); res.end('{"ok":true,"inputSessions":[]}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/audio') { res.end(JSON.stringify({ ok: true, audio: state().audio, revision })); return; }
  if (path === '/api/page') { res.end(JSON.stringify(state())); return; }
  const file = path === '/' || path === '/settings' ? 'index.html' : path.slice(1);
  if (!/^[\w.-]+$/.test(file)) { res.writeHead(404); res.end(); return; }
  try { res.end(fs.readFileSync('web/' + file)); } catch { res.writeHead(404); res.end(); }
});

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
    const group = admin.locator('.shortcut-group').filter({ hasText: '時計・情報表示' });
    await group.locator('summary').click();
    const digital = group.locator('.shortcut-row[data-action="widget-clock-digital"]');
    await digital.getByRole('button', { name: '追加', exact: true }).click();
    await admin.locator('#preview-deck .clock-digital').waitFor();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('追加して自動保存'));
    assert.equal(apps.length, 1);
    assert.equal(apps[0].type, 'clock');
    assert.equal(apps[0].width, 2);
    assert.equal(apps[0].height, 2);
    assert.equal(apps[0].options.style, 'digital');
    assert.match(await admin.locator('#preview-deck .clock-time').innerText(), /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(await admin.locator('#preview-deck .clock-widget').evaluate(node => node.style.gridColumn.includes('span 2')), true);

    const clockSettings = admin.locator('.editor .clock-settings');
    assert.equal(await clockSettings.locator('select').count(), 0, 'clock type is fixed when the widget is added');
    assert.equal(await admin.locator('.editor .icon-select-button').count(), 0);
    const checks = clockSettings.locator('input[type="checkbox"]');
    await checks.nth(3).check();
    await admin.locator('.editor .appearance-size').selectOption('1');
    await save(admin);
    assert.equal(apps[0].width, 2);
    assert.equal(apps[0].height, 1);
    assert.equal(apps[0].options.hour12, true);
    assert.match(await admin.locator('#preview-deck .clock-time').innerText(), / (AM|PM)$/);
    await group.locator('.shortcut-row[data-action="widget-clock-analog"]').getByRole('button', { name: '追加', exact: true }).click();
    await admin.locator('#preview-deck .clock-face').waitFor();
    assert.equal(apps[1].options.style, 'analog');
    assert.equal(await admin.locator('.editor').nth(1).locator('.appearance-size option').count(), 1, 'analog clock stays fixed at 2x2');
    assert.equal(await admin.locator('#preview-deck .clock-analog.clock-wide').count(), 0);

    const phone = await browser.newPage({ viewport: { width: 667, height: 375 } });
    phone.on('pageerror', error => errors.push(String(error)));
    await phone.goto(base + '/#connect=test');
    const phoneClock = phone.locator('#deck .clock-time');
    await phoneClock.waitFor();
    const first = await phoneClock.innerText();
    await phone.waitForFunction(previous => document.querySelector('#deck .clock-time').textContent !== previous, first, { timeout: 2500 });
    const fits = () => phone.locator('#deck .clock-digital').evaluate(tile => {
      const node = tile.querySelector('.clock-time'), range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect(), box = tile.getBoundingClientRect();
      return text.left >= box.left - 1 && text.right <= box.right + 1 && text.top >= box.top - 1 && text.bottom <= box.bottom + 1;
    });
    assert(await fits(), '12-hour time fits a 2x1 tile on a 5x3 grid');
    grid = { columns: 8, rows: 5 };
    bump();
    await phone.waitForFunction(() => document.querySelector('#deck').dataset.columns === '8');
    assert(await fits(), '12-hour time fits a 2x1 tile on a dense 8x5 grid');
    assert(stateVisibleIds.length > 0);
    assert(stateVisibleIds.every(value => value === ''), 'clock must not create a display subscription');
    assert(viewCalls.every(call => Array.isArray(call.visibleIds) && call.visibleIds.length === 0), 'clock view announcements must stay empty');
    assert.deepEqual(errors, []);
    console.log('PASS clock UI: 2x1/2x2 fixed digital and analog clocks, local ticking and no display subscription');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
