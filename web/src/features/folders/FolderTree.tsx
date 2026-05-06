import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  FolderAggregateStatus,
  FolderTreeNode as FolderTreeNodeData,
} from '@shared/types';
import { Folder, FolderOpen, CaretRight, Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Pill } from '../../components/Pill';
import { useToast } from '../../hooks/useToast';
import { useFolderTree, useCreateFolder, useRenameFolder, useMoveFolder, useDeleteFolder } from './queries';
import { useFolderTreeState } from './state';
import { DeleteFolderModal } from './DeleteFolderModal';
import styles from './FolderTree.module.css';

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

const collectDescendantIds = (nodes: FolderTreeNodeData[], targetId: string): Set<string> => {
  const result = new Set<string>();
  const collectAll = (list: FolderTreeNodeData[]): void => {
    for (const node of list) {
      result.add(node.folderId);
      collectAll(node.children);
    }
  };
  const findAndCollect = (list: FolderTreeNodeData[]): boolean => {
    for (const node of list) {
      if (node.folderId === targetId) {
        collectAll(node.children);
        return true;
      }
      if (findAndCollect(node.children)) return true;
    }
    return false;
  };
  findAndCollect(nodes);
  result.add(targetId); // a folder cannot be dropped on itself
  return result;
};

const collectAncestorIds = (nodes: FolderTreeNodeData[], targetId: string): string[] => {
  const find = (list: FolderTreeNodeData[], ancestors: string[]): string[] | null => {
    for (const node of list) {
      if (node.folderId === targetId) return ancestors;
      const found = find(node.children, [...ancestors, node.folderId]);
      if (found !== null) return found;
    }
    return null;
  };
  return find(nodes, []) ?? [];
};

// ---------------------------------------------------------------------------
// Public handle
// ---------------------------------------------------------------------------

export interface FolderTreeHandle {
  /** Expands all ancestors of folderId so the node becomes visible. */
  revealFolder: (folderId: string) => void;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FolderTreeProps {
  documentSetId: string;
  activeFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  isReadOnly: boolean;
  /**
   * Per-folder aggregate status (spec 3.5.2). Optional — when omitted no
   * pills are rendered. Keys: `null` = root, otherwise folderId.
   */
  aggregateStatuses?: Map<string | null, FolderAggregateStatus>;
  /** Called when a folder's failure pill is clicked. Spec 3.6.2. */
  onFailureBadgeClick?: (folderId: string | null) => void;
}

const aggregatePillFor = (
  status: FolderAggregateStatus,
): { tone: 'info' | 'warning' | 'error' | 'success' | 'neutral'; label: string } | null => {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'indexing':
      return { tone: 'info', label: `Indexing ${status.ready}/${status.total}` };
    case 'indexed-fading':
      return { tone: 'success', label: 'Indexed' };
    case 'has-failures':
      return {
        tone: 'error',
        label: `${status.failed} failed${status.skipped > 0 ? ` · ${status.skipped} skipped` : ''}`,
      };
    case 'has-skips':
      return { tone: 'warning', label: `${status.skipped} skipped` };
  }
};

// ---------------------------------------------------------------------------
// Private sub-component — single tree node
// ---------------------------------------------------------------------------

interface NodeProps {
  node: FolderTreeNodeData;
  depth: number;
  documentSetId: string;
  activeFolderId: string | null;
  expandedIds: string[];
  renamingFolderId: string | null;
  renamingValue: string;
  draggingFolderId: string | null;
  dragInvalidIds: Set<string>;
  dragOverFolderId: string | null;
  isReadOnly: boolean;
  aggregateStatuses?: Map<string | null, FolderAggregateStatus>;
  onSelect: (folderId: string) => void;
  onToggleExpand: (folderId: string, isExpanded: boolean) => void;
  onRenameStart: (folderId: string, currentName: string) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteRequest: (folderId: string, name: string) => void;
  onDragStart: (folderId: string) => void;
  onDragEnd: () => void;
  onDragOver: (folderId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (targetFolderId: string) => void;
  onFailureBadgeClick?: (folderId: string | null) => void;
}

const FolderTreeNodeBase = ({
  node,
  depth,
  documentSetId,
  activeFolderId,
  expandedIds,
  renamingFolderId,
  renamingValue,
  draggingFolderId,
  dragInvalidIds,
  dragOverFolderId,
  isReadOnly,
  aggregateStatuses,
  onSelect,
  onToggleExpand,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDeleteRequest,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onFailureBadgeClick,
}: NodeProps) => {
  const isExpanded = expandedIds.includes(node.folderId);
  const isActive = activeFolderId === node.folderId;
  const isRenaming = renamingFolderId === node.folderId;
  const isDragging = draggingFolderId === node.folderId;
  const isInvalidTarget = dragInvalidIds.has(node.folderId);
  const isDragTarget = dragOverFolderId === node.folderId && !isInvalidTarget;
  const hasChildren = node.children.length > 0;
  const aggregateStatus = aggregateStatuses?.get(node.folderId) ?? null;
  const aggregatePill = aggregateStatus ? aggregatePillFor(aggregateStatus) : null;

  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onRenameSubmit();
    } else if (event.key === 'Escape') {
      onRenameCancel();
    }
  };

  return (
    <li
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={depth + 1}
      className={[
        styles.treeItem,
        isActive ? styles.treeItemActive : '',
        isDragging ? styles.treeItemDragging : '',
        isDragTarget ? styles.treeItemDragTarget : '',
        isInvalidTarget && draggingFolderId ? styles.treeItemDragInvalid : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={styles.treeRow}
        style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
        draggable={!isReadOnly}
        onDragStart={() => onDragStart(node.folderId)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOver(node.folderId, event)}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(node.folderId);
        }}
      >
        <button
          type="button"
          className={styles.expandToggle}
          aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-hidden={!hasChildren}
          tabIndex={hasChildren ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand(node.folderId, isExpanded);
          }}
        >
          <CaretRight
            size={12}
            className={[styles.caret, isExpanded ? styles.caretExpanded : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          />
        </button>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            aria-label={`Rename ${node.name}`}
            value={renamingValue}
            onChange={(event) => onRenameChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onRenameSubmit}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={styles.folderButton}
            onClick={() => onSelect(node.folderId)}
            aria-current={isActive ? 'true' : undefined}
            // Surfaces the full name on hover when the row truncates with
            // text-overflow: ellipsis.
            title={node.name}
          >
            <span className={styles.folderIcon} aria-hidden>
              {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
            </span>
            <span className={styles.folderName}>{node.name}</span>
          </button>
        )}

        {aggregatePill && !isRenaming && (
          aggregateStatus?.kind === 'has-failures' && onFailureBadgeClick ? (
            <button
              type="button"
              className={styles.aggregateBadgeButton}
              onClick={(event) => {
                event.stopPropagation();
                onFailureBadgeClick(node.folderId);
              }}
              aria-label={`Open issues for ${node.name}`}
            >
              <Pill tone={aggregatePill.tone} label={aggregatePill.label} />
            </button>
          ) : (
            <span className={styles.aggregateBadge}>
              <Pill tone={aggregatePill.tone} label={aggregatePill.label} />
            </span>
          )
        )}

        {!isReadOnly && !isRenaming && (
          <span className={styles.rowActions} aria-label={`Actions for ${node.name}`}>
            <button
              type="button"
              className={styles.rowAction}
              aria-label={`Rename ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRenameStart(node.folderId, node.name);
              }}
            >
              <PencilSimple size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.rowAction}
              aria-label={`Delete ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteRequest(node.folderId, node.name);
              }}
            >
              <Trash size={14} aria-hidden />
            </button>
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <ul role="group" className={styles.childList}>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.folderId}
              node={child}
              depth={depth + 1}
              documentSetId={documentSetId}
              activeFolderId={activeFolderId}
              expandedIds={expandedIds}
              renamingFolderId={renamingFolderId}
              renamingValue={renamingValue}
              draggingFolderId={draggingFolderId}
              dragInvalidIds={dragInvalidIds}
              dragOverFolderId={dragOverFolderId}
              isReadOnly={isReadOnly}
              aggregateStatuses={aggregateStatuses}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onRenameStart={onRenameStart}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onDeleteRequest={onDeleteRequest}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onFailureBadgeClick={onFailureBadgeClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
const FolderTreeNode = memo(FolderTreeNodeBase);

// ---------------------------------------------------------------------------
// Inline create-folder input
// ---------------------------------------------------------------------------

interface CreateRowProps {
  parentFolderId: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

const CreateFolderRow = ({ parentFolderId: _parentFolderId, onSubmit, onCancel }: CreateRowProps) => {
  const [name, setName] = useState('');
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (name.trim()) onSubmit(name.trim());
    } else if (event.key === 'Escape') {
      onCancel();
    }
  };
  return (
    <li className={styles.createRow} role="none">
      <input
        className={styles.createInput}
        aria-label="New folder name"
        placeholder="Folder name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (name.trim()) onSubmit(name.trim());
          else onCancel();
        }}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
    </li>
  );
};

// ---------------------------------------------------------------------------
// FolderTree (exported)
// ---------------------------------------------------------------------------

export const FolderTree = forwardRef<FolderTreeHandle, FolderTreeProps>(
  (
    {
      documentSetId,
      activeFolderId,
      onFolderSelect,
      isReadOnly,
      aggregateStatuses,
      onFailureBadgeClick,
    },
    ref,
  ) => {
    const { data: treeData, isLoading, isError } = useFolderTree(documentSetId);
    const [treeState, dispatchTree] = useFolderTreeState(documentSetId);

    const createMutation = useCreateFolder();
    const renameMutation = useRenameFolder();
    const moveMutation = useMoveFolder();
    const deleteMutation = useDeleteFolder();
    const { push: pushToast } = useToast();

    // Inline-rename state
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const [renamingValue, setRenamingValue] = useState('');

    // Inline-create state: null = not creating; string | null = parentFolderId
    const [creatingUnder, setCreatingUnder] = useState<{ parentFolderId: string | null } | null>(
      null,
    );

    // Delete-confirm state
    const [deletingFolder, setDeletingFolder] = useState<{ folderId: string; name: string } | null>(
      null,
    );

    // DnD state
    const dragInvalidIdsRef = useRef<Set<string>>(new Set());
    const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

    // Imperative handle
    useImperativeHandle(
      ref,
      () => ({
        revealFolder: (folderId: string) => {
          if (!treeData) return;
          const ancestors = collectAncestorIds(treeData.roots, folderId);
          if (ancestors.length > 0) {
            dispatchTree({ type: 'EXPAND_MANY', folderIds: ancestors });
          }
          dispatchTree({ type: 'EXPAND', folderId });
        },
      }),
      [treeData, dispatchTree],
    );

    // ------- handlers -------

    const handleToggleExpand = useCallback(
      (folderId: string, isExpanded: boolean) => {
        if (isExpanded) {
          dispatchTree({ type: 'COLLAPSE', folderId });
        } else {
          dispatchTree({ type: 'EXPAND', folderId });
        }
      },
      [dispatchTree],
    );

    const handleRenameStart = useCallback((folderId: string, currentName: string) => {
      setRenamingFolderId(folderId);
      setRenamingValue(currentName);
    }, []);

    const handleRenameSubmit = useCallback(() => {
      if (!renamingFolderId || !renamingValue.trim()) {
        setRenamingFolderId(null);
        return;
      }
      const trimmed = renamingValue.trim();
      setRenamingFolderId(null);
      renameMutation.mutate(
        { documentSetId, folderId: renamingFolderId, body: { name: trimmed } },
        {
          onError: (error) =>
            pushToast((error as Error).message ?? 'Could not rename folder.', 'error'),
        },
      );
    }, [renamingFolderId, renamingValue, documentSetId, renameMutation, pushToast]);

    const handleRenameCancel = useCallback(() => {
      setRenamingFolderId(null);
    }, []);

    const handleCreateSubmit = useCallback(
      (name: string) => {
        const parentFolderId = creatingUnder?.parentFolderId ?? null;
        setCreatingUnder(null);
        createMutation.mutate(
          { documentSetId, body: { name, parentFolderId } },
          {
            onError: (error) =>
              pushToast((error as Error).message ?? 'Could not create folder.', 'error'),
          },
        );
      },
      [creatingUnder, documentSetId, createMutation, pushToast],
    );

    const handleDragStart = useCallback(
      (folderId: string) => {
        setDraggingFolderId(folderId);
        dragInvalidIdsRef.current = collectDescendantIds(treeData?.roots ?? [], folderId);
      },
      [treeData],
    );

    const handleDragEnd = useCallback(() => {
      setDraggingFolderId(null);
      setDragOverFolderId(null);
      dragInvalidIdsRef.current = new Set();
    }, []);

    const handleDragOver = useCallback(
      (folderId: string, event: React.DragEvent<HTMLDivElement>) => {
        if (!dragInvalidIdsRef.current.has(folderId)) {
          event.preventDefault(); // allow drop
        }
        setDragOverFolderId(folderId);
      },
      [],
    );

    const handleDrop = useCallback(
      (targetFolderId: string) => {
        const sourceFolderId = draggingFolderId;
        // Capture before clearing — the cycle check needs the populated Set.
        const invalidIds = dragInvalidIdsRef.current;
        setDraggingFolderId(null);
        setDragOverFolderId(null);
        dragInvalidIdsRef.current = new Set();

        if (!sourceFolderId || invalidIds.has(targetFolderId)) return;

        // Wire contract: newParentFolderId is `string | null` (null = root).
        const newParentFolderId = targetFolderId === '__root__' ? null : targetFolderId;
        moveMutation.mutate(
          { documentSetId, folderId: sourceFolderId, body: { newParentFolderId } },
          {
            onError: (error) => {
              const msg = (error as Error).message;
              pushToast(
                msg?.includes('folder-move-cycle')
                  ? 'Cannot move a folder into its own descendant.'
                  : (msg ?? 'Could not move folder.'),
                'error',
              );
            },
          },
        );
      },
      [draggingFolderId, documentSetId, moveMutation, pushToast],
    );

    const handleDeleteConfirm = useCallback(() => {
      if (!deletingFolder) return;
      const { folderId } = deletingFolder;
      setDeletingFolder(null);
      deleteMutation.mutate(
        { documentSetId, folderId },
        {
          onSuccess: () => {
            if (activeFolderId === folderId) {
              onFolderSelect(null);
            }
          },
          onError: (error) =>
            pushToast((error as Error).message ?? 'Could not delete folder.', 'error'),
        },
      );
    }, [deletingFolder, documentSetId, deleteMutation, activeFolderId, onFolderSelect, pushToast]);

    const handleDeleteRequest = useCallback((folderId: string, name: string) => {
      setDeletingFolder({ folderId, name });
    }, []);

    // ------- render -------

    if (isLoading) {
      return (
        <nav aria-label="Folders" className={styles.tree}>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </nav>
      );
    }

    if (isError || !treeData) {
      return (
        <nav aria-label="Folders" className={styles.tree}>
          <p className={styles.errorMsg} role="alert">
            Could not load folders.
          </p>
        </nav>
      );
    }

    const roots = treeData.roots;
    const isEmpty = roots.length === 0 && !creatingUnder;

    const sharedNodeProps = {
      documentSetId,
      activeFolderId,
      expandedIds: treeState.expandedFolderIds,
      renamingFolderId,
      renamingValue,
      draggingFolderId,
      dragInvalidIds: dragInvalidIdsRef.current,
      dragOverFolderId,
      isReadOnly,
      aggregateStatuses,
      onSelect: onFolderSelect,
      onToggleExpand: handleToggleExpand,
      onRenameStart: handleRenameStart,
      onRenameChange: setRenamingValue,
      onRenameSubmit: handleRenameSubmit,
      onRenameCancel: handleRenameCancel,
      onDeleteRequest: handleDeleteRequest,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onFailureBadgeClick,
    };

    return (
      <>
        <nav aria-label="Folders" className={styles.tree}>
          {/* Root-level "All files" item */}
          <div className={styles.rootItemWrapper}>
            <button
              type="button"
              className={[
                styles.rootItem,
                activeFolderId === null ? styles.rootItemActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={activeFolderId === null ? 'true' : undefined}
              onDragOver={(event) => {
                if (draggingFolderId) {
                  event.preventDefault();
                  setDragOverFolderId('__root__');
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingFolderId) {
                  handleDrop('__root__');
                }
              }}
              onClick={() => onFolderSelect(null)}
            >
              <Folder size={16} aria-hidden />
              All files
            </button>
            {(() => {
              const rootStatus = aggregateStatuses?.get(null) ?? null;
              const pill = rootStatus ? aggregatePillFor(rootStatus) : null;
              if (!pill) return null;
              if (rootStatus?.kind === 'has-failures' && onFailureBadgeClick) {
                return (
                  <button
                    type="button"
                    className={styles.aggregateBadgeButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      onFailureBadgeClick(null);
                    }}
                    aria-label={`Open issues for All files`}
                  >
                    <Pill tone={pill.tone} label={pill.label} />
                  </button>
                );
              }
              return (
                <span className={styles.aggregateBadge}>
                  <Pill tone={pill.tone} label={pill.label} />
                </span>
              );
            })()}
          </div>

          {isEmpty ? (
            <EmptyState
              title="No folders yet"
              body={isReadOnly ? '' : "Click '+' to create a folder."}
            />
          ) : (
            <ul
              role="tree"
              aria-label="Folder tree"
              className={styles.rootList}
            >
              {roots.map((node) => (
                <FolderTreeNode key={node.folderId} node={node} depth={0} {...sharedNodeProps} />
              ))}
              {creatingUnder?.parentFolderId === null && (
                <CreateFolderRow
                  parentFolderId={null}
                  onSubmit={handleCreateSubmit}
                  onCancel={() => setCreatingUnder(null)}
                />
              )}
            </ul>
          )}

          {!isReadOnly && (
            <button
              type="button"
              className={styles.addRootFolderBtn}
              aria-label="Create folder at root level"
              onClick={() => setCreatingUnder({ parentFolderId: null })}
            >
              <Plus size={14} aria-hidden />
              New folder
            </button>
          )}
        </nav>

        <DeleteFolderModal
          isOpen={deletingFolder !== null}
          folderName={deletingFolder?.name ?? ''}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingFolder(null)}
        />
      </>
    );
  },
);

FolderTree.displayName = 'FolderTree';
