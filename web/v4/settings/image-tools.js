export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('image')); image.src = source;
  });
}

function drawSquare(image, size) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'), scale = Math.min((size - Math.round(size / 12)) / image.width, (size - Math.round(size / 12)) / image.height);
  const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
  context.clearRect(0, 0, size, size); context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
  return canvas.toDataURL('image/png');
}

export async function makeCustomIcon(file) {
  if (!file || file.size > 5 * 1024 * 1024) throw new Error('size');
  const image = await loadImage(await readFile(file));
  let value = drawSquare(image, 96); if (value.length > 60000) value = drawSquare(image, 72);
  if (value.length > 60000) throw new Error('encoded');
  return value;
}

export async function makeBackgroundImage(file) {
  if (!file || file.size > 30 * 1024 * 1024) throw new Error('size');
  const image = await loadImage(await readFile(file));
  let scale = Math.min(1, 2560 / Math.max(image.width, image.height)), quality = .9, value = '';
  while (quality >= .45) {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); value = canvas.toDataURL('image/jpeg', quality);
    if (value.length <= 1850000) return { data: value, width: canvas.width, height: canvas.height };
    scale *= .85; quality -= .1;
  }
  throw new Error('encoded');
}
