import type { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { normalizeError, NormalizedError } from '../utils/normalizeError';

// HTTP client. Wraps fetch with:
//   - Bearer-token attachment via host-supplied getAccessToken()
//   - X-Operation-Id capture + structured Application Insights logging
//   - ProblemDetails parsing on non-2xx
//   - auth/expired escalation on 401 (no internal retry)
//
// Reachable only through hooks/useApiClient.ts inside React, so the host
// contract is the single source of apiBaseUrl + getAccessToken.
//
// See docs/architecture/api-contracts.md §1.

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T>;
  del<T>(path: string, opts?: RequestOptions): Promise<T>;
  postMultipart<T>(path: string, form: FormData, opts?: RequestOptions): Promise<T>;
}

export interface CreateApiClientOptions {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string>;
  onAuthExpired: () => void;
  appInsights?: ApplicationInsights;
}

const trimTrailingSlash = (s: string): string => s.replace(/\/+$/, '');

const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) return false;
  return (
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json')
  );
};

export class ApiClientError extends Error {
  readonly normalized: NormalizedError;
  readonly operationId: string | null;

  constructor(normalized: NormalizedError, operationId: string | null) {
    super(normalized.detail);
    this.name = 'ApiClientError';
    this.normalized = normalized;
    this.operationId = operationId;
  }
}

interface ResolvedRequest {
  method: string;
  url: string;
  init: RequestInit;
}

const buildRequest = async (
  base: string,
  path: string,
  method: string,
  body: unknown,
  opts: RequestOptions | undefined,
  getAccessToken: () => Promise<string>,
  isMultipart: boolean,
): Promise<ResolvedRequest> => {
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${await getAccessToken()}`,
  };

  let resolvedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (isMultipart) {
      resolvedBody = body as FormData;
    } else {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
      resolvedBody = JSON.stringify(body);
    }
  }

  return {
    method,
    url: `${base}${path}`,
    init: {
      method,
      headers,
      body: resolvedBody,
      signal: opts?.signal,
      credentials: 'omit',
    },
  };
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type');
  if (response.body === null || !isJsonContentType(contentType)) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const trackEvent = (
  appInsights: ApplicationInsights | undefined,
  name: string,
  properties: Record<string, string | number | boolean | undefined>,
): void => {
  if (!appInsights) return;
  try {
    appInsights.trackEvent({
      name,
      properties: properties as Record<string, unknown>,
    });
  } catch {
    // Telemetry must never break the request path.
  }
};

const trackException = (
  appInsights: ApplicationInsights | undefined,
  error: unknown,
  properties: Record<string, string | number | boolean | undefined>,
): void => {
  if (!appInsights) return;
  try {
    appInsights.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
      properties: properties as Record<string, unknown>,
    });
  } catch {
    // ditto
  }
};

export const createApiClient = (opts: CreateApiClientOptions): ApiClient => {
  const base = trimTrailingSlash(opts.apiBaseUrl);
  let authExpiredFired = false;

  const exec = async <T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions | undefined,
    isMultipart = false,
  ): Promise<T> => {
    const startedAt = Date.now();
    const request = await buildRequest(
      base,
      path,
      method,
      body,
      options,
      opts.getAccessToken,
      isMultipart,
    );

    let response: Response;
    try {
      response = await fetch(request.url, request.init);
    } catch (error) {
      // Network or CORS error.
      const normalized = normalizeError(error);
      trackException(opts.appInsights, error, {
        method,
        path,
        durationMs: Date.now() - startedAt,
      });
      throw new ApiClientError(normalized, null);
    }

    const operationId = response.headers.get('X-Operation-Id');

    if (response.status === 401) {
      // The host owns recovery — fire once per client lifetime.
      if (!authExpiredFired) {
        authExpiredFired = true;
        try {
          opts.onAuthExpired();
        } catch {
          // Host's onAuthExpired must not bubble.
        }
      }
      const normalized = normalizeError({
        type: 'https://problems.api/unauthorized',
        title: 'Authentication required',
        status: 401,
        detail: 'Your session has expired.',
      });
      throw new ApiClientError(normalized, operationId);
    }

    if (!response.ok) {
      const payload = await parseResponseBody(response);
      const normalized = normalizeError(
        payload && typeof payload === 'object'
          ? { ...payload, status: (payload as { status?: number }).status ?? response.status }
          : { type: 'about:blank', title: 'Error', status: response.status, detail: response.statusText },
      );
      trackEvent(opts.appInsights, 'IndexerApi/Error', {
        method,
        path,
        status: response.status,
        operationId: operationId ?? undefined,
        durationMs: Date.now() - startedAt,
      });
      throw new ApiClientError(normalized, operationId);
    }

    trackEvent(opts.appInsights, 'IndexerApi/Success', {
      method,
      path,
      status: response.status,
      operationId: operationId ?? undefined,
      durationMs: Date.now() - startedAt,
    });

    const payload = await parseResponseBody(response);
    return payload as T;
  };

  return {
    get: <T>(path: string, options?: RequestOptions) =>
      exec<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      exec<T>('POST', path, body, options),
    patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
      exec<T>('PATCH', path, body, options),
    del: <T>(path: string, options?: RequestOptions) =>
      exec<T>('DELETE', path, undefined, options),
    postMultipart: <T>(path: string, form: FormData, options?: RequestOptions) =>
      exec<T>('POST', path, form, options, true),
  };
};
