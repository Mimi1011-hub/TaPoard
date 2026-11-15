import { checkField, selectField } from './fields.js';

export function metricsDetails(context) {
  context.defaults({ primary: 'cpu', cycle: false, gpuId: '', gpuName: '' });
  selectField(context, context.t('details.metricsPrimary'), 'primary', [
    ['cpu', 'CPU'], ['memory', context.t('metrics.memory')], ['gpu', 'GPU'], ['gpuMemory', context.t('metrics.gpuMemory')],
  ]);
  checkField(context, context.t('details.metricsCycle'), 'cycle');
  const gpus = context.state.metrics && context.state.metrics.gpus || [];
  const choices = gpus.map((gpu) => [gpu.id, gpu.name || gpu.id]);
  const select = selectField(context, context.t('details.gpu'), 'gpuId', choices.length ? choices : [['', context.t('details.gpuNone')]]);
  select.addEventListener('change', () => {
    const gpu = gpus.find((value) => value.id === select.value);
    if (gpu) context.changeMany({ gpuId: gpu.id, gpuName: gpu.name || '' });
  });
}
