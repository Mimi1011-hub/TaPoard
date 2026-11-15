import { catalogGroups } from './legacy.js';

export const apps = catalogGroups.filter((group) => ['discord', 'clipstudio'].indexOf(group.id) >= 0);
