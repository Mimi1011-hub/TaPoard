const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let revision = 1;
let version = 'one';
let weatherConfigured = false;
let metricValue = 22;
let pairResult = 'approved';
let pairPolls = 0;
const backgroundState = { color: '#123456', image: 'bg-one', imageWidth: 100, imageHeight: 50,
  portrait: { fit: 'cover', x: 40, y: 60, zoom: 1, flipX: true, flipY: false, rotate: 90 },
  landscape: { fit: 'cover', x: 50, y: 50, zoom: 1, flipX: false, flipY: false, rotate: 0 }, keyClear: 20 };
const audioRequests = [];
const viewRequests = [];
const slideRequests = [];
let backgroundRequests = 0;

function placement(id, type, row, column, width, height, options) {
  return { id, type, name: type, row, column, width, height, options: options || null, hideLabel: false, keyClear: null };
}

function deckState() {
  const faders = {
    speaker: { row: 0, column: 0, width: 1, height: 2, backgroundOpacity: 60, iconColor: '#b53846' },
    mic: { row: 0, column: 1, width: 1, height: 2 },
  };
  const items = [
    placement('clock-1', 'clock', 0, 1, 2, 1, { showSeconds: true }),
    placement('metrics-1', 'metrics', 1, 1, 2, 2),
    placement('weather-1', 'weather', 3, 0, 2, 2),
    placement('slides-1', 'slideshow', 3, 2, 2, 2, { folder: 'pictures', interval: 3 }),
    placement('wheel-1', 'wheel', 5, 0, 1, 1),
    Object.assign(placement('button-1', 'app', 5, 1, 1, 1), { keyClear: 50 }),
    placement('future-1', 'future', 5, 2, 1, 1),
  ];
  return {
    schemaVersion: 3, revision, version, computer: 'Widget test', current: { portrait: 0, landscape: 0 },
    deck: {
      keepAwake: false,
      portrait: { columns: 4, rows: 6, faders, pages: [{ faders: null, items }, { faders: { speakerHidden: true, micHidden: true }, items: [] }] },
      landscape: { columns: 6, rows: 4, faders, pages: [{ faders: null, items }, { faders: { speakerHidden: true, micHidden: true }, items: [] }] },
    },
    widgetDefinitions: [
      { type: 'clock', displayOnly: true }, { type: 'metrics', displayOnly: true }, { type: 'weather', displayOnly: true },
      { type: 'slideshow', displayOnly: true }, { type: 'wheel', displayOnly: true },
      { type: 'future', displayOnly: true },
    ],
    audio: { speakerVolume: 20, speakerMuted: false, speakerAvailable: true, micVolume: 42, micMuted: true, micAvailable: true },
    metrics: { active: true, cpuSupported: true, cpuAvailable: true, cpuPercent: metricValue, memoryAvailable: true, memoryPercent: 44, memoryUsedBytes: 4294967296, memoryTotalBytes: 8589934592,
      history: [{ cpuPercent: 10, memoryPercent: 40, gpus: [{ id: 'gpu-1', utilizationPercent: 30, memoryPercent: 20 }] }, { cpuPercent: metricValue, memoryPercent: 44, gpus: [{ id: 'gpu-1', utilizationPercent: 50, memoryPercent: 25 }] }],
      gpus: [{ id: 'gpu-1', name: 'Test GPU', utilizationPercent: 50, utilizationAvailable: true, memoryAvailable: true, memoryUsedBytes: 2147483648, memoryTotalBytes: 4294967296 }] },
    weather: weatherConfigured ? { configured: true, available: true, location: 'Tokyo', temperature: 21, code: 1, precipitation: 10, days: [{ date: '2026-11-15', code: 1, maximum: 22, minimum: 12, precipitation: 10 }], attribution: 'Open-Meteo', updatedAt: '2026-11-15T10:30:00+09:00', stale: true } : { configured: false },
    background: backgroundState,
  };
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const image = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/pair/start') { pairPolls = 0; json(res, 200, { id: 'pair-id', secret: 'pair-secret', code: '123456', expires: new Date(Date.now() + 180000).toISOString() }); return; }
  if (url.pathname === '/api/pair/status') {
    if (req.headers.authorization !== 'Bearer pair-secret') { json(res, 401, { error: 'unauthorized' }); return; }
    json(res, 200, pairResult === 'approved' ? (++pairPolls === 1 ? { status: 'pending' } : { status: 'approved', token: 'test' }) : { status: 'denied' }); return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') { json(res, 401, { error: 'unauthorized' }); return; }
    if (url.pathname === '/api/v3/state') { json(res, 200, deckState()); return; }
    if (url.pathname === '/api/sync') { setTimeout(() => json(res, 200, { revision, version }), 100); return; }
    if (url.pathname === '/api/audio') {
      const value = JSON.parse(body); audioRequests.push(value);
      const audio = value.toggleMute ? { speakerMuted: true } : { speakerVolume: 5, speakerAvailable: true };
      json(res, 200, { revision, audio }); return;
    }
    if (url.pathname === '/api/view') { viewRequests.push(JSON.parse(body)); json(res, 200, { ok: true }); return; }
    if (url.pathname === '/api/slideshow') { slideRequests.push(Number(url.searchParams.get('index'))); json(res, 200, { index: Number(url.searchParams.get('index')), count: 3, data: image }); return; }
    if (url.pathname === '/api/background/image') { backgroundRequests += 1; json(res, 200, { data: image }); return; }
    if (url.pathname === '/api/page') { json(res, 200, { ok: true }); return; }
    json(res, 200, { ok: true }); return;
  }
  let file;
  if (url.pathname === '/v4' || url.pathname === '/v4/') file = 'web/v4/index.html';
  else if (url.pathname.startsWith('/v4/')) file = `web/v4/${url.pathname.slice(4)}`;
  else if (url.pathname === '/nosleep.min.js') file = 'web/nosleep.min.js';
  if (!file || !fs.existsSync(file)) { res.writeHead(url.pathname === '/favicon.ico' ? 204 : 404); res.end(); return; }
  const ext = path.extname(file);
  const type = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.json' ? 'application/json' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(fs.readFileSync(file));
});

async function prepare(page, errors) {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {} }) } }));
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 320, height: 700 } });
    await prepare(page, errors);
    await page.goto(`${base}/v4/#connect=test`);
    await page.locator('.metrics-widget').waitFor();
    assert.match(await page.locator('.clock-time').innerText(), /^\d\d:\d\d:\d\d$/);
    await page.getByRole('button', { name: '画面と接続の設定' }).click();
    await page.locator('.language-row select').selectOption('en');
    await page.waitForFunction(() => /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(
      document.querySelector('.clock-date').textContent,
    ));
    await page.locator('.language-row select').selectOption('ja');
    await page.getByRole('button', { name: '閉じる' }).click();
    assert.equal(await page.locator('.weather-message').innerText(), 'PCの設定画面で場所を決めてください');
    assert.equal(await page.locator('.widget-placeholder').count(), 1, 'future widget remains a placeholder');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    await page.waitForFunction(() => document.querySelector('.deck-background-picture').style.backgroundImage.includes('data:image'));
    assert.match(await page.locator('.deck-background-picture').evaluate((node) => node.style.transform), /rotate\(90deg\).*scaleX\(-1\)/);
    assert.equal(backgroundRequests, 1, 'background image fetched once');
    assert.match(await page.locator('.deck-shell').evaluate((node) => node.style.getPropertyValue('--key-bg')), /linear-gradient\(145deg/);
    const sizeAtOne = await page.locator('.deck-background-picture').evaluate((node) => node.style.backgroundSize.split(' ').map(parseFloat));
    assert(sizeAtOne.every(Number.isFinite), 'background size uses pixels');
    backgroundState.portrait.zoom = 2; revision += 1;
    await page.waitForFunction((width) => parseFloat(document.querySelector('.deck-background-picture').style.backgroundSize) === width * 2, sizeAtOne[0]);
    assert.equal(backgroundRequests, 1, 'zoom does not refetch the image');
    const iconOpacity = await page.locator('.deck-button .icon-fallback').evaluate((node) => getComputedStyle(node).opacity);
    assert.equal(iconOpacity, '1', 'key transparency does not fade icon content');
    backgroundState.keys = 'standard'; revision += 1;
    await page.waitForFunction(() => !document.querySelector('.deck-shell').classList.contains('keys-tint'));
    assert.equal(await page.locator('.deck-shell').evaluate((node) => node.style.getPropertyValue('--key-bg')), '');
    backgroundState.image = ''; backgroundState.color = '#f4e7d3'; backgroundState.keys = ''; revision += 1;
    await page.waitForFunction(() => document.querySelector('.deck-shell').classList.contains('keys-light'));
    assert.match(await page.locator('.deck-shell').evaluate((node) => node.style.getPropertyValue('--key-bg')), /linear-gradient\(145deg/);
    assert.equal(await page.evaluate(async () => (await import('/v4/core/image-source.js')).safeImageSource('//example.com/a.png')), '');
    await page.waitForFunction(() => document.querySelector('.slideshow-picture').getAttribute('src'));
    assert(slideRequests.length >= 1 && slideRequests.every((index) => index === 0));
    assert.equal(await page.locator('.metrics-memory-detail').innerText(), 'Test GPU');
    assert.equal(await page.locator('.gpu-line').getAttribute('d') !== '', true, 'GPU history line is rendered');
    assert.equal(await page.locator('.gpu-memory-line').getAttribute('d') !== '', true, 'GPU memory history line is rendered');
    await page.evaluate(() => { window.__metricsNode = document.querySelector('.metrics-widget'); });
    metricValue = 57; revision += 1;
    await page.waitForFunction(() => document.querySelector('.metric-row strong').textContent === '57.0%');
    assert.equal(await page.evaluate(() => window.__metricsNode === document.querySelector('.metrics-widget')), true, 'state update keeps widget DOM');
    assert.equal(backgroundRequests, 1, 'unchanged background is not fetched again');
    weatherConfigured = true; revision += 1;
    await page.waitForFunction(() => document.querySelector('.weather-heading') && document.querySelector('.weather-heading').textContent === 'Tokyo');
    assert.match(await page.locator('.weather-updated').innerText(), /^古い予報・更新 /);
    version = 'two'; revision += 1;
    await page.waitForFunction(() => window.__metricsNode !== document.querySelector('.metrics-widget'));
    assert(viewRequests.some((entry) => entry.visibleIds.includes('metrics-1')), 'visible widgets are announced');

    const track = page.locator('.speaker .fader-track');
    assert.equal(await page.locator('.speaker').evaluate((node) => node.style.getPropertyValue('--key-alpha')), '0.6');
    assert.equal(await page.locator('.speaker .audio-mute').evaluate((node) => getComputedStyle(node).color), 'rgb(181, 56, 70)');
    assert.equal(await page.locator('.speaker .audio-mute svg path').count(), 2, 'speaker mute uses the line icon');
    assert.equal(await page.locator('.mic .audio-mute svg rect').count(), 1, 'microphone mute uses the line icon');
    assert.equal(await page.locator('.speaker .audio-mute').innerText(), '', 'fader mute does not use a clipped text glyph');
    const box = await track.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 2, { steps: 12 });
    await page.waitForFunction(() => document.querySelector('.speaker .fader-value').textContent !== '20%');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert(parseInt(await page.locator('.speaker .fader-value').innerText(), 10) > 50, 'server state does not rewind an active drag');
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(audioRequests.length >= 2, 'drag sends multiple audio requests');
    assert.equal(audioRequests.filter((value) => value.final === true).length, 1, 'one final audio request');
    assert.equal(audioRequests.at(-1).final, true, 'final request is last');
    await page.getByRole('button', { name: 'スピーカーのミュート切替' }).click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(audioRequests.at(-1), { target: 'speaker', toggleMute: true });
    assert.equal(await page.locator('.mic .fader-value').innerText(), '42%', 'speaker response keeps microphone volume');
    assert.equal(await page.locator('.mic').evaluate((node) => node.classList.contains('muted')), true, 'speaker response keeps microphone mute');
    await page.getByRole('button', { name: '次のページ' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.widget-tile').length === 0);
    assert(viewRequests.some((entry) => entry.visibleIds.length === 0), 'empty page announces no widgets');

    const pair = await browser.newPage({ locale: 'ja-JP', viewport: { width: 320, height: 600 } });
    await prepare(pair, errors); await pair.goto(`${base}/v4/`);
    await pair.getByRole('button', { name: '接続をリクエスト' }).click();
    await pair.locator('.pair-code').waitFor();
    await pair.locator('.deck-button, .widget-tile').first().waitFor();
    assert.equal(await pair.evaluate(() => localStorage.getItem('tapoard-key')), 'test');
    await pair.close();
    pairResult = 'denied';
    const denied = await browser.newPage({ locale: 'ja-JP', viewport: { width: 320, height: 600 } });
    await prepare(denied, errors); await denied.goto(`${base}/v4/`);
    await denied.evaluate(() => localStorage.removeItem('tapoard-key')); await denied.reload();
    await denied.getByRole('button', { name: '接続をリクエスト' }).click();
    await denied.waitForFunction(() => document.querySelector('.pair-status').textContent.includes('拒否'));
    await denied.close();
    assert.deepEqual(errors, []);
    console.log('PASS v4 widgets: fader, display widgets, background, view and pairing');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
