// The connection, PC window and general sections, adding apps, and the settings that only one kind of item has.
const { chromium } = require('./playwright.cjs');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let version = 1;
let revision = 1;
let pairRevision = 1;
let pairReads = 0;
let token = 'one';
let importResult = null;
let languagePreference = 'ja';
const calls = [];
const evil = '<img src=x onerror="window.hacked=1">';

const item = (id, name, type, row, column, width, height, extra) =>
  Object.assign(
    {
      id,
      name,
      type,
      action: null,
      category: 'widget',
      iconKey: '',
      iconColor: '',
      customIcon: '',
      hotkey: '',
      options: null,
      row,
      column,
      width,
      height,
      fontSize: 11,
      iconScale: 82,
      labelOpacity: 45,
      keyClear: null,
      hideLabel: false,
    },
    extra,
  );
const faders = () => ({
  speaker: { row: 3, column: 0, width: 1, height: 1, off: true },
  mic: { row: 3, column: 1, width: 1, height: 1, off: true },
});
const clockOptions = { style: 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false };
const wheelOptions = { style: 'vertical', sensitivity: 24, multiplier: 1, reverse: false, ctrl: false, shift: false, alt: false, middleClick: false };
const touchpadOptions = { speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' };
let deck = {
  keepAwake: false,
  background: {},
  landscape: {
    columns: 5,
    rows: 4,
    faders: faders(),
    pages: [
      {
        name: '',
        faders: null,
        items: [
          item('clock', 'Clock', 'clock', 0, 0, 2, 1, { options: clockOptions, hideLabel: true }),
          item('wheel', 'Wheel', 'wheel', 0, 2, 1, 1, { options: wheelOptions, hideLabel: true }),
          item('key', 'Play', 'hotkey', 0, 3, 1, 1, { action: 'media-play', category: 'music' }),
          item('device', 'Speaker', 'audioDevice', 0, 4, 1, 1, { category: 'audio', deviceId: 'a', deviceTarget: 'speaker', deviceName: 'First' }),
          item('app', 'Same', 'app', 1, 0, 1, 1, { category: 'app', path: 'C:\\Apps\\same.exe' }),
        ],
      },
      {
        name: '',
        faders: null,
        items: [item('pad', 'Pad', 'touchpad', 0, 0, 3, 2, { options: touchpadOptions, hideLabel: true })],
      },
    ],
  },
  portrait: { columns: 3, rows: 4, faders: faders(), pages: [{ name: '', faders: null, items: [] }] },
};
const definitions = ['hotkey', 'app', 'url', 'audioDevice']
  .map((type) => ({ type, sizes: ['1x1'] }))
  .concat([
    { type: 'clock', sizes: ['2x1', '2x2'] },
    { type: 'wheel', sizes: ['1x1', '1x2', '2x2'] },
    { type: 'touchpad', sizes: ['3x2', '2x3'] },
  ]);
let pending = [{ id: 'p1', name: `Phone ${evil}`, code: '1234', address: '192.0.2.7', expires: 0 }];
let devices = [{ id: 'd1', name: 'Tablet', created: '2026-11-01T10:00:00.0000000Z' }];
let pcOptions = {
  startup: 'none',
  startTopmost: 'last',
  buttonSize: 'medium',
  aspect: 'keep',
  opacity: 100,
  autoHideBar: false,
  showInfo: true,
  confirmClose: true,
};
let runtimeAvailable = true;
let weatherPlace = '';

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
const state = () => ({
  version: String(version),
  revision,
  appVersion: '4.0-test',
  computer: 'TEST-PC',
  phoneConnected: false,
  pcWindowOpen: false,
  audio: {},
  metrics: {},
  weather: { location: weatherPlace },
  background: {},
});
const manage = () => ({ pending, devices, revision: pairRevision });
const pcView = () => ({ options: pcOptions, open: false, viewOnly: false, runtimeAvailable });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer test') return json(res, 401, { error: 'key' });
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const name = url.pathname.slice(5);
    if (req.method === 'POST') calls.push({ name, body });
    if (name === 'v3/language') {
      if (req.method === 'POST') languagePreference = body.preference;
      const language = languagePreference === 'auto' ? 'ja' : languagePreference;
      return json(res, 200, {
        preference: languagePreference, language,
        languages: [{ id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }],
      });
    }
    if (name === 'v3/deck' && req.method === 'GET') return json(res, 200, { version: String(version), deck, widgetDefinitions: definitions });
    if (name === 'v3/deck') {
      deck = body.deck;
      version += 1;
      revision += 1;
      return json(res, 200, { ok: true, version: String(version), deck });
    }
    if (name === 'v3/state') return json(res, 200, state());
    if (name === 'sync') return setTimeout(() => json(res, 200, state()), 30);
    if (name === 'icon-packs') return json(res, 200, { packs: [], maxPacks: 50, maxIcons: 5000 });
    if (name === 'shortcut-packs') return json(res, 200, { packs: [], maxPacks: 20, maxShortcuts: 300 });
    if (name === 'presets') return json(res, 200, { presets: [] });
    if (name === 'icon-styles') return json(res, 200, { styles: [], maxStyles: 20 });
    if (name === 'backups') return json(res, 200, { backups: [] });
    if (name === 'v3/connect') {
      return json(res, 200, {
        iphoneUrl: `http://test-pc:18781/#connect=${token}`,
        androidUrl: `http://192.0.2.1:18781/#connect=${token}`,
        urls: [],
      });
    }
    if (name === 'pair/manage' && req.method === 'GET') {
      pairReads += 1;
      return json(res, 200, manage());
    }
    if (name === 'pair/manage') {
      if (body.revoke) devices = devices.filter((device) => device.id !== body.id);
      else {
        if (body.approve) devices = devices.concat({ id: 'd2', name: pending[0].name, created: '2026-11-15T10:00:00.0000000Z' });
        pending = [];
      }
      pairRevision += 1;
      return json(res, 200, manage());
    }
    if (name === 'rotate') {
      token = 'two';
      devices = [];
      pairRevision += 1;
      return json(res, 200, { ok: true });
    }
    if (name === 'firewall') {
      return json(res, 200, {
        profile: 'public',
        networks: 'Home',
        rulesChecked: true,
        httpRule: true,
        mdnsRule: false,
        blockRules: 2,
        scriptAvailable: true,
        repair: 'idle',
      });
    }
    if (name === 'pc-window' && req.method === 'POST') pcOptions = body;
    if (name === 'pc-window' || name === 'pc-window/open') return json(res, 200, pcView());
    if (name === 'weather/search') {
      return json(res, 200, {
        results: [{ name: `Osaka ${evil}`, region: 'Osaka', country: 'Japan', latitude: 34.7, longitude: 135.5, timezone: 'Asia/Tokyo' }],
      });
    }
    if (name === 'weather/location') {
      weatherPlace = body.name;
      return json(res, 200, { ok: true });
    }
    if (name === 'import' && req.method === 'POST') return json(res, 200, { id: 'ticket' });
    if (name === 'import') return json(res, 200, { id: 'ticket', result: importResult });
    if (name === 'devices') {
      return json(res, 200, {
        devices: [
          { id: 'a', name: 'First', target: 'speaker' },
          { id: 'b', name: 'Second', target: 'speaker' },
          { id: 'm', name: 'Mic', target: 'mic' },
        ],
      });
    }
    return json(res, 404, { error: 'not found' });
  }
  let file = url.pathname.startsWith('/v4/') ? `web/v4/${url.pathname.slice(4)}` : '';
  if (url.pathname === '/qrcode.js') file = 'web/qrcode.js';
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'text/html'}; charset=utf-8` });
  res.end(fs.readFileSync(file));
});

async function waitFor(check, message, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${message}`);
}
const last = (name) => calls.filter((call) => call.name === name).pop();
const savedItem = (id) => deck.landscape.pages[0].items.find((value) => value.id === id);

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1100, height: 700 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/v4/settings.html#admin=test`);
    await page.locator('.preview-hit[data-kind="item"]').first().waitFor();
    const inspector = page.locator('#settings-inspector');
    // Set UI_SHOTS to a folder to keep a picture of each section for a visual check.
    const shot = async (name) => {
      if (process.env.UI_SHOTS && name.startsWith('details-'))
        await inspector.locator('.inspector-details').scrollIntoViewIfNeeded().catch(() => {});
      if (process.env.UI_SHOTS) await page.screenshot({ path: path.join(process.env.UI_SHOTS, `${name}.png`) });
    };
    const section = (name) => page.locator(`.settings-nav [data-section="${name}"]`).click();
    const url = () => page.locator('.connect-url').innerText();
    const noOverflow = async (name) => {
      const fits = await page.evaluate(() => {
        const panel = document.querySelector('#settings-catalog');
        return panel.scrollWidth <= panel.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      assert(fits, `${name} fits the column at 1100px`);
    };

    // Connection: the QR, devices waiting and connected, cutting every device, the firewall line.
    assert.equal(pairReads, 0, 'the device list is not read before the section is opened');
    await section('connection');
    await waitFor(async () => (await url()) === 'http://test-pc:18781/', 'phone address');
    assert.equal(await page.locator('[data-kind="iphone"]').innerText(), 'スマートフォン');
    assert.equal(await page.locator('[data-kind="android"]').innerText(), '古いスマートフォン');
    assert.equal(await page.locator('.connect-kind-note').innerText(), 'ふつうはこちら');
    const japaneseKindHeights = await page.locator('#settings-section-connection .orientation-switch button').evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height));
    assert.equal(japaneseKindHeights[0], japaneseKindHeights[1], 'Japanese phone-choice buttons have equal heights');
    assert(!(await url()).includes('connect='), 'the key is not shown as text');
    const drawn = () => page.locator('.connect-qr').evaluate((canvas) => canvas.toDataURL());
    const first = await drawn();
    assert(first.length > 1000, 'the QR is drawn');
    await page.locator('[data-kind="android"]').click();
    assert.equal(await url(), 'http://192.0.2.1:18781/');
    assert.match(await page.locator('.connect-kind-note').innerText(), /IP アドレスで開きます/);
    assert.notEqual(await drawn(), first, 'older phones get the IP address QR');
    const waiting = page.locator('.pairing-list').first();
    assert((await waiting.innerText()).includes('1234') && (await waiting.innerText()).includes('<img'), 'the code and the name are shown as text');
    await waitFor(async () => (await page.locator('.firewall-status').innerText()).includes('Home'), 'firewall line');
    const firewall = await page.locator('.firewall-status').innerText();
    assert(firewall.includes('パブリック') && firewall.includes('2 件'), `firewall details: ${firewall}`);
    await waiting.getByRole('button', { name: '許可' }).click();
    await waitFor(() => last('pair/manage'), 'allow sent');
    assert.deepEqual(last('pair/manage').body, { id: 'p1', code: '1234', approve: true });
    const connected = page.locator('.pairing-list').nth(1);
    await waitFor(async () => (await connected.locator('.pair-request-row').count()) === 2, 'the allowed device joins the list');
    await connected.getByRole('button', { name: '解除' }).first().click();
    await page.locator('.confirm-dialog[open]').getByRole('button', { name: 'キャンセル' }).click();
    assert.equal(devices.length, 2, 'cancel keeps the device');
    await connected.getByRole('button', { name: '解除' }).first().click();
    await page.locator('.confirm-dialog[open]').getByRole('button', { name: '実行' }).click();
    await waitFor(() => devices.length === 1, 'device removed');
    await page.getByRole('button', { name: '全部の端末を切る' }).click();
    await page.locator('.confirm-dialog[open]').getByRole('button', { name: '実行' }).click();
    await waitFor(() => token === 'two', 'every device cut');
    await waitFor(async () => (await connected.innerText()).includes('ありません'), 'empty device list');
    await page.locator('[data-kind="iphone"]').click();
    await waitFor(async () => (await drawn()) !== first, 'a new QR after cutting every device');
    await shot('connection');
    await noOverflow('connection');

    // PC window: values are shown, every change is sent at once, and the open buttons follow the runtime.
    await section('pc');
    const reads = pairReads;
    const pc = page.locator('#settings-section-pc');
    await waitFor(async () => (await pc.locator('select[name="buttonSize"]').inputValue()) === 'medium', 'PC window values');
    assert.equal(await pc.locator('input[name="showInfo"]').isChecked(), true);
    await pc.locator('select[name="buttonSize"]').selectOption('large');
    await pc.locator('input[name="autoHideBar"]').check();
    await waitFor(() => pcOptions.buttonSize === 'large' && pcOptions.autoHideBar === true, 'PC window saved');
    assert.equal(pcOptions.opacity, 100, 'the whole set of options is sent');
    assert.equal(await pc.getByRole('button', { name: 'PC 用ウィンドウを開く' }).isDisabled(), false);
    await pc.getByRole('button', { name: '全画面で開く' }).click();
    await waitFor(() => last('pc-window/open'), 'open sent');
    assert.deepEqual(last('pc-window/open').body, { fullscreen: true });
    await new Promise((resolve) => setTimeout(resolve, 2300));
    assert.equal(pairReads, reads, 'the device list is not read while another section is shown');
    await shot('pc');
    await noOverflow('PC window');

    // General: keep awake is part of the deck (saved and undoable); the weather place is searched and set.
    await section('general');
    const general = page.locator('#settings-section-general');
    await waitFor(async () => (await general.locator('.general-about').innerText()).includes('4.0-test'), 'version');
    assert((await general.locator('.general-about').innerText()).includes('TEST-PC'));
    await general.locator('input[type="checkbox"]').check();
    await waitFor(() => deck.keepAwake === true, 'keep awake saved');
    await page.locator('#settings-undo').click();
    await waitFor(() => deck.keepAwake === false, 'keep awake undone');
    assert.equal(await general.locator('input[type="checkbox"]').isChecked(), false);
    await general.locator('input[type="search"]').fill('Osaka');
    await general.getByRole('button', { name: '検索' }).click();
    const place = general.locator('.weather-result').first();
    assert((await place.innerText()).includes('<img'), 'place names are shown as text');
    await place.click();
    await waitFor(() => last('weather/location'), 'place sent');
    assert.equal(last('weather/location').body.timezone, 'Asia/Tokyo');
    await waitFor(async () => (await general.locator('.weather-current').innerText()).includes('Osaka'), 'place shown');
    await shot('general');
    await noOverflow('general');

    // Widgets that operate the PC are drawn in the preview without sending anything.
    await section('layout');
    await page.locator('.settings-page-tab').nth(1).locator('.settings-page-name').click();
    await page.locator('.touchpad-widget').waitFor();
    await page.locator('.preview-hit[data-kind="item"]').first().click();
    await inspector.locator('[data-option="speed"]').waitFor();
    assert.equal(await inspector.locator('[data-option="longPress"]').inputValue(), 'none');
    await shot('details-touchpad');
    await page.locator('.settings-page-tab').first().locator('.settings-page-name').click();
    await page.locator('.clock-widget').waitFor();

    // Adding apps: one already on the deck is skipped, the rest go to free cells, and one undo takes them all back.
    importResult = {
      apps: [
        { type: 'app', name: 'Same', path: 'c:\\apps\\SAME.exe', args: '', icon: null, category: 'app' },
        { type: 'app', name: `New ${evil}`, path: 'C:\\Apps\\new.exe', args: '', icon: null, category: 'app' },
        { type: 'url', name: 'Site', url: 'https://example.com/', icon: null, category: 'custom' },
      ],
    };
    await page.locator('.catalog-card').filter({ hasText: /^起動・その他/ }).click();
    await page.getByRole('button', { name: 'アプリや URL を追加' }).click();
    await waitFor(() => deck.landscape.pages[0].items.length === 7, 'two new items saved');
    const added = deck.landscape.pages[0].items.slice(5);
    assert.deepEqual(
      added.map((value) => value.type),
      ['app', 'url'],
    );
    assert.equal(added[1].url, 'https://example.com/');
    const report = await page.locator('#settings-notice').innerText();
    assert(report.includes('2 個追加') && report.includes('1 個あった') && !report.includes('空き'), `the result is reported: ${report}`);
    assert.equal(await page.getByRole('button', { name: 'アプリや URL を追加' }).isDisabled(), false);
    await page.locator('#settings-undo').click();
    await waitFor(() => deck.landscape.pages[0].items.length === 5, 'the import is one undo step');

    // Details: clock, wheel, shortcut key and audio device.
    const choose = async (index) => {
      await page.locator('.preview-hit[data-kind="item"]').nth(index).click();
      await inspector.locator('.inspector-details').waitFor();
    };
    await choose(0);
    assert.equal(await inspector.locator('[data-option="style"]').count(), 0, 'the clock style is not offered, because it would change the size');
    await inspector.locator('[data-option="showSeconds"]').uncheck();
    await waitFor(() => savedItem('clock').options.showSeconds === false, 'clock option saved');
    assert.equal(savedItem('clock').options.style, 'digital', 'the other options are kept');
    await choose(1);
    await shot('details-wheel');
    const range = inspector.locator('[data-option="sensitivity"]');
    assert.equal(await range.getAttribute('min'), '8');
    await range.fill('40');
    await range.dispatchEvent('change');
    await inspector.locator('[data-option="multiplier"]').selectOption('3');
    await waitFor(
      () => savedItem('wheel').options.multiplier === 3 && savedItem('wheel').options.sensitivity === 40,
      'wheel options saved as numbers',
    );
    await choose(2);
    assert((await inspector.locator('.hotkey-current').innerText()).includes('標準'));
    await inspector.locator('.hotkey-record').focus();
    await page.keyboard.press('Control+Shift+KeyZ');
    await waitFor(() => savedItem('key').hotkey === 'Ctrl+Shift+Z', 'recorded key saved');
    assert.equal(deck.landscape.pages[0].items.length, 5, 'recording Ctrl+Z does not undo');
    await shot('details-hotkey');
    await inspector.locator('.hotkey-main').selectOption('F5');
    await waitFor(() => savedItem('key').hotkey === 'Ctrl+Shift+F5', 'key from the list keeps the modifiers');
    await inspector.getByRole('button', { name: '標準に戻す' }).click();
    await waitFor(() => savedItem('key').hotkey === '', 'standard key');
    await choose(3);
    const device = inspector.locator('[data-option="deviceId"]');
    await waitFor(async () => (await device.locator('option').count()) === 2, 'only speakers are listed');
    await device.selectOption('b');
    await waitFor(() => savedItem('device').deviceId === 'b' && savedItem('device').deviceName === 'Second', 'device saved');

    await section('general');
    await general.locator('select').first().selectOption('en');
    await page.waitForFunction(() => document.title === 'TaPoard Settings');
    assert.equal(last('v3/language').body.preference, 'en', 'English preference is posted');
    for (const name of ['layout', 'presets', 'appearance', 'saved', 'connection', 'pc', 'general']) {
      await section(name);
      const visibleText = await page.locator(`#settings-section-${name}`).innerText();
      const withoutLanguageName = visibleText.replace('日本語', '');
      assert(!/[ぁ-んァ-ヶ一-龠]/.test(withoutLanguageName), `${name} has no Japanese text in English`);
      await shot(`english-${name}`);
      await noOverflow(name);
      if (name === 'connection') {
        const heights = await page.locator('#settings-section-connection .orientation-switch button').evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().height));
        assert.equal(heights[0], heights[1], 'English phone-choice buttons have equal heights');
      }
    }
    await page.locator('#settings-section-general select').first().selectOption('ja');
    await page.waitForFunction(() => document.title === 'TaPoard 設定');
    assert.equal(last('v3/language').body.preference, 'ja', 'Japanese preference is posted');

    assert.equal(await page.evaluate(() => window.hacked), undefined, 'names from the PC never run as HTML');
    assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`);
    console.log('PASS v4 settings connect: connection, PC window, general, language, app import and item details');
  } catch (error) {
    if (errors.length) console.error(`console errors: ${errors.join('\n')}`);
    if (process.env.UI_DEBUG) await browser.contexts()[0].pages()[0].screenshot({ path: process.env.UI_DEBUG });
    throw error;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
