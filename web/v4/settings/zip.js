let table;
export function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function text(bytes, utf8) {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'utf-8', { fatal: !utf8 }).decode(bytes);
  } catch (error) {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}
export function readZipEntries(buffer) {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1)
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  if (end < 0) throw new Error('zip');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = [];
  if (count > 5000) throw new Error('count');
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('broken');
    const flags = view.getUint16(offset + 8, true),
      nameLength = view.getUint16(offset + 28, true),
      extraLength = view.getUint16(offset + 30, true),
      commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: text(bytes.subarray(offset + 46, offset + 46 + nameLength), !!(flags & 0x800)).replace(/\\/g, '/'),
      method: view.getUint16(offset + 10, true),
      compressed: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      local: view.getUint32(offset + 42, true),
      encrypted: !!(flags & 1),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
export async function readZipEntry(buffer, entry) {
  const view = new DataView(buffer);
  if (entry.encrypted || entry.size > 8 * 1024 * 1024 || view.getUint32(entry.local, true) !== 0x04034b50) throw new Error('entry');
  const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true),
    data = new Uint8Array(buffer, start, entry.compressed);
  if (entry.method === 0) return data;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('compression');
  const output = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  if (output.byteLength > 8 * 1024 * 1024) throw new Error('size');
  return new Uint8Array(output);
}
export function buildZip(files) {
  const encoder = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name),
      crc = crc32(file.bytes),
      local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.bytes.length, true);
    local.setUint32(22, file.bytes.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, file.bytes);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x800, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, file.bytes.length, true);
    head.setUint32(24, file.bytes.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(head.buffer, name);
    offset += 30 + name.length + file.bytes.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0),
    end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
