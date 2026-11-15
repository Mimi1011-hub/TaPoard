import { catalogGroups } from './base.js';

const ids = ['common', 'windows', 'music', 'browser'];
const audio = catalogGroups.find((group) => group.id === 'audio');

export const actions = [
  {
    id: 'audio',
    title: 'catalog.group.audioActions',
    note: 'catalog.note.audioActions',
    items: audio.items.filter((item) => item.action.indexOf('audio-') === 0),
  },
].concat(catalogGroups.filter((group) => ids.indexOf(group.id) >= 0).map((group) => ({
  ...group,
  items: group.items.filter((item) => item.action !== 'key-custom'),
})));
