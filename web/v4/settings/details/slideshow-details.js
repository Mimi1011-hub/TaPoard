import { el } from '../../core/dom.js';
import { button, heading, note, selectField, textField } from './fields.js';

const intervals = [5, 10, 30, 60, 300, 900, 3600];

export function slideshowDetails(context) {
  context.defaults({ folder: '', interval: 10, order: 'name', fit: 'cover' });
  heading(context, 'details.slideshowTitle');
  const folder = textField(context, context.t('details.folder'), 'folder', 260);
  folder.placeholder = context.t('details.folderExample');
  const status = el('p', 'inspector-note');
  const pick = button(context, 'details.pickFolder', async () => {
    pick.disabled = true;
    status.textContent = context.t('details.pickOpened');
    try {
      const result = await context.api.post('/api/slideshow/pick-folder', { folder: folder.value }, 600000);
      status.textContent = '';
      if (result.picked) {
        context.onError(context.t('details.pickFound', { count: result.count }));
        context.change('folder', result.folder);
      }
    } catch (error) {
      status.textContent = error.message;
    }
    pick.disabled = false;
  });
  context.root.appendChild(status);
  const choices = intervals.map((value) => [value, context.t(`details.interval.${value}`)]);
  const interval = selectField(context, context.t('details.interval'), 'interval', choices, true);
  if (intervals.indexOf(Number(context.options.interval)) < 0) interval.value = '10';
  selectField(context, context.t('details.order'), 'order', [
    ['name', context.t('details.orderName')],
    ['random', context.t('details.random')],
  ]);
  selectField(context, context.t('details.fit'), 'fit', [
    ['cover', context.t('details.cover')],
    ['contain', context.t('details.contain')],
  ]);
  note(context, 'details.slideshowNote');
}
