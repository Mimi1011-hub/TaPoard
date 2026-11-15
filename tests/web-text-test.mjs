import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('web/v4');
const allowed = new Set([
  path.join(root, 'settings', 'icon-words.js'),
]);

async function files(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(full));
    else if (/\.(js|html)$/.test(entry.name)) result.push(full);
  }
  return result;
}

for (const file of await files(root)) {
  if (allowed.has(file)) continue;
  const source = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(source, /[ぁ-んァ-ヶ一-龠]/, path.relative(root, file));
}

console.log('PASS web text: no Japanese remains outside the dictionaries');
