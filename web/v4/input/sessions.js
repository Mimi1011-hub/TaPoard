export class InputSessions {
  constructor() { this.byWidget = new Map(); }

  apply(response) {
    if (!response || !Array.isArray(response.inputSessions)) return;
    const next = new Map();
    response.inputSessions.forEach((session) => {
      if (!session || !session.widgetId || !session.sessionId) return;
      const known = this.byWidget.get(session.widgetId);
      const value = Object.assign({}, session);
      if (known && known.sessionId === value.sessionId && known.nextSequence > value.nextSequence)
        value.nextSequence = known.nextSequence;
      next.set(value.widgetId, value);
    });
    this.byWidget = next;
  }

  get(widgetId) { return this.byWidget.get(widgetId) || null; }

  acknowledge(widgetId, sessionId, sequence) {
    const current = this.get(widgetId);
    if (current && current.sessionId === sessionId)
      current.nextSequence = Math.max(current.nextSequence, sequence + 1);
  }

  discard(widgetId, sessionId) {
    const current = this.get(widgetId);
    if (current && (!sessionId || current.sessionId === sessionId)) this.byWidget.delete(widgetId);
  }
}
