// Client-side gate before POST /documents.
// Classifies a file as supported / unsupported / too-large / empty, mapping
// the wire allowlist (contract §2.4 in api-contracts.md) onto the
// FileTypeCode enum the API stores.
//
// The product spec (3.4.2) lists a broader set of extensions; the wire
// contract narrows to the ADI allowlist. Files outside the wire allowlist
// are surfaced as `Unsupported` (yellow Skip severity, spec 3.6.3) and
// never sent.

import type { FileTypeCode } from '@shared/types';

export type FileTypeClassification =
  | { kind: 'supported'; fileTypeCode: FileTypeCode; contentType: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'too-large'; reason: string }
  | { kind: 'empty'; reason: string };

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // matches API SupportedContentTypes.MaxFileSizeBytes (100 MB)

interface AllowlistEntry {
  contentType: string;
  fileTypeCode: FileTypeCode;
}

// Maps lowercased extensions to the contract's accepted MIME type and the
// default `FileTypeCode` we attach to the upload (the user can re-classify
// the document later via PATCH /documents).
const EXTENSION_ALLOWLIST: Record<string, AllowlistEntry> = {
  pdf: { contentType: 'application/pdf', fileTypeCode: 'Other' },
  jpg: { contentType: 'image/jpeg', fileTypeCode: 'Other' },
  jpeg: { contentType: 'image/jpeg', fileTypeCode: 'Other' },
  png: { contentType: 'image/png', fileTypeCode: 'Other' },
  bmp: { contentType: 'image/bmp', fileTypeCode: 'Other' },
  tif: { contentType: 'image/tiff', fileTypeCode: 'Other' },
  tiff: { contentType: 'image/tiff', fileTypeCode: 'Other' },
  heif: { contentType: 'image/heif', fileTypeCode: 'Other' },
  heic: { contentType: 'image/heif', fileTypeCode: 'Other' },
  docx: {
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileTypeCode: 'Other',
  },
  xlsx: {
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileTypeCode: 'Financial',
  },
  html: { contentType: 'text/html', fileTypeCode: 'Other' },
  htm: { contentType: 'text/html', fileTypeCode: 'Other' },

  // Plain-text formats — server-side ingestion was extended 2026-05-15.
  md: { contentType: 'text/markdown', fileTypeCode: 'Other' },
  txt: { contentType: 'text/plain', fileTypeCode: 'Other' },
  log: { contentType: 'text/plain', fileTypeCode: 'Other' },
  rtf: { contentType: 'application/rtf', fileTypeCode: 'Other' },

  // Legacy Office (pre-OOXML). xls inherits the Financial default to
  // stay aligned with xlsx. PowerPoint (.ppt / .pptx) is intentionally
  // excluded — server-side ingestion does not currently extract them.
  doc: { contentType: 'application/msword', fileTypeCode: 'Other' },
  xls: { contentType: 'application/vnd.ms-excel', fileTypeCode: 'Financial' },
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
};

export const classify = (file: {
  name: string;
  type: string;
  size: number;
}): FileTypeClassification => {
  if (file.size === 0) {
    return { kind: 'empty', reason: 'Empty file.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { kind: 'too-large', reason: 'File too large — 100 MB max.' };
  }

  const ext = extensionOf(file.name);
  const entry = EXTENSION_ALLOWLIST[ext];
  if (!entry) {
    return {
      kind: 'unsupported',
      reason: 'Unsupported file type.',
    };
  }

  // Browsers sometimes fail to detect a content type (DataTransfer entries
  // walked from a folder drop carry empty `type` strings). Trust the
  // allowlist's mapping for the extension in that case; otherwise prefer
  // the browser-supplied value when it matches the allowlist.
  const browserType = file.type?.trim().toLowerCase() ?? '';
  const contentType =
    browserType.length > 0 && browserType === entry.contentType
      ? browserType
      : entry.contentType;

  return {
    kind: 'supported',
    fileTypeCode: entry.fileTypeCode,
    contentType,
  };
};
