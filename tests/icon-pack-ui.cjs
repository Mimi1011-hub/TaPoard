const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 3.1: a .tpicons file (zip + icons.json) is imported in the settings page, picked in the icon
// picker, exported again, and deleted. Runs against the real HTTP host (Release103Tests serve).
const base = 'http://127.0.0.1:18782';
const win = process.platform === 'win32';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
fs.rmSync('tests/bin/data/icon-packs', { recursive: true, force: true });
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
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
// A deflate-compressed zip, as made by Windows Explorer or 7-Zip.
function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = zlib.deflateRawSync(f.data), crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x800, 8); head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(f.data.length, 24); head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

(async () => {
  let browser;
  const temp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tapoard-pack-'));
  try {
    await ready;
    const manifest = { format: 'tapoard-icons', version: 1, name: 'テスト用パック', author: 'TaPoard', icons: [
      { file: 'icons/mic.png', name: 'マイク', key: 'microphone' },
      { file: 'icons/big.png', name: '大きい画像', key: 'paste' },
      { file: 'icons/broken.png', name: '壊れた画像' },
    ] };
    const packFile = path.join(temp, 'test-pack.tpicons');
    fs.writeFileSync(packFile, zip([
      { name: 'icons.json', data: Buffer.from(JSON.stringify(manifest)) },
      { name: 'icons/mic.png', data: fs.readFileSync('web/icon-192.png') },
      { name: 'icons/big.png', data: fs.readFileSync('web/icon-512.png') },
      { name: 'icons/broken.png', data: Buffer.from('not a picture') },
    ]));
    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const errors = [];
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
    const admin = await context.newPage();
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('#preview-deck [data-app-index="0"]').waitFor();
    await admin.locator('.icon-pack-empty').waitFor();

    // Import: two pictures load, the broken one is skipped and reported.
    await admin.locator('#icon-pack-file').setInputFiles(packFile);
    await admin.waitForFunction(() => document.querySelector('#message').textContent.includes('読み込みました'));
    assert.match(await admin.locator('#message').innerText(), /テスト用パック.*2個.*読めなかった画像 1個/);
    await admin.locator('.icon-pack-item').filter({ hasText: 'テスト用パック' }).waitFor();
    const list = (await api('icon-packs')).data.packs;
    assert.equal(list.length, 1);
    assert.equal(list[0].count, 2);
    assert.equal(list[0].mapped, 2);
    const pack = (await api('icon-packs/get?id=' + list[0].id)).data;
    assert.deepEqual(pack.icons.map(i => [i.name, i.key]), [['マイク', 'microphone'], ['大きい画像', 'paste']]);
    for (const icon of pack.icons) assert(icon.data.length <= 60000 && /^data:image\/(png|webp);base64,/.test(icon.data), 'icons are shrunk to the custom icon limit');
    assert(fs.existsSync(path.join('tests/bin/data/icon-packs', list[0].id + '.json')));

    // Pick a pack icon for the first button.
    await admin.locator('.icon-select-button').first().click();
    await admin.locator('.icon-pack-tabs').getByRole('tab', { name: 'テスト用パック' }).click();
    assert.equal(await admin.locator('#icon-preset-groups').isHidden(), true);
    const saved = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('.icon-pack-grid .icon-choice', { hasText: 'マイク' }).click();
    await saved;
    let settings = (await api('settings')).data;
    let app = settings.apps.find(a => a.iconPack);
    assert(app, 'button remembers its pack');
    assert.equal(app.iconPack, pack.id);
    assert.equal(app.iconPackItem, pack.icons[0].id);
    assert.equal(app.iconKey, 'microphone');
    assert.equal(app.customIcon, pack.icons[0].data);
    assert.equal(await admin.locator('#preview-deck .custom-app-icon').count() >= 1, true);

    // Choosing a standard icon again forgets the pack.
    await admin.locator('.icon-select-button').first().click();
    await admin.locator('.icon-pack-tabs').getByRole('tab', { name: '標準アイコン' }).click();
    const back = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('.icon-choice[data-icon-key="heart"]').click();
    await back;
    settings = (await api('settings')).data;
    app = settings.apps.find(a => a.iconKey === 'heart');
    assert(app && !app.iconPack && !app.customIcon, 'standard icon clears the pack picture');

    // Bulk change: the portrait "paste" button takes the pack picture; the "heart" one has no match.
    await admin.locator('#icon-pack-bulk-pack').selectOption(pack.id);
    let bulk = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('#icon-pack-bulk-apply').click();
    await admin.locator('#look-save-no').click();
    await bulk;
    assert.match(await admin.locator('#message').innerText(), /1個変更.*合う絵がなかったボタン 1個/);
    settings = (await api('settings')).data;
    let portrait = settings.apps.find(a => a.orientation === 'portrait');
    assert.equal(portrait.customIcon, pack.icons[1].data);
    assert.equal(portrait.iconKey, 'paste', 'the preset key stays so the change can be undone');
    assert.equal(settings.apps.find(a => a.orientation === 'landscape').customIcon || '', '');
    // Undo restores the standard icon.
    bulk = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('#icon-pack-bulk-undo').click();
    await bulk;
    settings = (await api('settings')).data;
    assert.equal(settings.apps.find(a => a.orientation === 'portrait').customIcon || '', '');
    // Apply again, then switch everything back to the standard icons.
    bulk = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('#icon-pack-bulk-apply').click();
    await admin.locator('#look-save-no').click();
    await bulk;
    assert.equal((await api('settings')).data.apps.find(a => a.orientation === 'portrait').iconPack, pack.id);
    await admin.locator('#icon-pack-bulk-pack').selectOption('');
    bulk = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET');
    await admin.locator('#icon-pack-bulk-apply').click();
    await admin.locator('#look-save-no').click();
    await bulk;
    portrait = (await api('settings')).data.apps.find(a => a.orientation === 'portrait');
    assert(!portrait.customIcon && !portrait.iconPack && portrait.iconKey === 'paste', 'standard icons come back');

    // Export the pack and import the exported file again: same names, keys and pictures.
    const download = admin.waitForEvent('download');
    await admin.locator('.icon-pack-item').filter({ hasText: 'テスト用パック' }).getByRole('button', { name: '書き出し' }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), 'テスト用パック.tpicons');
    const exported = path.join(temp, 'exported.tpicons');
    await file.saveAs(exported);
    await admin.locator('#icon-pack-file').setInputFiles(exported);
    await admin.waitForFunction(() => document.querySelectorAll('.icon-pack-item').length === 2);
    const packs = (await api('icon-packs')).data.packs;
    const again = (await api('icon-packs/get?id=' + packs[1].id)).data;
    assert.deepEqual(again.icons.map(i => [i.name, i.key]), pack.icons.map(i => [i.name, i.key]));

    // Loose images (no zip) become a pack named after the first file.
    fs.copyFileSync('web/icon-192.png', path.join(temp, 'speaker.png'));
    await admin.locator('#icon-pack-file').setInputFiles(path.join(temp, 'speaker.png'));
    await admin.waitForFunction(() => document.querySelectorAll('.icon-pack-item').length === 3);
    const loose = (await api('icon-packs')).data.packs[2];
    assert.equal(loose.mapped, 1, 'speaker.png maps to the speaker preset');

    // Server rejects bad input directly as well.
    assert.equal((await api('icon-packs/add', { id: pack.id, icons: [{ name: 'x', data: 'data:text/html;base64,PGgxPg==' }] })).status, 400);
    assert.equal((await api('icon-packs/get?id=../settings-v2')).status, 400);
    const phone = await fetch(base + '/api/icon-packs', { headers: { Authorization: 'Bearer test-phone' } });
    assert.notEqual(phone.status, 200, 'phones cannot read packs');

    // Delete.
    admin.once('dialog', d => d.accept());
    await admin.locator('.icon-pack-item').filter({ hasText: 'speaker' }).getByRole('button', { name: '削除' }).click();
    await admin.waitForFunction(() => document.querySelectorAll('.icon-pack-item').length === 2);
    assert.equal((await api('icon-packs')).data.packs.length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS icon packs: .tpicons import (deflate zip, broken picture skipped), picker tab, bulk change with undo, export round trip, loose images, server checks, delete');
  } finally {
    if (browser) await browser.close();
    host.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
