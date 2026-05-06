import type { FolderTreeNode } from '@shared/types';
import { resolveTargetFolderId } from './folderPath';

const node = (
  folderId: string,
  name: string,
  parentFolderId: string | null,
  children: FolderTreeNode[] = [],
): FolderTreeNode => ({ folderId, name, parentFolderId, children });

describe('resolveTargetFolderId', () => {
  it('returns the rootFolderId when the path has no directory segments', async () => {
    const tree: FolderTreeNode[] = [];
    const createMissing = jest.fn();
    const result = await resolveTargetFolderId({
      relativePath: 'brief.pdf',
      rootFolderId: 'root-id',
      tree,
      createMissing,
    });
    expect(result).toBe('root-id');
    expect(createMissing).not.toHaveBeenCalled();
  });

  it('walks an existing chain without creating folders', async () => {
    const grandchild = node('GC', 'Q1', 'C');
    const child = node('C', '2026', null, [grandchild]);
    grandchild.parentFolderId = 'C';
    const tree: FolderTreeNode[] = [child];
    const createMissing = jest.fn();
    const result = await resolveTargetFolderId({
      relativePath: '2026/Q1/brief.pdf',
      rootFolderId: null,
      tree,
      createMissing,
    });
    expect(result).toBe('GC');
    expect(createMissing).not.toHaveBeenCalled();
  });

  it('creates missing folders and reuses created ones for sibling files', async () => {
    const tree: FolderTreeNode[] = [];
    const createMissing = jest
      .fn()
      .mockResolvedValueOnce('new-2026')
      .mockResolvedValueOnce('new-q1');

    const first = await resolveTargetFolderId({
      relativePath: '2026/Q1/brief.pdf',
      rootFolderId: null,
      tree,
      createMissing,
    });
    expect(first).toBe('new-q1');
    expect(createMissing).toHaveBeenCalledTimes(2);

    // Second sibling file in the same Q1 — must reuse, not re-create.
    const second = await resolveTargetFolderId({
      relativePath: '2026/Q1/exhibit.pdf',
      rootFolderId: null,
      tree,
      createMissing,
    });
    expect(second).toBe('new-q1');
    expect(createMissing).toHaveBeenCalledTimes(2);
  });

  it('walks under the rootFolderId when one is provided', async () => {
    const tree: FolderTreeNode[] = [node('R', 'Cases', null)];
    const createMissing = jest.fn().mockResolvedValueOnce('new-acme');
    const result = await resolveTargetFolderId({
      relativePath: 'Acme/contract.pdf',
      rootFolderId: 'R',
      tree,
      createMissing,
    });
    expect(result).toBe('new-acme');
    expect(createMissing).toHaveBeenCalledWith('R', 'Acme');
  });

  it('strips `.` and `..` segments and leading slashes', async () => {
    const tree: FolderTreeNode[] = [];
    const createMissing = jest.fn();
    const result = await resolveTargetFolderId({
      relativePath: '/./file.pdf',
      rootFolderId: null,
      tree,
      createMissing,
    });
    expect(result).toBeNull();
    expect(createMissing).not.toHaveBeenCalled();
  });

  it('handles backslash-separated paths from drag-drop on Windows', async () => {
    const tree: FolderTreeNode[] = [];
    const createMissing = jest.fn().mockResolvedValueOnce('a');
    const result = await resolveTargetFolderId({
      relativePath: 'A\\file.pdf',
      rootFolderId: null,
      tree,
      createMissing,
    });
    expect(result).toBe('a');
    expect(createMissing).toHaveBeenCalledWith(null, 'A');
  });
});
