import { catalogGroups } from './base.js';

const ids = ['info', 'nowPlaying', 'mouse', 'photo', 'keyboard'];
const audio = catalogGroups.find((group) => group.id === 'audio');

export const parts = [
  {
    id: 'audio',
    title: 'catalog.group.audioFaders',
    note: 'catalog.note.audioFaders',
    items: audio.items.filter((item) => item.action.indexOf('control-') === 0),
  },
].concat(catalogGroups.filter((group) => ids.indexOf(group.id) >= 0));
