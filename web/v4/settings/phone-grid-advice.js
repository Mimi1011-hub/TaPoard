export function phoneAspect(ratio, phoneSize, orientation) {
  let parts;
  if (ratio === 'auto' && phoneSize && phoneSize[0] > 0 && phoneSize[1] > 0) parts = phoneSize;
  else parts = (ratio === 'auto' ? '19.5:9' : ratio).split(':').map(Number);
  const wide = parts[0] >= parts[1] ? parts : [parts[1], parts[0]];
  return orientation === 'portrait' ? wide[1] / wide[0] : wide[0] / wide[1];
}

export function recommendedGrids(ratio, phoneSize, orientation) {
  const aspect = phoneAspect(ratio, phoneSize, orientation);
  const values = [];
  const firstRow = orientation === 'landscape' ? 3 : 2;
  for (let rows = firstRow; rows <= 5; rows += 1) {
    for (let columns = 3; columns <= 8; columns += 1) {
      values.push({ columns, rows, error: Math.abs(aspect * rows / columns - 1) });
    }
  }
  values.sort((left, right) => left.error - right.error || left.rows - right.rows || left.columns - right.columns);
  return values.slice(0, 3).map(({ columns, rows }) => ({ columns, rows }));
}

export function gridShape(ratio, phoneSize, orientation, columns, rows) {
  const shape = phoneAspect(ratio, phoneSize, orientation) * rows / columns;
  if (shape >= 1.25) return 'wide';
  if (shape <= 0.75) return 'tall';
  return '';
}
