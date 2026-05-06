const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** Format a byte count as a human-readable string (e.g. "1.4 MB"). */
export const formatBytes = (bytes: number): string => {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
};
