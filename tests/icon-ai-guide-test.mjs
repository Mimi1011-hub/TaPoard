import assert from 'node:assert/strict';
import { iconPrompt, iconReferencePrompt, iconTemplate } from '../web/v4/settings/icon-ai-guide.js';

const i18n = { t: (key, values) => key === 'iconAi.separator' ? ', ' : key === 'iconAi.prompt'
  ? `Prompt: ${values.names}` : key === 'iconAi.referencePrompt' ? `Reference: ${values.names}`
    : key === 'iconAi.packName' ? 'Generated' : key.replace('icon.name.', '') };
const manifest = iconTemplate(i18n);
assert.equal(manifest.format, 'tapoard-icons');
assert(manifest.icons.length > 20);
assert(manifest.icons.every((icon) => icon.file === `icons/${icon.key}.png`));
assert.match(iconPrompt(i18n, manifest), /play/);
assert.match(iconReferencePrompt(i18n, manifest), /play/);

console.log('PASS icon AI guide: manifest template and both prompts use every built-in icon key');
