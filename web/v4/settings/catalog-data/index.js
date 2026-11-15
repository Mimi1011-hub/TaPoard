import { parts } from './parts.js';
import { actions } from './actions.js';
import { apps } from './apps.js';
import { launch } from './launch.js';

export const catalogTops = [
  { id: 'parts', groups: parts },
  { id: 'actions', groups: actions },
  { id: 'apps', groups: apps },
  { id: 'launch', flat: true, groups: launch },
].map((top) => Object.assign(top, {
  title: `catalog.top.${top.id}`,
  note: `catalog.topNote.${top.id}`,
}));

export const catalogGroups = catalogTops.flatMap((top) => top.groups);
