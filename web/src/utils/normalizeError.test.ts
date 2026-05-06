import {
  isAuthExpiredError,
  isForbiddenError,
  isShareAlreadyExistsError,
  isUploadInProgressError,
  normalizeError,
} from './normalizeError';

describe('normalizeError', () => {
  it('preserves type, title, status, detail, and field errors from a ProblemDetails body', () => {
    const result = normalizeError({
      type: 'https://problems.api/validation-failed',
      title: 'Validation failed',
      status: 400,
      detail: 'Name is required.',
      errors: { name: ['Name is required.'] },
    });

    expect(result).toEqual({
      type: 'https://problems.api/validation-failed',
      title: 'Validation failed',
      status: 400,
      detail: 'Name is required.',
      fieldErrors: { name: ['Name is required.'] },
    });
  });

  it('substitutes a fallback detail when ProblemDetails omits one', () => {
    const result = normalizeError({
      type: 'https://problems.api/conflict',
      title: 'Conflict',
      status: 409,
    });

    expect(result.detail).toBe('Something went wrong. Please try again.');
  });

  it('drops malformed errors objects rather than passing them through', () => {
    const result = normalizeError({
      type: 'https://problems.api/validation-failed',
      title: 'Validation failed',
      status: 400,
      detail: 'Bad input',
      errors: { name: 'not an array' },
    });

    expect(result.fieldErrors).toBeUndefined();
  });

  it('classifies an AbortError as a cancelled request', () => {
    const result = normalizeError(new DOMException('aborted', 'AbortError'));
    expect(result.title).toBe('Request cancelled');
    expect(result.status).toBe(0);
  });

  it('classifies a TypeError as a network error with a humanized message', () => {
    const result = normalizeError(new TypeError('Failed to fetch'));
    expect(result.status).toBe(0);
    expect(result.detail).toMatch(/Could not reach the server/);
  });

  it('falls back to a generic message for arbitrary Error instances', () => {
    const result = normalizeError(new Error('something broke'));
    expect(result.title).toBe('Error');
    expect(result.detail).toBe('Something went wrong. Please try again.');
  });

  it('falls back to a generic message for non-Error throwables', () => {
    expect(normalizeError(null).detail).toBe('Something went wrong. Please try again.');
    expect(normalizeError(undefined).status).toBe(0);
    expect(normalizeError('a string').title).toBe('Error');
    expect(normalizeError(42).status).toBe(0);
  });

  it('does not classify random objects as ProblemDetails', () => {
    const result = normalizeError({ ok: false });
    expect(result.type).toBe('about:blank');
    expect(result.status).toBe(0);
  });
});

describe('error-type guards', () => {
  const make = (type: string, status: number) =>
    normalizeError({ type, title: 't', status, detail: 'd' });

  it('identifies auth-expired by 401', () => {
    expect(isAuthExpiredError(make('about:blank', 401))).toBe(true);
    expect(isAuthExpiredError(make('about:blank', 403))).toBe(false);
  });

  it('identifies forbidden by status or by slug', () => {
    expect(isForbiddenError(make('about:blank', 403))).toBe(true);
    expect(isForbiddenError(make('https://problems.api/forbidden', 200))).toBe(true);
    expect(isForbiddenError(make('about:blank', 404))).toBe(false);
  });

  it('identifies upload-in-progress only by the document-set-delete-blocked slug', () => {
    expect(
      isUploadInProgressError(make('https://problems.api/document-set-delete-blocked', 409)),
    ).toBe(true);
    expect(isUploadInProgressError(make('about:blank', 409))).toBe(false);
  });

  it('identifies share-already-exists only by its slug', () => {
    expect(
      isShareAlreadyExistsError(make('https://problems.api/share-already-exists', 409)),
    ).toBe(true);
    expect(isShareAlreadyExistsError(make('about:blank', 409))).toBe(false);
  });
});
