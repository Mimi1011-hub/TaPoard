import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { buildZip, crc32, readZipEntries, readZipEntry } from '../web/v4/settings/zip.js';
import { readPackSource } from '../web/v4/settings/icon-pack-reader.js';

const encoder = new TextEncoder();
const plain = encoder.encode('hello zip');
const blob = buildZip([{ name: 'hello.txt', bytes: plain }]);
let buffer = await blob.arrayBuffer();
let entries = readZipEntries(buffer);
assert.equal(entries[0].method, 0);
assert.equal(new TextDecoder().decode(await readZipEntry(buffer, entries[0])), 'hello zip');

function deflatedZip(nameText, bytes) {
  const name = encoder.encode(nameText), compressed = deflateRawSync(bytes), crc = crc32(bytes);
  const local = new DataView(new ArrayBuffer(30)); local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x800, true); local.setUint16(8, 8, true); local.setUint32(14, crc, true); local.setUint32(18, compressed.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, name.length, true);
  const central = new DataView(new ArrayBuffer(46)); central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x800, true); central.setUint16(10, 8, true); central.setUint32(16, crc, true); central.setUint32(20, compressed.length, true); central.setUint32(24, bytes.length, true); central.setUint16(28, name.length, true);
  const offset = 30 + name.length + compressed.length, end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, 46 + name.length, true); end.setUint32(16, offset, true);
  return new Blob([local.buffer, name, compressed, central.buffer, name, end.buffer]);
}
buffer = await deflatedZip('compressed.txt', plain).arrayBuffer(); entries = readZipEntries(buffer);
assert.equal(entries[0].method, 8);
assert.equal(new TextDecoder().decode(await readZipEntry(buffer, entries[0])), 'hello zip');

const manifest = { format: 'tapoard-icons', name: 'Test Pack', icons: [{ file: 'icons/mic.png', name: 'Mic', key: 'microphone' }] };
const packBlob = buildZip([{ name: 'icons.json', bytes: encoder.encode(JSON.stringify(manifest)) }, { name: 'icons/mic.png', bytes: new Uint8Array([1, 2, 3]) }]);
const pack = await readPackSource([{ name: 'test.tpicons', size: packBlob.size, arrayBuffer: () => packBlob.arrayBuffer() }]);
assert.equal(pack.icons[0].key, 'microphone');
console.log('PASS settings zip: stored, deflated and tpicons key');
