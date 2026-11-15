export class ViewAnnouncer {
  constructor(api, viewId, sessions) {
    this.api = api;
    this.viewId = viewId;
    this.sessions = sessions;
    this.signature = null;
  }

  announce(ids) {
    const visibleIds = (ids || []).slice(0, 40);
    const signature = visibleIds.join(',');
    if (signature === this.signature) return Promise.resolve();
    this.signature = signature;
    return this.api.post('/api/view', { viewId: this.viewId, visibleIds }, 5000).then((response) => {
      if (this.sessions) this.sessions.apply(response);
      return response;
    }).catch((error) => {
      this.signature = null;
      throw error;
    });
  }

  force(ids) { this.signature = null; return this.announce(ids); }

  clear() {
    return this.announce([]).catch(() => {});
  }
}
