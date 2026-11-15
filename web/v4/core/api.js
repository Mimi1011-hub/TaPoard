export class ApiError extends Error {
  constructor(status, serverError) {
    super(serverError || `HTTP ${status || 0}`);
    this.name = 'ApiError';
    this.status = status || 0;
    this.serverError = serverError || '';
  }
}

export class AuthError extends ApiError {
  constructor(serverError) {
    super(401, serverError);
    this.name = 'AuthError';
  }
}

export class Api {
  constructor(key, fetchFn) {
    this.key = key;
    this.fetchFn = fetchFn;
  }

  get(path, timeoutMs) {
    return this.request('GET', path, undefined, timeoutMs);
  }

  post(path, body, timeoutMs) {
    return this.request('POST', path, body, timeoutMs);
  }

  withKey(key) {
    return new Api(key, this.fetchFn);
  }

  async request(method, path, body, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || 5000);
    const options = {
      method,
      headers: {},
      signal: controller.signal,
    };
    if (this.key) options.headers.Authorization = `Bearer ${this.key}`;
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    try {
      const response = await this.fetchFn(path, options);
      let value = {};
      try {
        value = await response.json();
      } catch (error) {
        if (response.ok) throw new ApiError(response.status, 'Invalid JSON');
      }
      if (response.status === 401) throw new AuthError(value && value.error);
      if (!response.ok) throw new ApiError(response.status, value && value.error);
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, error && error.name === 'AbortError' ? 'Timeout' : error.message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
