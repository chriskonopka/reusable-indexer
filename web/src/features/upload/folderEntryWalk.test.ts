import { fromFileList, walkDataTransfer } from './folderEntryWalk';

const fakeFile = (name: string): File => new File(['hi'], name, { type: 'text/plain' });

const makeFileEntry = (name: string, file: File) => ({
  isFile: true,
  isDirectory: false,
  name,
  fullPath: `/${name}`,
  file: (success: (f: File) => void) => success(file),
});

const makeDirEntry = (
  name: string,
  children: Array<ReturnType<typeof makeFileEntry> | ReturnType<typeof makeDirEntry>>,
) => {
  let returnedOnce = false;
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    createReader: () => ({
      readEntries: (success: (entries: unknown[]) => void) => {
        if (returnedOnce) {
          success([]);
          return;
        }
        returnedOnce = true;
        success(children);
      },
    }),
  };
};

const makeItem = (entry: unknown, file?: File): DataTransferItem => {
  return {
    kind: 'file',
    type: '',
    webkitGetAsEntry: () => entry,
    getAsFile: () => file ?? null,
    getAsString: () => undefined,
  } as unknown as DataTransferItem;
};

const makeDataTransfer = (
  items: DataTransferItem[],
  files: File[] = [],
): DataTransfer => {
  const itemList = {
    length: items.length,
    [Symbol.iterator]: function* () {
      for (const item of items) yield item;
    },
  } as unknown as DataTransferItemList;
  return {
    items: itemList,
    files: files as unknown as FileList,
  } as unknown as DataTransfer;
};

describe('walkDataTransfer', () => {
  it('returns plain files at the root with their bare name', async () => {
    const fileA = fakeFile('A.pdf');
    const result = await walkDataTransfer(
      makeDataTransfer([makeItem(makeFileEntry('A.pdf', fileA))]),
    );
    expect(result).toEqual([{ file: fileA, relativePath: 'A.pdf' }]);
  });

  it('walks nested directories and prefixes the relative path', async () => {
    const inner = fakeFile('brief.pdf');
    const dir = makeDirEntry('Acme', [makeFileEntry('brief.pdf', inner)]);
    const result = await walkDataTransfer(makeDataTransfer([makeItem(dir)]));
    expect(result).toEqual([{ file: inner, relativePath: 'Acme/brief.pdf' }]);
  });

  it('falls back to dataTransfer.files when items is empty', async () => {
    const f = fakeFile('only.pdf');
    const result = await walkDataTransfer(makeDataTransfer([], [f]));
    expect(result).toEqual([{ file: f, relativePath: 'only.pdf' }]);
  });

  it('falls back to getAsFile when webkitGetAsEntry returns null', async () => {
    const f = fakeFile('plain.pdf');
    const result = await walkDataTransfer(
      makeDataTransfer([makeItem(null, f)]),
    );
    expect(result).toEqual([{ file: f, relativePath: 'plain.pdf' }]);
  });

  it('deduplicates by relativePath', async () => {
    const f = fakeFile('dup.pdf');
    const items = [
      makeItem(makeFileEntry('dup.pdf', f)),
      makeItem(makeFileEntry('dup.pdf', f)),
    ];
    const result = await walkDataTransfer(makeDataTransfer(items));
    expect(result).toHaveLength(1);
  });

  it('processes every dropped file when multiple plain files are dropped at once', async () => {
    // Regression: browsers invalidate DataTransferItem refs once the drop
    // handler yields the event loop, so any `webkitGetAsEntry()` call made
    // after an `await` returns null. Previously this caused multi-file drops
    // to silently drop everything after the first file; folder drops worked
    // only because they're a single item.
    const fileA = fakeFile('A.pdf');
    const fileB = fakeFile('B.pdf');
    const fileC = fakeFile('C.pdf');
    const items = [
      makeItem(makeFileEntry('A.pdf', fileA)),
      makeItem(makeFileEntry('B.pdf', fileB)),
      makeItem(makeFileEntry('C.pdf', fileC)),
    ];

    // Model the browser invalidating items the moment the drop handler yields
    // the event loop. The queued microtask fires after the synchronous body of
    // walkDataTransfer runs, so the fix (which snapshots entries up front) sees
    // all three; the previous loop-with-await structure would only see the
    // first because every later iteration's webkitGetAsEntry would return null.
    let invalidated = false;
    queueMicrotask(() => {
      invalidated = true;
    });
    for (const item of items) {
      const target = item as unknown as { webkitGetAsEntry: () => unknown };
      const original = target.webkitGetAsEntry;
      target.webkitGetAsEntry = () => (invalidated ? null : original.call(item));
    }

    const result = await walkDataTransfer(makeDataTransfer(items));
    expect(result.map((entry) => entry.relativePath)).toEqual([
      'A.pdf',
      'B.pdf',
      'C.pdf',
    ]);
  });
});

describe('fromFileList', () => {
  it('uses webkitRelativePath when present', () => {
    const file = new File(['hi'], 'inner.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'Acme/inner.pdf',
      configurable: true,
    });
    const fakeList = [file] as unknown as FileList;
    Object.defineProperty(fakeList, 'length', { value: 1 });
    expect(fromFileList(fakeList)).toEqual([
      { file, relativePath: 'Acme/inner.pdf' },
    ]);
  });

  it('falls back to the file name when webkitRelativePath is empty', () => {
    const file = new File(['hi'], 'flat.pdf', { type: 'application/pdf' });
    const fakeList = [file] as unknown as FileList;
    Object.defineProperty(fakeList, 'length', { value: 1 });
    expect(fromFileList(fakeList)).toEqual([{ file, relativePath: 'flat.pdf' }]);
  });
});
