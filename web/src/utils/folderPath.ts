// Walks a dropped folder's relative path against the live folder tree,
// creating any missing intermediate folders via `createMissing(...)`, and
// returns the leaf folderId for the file's POST /documents call.
//
// `relativePath` is the file path relative to the dropped/picked root,
// e.g. "Contracts/2026/brief.pdf". The trailing segment (the file name)
// is consumed by the caller, not here — we only walk directory segments.
//
// Spec 3.4.5; consumed by features/upload/.

import type { FolderTreeNode } from '@shared/types';

export interface ResolveTargetFolderArgs {
  /**
   * Path relative to the upload root, separated by `/`. Includes the file
   * name as the final segment — directory walking strips it before
   * resolving folders. May be empty when uploading directly to the active
   * folder (no folder structure carried).
   */
  relativePath: string;
  /** The folder the user dropped into (`null` = collection root). */
  rootFolderId: string | null;
  /** Live folder tree from `GET /folders`. */
  tree: FolderTreeNode[];
  /** Creates a folder by name under `parentId` and returns the new folderId. */
  createMissing: (parentId: string | null, name: string) => Promise<string>;
}

/**
 * Splits a path into directory segments, dropping the final file-name
 * segment, leading slashes, and `.` / `..` parts. Empty arrays are valid
 * (file at the dropped root).
 */
const directorySegments = (relativePath: string): string[] => {
  const trimmed = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (trimmed.length === 0) return [];
  const segments = trimmed.split('/');
  // Drop the file name (the last segment) — we only walk directories.
  segments.pop();
  return segments.filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
};

const findChildByName = (
  nodes: FolderTreeNode[],
  parentId: string | null,
  name: string,
): FolderTreeNode | undefined => {
  if (parentId === null) {
    return nodes.find((node) => node.name === name);
  }
  // BFS for the parent, then look at its children.
  const stack: FolderTreeNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.folderId === parentId) {
      return node.children.find((child) => child.name === name);
    }
    stack.push(...node.children);
  }
  return undefined;
};

export const resolveTargetFolderId = async (
  args: ResolveTargetFolderArgs,
): Promise<string | null> => {
  const segments = directorySegments(args.relativePath);
  if (segments.length === 0) return args.rootFolderId;

  let parentId: string | null = args.rootFolderId;
  for (const segment of segments) {
    const existing = findChildByName(args.tree, parentId, segment);
    if (existing) {
      parentId = existing.folderId;
    } else {
      // Mutating the tree in place keeps `findChildByName` consistent for
      // sibling files in the same drop that share an intermediate folder.
      const newId = await args.createMissing(parentId, segment);
      const newNode: FolderTreeNode = {
        folderId: newId,
        parentFolderId: parentId,
        name: segment,
        children: [],
      };
      if (parentId === null) {
        args.tree.push(newNode);
      } else {
        const parent = findNodeById(args.tree, parentId);
        if (parent) parent.children.push(newNode);
      }
      parentId = newId;
    }
  }
  return parentId;
};

const findNodeById = (
  nodes: FolderTreeNode[],
  folderId: string,
): FolderTreeNode | undefined => {
  const stack: FolderTreeNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.folderId === folderId) return node;
    stack.push(...node.children);
  }
  return undefined;
};
