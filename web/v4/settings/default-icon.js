// The built-in icon a shortcut gets when it is added, chosen from what it does (same as 3.x).
const byWord = [
  ['screenshot', 'screenshot'], ['printscreen', 'screenshot'], ['copy', 'copy'], ['paste', 'paste'], ['save', 'save'],
  ['undo', 'back'], ['back', 'back'], ['redo', 'forward'], ['forward', 'forward'], ['search', 'search'], ['find', 'search'],
  ['brush', 'brush'], ['pen', 'pen'], ['pencil', 'pencil'], ['eraser', 'eraser'], ['layer', 'layers'],
];
const byCategory = { discord: 'chat', windows: 'windows', browser: 'globe', clipstudio: 'palette', common: 'star' };

export function defaultIconForAction(action, category) {
  action = action || '';
  if (action === 'key-custom') return 'keyboard';
  if (action.indexOf('media-play') === 0) return 'play';
  if (action.indexOf('media-previous') === 0) return 'previous';
  if (action.indexOf('media-next') === 0) return 'next';
  if (action.indexOf('media-stop') === 0) return 'stop';
  if (action.indexOf('mic') >= 0) return 'microphone';
  if (action.indexOf('speaker') >= 0) return action.indexOf('mute') >= 0 ? 'mute' : 'speaker';
  const found = byWord.find((entry) => action.indexOf(entry[0]) >= 0);
  if (found) return found[1];
  if (action.indexOf('zoom') >= 0) return action.indexOf('out') >= 0 ? 'zoom-out' : 'zoom-in';
  if (action.indexOf('rotate') >= 0) return 'rotate';
  return byCategory[category] || '';
}

// The icon kind a button stands for, used to find its picture in an icon pack.
export function effectiveIconKey(item) {
  if (item.iconKey) return item.iconKey;
  if (item.type === 'url') return 'globe';
  if (item.type === 'clipboard' || item.type === 'text') return 'copy';
  return defaultIconForAction(item.action, item.category);
}
