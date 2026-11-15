const BUSY_MESSAGE = '他の端末が操作中です。';

export class InputSender {
  constructor(widgetId, context) {
    this.widgetId = widgetId;
    this.context = context;
    this.queue = [];
    this.inFlight = false;
    this.lastSent = 0;
    this.timer = null;
    this.releaseWanted = false;
    this.listener = null;
  }

  listen(listener) { this.listener = listener; }
  notify(state) { if (this.listener) this.listener(state); }
  session() { return this.context.sessions.get(this.widgetId); }

  push(event) {
    const last = this.queue[this.queue.length - 1];
    if (last && last.type === event.type && (event.type === 'steps' || event.type === 'wheel')) {
      last.delta += event.delta;
      if (!last.delta) this.queue.pop();
    } else if (last && last.type === 'move' && event.type === 'move') {
      last.dx += event.dx; last.dy += event.dy;
      if (!last.dx && !last.dy) this.queue.pop();
    } else this.queue.push(event);
    this.pump();
  }

  take() {
    const batch = [];
    while (this.queue.length && batch.length < 16) {
      const event = this.queue[0];
      if (event.type === 'steps' && Math.abs(event.delta) > 20) {
        const delta = event.delta > 0 ? 20 : -20;
        event.delta -= delta; batch.push({ type: 'steps', delta }); break;
      }
      if (event.type === 'move' && (Math.abs(event.dx) > 4096 || Math.abs(event.dy) > 4096)) {
        const dx = Math.max(-4096, Math.min(4096, event.dx));
        const dy = Math.max(-4096, Math.min(4096, event.dy));
        event.dx -= dx; event.dy -= dy; batch.push({ type: 'move', dx, dy }); break;
      }
      this.queue.shift();
      if (event.type !== 'move' || event.dx || event.dy) batch.push(event);
    }
    return batch;
  }

  async post(path, body, retry) {
    try { return await this.context.api.post(path, body, 8000); }
    catch (error) {
      if (retry && error && error.serverError === 'Timeout') return this.post(path, body, false);
      throw error;
    }
  }

  pump() {
    if (this.inFlight || this.timer) return;
    if (!this.queue.length) { this.sendRelease(); return; }
    const wait = Math.max(0, 50 - (Date.now() - this.lastSent));
    if (wait) { this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait); return; }
    const session = this.session();
    if (!session) { this.queue = []; this.context.renewView(); return; }
    const events = this.take();
    if (!events.length) { this.pump(); return; }
    const sequence = session.nextSequence;
    this.inFlight = true;
    this.lastSent = Date.now();
    const started = Date.now();
    this.post('/api/input', { viewId: this.context.viewId, sessionId: session.sessionId, sequence, events }, true)
      .then((ack) => {
        this.context.sessions.acknowledge(this.widgetId, session.sessionId, ack.acknowledged);
        this.context.onLatency(Date.now() - started);
        this.notify(ack.foregroundBlocked ? 'blocked' : 'ok');
      }, (error) => {
        this.queue = [];
        if (error && error.serverError === BUSY_MESSAGE) this.notify('busy');
        else {
          this.context.sessions.discard(this.widgetId, session.sessionId);
          this.context.renewView();
          this.notify('error');
        }
      }).then(() => { this.inFlight = false; this.pump(); });
  }

  sendRelease() {
    if (!this.releaseWanted) return;
    this.releaseWanted = false;
    const session = this.session();
    if (session) this.context.api.post('/api/input/release', { viewId: this.context.viewId, sessionId: session.sessionId }, 5000).catch(() => {});
  }

  steps(delta) { if (delta) this.push({ type: 'steps', delta }); }
  move(dx, dy) { if (dx || dy) this.push({ type: 'move', dx, dy }); }
  wheel(delta) { if (delta) this.push({ type: 'wheel', delta }); }
  button(type, control) { this.push({ type, control }); }
  keyTap(control) { if (control) this.push({ type: 'keyTap', control }); }
  release() { this.releaseWanted = true; this.pump(); }

  keepalive() {
    const session = this.session();
    if (session && !this.inFlight && !this.queue.length)
      this.context.api.post('/api/input/keepalive', { viewId: this.context.viewId, sessionId: session.sessionId }, 5000).catch(() => {});
  }
}

export class InputSenders {
  constructor(context) { this.context = context; this.senders = new Map(); }
  get(widgetId) {
    if (!this.senders.has(widgetId)) this.senders.set(widgetId, new InputSender(widgetId, this.context));
    return this.senders.get(widgetId);
  }
}
