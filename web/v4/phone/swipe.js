import { SwipeMotion } from '../deck/swipe-motion.js';

export class Swipe extends SwipeMotion {
  constructor(root, storage, onPage, pages, windowObject) {
    super(root, {
      enabled: () => storage.getItem('tapoard-swipe') !== 'off',
      onPage,
      pages,
      windowObject,
    });
    this.bind();
  }
}
