import { catalogGroups } from './legacy.js';

const actions = ['custom-url', 'custom-clipboard', 'key-custom', 'custom-audio-output', 'custom-audio-input'];
const items = catalogGroups.flatMap((group) => group.items).filter((item) => actions.indexOf(item.action) >= 0);

export const launch = [{ id: 'launch', title: 'catalog.top.launch', note: 'catalog.topNote.launch', items }];
