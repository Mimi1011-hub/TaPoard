const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 3.1: saved looks. The current icons, icon colors and background (with its picture) are saved under a
// name and put back later; actions and placement stay. A save is offered before a bulk change.
const base = 'http://127.0.0.1:18782';
const win = process.platform === 'win32';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
fs.rmSync('tests/bin/data/icon-styles', { recursive: true, force: true });
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
function button(id, name, column, iconKey, iconColor) {
  return { id, name, orientation: 'landscape', type: 'hotkey', category: 'common', action: 'common-copy', iconKey, iconColor, size: 1, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45, landscape: { page: 0, row: 1, column } };
}
const picture = 'data:image/png;base64,' + fs.readFileSync('web/icon-180.png').toString('base64');

(async () => {
  let browser;
  try {
    await ready;
    assert.equal((await api('settings', { apps: [button('a', 'A', 2, 'copy', '#ff0000'), button('b', 'B', 3, 'paste', '')] })).status, 200);
    assert.equal((await api('background', { color: '#14213d', color2: '', dim: 10, blur: 0 })).status, 200);
    assert.equal((await api('background/image', { data: picture, width: 180, height: 180 })).status, 200);

    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('#preview-deck [data-app-index]').first().waitFor();
    await admin.waitForFunction(() => document.querySelector('#icon-style-count').textContent === '0 / 20');

    // Save the current look by name.
    await admin.locator('#icon-style-name').fill('配信用');
    await admin.locator('#icon-style-save').click();
    await admin.locator('.icon-style-row').first().waitFor();
    assert.match(await admin.locator('.icon-style-row').first().textContent(), /配信用.*ボタン 2 個.*背景画像あり/);
    const saved = (await api('icon-styles')).data.styles;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].color, '#14213d');

    // Change icons, actions, the background and drop the picture.
    let apps = (await api('settings')).data.apps;
    apps[0].iconKey = 'paste';
    apps[0].iconColor = '#00ff00';
    apps[0].name = 'A2';
    apps[1].action = 'common-paste';
    assert.equal((await api('settings', { apps })).status, 200);
    assert.equal((await api('background', { color: '#000000', color2: '', dim: 0, blur: 0 })).status, 200);
    assert.equal((await api('background/image/delete', {})).status, 200);
    await admin.reload();
    await admin.locator('.icon-style-row').first().waitFor();

    // Putting the look back asks first; "やめる" changes nothing.
    await admin.locator('.icon-style-row button', { hasText: 'この見た目に戻す' }).click();
    await admin.locator('#look-save-backdrop').waitFor();
    await admin.locator('#look-save-cancel').click();
    assert.equal(await admin.locator('#look-save-backdrop').isHidden(), true);
    assert.equal((await api('settings')).data.apps[0].iconKey, 'paste');

    // "保存せずに続ける" puts the icons, color and picture back but keeps the name and actions.
    await admin.locator('.icon-style-row button', { hasText: 'この見た目に戻す' }).click();
    await admin.locator('#look-save-no').click();
    await admin.waitForFunction(() => /ボタン 1 個/.test(document.querySelector('#message').textContent));
    let s = (await api('settings')).data;
    assert.deepEqual(s.apps.map(a => [a.name, a.iconKey, a.iconColor || '', a.action]), [['A2', 'copy', '#ff0000', 'common-copy'], ['B', 'paste', '', 'common-paste']]);
    assert.equal(s.background.color, '#14213d');
    assert.equal(s.background.dim, 10);
    assert.ok(s.background.image, 'picture restored');
    assert.match((await api('background/image')).data.data, /^data:image\/png;base64,/);
    await admin.waitForFunction(() => /url\("data:image/.test((document.querySelector('#phone-shell .deck-bg-picture') || {}).style?.backgroundImage || ''));

    // A bulk change offers to save first; saving adds a second look, then the change runs.
    await admin.locator('#icon-pack-bulk-pack').selectOption('');
    await admin.locator('#icon-pack-bulk-apply').click();
    await admin.locator('#look-save-backdrop').waitFor();
    assert.match(await admin.locator('#look-save-name').inputValue(), /の見た目$/);
    await admin.locator('#look-save-name').fill('一括変更の前');
    await admin.locator('#look-save-yes').click();
    await admin.waitForFunction(() => document.querySelectorAll('.icon-style-row').length === 2);
    assert.equal(await admin.locator('.icon-style-row strong').first().textContent(), '一括変更の前', 'newest first');

    // Rename and delete.
    admin.once('dialog', d => d.accept('配信用（改）'));
    await admin.locator('.icon-style-row').nth(1).locator('button', { hasText: '名前を変える' }).click();
    await admin.waitForFunction(() => [...document.querySelectorAll('.icon-style-row strong')].some(e => e.textContent === '配信用（改）'));
    admin.once('dialog', d => d.accept());
    await admin.locator('.icon-style-row').first().locator('button', { hasText: '削除' }).click();
    await admin.waitForFunction(() => document.querySelectorAll('.icon-style-row').length === 1);

    // At most 20; phones cannot use looks.
    for (let i = 0; i < 19; i++) assert.equal((await api('icon-styles/save', { name: 'x' + i })).status, 200);
    const over = await api('icon-styles/save', { name: 'over' });
    assert.notEqual(over.status, 200);
    assert.match(over.data.error, /20個まで/);
    assert.notEqual((await api('icon-styles', undefined, 'test-phone')).status, 200);
    assert.notEqual((await api('icon-styles/save', { name: 'p' }, 'test-phone')).status, 200);
    assert.notEqual((await api('icon-styles/apply', { id: '../x' })).status, 200);
    await admin.reload();
    await admin.waitForFunction(() => document.querySelector('#icon-style-count').textContent === '20 / 20');
    assert.equal(await admin.locator('#icon-style-save').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS saved looks: save by name, ask before replacing, restore icons/colors/background picture without actions, save before bulk change, rename, delete, limit 20');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
