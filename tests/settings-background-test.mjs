import assert from 'node:assert/strict';
import { movePicture, pictureLayout } from '../web/v4/settings/background-adjust.js';

// A 2000x1000 picture on a 1000x1000 screen: "cover" leaves 1000px to move sideways, nothing up or down.
const size = { width: 1000, height: 1000, imageWidth: 2000, imageHeight: 1000 };
const start = { fit: 'cover', x: 50, y: 50, zoom: 1 };
const layout = pictureLayout(start, size.imageWidth, size.imageHeight, size.width, size.height);
assert.equal(layout.overX, 1000);
assert.equal(layout.overY, 0);
assert.equal(layout.left, -500);

// Dragging 100px to the right moves the picture 100px to the right (x gets smaller).
const dragged = movePicture(start, size, 1, 400, 500, 500, 500);
assert.equal(dragged.x, 40);
assert.equal(dragged.y, 50, 'no vertical room, so y stays');
assert.equal(pictureLayout(dragged, 2000, 1000, 1000, 1000).left, -400);

// The picture cannot be pulled past its edge.
assert.equal(movePicture(start, size, 1, 0, 500, 900, 500).x, 0);
assert.equal(movePicture(start, size, 1, 900, 500, 0, 500).x, 100);

// Zooming keeps the picture point under the pointer in place.
const zoomed = movePicture(start, size, 2, 250, 250, 250, 250);
const after = pictureLayout(zoomed, 2000, 1000, 1000, 1000);
const pictureX = (250 - layout.left) / layout.scale, pictureY = (250 - layout.top) / layout.scale;
assert(Math.abs(after.left + pictureX * after.scale - 250) < 0.001);
assert(Math.abs(after.top + pictureY * after.scale - 250) < 0.001);

// Zoom stays between 1 and 5.
assert.equal(movePicture(start, size, 0.2, 500, 500, 500, 500).zoom, 1);
assert.equal(movePicture(start, size, 9, 500, 500, 500, 500).zoom, 5);
console.log('PASS settings background: drag follows the pointer, edges, zoom around the pointer and limits');
