import { el } from '../../core/dom.js';
import { selectField, textField } from './fields.js';

export function slideshowDetails(context) {
  context.defaults({ folder: '', interval: 10, order: 'name', fit: 'cover' });
  const folder = textField(context, context.t('details.folder'), 'folder');
  const pick = el('button', '', context.t('details.pickFolder'));
  pick.type = 'button';
  pick.addEventListener('click', async () => {
    try {
      const result = await context.api.post('/api/slideshow/pick-folder', { folder: folder.value }, 600000);
      if (result.picked) {
        folder.value = result.folder;
        context.change('folder', result.folder);
      }
    } catch (error) {
      context.onError(error.message);
    }
  });
  context.root.appendChild(pick);
  selectField(context, context.t('details.interval'), 'interval', [[5, '5'], [10, '10'], [30, '30'], [60, '60'], [300, '300'], [900, '900'], [3600, '3600']]);
  selectField(context, context.t('details.order'), 'order', [['name', context.t('details.orderName')], ['random', context.t('details.random')]]);
  selectField(context, context.t('details.fit'), 'fit', [['cover', context.t('details.cover')], ['contain', context.t('details.contain')]]);
}
