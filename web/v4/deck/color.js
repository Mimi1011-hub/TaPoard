export function hexRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixRgb(one, two, amount) {
  return one.map((value, index) => Math.round(value + (two[index] - value) * amount));
}

export function rgbCss(color, alpha) {
  return alpha === undefined ? `rgb(${color.join(',')})` : `rgba(${color.join(',')},${alpha})`;
}

export function lightness(color) {
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}

export function rgbHsl(color) {
  const [r, g, b] = color.map((value) => value / 255);
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const luminance = (maximum + minimum) / 2;
  const difference = maximum - minimum;
  let hue = 0;
  let saturation = 0;
  if (difference) {
    saturation = difference / (1 - Math.abs(2 * luminance - 1));
    hue = maximum === r ? ((g - b) / difference) % 6 : maximum === g ? (b - r) / difference + 2 : (r - g) / difference + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, saturation, luminance];
}

export function hslRgb(hue, saturation, luminance) {
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
  const middle = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const shift = luminance - chroma / 2;
  const values = hue < 60 ? [chroma, middle, 0] : hue < 120 ? [middle, chroma, 0] : hue < 180 ? [0, chroma, middle]
    : hue < 240 ? [0, middle, chroma] : hue < 300 ? [middle, 0, chroma] : [chroma, 0, middle];
  return values.map((value) => Math.round((value + shift) * 255));
}

export function keyShade(color, light) {
  if (light) return mixRgb(color, [255, 255, 255], 0.4);
  if (lightness(color) < 0.18) return mixRgb(color, [255, 255, 255], 0.13);
  const hsl = rgbHsl(color);
  return hslRgb(hsl[0], Math.min(1, hsl[1] * 1.1), hsl[2] * 0.78);
}
