import { ApiClientError, createApiClient } from './client';

const stubProblem = (status: number, type: string, detail = 'oh no') => ({
  body: JSON.stringify({ type, title: 'Problem', status, detail }),
  contentType: 'application/problem+json',
});

const buildResponse = (
  status: number,
  body: string | null,
  contentType: string | null,
  operationId = 'op-123',
): Response => {
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  if (operationId) headers.set('X-Operation-Id', operationId);
  return new Response(body, { status, headers });
};

describe('ApiClient', () => {
  let fetchMock: jest.Mock;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const makeClient = (overrides: Partial<Parameters<typeof createApiClient>[0]> = {}) =>
    createApiClient({
      apiBaseUrl: 'https://example.test',
      getAccessToken: async () => 'token-abc',
      onAuthExpired: jest.fn(),
      ...overrides,
    });

  it('attaches a Bearer token from getAccessToken', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(200, JSON.stringify({ ok: true }), 'application/json'),
    );

    const client = makeClient();
    await client.get('/document-sets/list');

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('joins apiBaseUrl + path without doubled slashes', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(200, JSON.stringify({}), 'application/json'),
    );

    const client = createApiClient({
      apiBaseUrl: 'https://example.test/',
      getAccessToken: async () => 't',
      onAuthExpired: jest.fn(),
    });
    await client.get('/document-sets');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/document-sets');
  });

  it('parses a JSON response and returns it', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(200, JSON.stringify({ documentSetId: 'abc' }), 'application/json'),
    );
    const client = makeClient();
    const result = await client.get<{ documentSetId: string }>('/document-sets/abc');
    expect(result).toEqual({ documentSetId: 'abc' });
  });

  it('returns undefined for a 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(204, null, null));
    const client = makeClient();
    const result = await client.del('/document-sets/abc');
    expect(result).toBeUndefined();
  });

  it('throws ApiClientError with a parsed ProblemDetails on 400', async () => {
    const { body, contentType } = stubProblem(400, 'https://problems.api/validation-failed', 'name required');
    fetchMock.mockResolvedValueOnce(buildResponse(400, body, contentType));

    const client = makeClient();
    await expect(client.post('/document-sets', { name: '' })).rejects.toMatchObject({
      name: 'ApiClientError',
      operationId: 'op-123',
      normalized: {
        type: 'https://problems.api/validation-failed',
        status: 400,
        detail: 'name required',
      },
    });
  });

  it('escalates 401 by calling onAuthExpired exactly once across multiple calls', async () => {
    fetchMock.mockResolvedValue(buildResponse(401, null, null));
    const onAuthExpired = jest.fn();
    const client = makeClient({ onAuthExpired });

    await expect(client.get('/document-sets/list')).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.get('/document-sets/list')).rejects.toBeInstanceOf(ApiClientError);

    expect(onAuthExpired).toHaveBeenCalledTimes(1);
  });

  it('does not retry internally on 5xx — surfaces the error to the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(503, JSON.stringify({ type: 'https://problems.api/blob-unavailable', title: 't', status: 503, detail: 'down' }), 'application/problem+json'),
    );
    const client = makeClient();
    await expect(client.post('/documents', new FormData())).rejects.toMatchObject({
      normalized: { status: 503, type: 'https://problems.api/blob-unavailable' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('captures X-Operation-Id from the response', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(404, JSON.stringify({ type: 'about:blank', title: 't', status: 404 }), 'application/problem+json', 'opx'),
    );
    const client = makeClient();
    await expect(client.get('/document-sets/x')).rejects.toMatchObject({ operationId: 'opx' });
  });

  it('treats network errors as ApiClientError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const client = makeClient();
    const err = await client.get('/document-sets/list').catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.normalized.status).toBe(0);
  });

  it('sends multipart bodies without a content-type header (fetch sets it)', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(202, JSON.stringify({}), 'application/json'));
    const form = new FormData();
    form.append('file', new Blob(['hi']));

    const client = makeClient();
    await client.postMultipart('/documents', form);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(init.body).toBe(form);
  });

  it('forwards an AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(200, JSON.stringify({}), 'application/json'));
    const controller = new AbortController();
    const client = makeClient();
    await client.get('/document-sets/list', { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('omits credentials so the browser does not attach cookies', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(200, JSON.stringify({}), 'application/json'));
    const client = makeClient();
    await client.get('/document-sets/list');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
  });

  it('logs success and error events to App Insights when provided', async () => {
    const trackEvent = jest.fn();
    const trackException = jest.fn();
    const appInsights = { trackEvent, trackException } as unknown as Parameters<
      typeof createApiClient
    >[0]['appInsights'];

    fetchMock.mockResolvedValueOnce(buildResponse(200, JSON.stringify({}), 'application/json'));
    const client = makeClient({ appInsights });
    await client.get('/document-sets/list');
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'IndexerApi/Success',
        properties: expect.objectContaining({ method: 'GET', status: 200 }),
      }),
    );

    fetchMock.mockResolvedValueOnce(buildResponse(409, JSON.stringify({ type: 'x', title: 't', status: 409 }), 'application/problem+json'));
    await expect(client.del('/document-sets/abc')).rejects.toBeInstanceOf(ApiClientError);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'IndexerApi/Error',
        properties: expect.objectContaining({ status: 409 }),
      }),
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>500</html>', { status: 500 }));
    const client = makeClient();
    await expect(client.get('/x')).rejects.toMatchObject({
      normalized: { status: 500 },
    });
  });
});
