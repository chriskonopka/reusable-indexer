import { FormEvent, useCallback, useMemo, useState } from 'react';
import type { DocumentSetSummary } from '@shared/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { Pill } from '../../components/Pill';
import { useToast } from '../../hooks/useToast';
import { useActiveDocumentSet } from './state';
import {
  useCreateDocumentSet,
  useDeleteDocumentSet,
  useDocumentSetsList,
  useRenameDocumentSet,
} from './queries';
import { ApiClientError } from '../../api/client';
import { ShareDialog } from './ShareDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import styles from './CollectionsSidebar.module.css';

interface CollectionsSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /**
   * Fires after every row click that resolves to a collection selection
   * (skipping no-ops like in-place rename).
   * RootShell uses this to auto-dismiss the mobile sidebar overlay even
   * when the clicked row is already the active one.
   */
  onAfterCollectionSelect?: () => void;
}

const sortByUpdatedAtDesc = (
  a: DocumentSetSummary,
  b: DocumentSetSummary,
): number => b.updatedAt.localeCompare(a.updatedAt);

const nextDefaultName = (existing: ReadonlyArray<DocumentSetSummary>): string => {
  const taken = new Set(existing.map((row) => row.name));
  if (!taken.has('New collection')) return 'New collection';
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `New collection ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `New collection ${Date.now()}`;
};

export const CollectionsSidebar = ({
  collapsed,
  onToggleCollapse,
  onAfterCollectionSelect,
}: CollectionsSidebarProps) => {
  const { data, isLoading, isError } = useDocumentSetsList();
  const create = useCreateDocumentSet();
  const rename = useRenameDocumentSet();
  const remove = useDeleteDocumentSet();
  const { documentSetId: activeId, select } = useActiveDocumentSet();
  const toast = useToast();

  const [renameTarget, setRenameTarget] = useState<{ id: string; value: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSetSummary | null>(null);
  const [shareTarget, setShareTarget] = useState<DocumentSetSummary | null>(null);

  const items = useMemo(
    () => data?.items.slice().sort(sortByUpdatedAtDesc) ?? [],
    [data],
  );

  const onCreate = useCallback(async () => {
    const name = nextDefaultName(items);
    try {
      const created = await create.mutateAsync({ name });
      // Auto-select and put the row into rename mode. Pass accessRole as
      // fallback because the list query cache hasn't refetched yet.
      select(created.documentSetId, created.accessRole);
      setRenameTarget({ id: created.documentSetId, value: created.name });
    } catch (error) {
      const detail =
        error instanceof ApiClientError ? error.normalized.detail : 'Could not create collection.';
      toast.push(detail, 'error');
    }
  }, [create, items, select, toast]);

  const onClickRow = useCallback(
    (row: DocumentSetSummary) => {
      if (renameTarget?.id === row.documentSetId) return;
      // Cross-collection navigation during upload is allowed. The upload
      // controller pins its poll / /complete / cache invalidation to the
      // upload's source collection (state.targetDocumentSetId), so switching
      // away does not break the in-flight batch. Starting a new upload in
      // another collection is still blocked, but that guard lives in
      // useUploadController.acceptDrop — not here.
      select(row.documentSetId);
      onAfterCollectionSelect?.();
    },
    [renameTarget, select, onAfterCollectionSelect],
  );

  const onSubmitRename = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!renameTarget) return;
      const trimmed = renameTarget.value.trim();
      const original = items.find((row) => row.documentSetId === renameTarget.id);
      if (!original || trimmed.length === 0 || trimmed === original.name) {
        setRenameTarget(null);
        return;
      }
      const previousValue = original.name;
      try {
        await rename.mutateAsync({ documentSetId: renameTarget.id, body: { name: trimmed } });
        setRenameTarget(null);
      } catch (error) {
        const detail =
          error instanceof ApiClientError
            ? error.normalized.detail
            : `Could not rename "${previousValue}".`;
        toast.push(detail, 'error');
        setRenameTarget(null);
      }
    },
    [items, rename, renameTarget, toast],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.documentSetId);
      if (activeId === deleteTarget.documentSetId) {
        select(null);
      }
    } catch (error) {
      const detail =
        error instanceof ApiClientError
          ? error.normalized.detail
          : 'Could not delete collection.';
      toast.push(detail, 'error');
    } finally {
      setDeleteTarget(null);
    }
  }, [activeId, deleteTarget, remove, select, toast]);

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      aria-label="Collections"
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Collections</h2>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand collections sidebar' : 'Collapse collections sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.newButtonRow}>
          <Button onClick={onCreate} loading={create.isPending}>
            New collection
          </Button>
        </div>
      )}

      <div className={styles.list}>
        {isLoading && (
          <div style={{ padding: '12px 16px' }}>
            <Skeleton variant="row" ariaLabel="Loading collections" />
          </div>
        )}

        {isError && (
          <div className={styles.empty} role="alert">
            Could not load collections.
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            title="No collections yet"
            body="Click 'New collection' to get started."
          />
        )}

        {items.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((row) => {
              const isActive = activeId === row.documentSetId;
              const isOwner = row.accessRole === 'Owner';
              const isRenaming = renameTarget?.id === row.documentSetId;
              return (
                <li
                  key={row.documentSetId}
                  className={styles.row}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={onSubmitRename}
                      style={{ display: 'flex', flex: 1 }}
                    >
                      <input
                        aria-label={`Rename ${row.name}`}
                        // The rename affordance is invoked by an explicit
                        // user action (button click or Enter), so focusing
                        // the input is the expected UX — not surprise focus.
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className={styles.renameInput}
                        value={renameTarget.value}
                        onChange={(event) =>
                          setRenameTarget({
                            id: row.documentSetId,
                            value: event.target.value,
                          })
                        }
                        onBlur={(event) =>
                          onSubmitRename(
                            event as unknown as FormEvent<HTMLFormElement>,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setRenameTarget(null);
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={styles.rowName}
                      aria-label={row.name}
                      aria-current={isActive ? 'true' : undefined}
                      // Native tooltip surfaces the full name when the row
                      // truncates with text-overflow: ellipsis.
                      title={row.name}
                      onClick={() => onClickRow(row)}
                      onDoubleClick={(event) => {
                        if (!isOwner) return;
                        event.stopPropagation();
                        setRenameTarget({ id: row.documentSetId, value: row.name });
                      }}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        font: 'inherit',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {row.name}
                    </button>
                  )}

                  {!collapsed && !isRenaming && !isOwner && (
                    <Pill tone="info" label="Shared" />
                  )}

                  {!collapsed && !isRenaming && isOwner && (
                    <span className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Share ${row.name}`}
                        onClick={() => setShareTarget(row)}
                      >
                        ⇪
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Rename ${row.name}`}
                        onClick={() =>
                          setRenameTarget({
                            id: row.documentSetId,
                            value: row.name,
                          })
                        }
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Delete ${row.name}`}
                        onClick={() => setDeleteTarget(row)}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDeleteDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
        loading={remove.isPending}
      />

      <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />
    </aside>
  );
};
