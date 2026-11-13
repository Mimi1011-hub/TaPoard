const { chromium } = require('./playwright.cjs');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

// 2.0 integration: every widget on one real-HTTP page, two phones, input ownership and load.
const base = 'http://127.0.0.1:18782';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
const host = spawn('tests/bin/Release103Tests.exe', ['serve'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const native = [];
let buffered = '';
const ready = new Promise((resolve, reject) => {
  host.stdout.on('data', data => {
    buffered += String(data);
    const lines = buffered.split('\n');
    buffered = lines.pop();
    for (const line of lines) {
      if (line.includes('READY')) resolve();
      if (line.startsWith('INPUT ')) native.push(...line.slice(6).trim().split(' '));
    }
  });
  host.stderr.on('data', data => reject(Error(String(data))));
  host.on('exit', code => reject(Error('Host exit ' + code)));
});
async function api(path, key = 'test-admin', body) {
  const r = await fetch(base + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await wait(25); }
  assert.fail(message);
}
function widget(name, type, row, column, width, height, options) {
  return { name, type, orientation: 'landscape', landscape: { page: 0, row, column }, size: 1, width, height, fontSize: 11, iconScale: 82, labelOpacity: 45, hideLabel: true, iconKey: '', iconColor: '', options };
}
// Server CPU seconds and resident memory from /proc (Linux) or the process list (Windows).
function hostUsage() {
  try {
    const stat = fs.readFileSync('/proc/' + host.pid + '/stat', 'utf8').split(') ')[1].split(' ');
    const status = fs.readFileSync('/proc/' + host.pid + '/status', 'utf8');
    return { cpu: (Number(stat[11]) + Number(stat[12])) / 100, rssMb: Number(/VmRSS:\s+(\d+)/.exec(status)[1]) / 1024 };
  } catch {
    const out = require('child_process').execSync('powershell -NoProfile -Command "$p=Get-Process -Id ' + host.pid + ';$p.TotalProcessorTime.TotalSeconds;$p.WorkingSet64"').toString().trim().split(/\s+/);
    return { cpu: Number(out[0]), rssMb: Number(out[1]) / 1048576 };
  }
}

(async () => {
  let browser;
  try {
    await ready;
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const errors = [];
    const layout = await api('layout', 'test-admin', { columns: 8, rows: 5, keepAwake: false, orientation: 'landscape', speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1 });
    assert.equal(layout.status, 200, JSON.stringify(layout.data));
    const settings = (await api('settings')).data;
    settings.apps = [
      widget('時計', 'clock', 0, 2, 2, 2, { style: 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false }),
      widget('CPU', 'metrics', 0, 4, 1, 1, { primary: 'cpu', cycle: false, gpuId: '' }),
      widget('PC情報', 'metrics', 0, 5, 2, 2, { primary: 'cpu', cycle: false, gpuId: '' }),
      widget('天気', 'weather', 0, 7, 1, 1, { forecastMode: 'hours' }),
      widget('縦ホイール', 'wheel', 1, 7, 1, 1, { style: 'vertical', sensitivity: 20, multiplier: 2, reverse: false, ctrl: true, shift: false, alt: false, middleClick: true }),
      widget('円形ホイール', 'wheel', 2, 0, 2, 2, { style: 'rotary', sensitivity: 18, multiplier: 1, reverse: true, ctrl: false, shift: false, alt: false, middleClick: false }),
      widget('タッチパッド', 'touchpad', 2, 2, 3, 2, { speed: 5, acceleration: false, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' }),
    ];
    const saved = await api('settings', 'test-admin', settings);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));

    const contextA = await browser.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
    const contextB = await browser.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
    const phoneA = await contextA.newPage(), phoneB = await contextB.newPage();
    for (const page of [phoneA, phoneB]) {
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(base + '/#connect=test-phone');
      await page.locator('#deck .touchpad-widget').waitFor();
      await page.locator('#deck .wheel-rotary').waitFor();
      await page.locator('#deck .clock-time').waitFor();
      await page.locator('#deck .metrics-widget').first().waitFor();
    }
    await until(() => true, '');
    const cdpA = await contextA.newCDPSession(phoneA);
    const touch = (type, points) => cdpA.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    async function waitSessions(page) {
      await page.waitForFunction(() => document.querySelector('#deck .touchpad-widget'));
      await wait(300);
    }
    await waitSessions(phoneA);
    await waitSessions(phoneB);

    // Vertical wheel on phone A: Ctrl and amount come from the PC settings.
    let start = native.length;
    const wheelBox = await phoneA.locator('#deck .wheel-vertical').boundingBox();
    await touch('touchStart', [[wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height - 4]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height - 4 - i * 5]]); await wait(16); }
    await touch('touchEnd', []);
    await until(() => native.slice(start).filter(e => e.startsWith('wheel:')).length > 0 && native.slice(start).at(-1) === 'keyUp:0:0:0:ctrl', 'vertical wheel reaches the PC');
    const wheelEvents = native.slice(start);
    assert.equal(wheelEvents[0], 'keyDown:0:0:0:ctrl');
    assert(wheelEvents.filter(e => e.startsWith('wheel:')).every(e => Number(e.split(':')[3]) % 240 === 0 && Number(e.split(':')[3]) > 0), 'swipe up scrolls up by 2 notches per step: ' + wheelEvents.join(' '));

    // Phone A holds a touchpad drag; phone B is refused and sees the busy label.
    const padBox = await phoneA.locator('#deck .touchpad-widget').boundingBox();
    const px = padBox.x + padBox.width / 2, py = padBox.y + padBox.height / 2;
    await wait(400);
    start = native.length;
    await touch('touchStart', [[px, py]]);
    await touch('touchEnd', []);
    await wait(100);
    await touch('touchStart', [[px, py]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[px + i * 5, py]]); await wait(16); }
    await until(() => native.slice(start).includes('buttonDown:0:0:0:left') && native.slice(start).filter(e => e === 'buttonDown:0:0:0:left').length === 2, 'tap-drag presses the left button');
    const bWheel = await phoneB.locator('#deck .wheel-vertical').boundingBox();
    const beforeB = native.length;
    await phoneB.mouse.move(bWheel.x + bWheel.width / 2, bWheel.y + bWheel.height - 4);
    await phoneB.mouse.down();
    for (let i = 1; i <= 8; i++) await phoneB.mouse.move(bWheel.x + bWheel.width / 2, bWheel.y + bWheel.height - 4 - i * 5);
    await phoneB.mouse.up();
    await phoneB.locator('#deck .wheel-vertical.input-busy').waitFor({ timeout: 2000 });
    await wait(1500);
    assert(native.slice(beforeB).every(e => e.startsWith('move:')), 'another phone cannot take over a held drag (keepalive keeps ownership past 2 seconds): ' + native.slice(beforeB).join(' '));
    await touch('touchEnd', []);
    await until(() => native.at(-1) === 'buttonUp:0:0:0:left', 'finger up releases the drag');
    await wait(300);
    const afterRelease = native.length;
    await phoneB.mouse.move(bWheel.x + bWheel.width / 2, bWheel.y + bWheel.height - 4);
    await phoneB.mouse.down();
    for (let i = 1; i <= 8; i++) await phoneB.mouse.move(bWheel.x + bWheel.width / 2, bWheel.y + bWheel.height - 4 - i * 5);
    await phoneB.mouse.up();
    await until(() => native.slice(afterRelease).includes('keyDown:0:0:0:ctrl'), 'phone B operates after phone A released');

    // Load: all widgets visible on two phones for 20 seconds, then 5 seconds of continuous touchpad movement.
    const perf = await contextA.newCDPSession(phoneA);
    await perf.send('Performance.enable');
    const metric = async () => Object.fromEntries((await perf.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await wait(2000);
    let m0 = await metric(), u0 = hostUsage(), t0 = Date.now();
    await wait(20000);
    let m1 = await metric(), u1 = hostUsage(), seconds = (Date.now() - t0) / 1000;
    const idle = {
      phoneTaskPercent: (100 * (m1.TaskDuration - m0.TaskDuration)) / seconds,
      phoneHeapMb: m1.JSHeapUsedSize / 1048576,
      serverCpuPercent: (100 * (u1.cpu - u0.cpu)) / seconds,
      serverRssMb: u1.rssMb,
    };
    let requests = 0;
    phoneA.on('request', r => { if (r.url().endsWith('/api/input')) requests++; });
    m0 = await metric(); u0 = hostUsage(); t0 = Date.now();
    await touch('touchStart', [[px - 80, py]]);
    for (let i = 0; i < 300; i++) { await touch('touchMove', [[px - 80 + (i % 40) * 4, py + ((i / 40) | 0)]]); await wait(16); }
    await touch('touchEnd', []);
    m1 = await metric(); u1 = hostUsage(); seconds = (Date.now() - t0) / 1000;
    const active = {
      seconds,
      inputRequestsPerSecond: requests / seconds,
      phoneTaskPercent: (100 * (m1.TaskDuration - m0.TaskDuration)) / seconds,
      serverCpuPercent: (100 * (u1.cpu - u0.cpu)) / seconds,
      serverRssMb: u1.rssMb,
    };
    console.log('LOAD idle ' + JSON.stringify(idle));
    console.log('LOAD touchpad ' + JSON.stringify(active));
    assert(active.inputRequestsPerSecond <= 21, 'touchpad sends at most about 20 requests per second');
    assert(idle.phoneTaskPercent < 15, 'idle phone page stays light');
    assert(idle.serverCpuPercent < 10, 'idle server stays light');
    assert.deepEqual(errors, []);
    console.log('PASS 2.0 integration: all widgets on one page, two phones, wheel modifiers, held-drag ownership, release hand-over and load');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
