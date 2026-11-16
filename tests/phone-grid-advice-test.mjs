import assert from 'node:assert/strict';
import { gridShape, phoneAspect, recommendedGrids } from '../web/v4/settings/phone-grid-advice.js';

assert.equal(phoneAspect('19.5:9', null, 'landscape'), 19.5 / 9);
assert.equal(phoneAspect('19.5:9', null, 'portrait'), 9 / 19.5);
assert.deepEqual(recommendedGrids('19.5:9', null, 'landscape'), [
  { columns: 7, rows: 3 },
  { columns: 6, rows: 3 },
  { columns: 8, rows: 4 },
]);
assert.equal(gridShape('16:9', null, 'landscape', 3, 4), 'wide');
assert.equal(gridShape('20:9', null, 'landscape', 8, 2), 'tall');
assert.equal(gridShape('19.5:9', null, 'landscape', 7, 3), '');

console.log('PASS phone grid advice: ratios, recommendations and shape warnings');
