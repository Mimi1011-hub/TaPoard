const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 3.1: deck background. Colors and gradients save at once, a picture uploads and can be moved and
// zoomed per orientation in the preview, phones show it, and removing it deletes the file.
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
async function background() {
  return (await api('settings')).data.background;
}
async function until(check, what) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error('Timed out: ' + what);
}

(async () => {
  let browser;
  try {
    await ready;
    browser = await chromium.launch(win ? { headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { headless: true });
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('#background-colors button').first().waitFor();
    const screen = admin.locator('#phone-shell .phone-screen');

    // A plain color.
    assert.equal(await admin.locator('#background-colors button').count() >= 12, true);
    await admin.locator('#background-colors button').nth(3).click();
    await until(async () => !!(await background()).color, 'color saved');
    let b = await background();
    assert.equal(b.color2, '');
    assert.match(await screen.evaluate(e => e.style.background), /rgb/);
    assert.equal(await screen.evaluate(e => e.classList.contains('has-deck-bg')), true);

    // A gradient, then dim and blur.
    await admin.locator('#background-gradients button').first().click();
    await until(async () => !!(await background()).color2, 'gradient saved');
    assert.match(await screen.evaluate(e => e.style.background), /linear-gradient/);
    await admin.locator('#background-dim').fill('40');
    await until(async () => (await background()).dim === 40, 'dim saved');
    // Buttons follow the background color by default, can be see-through or stay black.
    assert.equal(await screen.evaluate(e => e.classList.contains('keys-tint')), true);
    assert.match(await admin.locator('#preview-deck .deck-key').first().evaluate(e => getComputedStyle(e).backgroundImage), /linear-gradient\(145deg, rgb\((?!23, 25, 30)/);
    await admin.locator('#background-keys').selectOption('glass');
    await until(async () => (await background()).keys === 'glass', 'glass saved');
    assert.equal(await screen.evaluate(e => e.classList.contains('keys-glass') && !e.classList.contains('keys-tint')), true);
    await admin.locator('#background-keys').selectOption('standard');
    await until(async () => (await background()).keys === 'standard', 'standard saved');
    assert.equal(await screen.evaluate(e => e.classList.contains('keys-glass') || e.classList.contains('keys-tint')), false);
    await admin.locator('#background-keys').selectOption('');
    await until(async () => (await background()).keys === '', 'auto saved');
    assert.equal(await admin.locator('#background-dim-value').textContent(), '40%');

    // Bad input is refused or clamped by the PC.
    assert.notEqual((await api('background', { color: 'url(x)' })).status, 200);
    assert.notEqual((await api('background/image', { data: 'data:image/png;base64,AAAA', width: 1, height: 1 })).status, 200);

    // A picture: upload, then the controls appear.
    assert.equal(await admin.locator('#background-image-controls').isHidden(), true);
    await admin.locator('#background-image-file').setInputFiles('web/icon-512.png');
    await until(async () => !!(await background()).image, 'image saved');
    await admin.locator('#background-image-controls').waitFor();
    await admin.waitForFunction(() => /url\("data:image/.test(document.querySelector('#phone-shell .deck-bg-picture').style.backgroundImage));
    b = await background();
    assert.equal(b.imageWidth, 512);
    assert.equal(b.imageHeight, 512);
    const imagePath = (await api('background/image')).data.data;
    assert.match(imagePath, /^data:image\/jpeg;base64,/);

    // Adjust mode starts right after the upload: dragging up in landscape moves the picture.
    assert.equal(await admin.locator('#background-adjust').getAttribute('aria-pressed'), 'true');
    assert.equal(await admin.locator('#phone-shell').evaluate(e => e.classList.contains('background-adjusting')), true);
    await screen.scrollIntoViewIfNeeded();
    const box = await screen.boundingBox();
    await admin.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await admin.mouse.down();
    await admin.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 5 });
    await admin.mouse.up();
    await until(async () => (await background()).landscape.y > 50, 'landscape y moved');
    b = await background();
    assert.equal(b.landscape.x, 50, 'no horizontal overflow for a square picture in a wide screen');
    assert.equal(b.portrait.y, 50, 'portrait untouched');

    await admin.locator('#background-zoom').fill('2');
    await until(async () => (await background()).landscape.zoom === 2, 'zoom saved');
    assert.equal(await admin.locator('#background-zoom-value').textContent(), '200%');

    // Portrait keeps its own position.
    await admin.locator('#preview-portrait').click();
    await admin.waitForFunction(() => document.querySelector('#background-orientation-note').textContent.startsWith('縦'));
    assert.equal(await admin.locator('#background-zoom').inputValue(), '1');
    await admin.locator('#background-center').click();
    await admin.locator('#background-adjust').click();
    assert.equal((await background()).landscape.zoom, 2);

    // A phone gets the background and the picture.
    const phone = await browser.newPage({ viewport: { width: 667, height: 375 } });
    phone.on('pageerror', e => errors.push(String(e)));
    await phone.goto(base + '/#connect=test-phone');
    await phone.locator('#deck .deck-key').first().waitFor();
    await phone.waitForFunction(() => {
      const frame = document.querySelector('#deck').parentNode;
      const pic = frame.querySelector('.deck-bg-picture');
      return frame.classList.contains('has-deck-bg') && pic && /url\("data:image/.test(pic.style.backgroundImage);
    });
    assert.equal((await api('background/image', undefined, 'test-phone')).status, 200);
    assert.notEqual((await api('background', { color: '#000000' }, 'test-phone')).status, 200, 'phones cannot change it');

    // Remove the picture, then reset the colors.
    await admin.locator('#background-image-remove').click();
    await until(async () => !(await background()).image, 'image removed');
    assert.equal((await api('background/image')).data.data, null);
    await admin.waitForFunction(() => !document.querySelector('#phone-shell .deck-bg-picture') || !document.querySelector('#phone-shell .deck-bg-picture').style.backgroundImage);
    await admin.locator('#background-reset').click();
    await until(async () => { const v = await background(); return !v.color && !v.color2 && !v.dim; }, 'reset');
    await admin.waitForFunction(() => !document.querySelector('#phone-shell .phone-screen').classList.contains('has-deck-bg'));
    await phone.waitForFunction(() => !document.querySelector('#deck').parentNode.classList.contains('has-deck-bg'), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
    console.log('PASS background: colors, gradient, dim, picture upload, per-orientation drag and zoom, phone view, removal and reset');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
