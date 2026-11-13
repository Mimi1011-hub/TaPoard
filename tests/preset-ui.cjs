const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 3.1: purpose presets. Six presets; "add" puts the buttons on a new page of the chosen orientation and
// keeps the rest, "replace" swaps every button of that orientation, and both can be undone once.
const base = 'http://127.0.0.1:18782';
const win = process.platform === 'win32';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
const exe = 'tests/bin/Release103Tests.exe';
const host = win ? spawn(exe, ['serve'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('mono', [exe, 'serve'], { stdio: ['ignore', 'pipe', 'pipe'] });
const inputs = [];
const ready = new Promise((resolve, reject) => {
  host.stdout.on('data', d => {
    for (const line of String(d).split('\n')) if (line.startsWith('INPUT ')) inputs.push(line.slice(6).trim());
    if (String(d).includes('READY')) resolve();
  });
  host.stderr.on('data', d => reject(Error(String(d))));
  host.on('exit', code => reject(Error('Host exit ' + code)));
});
async function api(p, body, token = 'test-admin') {
  const r = await fetch(base + '/api/' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
function button(id, name, column, orientation = 'landscape') {
  return { id, name, orientation, type: 'hotkey', category: 'common', action: 'common-copy', iconKey: 'copy', size: 1, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45, [orientation]: { page: 0, row: 1, column } };
}

(async () => {
  let browser;
  try {
    await ready;
    assert.equal((await api('settings', { apps: [button('a', 'A', 2), button('p', 'P', 1, 'portrait')] })).status, 200);
    const presets = (await api('presets')).data.presets;
    assert.deepEqual(presets.map(p => p.name), ['配信者', 'ゲーム', '在宅ワーク・会議', '動画・画像編集', '音楽・動画鑑賞', 'プログラミング']);
    assert.notEqual((await api('presets', undefined, 'test-phone')).status, 200);

    // Every preset is valid on both orientations (added through the API, then undone).
    for (const p of presets)
      for (const orientation of ['landscape', 'portrait']) {
        const r = await api('presets/apply', { id: p.id, orientation, mode: 'add' });
        assert.equal(r.status, 200, p.id + ' ' + orientation + ': ' + JSON.stringify(r.data));
        assert.equal((await api('page/undo', {})).status, 200);
      }
    assert.notEqual((await api('presets/apply', { id: 'nope', orientation: 'landscape', mode: 'add' })).status, 200);

    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('.preset-card').first().waitFor();
    assert.equal(await admin.locator('.preset-card').count(), 6);
    assert.match(await admin.locator('#preset-orientation-note').textContent(), /横向き/);

    // Add the streamer preset as a new landscape page.
    await admin.locator('.preset-card[data-preset="streamer"] button', { hasText: '新しいページに追加' }).click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '2 / 2');
    let s = (await api('settings')).data;
    const added = s.apps.filter(a => a.orientation === 'landscape' && a.landscape.page === 1);
    assert.equal(added.length, 10);
    assert.deepEqual(s.apps.find(a => a.name === 'A').landscape, { page: 0, row: 1, column: 2 }, 'existing button stays');
    const scene = added.find(a => a.name === 'シーン1');
    assert.equal(scene.action, 'key-custom');
    assert.equal(scene.hotkey, 'Ctrl+Shift+F1');
    assert.equal(scene.iconKey, 'video');
    assert.equal(await admin.locator('#preview-undo-page').textContent(), 'プリセットを元に戻す');
    assert.match(await admin.locator('#message').textContent(), /配信者.*2 ページ目に追加/);

    // A phone pressing "シーン1" sends Ctrl+Shift+F1 (needs Windows input APIs).
    if (win) {
      const phone = await fetch(base + '/api/action', { method: 'POST', headers: { Authorization: 'Bearer test-phone', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'launch', id: scene.id }) });
      assert.equal(phone.status, 200, await phone.text());
      await new Promise(r => setTimeout(r, 300));
      assert.ok(inputs.some(line => /F1/.test(line)), 'sent ' + JSON.stringify(inputs));
    }
    // Undo removes the page again.
    await admin.locator('#preview-undo-page').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent.endsWith('/ 1'));
    assert.equal((await api('settings')).data.apps.length, 2);

    // Replace the portrait buttons with the media preset after confirming; landscape stays.
    await admin.locator('#preview-portrait').click();
    await admin.waitForFunction(() => /縦向き/.test(document.querySelector('#preset-orientation-note').textContent));
    let question = '';
    admin.once('dialog', d => { question = d.message(); d.accept(); });
    await admin.locator('.preset-card[data-preset="media"] button', { hasText: '縦向きを置き換え' }).click();
    await admin.waitForFunction(() => /置き換えました/.test(document.querySelector('#message').textContent));
    assert.match(question, /縦向きのボタン 1 個/);
    s = (await api('settings')).data;
    assert.deepEqual(s.apps.filter(a => a.orientation === 'portrait').map(a => a.name), ['再生／一時停止', '前の曲', '次の曲', '停止', '音量 ＋', '音量 −', 'ミュート', '全画面']);
    assert.equal(s.apps.filter(a => a.orientation === 'landscape').length, 1);
    assert.equal(s.apps.find(a => a.name === '再生／一時停止').category, 'music');

    // Cancelling the question changes nothing.
    admin.once('dialog', d => d.dismiss());
    await admin.locator('.preset-card[data-preset="game"] button', { hasText: '縦向きを置き換え' }).click();
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await api('settings')).data.apps.filter(a => a.orientation === 'portrait').length, 8);

    // The custom key shows up in the catalog.
    assert.equal(await admin.locator('.shortcut-row[data-action="key-custom"]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS presets: six presets valid in both orientations, add on a new page, custom keys, undo, replace with confirm');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
