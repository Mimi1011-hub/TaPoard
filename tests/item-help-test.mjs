import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customItemHelp } from '../web/v4/settings/item-help.js';

function i18n(language) {
  const dictionary = JSON.parse(fs.readFileSync(new URL(`../web/v4/i18n/${language}.json`, import.meta.url), 'utf8'));
  return {
    t(key, values = {}) {
      return Object.keys(values).reduce((result, name) => result.replaceAll(`{${name}}`, values[name]), dictionary[key] || key);
    },
  };
}

for (const language of ['ja', 'en']) {
  const t = i18n(language);
  const screenshot = customItemHelp({ name: 'Old', type: 'hotkey', action: 'windows-screenshot', hotkey: '' }, t);
  assert.equal(screenshot.name, language === 'ja' ? '画面切り取り' : 'Screen snip');
  assert.equal(screenshot.description, 'Win + Shift + S');
  assert.match(screenshot.sends, /Win \+ Shift \+ S/);

  const changed = customItemHelp({ name: 'Changed', type: 'hotkey', action: 'windows-screenshot', hotkey: 'Ctrl+Alt+P' }, t);
  assert.match(changed.sends, /Ctrl\+Alt\+P/);
  const free = customItemHelp({ name: 'Free', type: 'hotkey', action: 'key-custom', hotkey: 'F13' }, t);
  assert.match(free.sends, /F13/);

  const app = customItemHelp({ name: 'Tool', type: 'app', path: 'C:\\Long Folder\\tool.exe' }, t);
  assert.match(app.description, /tool\.exe/);
  assert.doesNotMatch(app.description, /Long Folder/);
  assert.match(customItemHelp({ name: 'Site', type: 'url', url: 'https://example.com/path?q=1' }, t).description, /example\.com/);

  const clipboard = customItemHelp({ name: 'Text', type: 'clipboard', text: '12345678901234567890more' }, t);
  assert.match(clipboard.description, /12345678901234567890$/);
  assert.doesNotMatch(clipboard.description, /more/);

  const direct = customItemHelp({ name: 'Mute', type: 'hotkey', action: 'audio-speaker-mute' }, t);
  assert.equal(direct.sends, t.t('presets.direct'));
  const wheel = customItemHelp({ name: 'Wheel', type: 'wheel', options: { style: 'vertical' } }, t);
  assert.match(wheel.description, new RegExp(t.t('catalog.desc.noPageSwipe').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(customItemHelp({ name: 'Clock', type: 'clock', options: { style: 'digital' } }, t).name,
    t.t('catalog.item.digitalClock'));
  const nowPlaying = customItemHelp({ name: 'Old', type: 'nowPlaying', options: {} }, t);
  assert.equal(nowPlaying.name, t.t('catalog.item.nowPlaying'));
  assert.equal(nowPlaying.description, t.t('catalog.desc.nowPlaying'));
  const calendar = customItemHelp({ name: 'Old', type: 'calendar', options: {} }, t);
  assert.equal(calendar.name, t.t('catalog.item.calendar'));
  assert.equal(calendar.description, t.t('catalog.desc.calendar'));

  const output = customItemHelp({ name: 'Output', type: 'audioDevice', deviceTarget: 'speaker', deviceName: 'Speakers' }, t);
  assert.match(output.description, /Speakers/);
  const input = customItemHelp({ name: 'Input', type: 'audioDevice', deviceTarget: 'mic', deviceName: '' }, t);
  assert.match(input.description, new RegExp(t.t('presets.help.defaultDevice')));
}

console.log('PASS item-help-test');
