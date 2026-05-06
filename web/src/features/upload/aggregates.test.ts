import type { UploadFile } from '@shared/types';
import {
  computeFolderAggregates,
  computeTotals,
  inProgressByFileName,
  isStatusTerminal,
  mapWireStatus,
} from './aggregates';

const file = (overrides: Partial<UploadFile>): UploadFile => ({
  clientId: overrides.clientId ?? 'cid',
  file: new File(['x'], overrides.relativePath?.split('/').pop() ?? 'a.pdf', {
    type: 'application/pdf',
  }),
  relativePath: overrides.relativePath ?? 'a.pdf',
  targetFolderId: overrides.targetFolderId ?? null,
  status: overrides.status ?? 'Queued',
  documentId: overrides.documentId ?? null,
  failureReason: overrides.failureReason ?? null,
  severity: overrides.severity ?? null,
  retryable: overrides.retryable ?? false,
});

describe('computeTotals', () => {
  it('counts ready / failed / skipped', () => {
    const totals = computeTotals([
      file({ clientId: '1', status: 'Indexed' }),
      file({ clientId: '2', status: 'Failed', severity: 'Fail' }),
      file({ clientId: '3', status: 'Unsupported', severity: 'Skip' }),
      file({ clientId: '4', status: 'Duplicate', severity: 'Skip' }),
      file({ clientId: '5', status: 'Indexing' }),
    ]);
    expect(totals).toEqual({ total: 5, indexed: 1, failed: 1, skipped: 2 });
  });
});

describe('computeFolderAggregates', () => {
  it('groups files by folderId and computes per-folder kind', () => {
    const aggregates = computeFolderAggregates([
      file({ clientId: 'a', targetFolderId: 'f1', status: 'Indexed' }),
      file({ clientId: 'b', targetFolderId: 'f1', status: 'Indexing' }),
      file({ clientId: 'c', targetFolderId: 'f2', status: 'Failed', severity: 'Fail' }),
      file({ clientId: 'd', targetFolderId: null, status: 'Indexed' }),
    ]);
    expect(aggregates.get('f1')?.kind).toBe('indexing');
    expect(aggregates.get('f1')?.ready).toBe(1);
    expect(aggregates.get('f1')?.total).toBe(2);
    expect(aggregates.get('f2')?.kind).toBe('has-failures');
    expect(aggregates.get(null)?.kind).toBe('indexed-fading');
  });

  it('reports has-skips for folders where the only outstanding rows are skips', () => {
    const aggregates = computeFolderAggregates([
      file({ clientId: 'a', targetFolderId: 'f1', status: 'Indexed' }),
      file({ clientId: 'b', targetFolderId: 'f1', status: 'Unsupported', severity: 'Skip' }),
    ]);
    expect(aggregates.get('f1')?.kind).toBe('has-skips');
  });
});

describe('inProgressByFileName', () => {
  it('keys non-indexed rows by lowercased file name within a folder', () => {
    const map = inProgressByFileName(
      [
        file({ clientId: '1', targetFolderId: 'f1', relativePath: 'A.pdf', status: 'Uploading' }),
        file({ clientId: '2', targetFolderId: 'f1', relativePath: 'b.pdf', status: 'Indexed', documentId: 'd' }),
        file({ clientId: '3', targetFolderId: 'f2', relativePath: 'c.pdf', status: 'Queued' }),
      ],
      'f1',
    );
    expect(map.size).toBe(1);
    expect(map.has('a.pdf')).toBe(true);
  });
});

describe('isStatusTerminal', () => {
  it.each([
    ['Indexed', true],
    ['Failed', true],
    ['Unsupported', true],
    ['Duplicate', true],
    ['Queued', false],
    ['Uploading', false],
    ['Submitted', false],
    ['Indexing', false],
  ] as const)('treats %s as terminal=%s', (status, expected) => {
    expect(isStatusTerminal(status)).toBe(expected);
  });
});

describe('mapWireStatus', () => {
  it('maps 4 wire states to client statuses', () => {
    expect(mapWireStatus('Pending')).toBe('Submitted');
    expect(mapWireStatus('Indexing')).toBe('Indexing');
    expect(mapWireStatus('Ready')).toBe('Indexed');
    expect(mapWireStatus('Failed')).toBe('Failed');
  });
});
