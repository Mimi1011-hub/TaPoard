export class ViewAnnouncer {
  constructor(api, viewId) {
    this.api = api;
    this.viewId = viewId;
    this.signature = null;
  }

  announce(ids) {
    const visibleIds = (ids || []).slice(0, 40);
    const signature = visibleIds.join(',');
    if (signature === this.signature) return Promise.resolve();
    this.signature = signature;
    return this.api.post('/api/view', { viewId: this.viewId, visibleIds }, 5000).catch((error) => {
      this.signature = null;
      throw error;
    });
  }

  clear() {
    return this.announce([]).catch(() => {});
  }
}
