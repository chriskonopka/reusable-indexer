import { act, renderHook } from '@testing-library/react';

// jest-axe is not used in this file: the reducer is a pure function and the
// useSelection hook tests use renderHook(), which produces no rendered DOM.
// Accessibility for the rendered checkbox/chip surfaces is covered by the
// FileList and FolderTree component tests.

import {
  SELECTION_CAP_PER_KIND,
  SelectionProvider,
  selectionReducer,
  useSelection,
  useSelectionState,
} from './state';
import type { SelectedDocument, SelectionState } from './state';

const emptyState: SelectionState = { documents: [], folders: [] };

const buildDocs = (count: number): SelectedDocument[] =>
  Array.from({ length: count }, (_, index) => ({
    documentId: `d-${index}`,
    fileName: `${index}.pdf`,
  }));

describe('selectionReducer', () => {
  it('SET_DOCUMENTS replaces the documents array', () => {
    const next = selectionReducer(emptyState, {
      type: 'SET_DOCUMENTS',
      documents: [{ documentId: 'd-1', fileName: 'a.pdf' }],
    });
    expect(next.documents).toEqual([{ documentId: 'd-1', fileName: 'a.pdf' }]);
    expect(next.folders).toEqual([]);
  });

  it('SET_DOCUMENTS clamps to the cap', () => {
    const tooMany = buildDocs(SELECTION_CAP_PER_KIND + 5);
    const next = selectionReducer(emptyState, {
      type: 'SET_DOCUMENTS',
      documents: tooMany,
    });
    expect(next.documents).toHaveLength(SELECTION_CAP_PER_KIND);
  });

  it('SET_DOCUMENTS returns the same state when the array is unchanged', () => {
    const start: SelectionState = {
      documents: [{ documentId: 'd-1', fileName: 'a.pdf' }],
      folders: [],
    };
    const next = selectionReducer(start, {
      type: 'SET_DOCUMENTS',
      documents: [{ documentId: 'd-1', fileName: 'a.pdf' }],
    });
    expect(next).toBe(start);
  });

  it('CLEAR resets both arrays', () => {
    const start: SelectionState = {
      documents: [{ documentId: 'd-1', fileName: 'a.pdf' }],
      folders: [{ folderId: 'f-1', folderName: 'Foo', path: 'Foo' }],
    };
    const next = selectionReducer(start, { type: 'CLEAR' });
    expect(next.documents).toEqual([]);
    expect(next.folders).toEqual([]);
  });

  it('CLEAR is a no-op when already empty', () => {
    const next = selectionReducer(emptyState, { type: 'CLEAR' });
    expect(next).toBe(emptyState);
  });
});

const wrapWithProvider =
  ({ children }: { children: React.ReactNode }) => (
    <SelectionProvider>{children}</SelectionProvider>
  );

describe('useSelection', () => {
  it('toggleDocument adds then removes', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });
    const doc = { documentId: 'd-1', fileName: 'a.pdf' };

    let outcome: 'added' | 'removed' | 'cap-reached' = 'cap-reached';
    act(() => {
      outcome = result.current.toggleDocument(doc);
    });
    expect(outcome).toBe('added');
    expect(result.current.state.documents).toEqual([doc]);

    act(() => {
      outcome = result.current.toggleDocument(doc);
    });
    expect(outcome).toBe('removed');
    expect(result.current.state.documents).toEqual([]);
  });

  it('toggleDocument returns cap-reached when full', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });
    const docs = buildDocs(SELECTION_CAP_PER_KIND);
    act(() => {
      // Fill the selection directly.
      docs.forEach((doc) => result.current.toggleDocument(doc));
    });
    expect(result.current.state.documents).toHaveLength(SELECTION_CAP_PER_KIND);
    let outcome: 'added' | 'removed' | 'cap-reached' = 'added';
    act(() => {
      outcome = result.current.toggleDocument({
        documentId: 'd-new',
        fileName: 'new.pdf',
      });
    });
    expect(outcome).toBe('cap-reached');
    expect(result.current.state.documents).toHaveLength(SELECTION_CAP_PER_KIND);
  });

  it('toggleFolder adds, removes, and respects the cap', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });
    const folder = { folderId: 'f-1', folderName: 'Foo', path: 'Foo' };

    let outcome: 'added' | 'removed' | 'cap-reached' = 'cap-reached';
    act(() => {
      outcome = result.current.toggleFolder(folder);
    });
    expect(outcome).toBe('added');
    expect(result.current.state.folders).toHaveLength(1);

    // Add to the cap with synthetic folders, then assert refusal.
    act(() => {
      for (let index = 1; index < SELECTION_CAP_PER_KIND; index += 1) {
        result.current.toggleFolder({
          folderId: `f-${index + 1}`,
          folderName: `F${index + 1}`,
          path: `F${index + 1}`,
        });
      }
    });
    expect(result.current.state.folders).toHaveLength(SELECTION_CAP_PER_KIND);
    act(() => {
      outcome = result.current.toggleFolder({
        folderId: 'f-over',
        folderName: 'Over',
        path: 'Over',
      });
    });
    expect(outcome).toBe('cap-reached');
  });

  it('setVisibleDocuments preserves selections outside the visible set', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });

    // Seed with two from different folders.
    act(() => {
      result.current.toggleDocument({ documentId: 'd-keep', fileName: 'keep.pdf' });
      result.current.toggleDocument({ documentId: 'd-replace', fileName: 'replace.pdf' });
    });

    // Visible folder shows only d-replace; "select all visible" then picks
    // d-replace + d-new — d-keep should survive untouched.
    act(() => {
      result.current.setVisibleDocuments(
        ['d-replace'],
        [
          { documentId: 'd-replace', fileName: 'replace.pdf' },
          { documentId: 'd-new', fileName: 'new.pdf' },
        ],
      );
    });

    expect(result.current.state.documents.map((doc) => doc.documentId)).toEqual([
      'd-keep',
      'd-replace',
      'd-new',
    ]);
  });

  it('setVisibleDocuments reports capReached when the merged set overflows', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });

    // Fill the selection to one short of the cap with non-visible docs.
    act(() => {
      buildDocs(SELECTION_CAP_PER_KIND - 1).forEach((doc) =>
        result.current.toggleDocument(doc),
      );
    });

    let report: { addedCount: number; capReached: boolean } = {
      addedCount: 0,
      capReached: false,
    };
    act(() => {
      report = result.current.setVisibleDocuments(
        ['v-1', 'v-2', 'v-3'],
        [
          { documentId: 'v-1', fileName: 'v1.pdf' },
          { documentId: 'v-2', fileName: 'v2.pdf' },
          { documentId: 'v-3', fileName: 'v3.pdf' },
        ],
      );
    });
    expect(report.capReached).toBe(true);
    expect(result.current.state.documents).toHaveLength(SELECTION_CAP_PER_KIND);
  });

  it('clear empties both arrays', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapWithProvider });
    act(() => {
      result.current.toggleDocument({ documentId: 'd-1', fileName: 'a.pdf' });
      result.current.toggleFolder({ folderId: 'f-1', folderName: 'Foo', path: 'Foo' });
    });
    act(() => result.current.clear());
    expect(result.current.state.documents).toEqual([]);
    expect(result.current.state.folders).toEqual([]);
  });

  it('useSelectionState mirrors the live state', () => {
    const { result } = renderHook(
      () => ({ api: useSelection(), state: useSelectionState() }),
      { wrapper: wrapWithProvider },
    );
    act(() => {
      result.current.api.toggleDocument({ documentId: 'd-1', fileName: 'a.pdf' });
    });
    expect(result.current.state.documents).toHaveLength(1);
  });
});
