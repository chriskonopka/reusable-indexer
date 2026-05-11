// Custom MIME types used to signal which kind of object is being dragged
// between sibling features. The FileList drags documents; the FolderTree
// drags folders. The FolderTree's drop handler reads these to decide which
// mutation to fire (moveDocument vs moveFolder).
//
// Keeping the two kinds in distinct MIME types — rather than a single
// 'application/x-mws-drag' with a discriminator inside — lets the receiver
// detect which kind is in flight via `dataTransfer.types.includes(...)`
// during `dragover`, where the payload is not yet readable.

export const DND_MIME_DOCUMENT_ID = 'application/x-mws-document-id';
export const DND_MIME_FOLDER_ID = 'application/x-mws-folder-id';

/**
 * Companion MIME carrying the source folder id of a document being dragged.
 * Value is the folder id, or the literal `__root__` sentinel when the
 * document is at the document-set root.
 *
 * Encoded into `dataTransfer` so the drop handler can invalidate the source
 * folder's contents query without needing to look up the document's current
 * folder from the metadata cache (which would race with the move).
 */
export const DND_MIME_DOCUMENT_SOURCE_FOLDER = 'application/x-mws-document-source-folder';
export const DND_ROOT_FOLDER_SENTINEL = '__root__';
