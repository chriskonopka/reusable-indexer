import { useMemo } from 'react';
import { ApiClient, createApiClient } from '../api/client';
import { useEmitEvent, useHost } from '../host/useHost';

// Single React-side entry point to the HTTP client. Pulls apiBaseUrl,
// getAccessToken, and appInsights from the host contract; routes 401s
// to the host's onEvent as auth/expired.

export const useApiClient = (): ApiClient => {
  const host = useHost();
  const emit = useEmitEvent();

  return useMemo<ApiClient>(
    () =>
      createApiClient({
        apiBaseUrl: host.apiBaseUrl,
        getAccessToken: host.getAccessToken,
        appInsights: host.appInsights,
        onAuthExpired: () => emit({ type: 'auth/expired' }),
      }),
    [host.apiBaseUrl, host.getAccessToken, host.appInsights, emit],
  );
};
