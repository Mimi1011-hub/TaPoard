import { el } from '../../core/dom.js';
import { checkField, field, heading, note, selectField } from './fields.js';

export function metricsDetails(context) {
  context.defaults({ primary: 'cpu', cycle: false, gpuId: '', gpuName: '' });
  heading(context, 'details.metricsTitle');
  const large = context.item.width === 2 && context.item.height === 2;
  const primary = context.options.primary;
  if (!large) {
    selectField(context, context.t('details.metricsPrimary'), 'primary', [
      ['cpu', context.t('details.metricsCpu')],
      ['memory', context.t('details.metricsMemory')],
      ['gpu', context.t('details.metricsGpu')],
      ['gpuMemory', context.t('details.metricsGpuMemory')],
    ]);
    if (primary === 'cpu' || primary === 'memory') checkField(context, context.t('details.metricsCycle'), 'cycle');
  }
  if (large || primary === 'gpu' || primary === 'gpuMemory') gpuField(context);
  note(context, 'details.metricsNote');
}

function gpuField(context) {
  const metrics = context.state.metrics || {};
  const gpus = Array.isArray(metrics.gpus) ? metrics.gpus : [];
  const saved = context.options.gpuId;
  // The id changes after a restart, so a saved GPU is found again by its name.
  const sameName = gpus.find((gpu) => gpu.name && gpu.name === context.options.gpuName);
  const listed = gpus.some((gpu) => gpu.id === saved);
  const current = listed || !sameName ? saved : sameName.id;
  const select = el('select', '');
  const add = (id, name) => {
    const option = el('option', '', name);
    option.value = id;
    select.appendChild(option);
  };
  if (!gpus.length && !current) add('', context.t('details.gpuNone'));
  if (current && !gpus.some((gpu) => gpu.id === current)) add(current, context.options.gpuName || context.t('details.gpuSaved'));
  gpus.forEach((gpu) => add(gpu.id, gpu.name || gpu.id));
  select.value = current || (gpus[0] ? gpus[0].id : '');
  select.dataset.option = 'gpuId';
  select.addEventListener('change', () => {
    const gpu = gpus.find((value) => value.id === select.value);
    if (gpu) context.changeMany({ gpuId: gpu.id, gpuName: gpu.name || '' });
  });
  field(context.root, context.t('details.gpu'), select);
}
