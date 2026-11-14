const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 3.1: slideshow widget. 3x3/4x4/5x5 tiles show the pictures of a PC folder one after another;
// phones get one shrunk JPEG at a time, only from folders set on a slideshow widget.
const base = 'http://127.0.0.1:18782';
const win = process.platform === 'win32';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
const exe = 'tests/bin/Release103Tests.exe';
const host = win ? spawn(exe, ['serve'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('mono', [exe, 'serve'], { stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((resolve, reject) => {
  host.stdout.on('data', d => { if (String(d).includes('READY')) resolve(); });
  host.stderr.on('data', d => reject(Error(String(d))));
  host.on('exit', code => reject(Error('Host exit ' + code)));
});
async function api(p, body, token = 'test-admin') {
  const r = await fetch(base + '/api/' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
function slideshow(side, folder, extra) {
  return Object.assign({ name: 'スライドショー', orientation: 'landscape', type: 'slideshow', category: 'widget', size: side, width: side, height: side, fontSize: 11, iconScale: 82, labelOpacity: 45, hideLabel: true,
    options: { folder, interval: 5, order: 'name', fit: 'cover' }, landscape: { page: 0, row: 0, column: 2 } }, extra || {});
}

(async () => {
  let browser;
  const folder = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tapoard-slides-'));
  try {
    await ready;
    fs.copyFileSync('web/icon-192.png', path.join(folder, 'a.png'));
    fs.copyFileSync('web/icon-512.png', path.join(folder, 'b.png'));
    fs.copyFileSync('web/icon-180.png', path.join(folder, 'c.png'));
    fs.writeFileSync(path.join(folder, 'notes.txt'), 'not a picture');

    // No faders on this deck, so a 4x3 slideshow fits the 5x3 grid.
    for (const target of ['speaker', 'mic']) assert.equal((await api('fader/remove', { orientation: 'landscape', target, removed: true })).status, 200);
    // Sizes and folders are checked.
    assert.notEqual((await api('settings', { apps: [slideshow(2, folder)] })).status, 200, '2x2 is not a slideshow size');
    assert.notEqual((await api('settings', { apps: [slideshow(3, 'relative/folder')] })).status, 200, 'folder must be a full path');
    const saved = await api('settings', { apps: [slideshow(3, folder)] });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const app = (await api('settings')).data.apps[0];
    assert.deepEqual(app.options, { folder, interval: 5, order: 'name', fit: 'cover' });

    // Pictures in name order, wrapping around; phones may read them.
    const first = (await api('slideshow?id=' + app.id + '&index=0', undefined, 'test-phone')).data;
    assert.equal(first.count, 3);
    assert.equal(first.name, 'a');
    assert.match(first.data, /^data:image\/jpeg;base64,/);
    assert.equal((await api('slideshow?id=' + app.id + '&index=4')).data.name, 'b');
    assert.equal((await api('slideshow?id=nope&index=0')).status, 404, 'only slideshow widgets');

    // The preview shows the first picture; the editor sets the folder, interval and size.
    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    const tile = admin.locator('#preview-deck .slideshow-widget');
    await tile.waitFor();
    assert.equal(await tile.evaluate(e => e.style.gridColumn), '3 / span 3');
    await admin.waitForFunction(() => /^data:image\/jpeg/.test((document.querySelector('#preview-deck .slideshow-picture.shown') || {}).src || ''));
    // After the interval the next picture comes.
    await admin.waitForFunction(id => true, app.id);
    const firstSrc = await admin.locator('#preview-deck .slideshow-picture.shown').getAttribute('src');
    await admin.waitForFunction(src => { const s = document.querySelector('#preview-deck .slideshow-picture.shown'); return s && s.src !== src; }, firstSrc, { timeout: 12000 });

    await tile.scrollIntoViewIfNeeded();
    await admin.waitForTimeout(800);
    await tile.click({ button: 'right' });
    await admin.locator('#deck-context-menu button', { hasText: '詳細設定を開く' }).click();
    await admin.locator('#editor-float .slideshow-folder').waitFor();
    assert.equal(await admin.locator('#editor-float .slideshow-folder').inputValue(), folder);
    assert.equal(await admin.locator('#deck-context-menu button', { hasText: 'アイコンを選ぶ' }).count(), 0);
    await admin.locator('#editor-float .slideshow-interval').selectOption('30');
    await admin.locator('#editor-float .slideshow-order').selectOption('random');
    // 4x3 would run off the grid where it is, so it moves to a free spot by itself.
    await admin.locator('#editor-float .appearance-size').selectOption('4x3');
    await admin.locator('#editor-float-save').click();
    await admin.waitForFunction(() => document.querySelector('#message').textContent.length > 0);
    let after;
    for (let i = 0; i < 30; i++) {
      after = (await api('settings')).data.apps[0];
      if (after.width === 4) break;
      await admin.waitForTimeout(200);
    }
    assert.deepEqual([after.width, after.height, after.options.interval, after.options.order], [4, 3, 30, 'random']);
    assert.deepEqual(after.landscape, { page: 0, row: 0, column: 0 }, 'moved to where it fits');
    for (const [w, h] of [[5, 4], [5, 5], [4, 4]]) {
      const shaped = Object.assign({}, after, { width: w, height: h, size: w === h ? w : 1 });
      shaped.landscape = { page: 0, row: 0, column: 0 };
      const r = await api('settings', { apps: [shaped] });
      assert.equal(r.status, 400, w + 'x' + h + ' needs more rows than this 5x3 grid: ' + JSON.stringify(r.data));
    }
    const wide = Object.assign({}, after, { width: 5, height: 2, size: 1 });
    assert.match((await api('settings', { apps: [wide] })).data.error, /スライドショー|5x2/);

    // The catalog adds one.
    assert.equal(await admin.locator('.shortcut-row[data-action^="widget-slideshow-"]').count(), 5);
    assert.deepEqual(errors, []);
    console.log('PASS slideshow: 3x3/4x3/4x4/5x4/5x5 widget, folder pictures as JPEG in name order with wrap-around, timed change in the preview, editor (folder, interval, order, size), server checks');
  } finally {
    if (browser) await browser.close();
    host.kill();
    fs.rmSync(folder, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
