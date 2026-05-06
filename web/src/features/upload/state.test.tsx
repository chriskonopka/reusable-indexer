import type { UploadFile, UploadSessionState } from '@shared/types';
import {
  __INITIAL_UPLOAD_STATE__,
  isUploadFinished,
  isUploadInFlight,
  severityFromStatus,
  uploadReducer,
} from './state';

// Synthetic File stand-in. The reducer never inspects the File object —
// it only carries it through. Building actual `new File(...)` instances
// here causes jest-matcher-utils to trip on Node's DOMException-bound
// internal slots when it pretty-prints state for assertions.
const fakeFile = (name: string): File =>
  ({ name, type: 'application/pdf', size: 1 } as unknown as File);

const buildFile = (overrides: Partial<UploadFile> = {}): UploadFile => ({
  clientId: overrides.clientId ?? 'cid',
  file: fakeFile(overrides.relativePath ?? 'a.pdf'),
  relativePath: 'a.pdf',
  targetFolderId: null,
  status: 'Queued',
  documentId: null,
  failureReason: null,
  severity: null,
  retryable: false,
  ...overrides,
});

const seedState = (
  patch: Partial<UploadSessionState> = {},
): UploadSessionState => ({ ...__INITIAL_UPLOAD_STATE__, ...patch });

describe('uploadReducer', () => {
  it('starts a session with the supplied files', () => {
    const next = uploadReducer(seedState(), {
      type: 'START_SESSION',
      targetDocumentSetId: 'ds',
      files: [buildFile({ clientId: 'a' })],
    });
    expect(next.targetDocumentSetId).toBe('ds');
    expect(next.files).toHaveLength(1);
    expect(next.aggregateStatus).toBe('Pending');
  });

  it('Idle when start session has no files', () => {
    const next = uploadReducer(seedState(), {
      type: 'START_SESSION',
      targetDocumentSetId: 'ds',
      files: [],
    });
    expect(next.aggregateStatus).toBe('Idle');
  });

  it('appends files without resetting batchId', () => {
    const next = uploadReducer(
      seedState({ batchId: 'b', files: [buildFile({ clientId: 'a' })] }),
      { type: 'APPEND_FILES', files: [buildFile({ clientId: 'b' })] },
    );
    expect(next.files.map((file) => file.clientId)).toEqual(['a', 'b']);
    expect(next.batchId).toBe('b');
  });

  it('PATCH_FILE rewrites only the matching row', () => {
    const next = uploadReducer(
      seedState({
        files: [buildFile({ clientId: 'a' }), buildFile({ clientId: 'b' })],
      }),
      {
        type: 'PATCH_FILE',
        clientId: 'a',
        patch: { status: 'Indexed', documentId: 'doc-a' },
      },
    );
    expect(next.files[0].status).toBe('Indexed');
    expect(next.files[1].status).toBe('Queued');
  });

  it('PATCH_FILE returns the same state when the clientId is unknown', () => {
    const start = seedState({ files: [buildFile({ clientId: 'a' })] });
    const next = uploadReducer(start, {
      type: 'PATCH_FILE',
      clientId: 'missing',
      patch: { status: 'Indexed' },
    });
    expect(next).toBe(start);
  });

  it('PATCH_FILES updates many rows in one go', () => {
    const next = uploadReducer(
      seedState({
        files: [buildFile({ clientId: 'a' }), buildFile({ clientId: 'b' })],
      }),
      {
        type: 'PATCH_FILES',
        entries: [
          { clientId: 'a', patch: { status: 'Indexing' } },
          { clientId: 'b', patch: { status: 'Failed', severity: 'Fail' } },
        ],
      },
    );
    expect(next.files[0].status).toBe('Indexing');
    expect(next.files[1].status).toBe('Failed');
    expect(next.files[1].severity).toBe('Fail');
  });

  it('DISMISS_FILE drops a single row', () => {
    const next = uploadReducer(
      seedState({ files: [buildFile({ clientId: 'a' }), buildFile({ clientId: 'b' })] }),
      { type: 'DISMISS_FILE', clientId: 'a' },
    );
    expect(next.files.map((file) => file.clientId)).toEqual(['b']);
  });

  it('DISMISS_FAILURES drops all failed/skipped/duplicate rows', () => {
    const next = uploadReducer(
      seedState({
        files: [
          buildFile({ clientId: 'ok', status: 'Indexed' }),
          buildFile({ clientId: 'fail', status: 'Failed', severity: 'Fail' }),
          buildFile({ clientId: 'dup', status: 'Duplicate', severity: 'Skip' }),
          buildFile({ clientId: 'unsup', status: 'Unsupported', severity: 'Skip' }),
        ],
      }),
      { type: 'DISMISS_FAILURES' },
    );
    expect(next.files.map((file) => file.clientId)).toEqual(['ok']);
  });

  it('TOGGLE_BANNER flips bannerExpanded', () => {
    const next1 = uploadReducer(seedState({ bannerExpanded: false }), {
      type: 'TOGGLE_BANNER',
    });
    expect(next1.bannerExpanded).toBe(true);
    const next2 = uploadReducer(next1, { type: 'TOGGLE_BANNER' });
    expect(next2.bannerExpanded).toBe(false);
  });

  it('SET_BANNER sets the explicit value', () => {
    const next = uploadReducer(seedState({ bannerExpanded: false }), {
      type: 'SET_BANNER',
      expanded: true,
    });
    expect(next.bannerExpanded).toBe(true);
  });

  it('CLEAR_SESSION resets but preserves bannerExpanded', () => {
    const next = uploadReducer(
      seedState({
        files: [buildFile({ clientId: 'a' })],
        batchId: 'b',
        targetDocumentSetId: 'ds',
        bannerExpanded: true,
      }),
      { type: 'CLEAR_SESSION' },
    );
    expect(next.files).toHaveLength(0);
    expect(next.batchId).toBeNull();
    expect(next.targetDocumentSetId).toBe('');
    expect(next.bannerExpanded).toBe(true);
  });

  it('SET_AGGREGATE swaps the aggregateStatus field', () => {
    const next = uploadReducer(seedState({ aggregateStatus: 'Pending' }), {
      type: 'SET_AGGREGATE',
      status: 'CompletedWithErrors',
    });
    expect(next.aggregateStatus).toBe('CompletedWithErrors');
  });

  it('SET_BATCH_ID stores the batchId', () => {
    const next = uploadReducer(seedState(), {
      type: 'SET_BATCH_ID',
      batchId: 'b1',
    });
    expect(next.batchId).toBe('b1');
  });
});

describe('helpers', () => {
  it('severityFromStatus maps statuses to a tone', () => {
    expect(severityFromStatus('Failed')).toBe('Fail');
    expect(severityFromStatus('Unsupported')).toBe('Skip');
    expect(severityFromStatus('Duplicate')).toBe('Skip');
    expect(severityFromStatus('Indexed')).toBeNull();
  });

  it('isUploadFinished is true only for terminal statuses', () => {
    expect(isUploadFinished('Completed')).toBe(true);
    expect(isUploadFinished('CompletedWithErrors')).toBe(true);
    expect(isUploadFinished('Failed')).toBe(true);
    expect(isUploadFinished('Pending')).toBe(false);
    expect(isUploadFinished('Idle')).toBe(false);
  });

  it('isUploadInFlight catches Pending and InProgress', () => {
    expect(isUploadInFlight('Pending')).toBe(true);
    expect(isUploadInFlight('InProgress')).toBe(true);
    expect(isUploadInFlight('Idle')).toBe(false);
    expect(isUploadInFlight('Completed')).toBe(false);
  });
});
