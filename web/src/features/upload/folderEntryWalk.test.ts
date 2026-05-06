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
