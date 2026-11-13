// Finds Playwright without a user-specific path: a normal install first, then PLAYWRIGHT_MODULE,
// then the Codex runtime under the current user's home folder.
const os = require('os');
const path = require('path');
const candidates = [
  'playwright',
  process.env.PLAYWRIGHT_MODULE,
  path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'),
].filter(Boolean);
let loaded = null;
for (const candidate of candidates) {
  try {
    loaded = require(candidate);
    break;
  } catch (e) {}
}
if (!loaded) throw new Error('Playwright not found. Install it or set PLAYWRIGHT_MODULE.');
module.exports = loaded;
