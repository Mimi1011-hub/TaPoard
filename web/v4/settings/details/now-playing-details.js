import { checkField, heading } from './fields.js';

export function nowPlayingDetails(context) {
  context.defaults({ showArt: true, showControls: true, showProgress: true });
  heading(context, 'details.nowPlayingTitle');
  checkField(context, context.t('details.nowPlayingArt'), 'showArt');
  checkField(context, context.t('details.nowPlayingControls'), 'showControls');
  checkField(context, context.t('details.nowPlayingProgress'), 'showProgress');
}
