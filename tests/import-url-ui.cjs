const { chromium } = require('./playwright.cjs');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

// The PC import window is native; this mock returns what it sends back for a typed URL.
let apps = [];
let revision = 1;
let version = '1';
let importResult = null;
const controls = {
  speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1,
  speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1,
  micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1,
};
function state() {
  return {
    apps, revision, version, appVersion: '2.0', computer: 'URLテストPC',
    landscapeGrid: { columns: 5, rows: 3 }, portraitGrid: { columns: 3, rows: 5 },
    landscapeControls: controls, portraitControls: controls,
    landscapePage: 0, portraitPage: 0, landscapePages: 1, portraitPages: 1,
    columns: 5, rows: 3, speakerSlot: 0, micSlot: 1, keepAwake: false, phoneConnected: false,
    audio: { speakerVolume: 50, micVolume: 50, speakerAvailable: true, micAvailable: true, devices: [] },
  };
}
const urlEntry = { name: 'youtube.com', type: 'url', category: 'custom', iconKey: 'globe', path: '', args: '', text: '', url: 'https://www.youtube.com/' };
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.startsWith('/api/') ? 'application/json' : 'text/html');
  if (path === '/api/sync') { setTimeout(() => { if (!res.writableEnded) res.end(JSON.stringify(state())); }, 20000); return; }
  if (path === '/api/settings') {
    if (req.method === 'POST') {
      apps = JSON.parse(body).apps.map((app, index) => ({ ...app, id: app.id || 'url-' + index }));
      revision++;
      version = String(Number(version) + 1);
      res.end('{"ok":true}');
    } else res.end(JSON.stringify({ ...state(), token: 'test', lanUrl: 'http://example.local/', ipUrls: [], networkStatus: 'テスト', qrUrl: 'http://example.local/#connect=test' }));
    return;
  }
  if (path === '/api/import') {
    if (req.method === 'POST') { importResult = null; setTimeout(() => { importResult = { cancelled: false, apps: [urlEntry] }; }, 300); res.end('{"id":"ticket"}'); }
    else res.end(JSON.stringify({ id: 'ticket', result: importResult }));
    return;
  }
  if (path === '/api/state') { res.end(JSON.stringify(state())); return; }
  if (path === '/api/view') { res.end('{"ok":true}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/page') { res.end(JSON.stringify(state())); return; }
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
    await admin.locator('#preview-add').click();
    await admin.waitForFunction(() => document.querySelector('#import-status').textContent.includes('URLを入力'));
    await admin.waitForFunction(() => document.querySelector('#import-status').textContent.includes('1個追加して自動保存'));
    assert.equal(apps.length, 1);
    assert.equal(apps[0].type, 'url');
    assert.equal(apps[0].url, 'https://www.youtube.com/');
    assert.equal(apps[0].name, 'youtube.com');

    // The same URL again is skipped instead of added twice.
    await admin.locator('#preview-add').click();
    await admin.waitForFunction(() => document.querySelector('#import-status').textContent.includes('新しいボタンはありませんでした'));
    assert.equal(apps.length, 1);
    assert.deepEqual(errors, []);
    console.log('PASS import URL UI: a URL typed in the PC window becomes a saved URL button, duplicates are skipped');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
