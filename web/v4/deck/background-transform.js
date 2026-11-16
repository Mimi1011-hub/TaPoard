export function backgroundTransform(position = {}) {
  return {
    flipX: position.flipX === true,
    flipY: position.flipY === true,
    rotate: [0, 90, 180, 270].includes(position.rotate) ? position.rotate : 0,
  };
}

export function pictureViewport(position, width, height) {
  const transform = backgroundTransform(position);
  const sideways = transform.rotate === 90 || transform.rotate === 270;
  return {
    width: sideways ? height : width,
    height: sideways ? width : height,
    left: sideways ? (width - height) / 2 : 0,
    top: sideways ? (height - width) / 2 : 0,
    ...transform,
  };
}

export function picturePoint(position, width, height, x, y) {
  const view = pictureViewport(position, width, height);
  const dx = x - width / 2;
  const dy = y - height / 2;
  let px = dx;
  let py = dy;
  if (view.rotate === 90) { px = dy; py = -dx; }
  if (view.rotate === 180) { px = -dx; py = -dy; }
  if (view.rotate === 270) { px = -dy; py = dx; }
  if (view.flipX) px = -px;
  if (view.flipY) py = -py;
  return { x: px + view.width / 2, y: py + view.height / 2, view };
}
