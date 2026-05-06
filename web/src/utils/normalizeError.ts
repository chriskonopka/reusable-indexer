import type { ProblemDetails } from '@shared/types';

// Maps a thrown error from `fetch` or a ProblemDetails response body into a
// stable shape every UI surface displays. See docs/architecture/api-contracts.md
// §1.3 for the slug → UI behavior map. The indexer never echoes raw HTTP status
// codes or stack traces — only the server-supplied detail text.

export interface NormalizedError {
  type: string;
  title: string;
  status: number;
  detail: string;
  fieldErrors?: Record<string, string[]>;
}

const FALLBACK_DETAIL = 'Something went wrong. Please try again.';

const isProblemDetails = (value: unknown): value is ProblemDetails => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === 'string' && typeof v.status === 'number';
};

const isFieldErrors = (value: unknown): value is Record<string, string[]> => {
  if (!value || typeof value !== 'object') return false;
  for (const entries of Object.values(value as Record<string, unknown>)) {
    if (!Array.isArray(entries)) return false;
    if (entries.some((entry) => typeof entry !== 'string')) return false;
  }
  return true;
};

export const normalizeError = (input: unknown): NormalizedError => {
  if (isProblemDetails(input)) {
    const fieldErrors = isFieldErrors(input.errors) ? input.errors : undefined;
    return {
      type: input.type,
      title: typeof input.title === 'string' ? input.title : 'Error',
      status: input.status,
      detail:
        typeof input.detail === 'string' && input.detail.length > 0
          ? input.detail
          : FALLBACK_DETAIL,
      fieldErrors,
    };
  }

  if (input instanceof DOMException && input.name === 'AbortError') {
    return {
      type: 'about:blank',
      title: 'Request cancelled',
      status: 0,
      detail: 'Request cancelled.',
    };
  }

  if (input instanceof TypeError) {
    return {
      type: 'about:blank',
      title: 'Network error',
      status: 0,
      detail: 'Could not reach the server. Check your connection and try again.',
    };
  }

  if (input instanceof Error) {
    return {
      type: 'about:blank',
      title: input.name || 'Error',
      status: 0,
      detail: FALLBACK_DETAIL,
    };
  }

  return {
    type: 'about:blank',
    title: 'Error',
    status: 0,
    detail: FALLBACK_DETAIL,
  };
};

export const isAuthExpiredError = (error: NormalizedError): boolean =>
  error.status === 401;

export const isForbiddenError = (error: NormalizedError): boolean =>
  error.status === 403 || error.type === 'https://problems.api/forbidden';

export const isUploadInProgressError = (error: NormalizedError): boolean =>
  error.type === 'https://problems.api/document-set-delete-blocked';

export const isShareAlreadyExistsError = (error: NormalizedError): boolean =>
  error.type === 'https://problems.api/share-already-exists';

export type { ProblemDetails };
