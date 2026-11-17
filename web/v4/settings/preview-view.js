import { gridShape } from './phone-grid-advice.js';
import { PhoneRatioPanel } from './phone-ratio-panel.js';

// The right-hand "phone screen ratio" guide; it replaces the selected-button settings when the phone view changes.
export function setupPhoneRatioPanel(app) {
  app.phoneRatioPanel = new PhoneRatioPanel({
    editor: app.editor, preview: app.preview, previewRatio: app.nodes.previewRatio,
    phoneSize: app.phonePreviewSize, gridSize: app.gridSize, i18n: app.i18n,
  });
  app.renderPhoneAdvice(app.nodes.previewMode.value === 'phone', app.phonePreviewSize || [], true);
}

// The preview's "view" choice (PC window or phone ratio) and the recommended grid sizes for the chosen phone ratio.
export async function setupPreviewView(app) {
  let view = { options: { previewMode: 'pc', previewRatio: 'auto' }, phoneWidth: 0, phoneHeight: 0 };
  try { view = await app.api.get('/api/pc-window'); } catch (error) { app.shell.showNotice(error.message); }
  app.phonePreviewSize = [view.phoneWidth, view.phoneHeight];
  const automatic = app.nodes.previewRatio.querySelector('option[value="auto"]');
  automatic.textContent = view.phoneWidth && view.phoneHeight
    ? app.i18n.t('settings.preview.autoSize', { width: view.phoneWidth, height: view.phoneHeight })
    : app.i18n.t('settings.preview.auto');
  const apply = () => {
    const phone = app.nodes.previewMode.value === 'phone';
    app.nodes.previewRatio.hidden = !phone;
    app.preview.setView(app.nodes.previewMode.value, app.nodes.previewRatio.value, [view.phoneWidth, view.phoneHeight]);
    renderPhoneAdvice(app, phone, app.phonePreviewSize, true);
  };
  app.nodes.previewMode.value = view.options.previewMode || 'pc';
  app.nodes.previewRatio.value = view.options.previewRatio || 'auto';
  [app.nodes.previewMode, app.nodes.previewRatio].forEach((control) => control.addEventListener('change', () => {
    apply();
    app.api.post('/api/pc-window', {
      previewMode: app.nodes.previewMode.value, previewRatio: app.nodes.previewRatio.value,
    }).catch((error) => app.shell.showNotice(error.message));
  }));
  apply();
  app.editor.subscribe(() => renderPhoneAdvice(app, app.nodes.previewMode.value === 'phone', app.phonePreviewSize));
}

export function renderPhoneAdvice(app, phone, phoneSize, forcePanel = false) {
  app.nodes.gridWarning.hidden = true;
  if (!phone) {
    if (app.phoneRatioPanel && app.inspector && app.inspector.externalPanel === app.phoneRatioPanel) app.inspector.showPanel(null);
    return;
  }
  const orientation = app.preview.orientation;
  const ratio = app.nodes.previewRatio.value;
  const current = app.editor.deck[orientation];
  const shape = gridShape(ratio, phoneSize, orientation, current.columns, current.rows);
  if (shape) {
    app.nodes.gridWarning.textContent = app.i18n.t(`settings.preview.${shape}Cells`);
    app.nodes.gridWarning.hidden = false;
  }
  if (app.phoneRatioPanel && app.inspector && (forcePanel || !app.inspector.selection)) app.inspector.showPanel(app.phoneRatioPanel);
}

export function presetPreview(app, active, name) {
  if (active) showIconGuide(app, false);
  app.nodes.previewTitle.textContent = active
    ? app.i18n.t('presets.previewTitle', { name })
    : app.i18n.t('settings.preview.title');
  app.nodes.presetBack.hidden = !active;
  app.nodes.layoutTools.hidden = active;
  app.nodes.undo.hidden = active;
  app.nodes.inspector.hidden = active;
}

export function showIconGuide(app, active) {
  app.iconGuideActive = !!active;
  if (active) app.iconAiGuide.render();
  app.nodes.previewTitle.textContent = active ? app.i18n.t('iconAi.title') : app.i18n.t('settings.preview.title');
  app.nodes.presetBack.hidden = !active;
  app.nodes.layoutTools.hidden = active;
  app.nodes.preview.hidden = active;
  app.nodes.iconGuide.hidden = !active;
  app.nodes.inspector.hidden = active;
}
