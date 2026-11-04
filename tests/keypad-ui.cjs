const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

const base = 'http://127.0.0.1:18782';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
const host = spawn('tests/bin/Release103Tests.exe', ['serve'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const native = [];
let buffered = '';
const ready = new Promise((resolve, reject) => {
  host.stdout.on('data', data => {
    buffered += String(data);
    const lines = buffered.split('\n'); buffered = lines.pop();
    for (const line of lines) {
      if (line.includes('READY')) resolve();
      if (line.startsWith('INPUT ')) native.push(...line.slice(6).trim().split(' '));
    }
  });
  host.stderr.on('data', data => reject(Error(String(data))));
  host.on('exit', code => reject(Error('Host exit ' + code)));
});
async function api(path, key = 'test-admin', body) {
  const response = await fetch(base + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
async function until(check, message) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  assert.fail(message);
}

(async () => {
  let browser;
  try {
    await ready;
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    assert.equal((await api('layout', 'test-admin', { columns: 4, rows: 4, keepAwake: false, orientation: 'landscape' })).status, 200);
    assert.equal((await api('layout', 'test-admin', { columns: 4, rows: 4, keepAwake: false, orientation: 'landscape', page: 0, speakerHidden: true, micHidden: true })).status, 200);
    const settings = (await api('settings')).data;
    settings.apps = [{
      name: 'テンキー', type: 'keypad', orientation: 'landscape', landscape: { page: 0, row: 0, column: 0 },
      size: 1, width: 4, height: 4, fontSize: 11, iconScale: 82, labelOpacity: 45, hideLabel: true,
      iconKey: '', iconColor: '', options: {},
    }];
    const saved = await api('settings', 'test-admin', settings);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));

    const phone = await browser.newPage({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
    await phone.goto(base + '/#connect=test-phone');
    const keypad = phone.locator('#deck .keypad-widget');
    await keypad.waitFor();
    assert.equal(await keypad.locator('.keypad-key').count(), 16);
    await phone.waitForTimeout(300);
    await keypad.getByRole('button', { name: '7', exact: true }).click();
    await until(() => native.includes('keyDown:0:0:0:numpad-7') && native.includes('keyUp:0:0:0:numpad-7'), 'numpad 7 reaches Windows');
    await keypad.getByRole('button', { name: 'Enter', exact: true }).click();
    await until(() => native.includes('keyDown:0:0:0:numpad-enter') && native.includes('keyUp:0:0:0:numpad-enter'), 'numpad Enter reaches Windows');
    assert.equal(await keypad.evaluate(node => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll('.keypad-key')].every(key => {
        const rect = key.getBoundingClientRect();
        return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom;
      });
    }), true, 'all keypad keys fit inside the widget');
    console.log('PASS keypad UI: 4x4 layout and allowlisted numpad input');
  } finally {
    if (browser) await browser.close();
    if (host.exitCode === null) {
      host.kill();
      await new Promise(resolve => {
        host.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
