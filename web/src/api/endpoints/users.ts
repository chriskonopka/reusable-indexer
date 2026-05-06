import type { UserLookupRequest, UserLookupResponse } from '@shared/types';
import type { ApiClient } from '../client';

// User lookup — used by the share dialog to resolve an email to a userId
// before issuing POST /shares. Rate-limited server-side; the share dialog
// debounces input before calling.

export const lookupUserByEmail = (
  client: ApiClient,
  body: UserLookupRequest,
  signal?: AbortSignal,
): Promise<UserLookupResponse> =>
  client.post('/users/lookup', body, { signal });
