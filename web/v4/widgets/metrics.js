import { el, clear } from '../core/dom.js';
import { appendWidgetName, percent } from './common.js';

function selectedGpu(metrics, options) {
  const gpus = (Array.isArray(metrics.gpus) ? metrics.gpus : []).filter(Boolean);
  return gpus.find((gpu) => gpu.id === options.gpuId) || gpus.find((gpu) => gpu.name === options.gpuName) || gpus[0] || null;
}

function gpuMemory(gpu) {
  return gpu && gpu.memoryAvailable && gpu.memoryTotalBytes > 0 ? 100 * gpu.memoryUsedBytes / gpu.memoryTotalBytes : null;
}

function path(history, property) {
  const points = [];
  (history || []).forEach((entry, index) => {
    const value = entry && entry[property];
    if (!Number.isFinite(value)) return;
    const x = history.length < 2 ? 100 : index * 100 / (history.length - 1);
    points.push(`${points.length ? 'L' : 'M'} ${x.toFixed(1)} ${(100 - Math.max(0, Math.min(100, value))).toFixed(1)}`);
  });
  return points.join(' ');
}

export class MetricsWidget {
  constructor(context) { this.context = context; }

  mount(node, item, state) {
    this.node = node;
    this.item = item;
    node.classList.add('metrics-widget');
    this.update(state);
  }

  descriptor(metrics, options) {
    const gpu = selectedGpu(metrics, options);
    if (options.primary === 'memory') return [this.context.i18n.t('metrics.memory'), metrics.memoryPercent, metrics.memoryAvailable, false];
    if (options.primary === 'gpu') return ['GPU', gpu && gpu.utilizationPercent, !!(gpu && gpu.utilizationAvailable), !gpu];
    if (options.primary === 'gpuMemory') return [this.context.i18n.t('metrics.gpuMemory'), gpuMemory(gpu), !!(gpu && gpu.memoryAvailable), !gpu];
    return ['CPU', metrics.cpuPercent, metrics.cpuAvailable, metrics.cpuSupported === false];
  }

  row(label, value, available, unsupported) {
    const row = el('div', 'metric-row');
    row.append(el('span', '', label), el('strong', '', percent(value, available, unsupported, this.context.i18n)));
    this.node.appendChild(row);
  }

  update(state) {
    const metrics = state.metrics || {};
    const options = Object.assign({ primary: 'cpu', cycle: false, gpuId: '', gpuName: '' }, this.item.options || {});
    const large = (this.item.width || 1) >= 2 && (this.item.height || 1) >= 2;
    clear(this.node);
    this.node.classList.toggle('metrics-large', large);
    this.node.classList.toggle('metrics-inactive', !metrics.active);
    if (!large) {
      if (options.cycle) options.primary = Math.floor(Date.now() / 4000) % 2 ? 'memory' : 'cpu';
      const descriptor = this.descriptor(metrics, options);
      this.node.append(el('span', 'metric-name', descriptor[0]), el('strong', 'metric-value', percent(descriptor[1], descriptor[2], descriptor[3], this.context.i18n)));
    } else {
      this.node.appendChild(el('strong', 'metrics-heading', this.context.i18n.t('metrics.title')));
      this.row('CPU', metrics.cpuPercent, metrics.cpuAvailable, metrics.cpuSupported === false);
      this.row(this.context.i18n.t('metrics.memory'), metrics.memoryPercent, metrics.memoryAvailable, false);
      const gpu = selectedGpu(metrics, options);
      this.row('GPU', gpu && gpu.utilizationPercent, !!(gpu && gpu.utilizationAvailable), !gpu);
      this.row(this.context.i18n.t('metrics.gpuMemory'), gpuMemory(gpu), !!(gpu && gpu.memoryAvailable), !gpu);
      const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      graph.setAttribute('class', 'metrics-graph'); graph.setAttribute('viewBox', '0 0 100 100'); graph.setAttribute('preserveAspectRatio', 'none');
      [['memoryPercent', 'memory-line'], ['cpuPercent', 'cpu-line']].forEach(([property, className]) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', className); line.setAttribute('d', path(metrics.history || [], property)); graph.appendChild(line);
      });
      this.node.appendChild(graph);
    }
    appendWidgetName(this.node, this.item);
  }

  destroy() {}
}
