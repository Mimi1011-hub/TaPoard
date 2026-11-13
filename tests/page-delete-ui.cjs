const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 3.1: deleting a page in the settings page removes its buttons and fader override, moves later
// pages up, leaves the other orientation alone, and can be undone once.
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
async function api(p, body) {
  const r = await fetch(base + '/api/' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
function button(id, name, page, row, column, orientation = 'landscape') {
  return { id, name, orientation, type: 'hotkey', category: 'common', action: 'common-copy', iconKey: 'copy', size: 1, width: 1, height: 1, fontSize: 11, iconScale: 82, labelOpacity: 45, [orientation]: { page, row, column } };
}

(async () => {
  let browser;
  try {
    await ready;
    // Landscape pages: 1 = A, 2 = B1 B2 (+ its own fader layout), 3 = C. Portrait has one button on page 2.
    const apps = [button('a', 'A', 0, 1, 2), button('b1', 'B1', 1, 1, 2), button('b2', 'B2', 1, 2, 3), button('c', 'C', 2, 1, 4), button('p', 'P', 1, 1, 1, 'portrait')];
    assert.equal((await api('settings', { apps })).status, 200);
    assert.equal((await api('layout', { columns: 5, rows: 3, keepAwake: false, orientation: 'landscape', page: 1, speakerSlot: 0, micSlot: 5, speakerSize: 1, micSize: 1 })).status, 200);
    assert.equal((await api('layout', { columns: 5, rows: 3, keepAwake: false, orientation: 'landscape', page: 2, speakerSlot: 0, micSlot: 6, speakerSize: 1, micSize: 1 })).status, 200);
    let settings = (await api('settings')).data;
    assert.equal(settings.landscapePages, 3);
    assert.deepEqual(settings.landscapeControlPages.map(p => p.page), [1, 2]);

    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('#preview-deck [data-app-index]').first().waitFor();
    await admin.locator('#preview-next').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '2 / 3');

    // Delete page 2: confirm names the two buttons.
    let dialogText = '';
    admin.once('dialog', d => { dialogText = d.message(); d.accept(); });
    await admin.locator('#preview-delete-page').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '2 / 2');
    assert.match(dialogText, /横向きの 2 ページ目.*\n.*ボタン 2 個/);
    settings = (await api('settings')).data;
    assert.deepEqual(settings.apps.filter(a => a.orientation === 'landscape').map(a => [a.name, a.landscape.page]), [['A', 0], ['C', 1]]);
    assert.deepEqual(settings.apps.find(a => a.name === 'P').portrait, { page: 1, row: 1, column: 1 }, 'portrait is untouched');
    assert.equal(settings.landscapePages, 2);
    assert.equal(settings.portraitPages, 2);
    assert.deepEqual(settings.landscapeControlPages.map(p => [p.page, p.micSlot]), [[1, 6]], 'page 3 fader layout moved to page 2');
    assert.equal(await admin.locator('#preview-undo-page').isVisible(), true);

    // Undo brings everything back.
    await admin.locator('#preview-undo-page').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '2 / 3');
    settings = (await api('settings')).data;
    assert.deepEqual(settings.apps.filter(a => a.orientation === 'landscape').map(a => [a.name, a.landscape.page]), [['A', 0], ['B1', 1], ['B2', 1], ['C', 2]]);
    assert.deepEqual(settings.landscapeControlPages.map(p => p.page), [1, 2]);
    assert.equal((await api('page/undo', {})).status, 400, 'only one undo');

    // An empty page goes without a question; the last page cannot be deleted.
    await admin.locator('#preview-portrait').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '1 / 2');
    let asked = false;
    admin.once('dialog', d => { asked = true; d.accept(); });
    await admin.locator('#preview-delete-page').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent === '1 / 1');
    assert.equal(asked, false);
    settings = (await api('settings')).data;
    assert.deepEqual(settings.apps.find(a => a.name === 'P').portrait, { page: 0, row: 1, column: 1 });
    assert.equal(await admin.locator('#preview-delete-page').isDisabled(), true);
    assert.equal((await api('page/delete', { orientation: 'portrait', page: 0 })).status, 400);

    // A later save ends the undo.
    await api('page/delete', { orientation: 'landscape', page: 2 });
    const renamed = (await api('settings')).data.apps;
    renamed[0].name = 'A2';
    await api('settings', { apps: renamed });
    assert.equal((await api('page/undo', {})).status, 400);
    // Phones cannot delete pages.
    const phone = await fetch(base + '/api/page/delete', { method: 'POST', headers: { Authorization: 'Bearer test-phone', 'Content-Type': 'application/json' }, body: JSON.stringify({ orientation: 'landscape', page: 0 }) });
    assert.notEqual(phone.status, 200);
    assert.deepEqual(errors, []);
    console.log('PASS page delete: buttons and fader layout of the page go, later pages move up, other orientation untouched, one undo, last page kept');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
