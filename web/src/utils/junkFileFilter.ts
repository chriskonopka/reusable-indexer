// Drops OS-generated junk files before they reach the upload pipeline.
// Spec 3.4.3 / contract §2.4.3: filtered silently — never shown to the user.

const JUNK_BASENAMES = new Set<string>([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '.localized',
  '.spotlight-v100',
  '.trashes',
  '.fseventsd',
]);

const JUNK_PREFIXES = ['._']; // macOS resource forks (AppleDouble files)

const baseName = (path: string): string => {
  const trimmed = path.replace(/[\\/]+$/, '');
  const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return lastSep === -1 ? trimmed : trimmed.slice(lastSep + 1);
};

export const isJunkFile = (file: { name: string }): boolean => {
  const lower = baseName(file.name).toLowerCase();
  if (lower.length === 0) return true;
  if (JUNK_BASENAMES.has(lower)) return true;
  return JUNK_PREFIXES.some((prefix) => lower.startsWith(prefix));
};
