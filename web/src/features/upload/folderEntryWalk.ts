// Walks a DataTransfer's directory entries (`webkitGetAsEntry`) and a
// flat FileList from the picker, normalizing both into the same
// `{ file, relativePath }` pairs the upload controller consumes.
// Spec 3.4.1 / 3.4.5.
//
// We avoid pulling in the `Filesystem*Entry` lib types here because they
// are not in the shared TS lib used by this project; the structural types
// below match the platform contract.

export interface DroppedFile {
  file: File;
  relativePath: string;
}

interface FsEntryShape {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
}

interface FsFileEntryShape extends FsEntryShape {
  isFile: true;
  isDirectory: false;
  file(success: (file: File) => void, error?: (err: Error) => void): void;
}

interface FsDirectoryEntryShape extends FsEntryShape {
  isFile: false;
  isDirectory: true;
  createReader(): {
    readEntries(
      success: (entries: FsEntryShape[]) => void,
      error?: (err: Error) => void,
    ): void;
  };
}

const fileFromEntry = (entry: FsFileEntryShape): Promise<File> =>
  new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });

const readDirectoryEntries = (
  reader: ReturnType<FsDirectoryEntryShape['createReader']>,
): Promise<FsEntryShape[]> =>
  new Promise<FsEntryShape[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

// Some browsers return at most 100 entries per readEntries call — keep
// reading until we get an empty batch. The MAX_BATCHES bound prevents a
// buggy reader from spinning forever.
const MAX_BATCHES = 1000;

const readAllChildren = async (
  entry: FsDirectoryEntryShape,
): Promise<FsEntryShape[]> => {
  const reader = entry.createReader();
  const collected: FsEntryShape[] = [];
  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await readDirectoryEntries(reader);
    if (batch.length === 0) return collected;
    collected.push(...batch);
  }
  return collected;
};

const stripLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path.slice(1) : path;

const walkEntry = async (
  entry: FsEntryShape,
  rootPrefix: string,
): Promise<DroppedFile[]> => {
  if (entry.isFile) {
    const fileEntry = entry as FsFileEntryShape;
    const file = await fileFromEntry(fileEntry);
    const relativePath = stripLeadingSlash(
      rootPrefix.length > 0 ? `${rootPrefix}/${entry.name}` : entry.name,
    );
    return [{ file, relativePath }];
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FsDirectoryEntryShape;
    const children = await readAllChildren(dirEntry);
    const childPrefix =
      rootPrefix.length > 0 ? `${rootPrefix}/${entry.name}` : entry.name;
    const nestedLists = await Promise.all(
      children.map((child) => walkEntry(child, childPrefix)),
    );
    return nestedLists.flat();
  }
  return [];
};

/**
 * Walks any directory entries on a drop event and any plain files dragged
 * directly. Picker-sourced FileLists go through `fromFileList()` because
 * they have no entry API.
 */
export const walkDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<DroppedFile[]> => {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const seen = new Set<string>();
    const collected: DroppedFile[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      // `webkitGetAsEntry` is not standardized but is implemented in
      // every browser this project supports (web-browser-support.md).
      const entry =
        typeof (item as { webkitGetAsEntry?: () => FsEntryShape | null })
          .webkitGetAsEntry === 'function'
          ? (item as { webkitGetAsEntry: () => FsEntryShape | null }).webkitGetAsEntry()
          : null;
      if (entry) {
        const dropped = await walkEntry(entry, '');
        for (const drop of dropped) {
          if (seen.has(drop.relativePath)) continue;
          seen.add(drop.relativePath);
          collected.push(drop);
        }
      } else {
        const fallback = item.getAsFile?.();
        if (fallback && !seen.has(fallback.name)) {
          seen.add(fallback.name);
          collected.push({ file: fallback, relativePath: fallback.name });
        }
      }
    }
    return collected;
  }
  // Fallback when items isn't available — files-only.
  return Array.from(dataTransfer.files).map((file) => ({
    file,
    relativePath: file.name,
  }));
};

/**
 * Picker-sourced FileList. Browsers populate `webkitRelativePath` for
 * `<input type="file" webkitdirectory>` selections; for plain multi-file
 * pickers it's empty and we fall back to the file name.
 */
export const fromFileList = (fileList: FileList): DroppedFile[] => {
  const out: DroppedFile[] = [];
  for (const file of Array.from(fileList)) {
    const relativePath = file.webkitRelativePath || file.name;
    out.push({ file, relativePath });
  }
  return out;
};
