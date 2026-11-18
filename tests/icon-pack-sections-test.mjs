import assert from 'node:assert/strict';
import { packSections } from '../web/v4/settings/icon-pack-sections.js';

const presets = [['media', [['play'], ['pause']]], ['basic', [['star']]]];
const keyOf = (icon) => icon.key || '';
const grouped = Array.from({ length: 12 }, (_, index) => ({ name: `Icon ${index}`, group: ['One', 'Two', 'Three'][index % 3] }));
assert.deepEqual(packSections(grouped, presets, keyOf).map((section) => section.title), ['One', 'Two', 'Three']);
const alphabetical = Array.from({ length: 130 }, (_, index) => ({ name: `${String.fromCharCode(65 + index % 26)} ${index}` }));
assert.equal(packSections(alphabetical, presets, keyOf)[0].title, 'A');
const standard = [{ name: 'Play', key: 'play' }, { name: 'Star', key: 'star' }, { name: 'Mystery' }];
assert.deepEqual(packSections(standard, presets, keyOf).map((section) => section.title), ['media', 'basic', 'other']);
const unique = Array.from({ length: 12 }, (_, index) => ({ name: `Icon ${index}`, group: `Group ${index}` }));
assert.deepEqual(packSections(unique, presets, keyOf).map((section) => section.title), ['other']);
console.log('PASS icon pack sections');
