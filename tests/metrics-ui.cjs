const { chromium } = require('./playwright.cjs');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

let apps = [];
let revision = 1;
let version = '1';
let metrics = {
  active: true, cpuAvailable: true, memoryAvailable: true,
  cpuPercent: 25.5, memoryPercent: 50.0,
  memoryUsedBytes: 8589934592, memoryTotalBytes: 17179869184,
  sampledAt: Date.now(),
  gpus: [
    { id: 'gpu-a', name: 'Test GPU A', utilizationAvailable: true, utilizationPercent: 35.5, memoryAvailable: true, memoryUsedBytes: 3221225472, memoryTotalBytes: 8589934592 },
    { id: 'gpu-b', name: 'Test GPU B', utilizationAvailable: true, utilizationPercent: 66.6, memoryAvailable: true, memoryUsedBytes: 1073741824, memoryTotalBytes: 4294967296 },
  ],
  history: [
    { timestamp: Date.now() - 2000, cpuPercent: 20, memoryPercent: 49, gpus: [{ id: 'gpu-a', utilizationPercent: 30, memoryPercent: 30 }] },
    { timestamp: Date.now(), cpuPercent: 25.5, memoryPercent: 50, gpus: [{ id: 'gpu-a', utilizationPercent: 35.5, memoryPercent: 37.5 }] },
  ],
};
const syncWaiters = new Set();
const stateVisibleIds = [];
const viewCalls = [];
const controls = {
  speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1,
  speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1,
  micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1,
};
function state() {
  return {
    apps, revision, version, metrics, appVersion: '2.0', computer: '情報テストPC',
    landscapeGrid: { columns: 5, rows: 3 }, portraitGrid: { columns: 3, rows: 5 },
    landscapeControls: controls, portraitControls: controls,
    landscapePage: 0, portraitPage: 0, landscapePages: 1, portraitPages: 1,
    columns: 5, rows: 3, speakerSlot: 0, micSlot: 1, keepAwake: false, phoneConnected: false,
    audio: { speakerVolume: 50, micVolume: 50, speakerAvailable: true, micAvailable: true, devices: [] },
  };
}
function sendSync(res) { if (!res.writableEnded) res.end(JSON.stringify(state())); }
function bump(changeVersion) {
  revision++;
  if (changeVersion) version = String(Number(version) + 1);
  for (const waiter of [...syncWaiters]) {
    clearTimeout(waiter.timer);
    syncWaiters.delete(waiter);
    sendSync(waiter.res);
  }
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.startsWith('/api/') ? 'application/json' : 'text/html');
  if (path === '/api/sync') {
    const requested = Number(url.searchParams.get('revision') || 0);
    if (requested < revision) { sendSync(res); return; }
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => { syncWaiters.delete(waiter); sendSync(res); }, 20000);
    syncWaiters.add(waiter);
    res.on('close', () => { clearTimeout(waiter.timer); syncWaiters.delete(waiter); });
    return;
  }
  if (path === '/api/settings') {
    if (req.method === 'POST') {
      apps = JSON.parse(body).apps.map((app, index) => ({ ...app, id: app.id || 'metric-' + index }));
      bump(true);
      res.end('{"ok":true}');
    } else {
      res.end(JSON.stringify({ ...state(), token: 'test', lanUrl: 'http://example.local/', ipUrls: [], networkStatus: 'テスト', qrUrl: 'http://example.local/#connect=test' }));
    }
    return;
  }
  if (path === '/api/state') {
    const visible = url.searchParams.get('visibleIds');
    if (visible !== null) stateVisibleIds.push(visible);
    res.end(JSON.stringify(state()));
    return;
  }
  if (path === '/api/view') { viewCalls.push(JSON.parse(body)); res.end('{"ok":true,"inputSessions":[]}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/audio') { res.end(JSON.stringify({ ok: true, audio: state().audio, revision })); return; }
  const file = path === '/' || path === '/settings' ? 'index.html' : path.slice(1);
  if (!/^[\w.-]+$/.test(file)) { res.writeHead(404); res.end(); return; }
  try { res.end(fs.readFileSync('web/' + file)); } catch { res.writeHead(404); res.end(); }
});

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
    await admin.locator('.shortcut-group').first().locator('summary').click();
    await group.locator('summary').click();
    const savedCpu = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'POST');
    const refreshedCpu = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'GET');
    await group.locator('.shortcut-row[data-action="widget-metrics-cpu"]').getByRole('button', { name: '追加', exact: true }).click();
    await savedCpu;
    await refreshedCpu;
    await admin.locator('#preview-deck .metrics-small').waitFor();
    assert.equal(apps[0].type, 'metrics');
    assert.equal(apps[0].options.primary, 'cpu');
    assert.equal(await admin.locator('#preview-deck .metrics-small .metric-value').innerText(), '25.5%');

    assert.equal(await group.evaluate(node => node.open), true, 'saving keeps the open catalog group open');
    assert.equal(await admin.locator('.shortcut-group').first().evaluate(node => node.open), false, 'saving does not reopen the first catalog group');
    const savedGpu = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'POST');
    const refreshedGpu = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'GET');
    await group.locator('.shortcut-row[data-action="widget-metrics-gpu"]').getByRole('button', { name: '追加', exact: true }).click();
    await savedGpu;
    await refreshedGpu;
    await admin.waitForFunction(() => document.querySelectorAll('#preview-deck .metrics-widget').length === 2);
    assert.equal(apps[1].options.primary, 'gpu');
    assert.equal(await admin.locator('#preview-deck .metrics-small').nth(1).locator('.metric-value').innerText(), '35.5%');
    const gpuEditor = admin.locator('.editor').nth(1);
    await gpuEditor.locator('.metrics-settings select').nth(1).selectOption('gpu-b');
    assert.equal(await admin.locator('#preview-deck .metrics-small').nth(1).locator('.metric-value').innerText(), '66.6%');

    const savedOverview = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'POST');
    const refreshedOverview = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'GET');
    await group.locator('.shortcut-row[data-action="widget-metrics-overview"]').getByRole('button', { name: '追加', exact: true }).click();
    await savedOverview;
    await refreshedOverview;
    await admin.waitForFunction(() => document.querySelectorAll('#preview-deck .metrics-widget').length === 3);
    assert.equal(apps[2].width, 2);
    assert.equal(apps[2].height, 2);
    assert.equal(await admin.locator('#preview-deck .metrics-large .metric-row').count(), 4);
    assert((await admin.locator('#preview-deck .metrics-large .cpu-line').getAttribute('d')).length > 0);
    assert((await admin.locator('#preview-deck .metrics-large .gpu-line').getAttribute('d')).length > 0);

    const phone = await browser.newPage({ viewport: { width: 667, height: 375 } });
    phone.on('pageerror', error => errors.push(String(error)));
    await phone.goto(base + '/#connect=test');
    const cpuTile = phone.locator('#deck .metrics-small').first();
    await cpuTile.waitFor();
    await cpuTile.evaluate(node => { node.dataset.identityCheck = 'same-node'; });
    metrics = {
      ...metrics, cpuPercent: 67.8, memoryPercent: 55.5, sampledAt: Date.now(),
      gpus: [{ ...metrics.gpus[0], utilizationPercent: 72.3 }],
      history: [...metrics.history, { timestamp: Date.now(), cpuPercent: 67.8, memoryPercent: 55.5, gpus: [{ id: 'gpu-a', utilizationPercent: 72.3, memoryPercent: 37.5 }] }],
    };
    bump(false);
    await phone.waitForFunction(() => document.querySelector('#deck .metrics-small .metric-value').textContent === '67.8%');
    assert.equal(await cpuTile.getAttribute('data-identity-check'), 'same-node', 'metrics update rebuilt the full deck');
    const fits = () => phone.evaluate(() => {
      const tile = document.querySelector('#deck .metrics-small'),
        value = tile.querySelector('.metric-value'),
        box = value.getBoundingClientRect(),
        frame = tile.getBoundingClientRect();
      return { text: value.textContent, status: value.classList.contains('metric-status'), fits: box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5 && value.scrollWidth <= value.clientWidth + 1, readable: box.width >= frame.width * 0.6 };
    });
    metrics = { ...metrics, cpuPercent: 100, sampledAt: Date.now() };
    bump(false);
    await phone.waitForFunction(() => document.querySelector('#deck .metrics-small .metric-value').textContent === '100.0%');
    assert.deepEqual(await fits(), { text: '100.0%', status: false, fits: true, readable: true }, 'the widest percentage fits a 1x1 tile');
    metrics = { ...metrics, cpuAvailable: false, sampledAt: Date.now() };
    bump(false);
    await phone.waitForFunction(() => document.querySelector('#deck .metrics-small .metric-value').textContent === '更新待ち');
    assert.deepEqual(await fits(), { text: '更新待ち', status: true, fits: true, readable: true }, 'status text uses the smaller style and fits');
    assert.equal(apps[1].options.gpuName, 'Test GPU B', 'the chosen GPU name is saved with its id');
    // After a Windows restart every GPU gets a new LUID; the saved name still finds the same GPU.
    metrics = {
      ...metrics, sampledAt: Date.now(),
      gpus: [{ ...metrics.gpus[0], id: 'gpu-a-reboot' }, { id: 'gpu-b-reboot', name: 'Test GPU B', utilizationAvailable: true, utilizationPercent: 44.4, memoryAvailable: true, memoryUsedBytes: 1073741824, memoryTotalBytes: 4294967296 }],
    };
    bump(false);
    await phone.waitForFunction(() => document.querySelectorAll('#deck .metrics-small')[1].querySelector('.metric-value').textContent === '44.4%');
    const selection = await phone.evaluate(() => {
      const deck = document.getElementById('deck'),
        style = getComputedStyle(deck),
        event = new Event('selectstart', { bubbles: true, cancelable: true });
      deck.querySelector('.deck-key').dispatchEvent(event);
      return { userSelect: style.userSelect || style.webkitUserSelect, blocked: event.defaultPrevented };
    });
    assert.deepEqual(selection, { userSelect: 'none', blocked: true }, 'deck taps cannot start a text selection');
    assert(stateVisibleIds.some(value => value.includes('metric-0')) || viewCalls.some(call => call.visibleIds.includes('metric-0')));
    assert.deepEqual(errors, []);
    console.log('PASS metrics UI: CPU, memory, GPU and GPU memory widgets, history graph, subscription and in-place updates');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
