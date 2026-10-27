const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'), http = require('http'), assert = require('assert');
let apps = [], revision = 1, version = '1';
let weatherLocation = { configured: true, name: '札幌', latitude: 43.06, longitude: 141.35, timezone: 'Asia/Tokyo' };
const weather = { active: true, configured: true, location: '札幌', available: true, stale: false, error: '', updatedAt: Date.now(), temperature: 12.4, code: 2, precipitation: 20, attribution: 'Weather data by Open-Meteo.com', days: [
  { date: '2026-10-27', code: 2, maximum: 15.1, minimum: 8.4, precipitation: 20 },
  { date: '2026-10-28', code: 61, maximum: 13.2, minimum: 7.1, precipitation: 80 },
  { date: '2026-10-29', code: 3, maximum: 16.3, minimum: 9.2, precipitation: 30 },
] };
const controls = { speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1, speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1, micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1 };
function state() { return { apps, revision, version, weather, weatherLocation, appVersion: '2.0-dev+test', computer: 'Weather PC', phoneConnected: false, landscapeGrid: { columns: 5, rows: 3 }, portraitGrid: { columns: 3, rows: 5 }, landscapeControls: controls, portraitControls: controls, landscapePage: 0, portraitPage: 0, landscapePages: 1, portraitPages: 1, columns: 5, rows: 3, speakerSlot: 0, micSlot: 1, keepAwake: false, audio: { speakerVolume: 50, micVolume: 50, speakerAvailable: true, micAvailable: true, devices: [] }, metrics: { active: false, history: [], gpus: [] } }; }
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const url = new URL(req.url, 'http://127.0.0.1'), path = url.pathname;
  res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.startsWith('/api/') ? 'application/json' : 'text/html');
  if (path === '/api/settings') { if (req.method === 'POST') { apps = JSON.parse(body).apps.map((a, i) => ({ ...a, id: a.id || 'weather-' + i })); version = String(+version + 1); revision++; res.end('{"ok":true}'); } else res.end(JSON.stringify({ ...state(), token: 'test', lanUrl: 'http://example.local/', ipUrls: [], networkStatus: 'test', qrUrl: 'http://example.local/#connect=test' })); return; }
  if (path === '/api/state' || path === '/api/sync') { res.end(JSON.stringify(state())); return; }
  if (path === '/api/view') { res.end('{"ok":true,"inputSessions":[]}'); return; }
  if (path === '/api/devices') { res.end('{"devices":[]}'); return; }
  if (path === '/api/weather/search' && JSON.parse(body).query === 'なし') { res.end('{"results":[]}'); return; }
  if (path === '/api/weather/search' && JSON.parse(body).query === '失敗') { res.writeHead(400); res.end(JSON.stringify({ error: '地域を検索できませんでした。' })); return; }
  if (path === '/api/weather/search') { res.end('{"results":[{"name":"横浜","region":"神奈川県","country":"日本","latitude":35.44,"longitude":139.64,"timezone":"Asia/Tokyo"}]}'); return; }
  if (path === '/api/weather/location') { weatherLocation = { ...JSON.parse(body), configured: true }; res.end(JSON.stringify({ ok: true, weatherLocation, revision: ++revision })); return; }
  const file = path === '/' || path === '/settings' ? 'index.html' : path.slice(1);
  try { res.end(fs.readFileSync('web/' + file)); } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser; const errors = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + server.address().port + '/settings#test');
    await page.locator('#weather-current-location').waitFor(); assert((await page.locator('#weather-current-location').innerText()).includes('札幌'));
    await page.locator('#weather-query').fill('横浜'); await page.locator('#weather-search').click(); await page.getByRole('button', { name: /横浜/ }).click(); await page.waitForFunction(() => document.querySelector('#weather-current-location').textContent.includes('横浜'));
    const group = page.locator('.shortcut-group').filter({ hasText: '時計・情報表示' }); await group.locator('summary').click();
    let saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'POST');
    await group.locator('[data-action="widget-weather-now"] button').click(); await saved; await page.locator('#preview-deck .weather-small').waitFor();
    assert.equal(await page.locator('#preview-deck .weather-temperature').innerText(), '12°');
    saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'POST');
    await group.locator('[data-action="widget-weather-days"] button').click(); await saved; await page.locator('#preview-deck .weather-large').waitFor();
    assert.equal(await page.locator('#preview-deck .weather-days > div').count(), 3);
    assert((await page.locator('#preview-deck .weather-large').getAttribute('title')).includes('Open-Meteo'));
    const focused = () => page.evaluate(() => document.activeElement && document.activeElement.id);
    await page.locator('.weather-locate').first().click(); assert.equal(await focused(), 'weather-query', 'the weather editor links to the location search');
    await page.locator('#weather-query').fill('札'); await page.locator('#weather-search').click();
    assert((await page.locator('#weather-results .weather-error').innerText()).includes('2文字以上'), 'a too-short query is explained next to the search box');
    await page.locator('#weather-query').fill('なし'); await page.locator('#weather-search').click();
    await page.locator('#weather-results').filter({ hasText: '市・都・府・県まで' }).waitFor({ timeout: 2000 });
    await page.locator('#weather-query').fill('失敗'); await page.locator('#weather-search').click();
    await page.locator('#weather-results .weather-error').filter({ hasText: '検索できませんでした' }).waitFor({ timeout: 2000 });
    weather.configured = false; weatherLocation = { configured: false, name: '', latitude: 0, longitude: 0, timezone: '' }; revision++;
    await page.locator('#preview-deck .weather-small .weather-message').filter({ hasText: '地域が未設定' }).waitFor({ timeout: 5000 });
    await page.locator('#weather-query').evaluate(node => node.blur());
    await page.locator('#preview-deck .weather-small').click(); assert.equal(await focused(), 'weather-query', 'an unconfigured preview tile opens the location search');
    assert.deepEqual(errors, []); console.log('PASS weather UI: location search and errors, 1x1 current weather, 2x2 three-day forecast and attribution, unconfigured guidance');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
