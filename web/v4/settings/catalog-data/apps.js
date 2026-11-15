import { catalogGroups } from './base.js';
import { vscode } from './vscode.js';

export const apps = catalogGroups.filter((group) => ['discord', 'clipstudio'].indexOf(group.id) >= 0).concat([vscode]);
