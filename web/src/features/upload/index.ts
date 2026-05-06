// Public surface of the upload feature. RootShell composes these; no other
// feature imports from here directly (boundary enforced in eslint.config.mjs).

export { UploadProvider, useUploadState } from './state';
export { useUploadController } from './useUploadController';
export type { UploadController } from './useUploadController';
export { useBeforeUnloadGuard } from './useBeforeUnloadGuard';
export { UploadDropzone } from './UploadDropzone';
export type { UploadDropzoneProps } from './UploadDropzone';
export { UploadProgressBanner } from './UploadProgressBanner';
export type { UploadProgressBannerProps } from './UploadProgressBanner';
export { FailedFilesPopover } from './FailedFilesPopover';
export type { FailedFilesPopoverProps } from './FailedFilesPopover';
export {
  computeFolderAggregates,
  inProgressByFileName,
  computeTotals,
} from './aggregates';
