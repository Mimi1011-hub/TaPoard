const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 3.1: purpose presets overwrite the page shown with a laid-out page (grid size, faders, widgets),
// and faders can be removed from every page of one orientation.
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
function button(name, page, row, column, orientation = 'landscape') {
  return { name, orientation, type: 'hotkey', category: 'common', action: 'common-copy', iconKey: 'copy', size: 1, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45, [orientation]: { page, row, column } };
}

(async () => {
  let browser;
  try {
    await ready;
    // Landscape: page 1 has A, page 2 has B (4th column, which a 6-column grid keeps).
    assert.equal((await api('settings', { apps: [button('A', 0, 1, 2), button('B', 1, 2, 4), button('P', 0, 1, 1, 'portrait')] })).status, 200);
    const presets = (await api('presets')).data.presets;
    assert.deepEqual(presets.map(p => p.name), ['配信者', 'ゲーム', '在宅ワーク・会議', '動画・画像編集', '音楽・動画鑑賞', 'プログラミング']);
    assert.notEqual((await api('presets', undefined, 'test-phone')).status, 200);

    // Every preset is valid on both orientations, and each layout fills its grid without overlaps.
    for (const p of presets)
      for (const o of ['landscape', 'portrait']) {
        const l = p[o], cells = new Set();
        const mark = (r, c, w, h, what) => {
          for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
            assert.ok(y < l.rows && x < l.columns, p.id + ' ' + o + ' ' + what + ' outside');
            assert.ok(!cells.has(y + ':' + x), p.id + ' ' + o + ' ' + what + ' overlaps');
            cells.add(y + ':' + x);
          }
        };
        if (l.speaker) mark(l.speaker.row, l.speaker.column, l.speaker.width, l.speaker.height, 'speaker');
        if (l.mic) mark(l.mic.row, l.mic.column, l.mic.width, l.mic.height, 'mic');
        l.items.forEach(i => mark(i.row, i.column, i.width, i.height, i.name));
        assert.equal(cells.size, l.columns * l.rows, p.id + ' ' + o + ' leaves empty cells');
        const r = await api('presets/apply', { id: p.id, orientation: o, page: 0 });
        assert.equal(r.status, 200, p.id + ' ' + o + ': ' + JSON.stringify(r.data));
        assert.equal((await api('page/undo', {})).status, 200);
      }
    assert.notEqual((await api('presets/apply', { id: 'nope', orientation: 'landscape', page: 0 })).status, 200);

    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('.preset-card').first().waitFor();
    assert.equal(await admin.locator('.preset-card').count(), 6);
    assert.match(await admin.locator('#preset-orientation-note').textContent(), /横向き 1 ページ目/);
    assert.ok(await admin.locator('.preset-card[data-preset="work"] .preset-map .preset-widget').count() >= 2, 'clock and weather drawn');

    // Overwrite landscape page 1 with "在宅ワーク・会議": grid becomes 6x3, A goes, B on page 2 stays.
    await admin.locator('.preset-card[data-preset="work"] button', { hasText: 'このページに使う' }).click();
    await admin.locator('#look-save-backdrop').waitFor();
    const question = await admin.locator('#look-save-reason').textContent();
    await admin.locator('#look-save-no').click();
    await admin.waitForFunction(() => /在宅ワーク・会議」にしました/.test(document.querySelector('#message').textContent));
    assert.match(question, /横向きの 1 ページ目.*\n.*ボタン 1 個.*\n.*5×3 から 6×3/);
    let s = (await api('settings')).data;
    assert.deepEqual(s.landscapeGrid, { columns: 6, rows: 3 });
    const page1 = s.apps.filter(a => a.orientation === 'landscape' && a.landscape.page === 0);
    assert.equal(page1.length, 9);
    assert.ok(!s.apps.some(a => a.name === 'A'));
    assert.deepEqual(s.apps.find(a => a.name === 'B').landscape, { page: 1, row: 2, column: 4 });
    const clock = page1.find(a => a.type === 'clock');
    assert.deepEqual([clock.width, clock.height, clock.landscape.row, clock.landscape.column], [2, 2, 0, 0]);
    assert.ok(page1.some(a => a.type === 'weather'));
    const faders = s.landscapeControlPages.find(p => p.page === 0);
    assert.deepEqual([faders.speakerRow, faders.speakerColumn, faders.speakerWidth, faders.micRow, faders.micColumn, faders.micWidth, faders.speakerHidden, faders.micHidden], [2, 0, 3, 2, 3, 3, false, false]);
    assert.equal(await admin.locator('#preview-undo-page').textContent(), 'プリセットを元に戻す');
    await admin.locator('#preview-deck .clock-widget').first().waitFor();

    // A preset without a mic fader hides it on that page only.
    await admin.locator('.preset-card[data-preset="programming"] button', { hasText: 'このページに使う' }).click();
    await admin.locator('#look-save-no').click();
    await admin.waitForFunction(() => /プログラミング」にしました/.test(document.querySelector('#message').textContent));
    s = (await api('settings')).data;
    const prog = s.landscapeControlPages.find(p => p.page === 0);
    assert.equal(prog.micHidden, true);
    assert.equal(prog.speakerHidden, false);
    assert.equal(s.apps.find(a => a.name === 'コマンド').hotkey, 'Ctrl+Shift+P');

    // Undo restores the page before the last preset.
    await admin.locator('#preview-undo-page').click();
    await admin.waitForFunction(() => /使う前に戻しました/.test(document.querySelector('#message').textContent));
    assert.ok((await api('settings')).data.apps.some(a => a.type === 'weather'));

    // Cancelling the question changes nothing.
    await admin.locator('.preset-card[data-preset="game"] button', { hasText: 'このページに使う' }).click();
    await admin.locator('#look-save-cancel').click();
    await new Promise(r => setTimeout(r, 300));
    assert.ok(!(await api('settings')).data.apps.some(a => a.name === 'Game Bar'));

    // Portrait: switch and overwrite with the media preset (3x5, analog clock and a 3x1 fader).
    await admin.locator('#preview-portrait').click();
    await admin.waitForFunction(() => /縦向き 1 ページ目/.test(document.querySelector('#preset-orientation-note').textContent));
    await admin.locator('.preset-card[data-preset="media"] button', { hasText: 'このページに使う' }).click();
    await admin.locator('#look-save-no').click();
    await admin.waitForFunction(() => /音楽・動画鑑賞」にしました/.test(document.querySelector('#message').textContent));
    s = (await api('settings')).data;
    assert.deepEqual(s.portraitGrid, { columns: 3, rows: 5 });
    assert.ok(!s.apps.some(a => a.name === 'P'));
    assert.equal(s.apps.filter(a => a.orientation === 'landscape').length, 10, 'landscape untouched');

    // Faders: remove the landscape speaker fader from every page, then bring it back.
    await admin.locator('#preview-landscape').click();
    assert.equal((await api('fader/remove', { orientation: 'landscape', target: 'speaker', removed: true })).status, 200);
    s = (await api('settings')).data;
    assert.equal(s.landscapeControls.speakerHidden, true);
    assert.ok(s.landscapeControlPages.every(p => p.speakerHidden), 'hidden on pages with their own layout too');
    assert.equal(s.landscapeControls.micHidden, false);
    // A new page has no speaker fader, so its cells are free for buttons.
    const apps = s.apps.concat([button('C', 2, 0, 0)]);
    assert.equal((await api('settings', { apps })).status, 200, 'cell 0,0 is free on a new page');
    await admin.reload();
    await admin.locator('.preset-card').first().waitFor();
    assert.equal(await admin.locator('.shortcut-row[data-action="control-speaker-fader"] button').textContent(), 'すべてのページに表示');
    await admin.locator('.shortcut-row[data-action="control-speaker-fader"] button').click();
    await admin.waitForFunction(() => /すべてのページに.*戻しました/.test(document.querySelector('#message').textContent));
    s = (await api('settings')).data;
    assert.equal(s.landscapeControls.speakerHidden, false);
    assert.equal(s.landscapeControlPages.find(p => p.page === 2).speakerHidden, true, 'stays hidden where button C now is');
    assert.notEqual((await api('fader/remove', { orientation: 'landscape', target: 'speaker' }, 'test-phone')).status, 200);

    assert.equal(await admin.locator('.shortcut-row[data-action="key-custom"]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS presets: six laid-out pages per orientation (grid, faders, widgets), overwrite the page shown with confirm and undo; faders removed from every page and restored');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
