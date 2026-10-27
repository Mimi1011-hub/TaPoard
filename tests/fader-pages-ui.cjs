const { chromium } = require('C:/Users/shimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('child_process'), assert = require('assert'), fs = require('fs');
const base = 'http://127.0.0.1:18782';
fs.cpSync('web', 'tests/bin/web', { recursive: true, force: true });
const host = spawn('tests/bin/Release103Tests.exe', ['serve'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((resolve, reject) => {
  host.stdout.on('data', d => { if (String(d).includes('READY')) resolve(); });
  host.stderr.on('data', d => reject(Error(String(d))));
  host.on('exit', code => reject(Error('Host exit ' + code)));
});
async function api(path, key = 'test-admin', body) {
  const r = await fetch(base + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

(async () => {
  let browser;
  try {
    await ready;
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const errors = [];
    // Shared faders on every page, then a second landscape page.
    assert.equal((await api('layout', 'test-admin', { columns: 6, rows: 3, keepAwake: false, orientation: 'landscape', speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1 })).status, 200);
    assert.equal((await api('page', 'test-admin', { page: 1, orientation: 'landscape' })).data.pages, 2);

    const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    admin.on('pageerror', e => errors.push(String(e)));
    await admin.goto(base + '/settings#test-admin');
    await admin.locator('#preview-deck .audio-fader').first().waitFor();
    if ((await admin.locator('#preview-page-label').innerText()).startsWith('1')) await admin.locator('#preview-next').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent.startsWith('2'));
    const layoutSaved = () => admin.waitForResponse(r => new URL(r.url()).pathname === '/api/layout');
    const menu = async (index, name) => {
      // Scroll first and let the preview settle: scrolling or a re-render closes an open context menu.
      const fader = admin.locator('#preview-deck .audio-fader').nth(index);
      await fader.scrollIntoViewIfNeeded();
      await admin.waitForTimeout(800);
      await fader.click({ button: 'right' });
      await admin.locator('#deck-context-menu').getByRole('button', { name, exact: true }).waitFor({ timeout: 3000 });
      const saved = layoutSaved();
      await admin.locator('#deck-context-menu').getByRole('button', { name, exact: true }).click();
      await saved;
      await admin.waitForTimeout(300);
    };

    // Page 2 hides its speaker fader; page 1 keeps the shared one.
    await menu(0, 'このページで非表示');
    let settings = (await api('settings')).data;
    assert.equal(settings.landscapeControlPages.length, 1);
    assert.equal(settings.landscapeControlPages[0].page, 1);
    assert.equal(settings.landscapeControlPages[0].speakerHidden, true);
    assert.equal(settings.landscapeControls.speakerSlot, 0, 'the shared speaker stays');
    assert.equal(await admin.locator('#preview-deck .audio-fader').count(), 1, 'page 2 shows only the mic fader');

    // The new 2-row 8-cell fader on page 2 only.
    await menu(0, '8マス（4×2）');
    settings = (await api('settings')).data;
    const page2 = settings.landscapeControlPages.find(p => p.page === 1);
    assert.equal(page2.micWidth, 4);
    assert.equal(page2.micHeight, 2);
    assert.equal(settings.landscapeControls.micWidth, 1, 'the shared mic stays 1x1');
    const mic = admin.locator('#preview-deck .audio-fader');
    assert.equal(await mic.evaluate(e => e.style.gridColumn), '2 / span 4');
    assert.equal(await mic.evaluate(e => e.style.gridRow), '1 / span 2');
    assert(await mic.evaluate(e => e.classList.contains('horizontal')), '4x2 faders use the horizontal layout');
    const parts = await mic.evaluate(e => {
      const box = n => e.querySelector(n).getBoundingClientRect(), tile = e.getBoundingClientRect();
      return { track: box('.fader-track').width / tile.width, iconAbove: box('.audio-mute').bottom <= box('.fader-track').top, valueBelow: box('.fader-value').top >= box('.fader-track').bottom };
    });
    assert(parts.track > 0.6 && parts.iconAbove && parts.valueBelow, 'two-row faders put the icon above and % below a wide bar ' + JSON.stringify(parts));

    // The catalog shows the hidden speaker again on this page.
    const group = admin.locator('.shortcut-group').first();
    if (!(await group.evaluate(node => node.open))) await group.locator('summary').click();
    let saved = layoutSaved();
    await group.locator('.shortcut-row[data-action="control-speaker-fader"]').getByRole('button', { name: 'このページに表示', exact: true }).click();
    await saved;
    await admin.waitForFunction(() => document.querySelectorAll('#preview-deck .audio-fader').length === 2);
    settings = (await api('settings')).data;
    assert.equal(settings.landscapeControlPages.find(p => p.page === 1).speakerHidden, false);

    // Page 1 still shows the shared 1x1 faders.
    await admin.locator('#preview-prev').click();
    await admin.waitForFunction(() => document.querySelector('#preview-page-label').textContent.startsWith('1'));
    assert.deepEqual(
      await admin.locator('#preview-deck .audio-fader').evaluateAll(nodes => nodes.map(e => e.style.gridColumn)),
      ['1 / span 1', '2 / span 1'],
    );

    // Each new fader shape is accepted by the PC; a 5x1 fader is not.
    for (const [width, height] of [[4, 1], [3, 2], [4, 2]])
      assert.equal((await api('layout', 'test-admin', { columns: 6, rows: 3, keepAwake: false, orientation: 'landscape', page: 0, speakerRow: 1, speakerColumn: 0, speakerWidth: width, speakerHeight: height, micRow: 0, micColumn: 5, micWidth: 1, micHeight: 1 })).status, 200, width + 'x' + height);
    assert.equal((await api('layout', 'test-admin', { columns: 6, rows: 3, keepAwake: false, orientation: 'landscape', page: 0, speakerRow: 1, speakerColumn: 0, speakerWidth: 5, speakerHeight: 1, micRow: 0, micColumn: 5, micWidth: 1, micHeight: 1 })).status, 400);
    assert.deepEqual(errors, []);
    console.log('PASS fader pages UI: per-page hide, show and shape, 4x1/3x2/4x2 faders, shared faders on other pages');
  } finally {
    if (browser) await browser.close();
    host.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
