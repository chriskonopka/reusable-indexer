import { classify, MAX_FILE_SIZE_BYTES } from './fileTypeFilter';

describe('classify', () => {
  it('accepts a PDF', () => {
    const result = classify({ name: 'brief.pdf', type: 'application/pdf', size: 1024 });
    expect(result).toEqual({
      kind: 'supported',
      fileTypeCode: 'Other',
      contentType: 'application/pdf',
    });
  });

  it('accepts an XLSX as Financial by default', () => {
    const result = classify({
      name: 'budget.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4096,
    });
    expect(result).toEqual({
      kind: 'supported',
      fileTypeCode: 'Financial',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });

  it('falls back to the allowlist content type when the browser does not provide one', () => {
    const result = classify({ name: 'memo.docx', type: '', size: 2048 });
    expect(result).toEqual({
      kind: 'supported',
      fileTypeCode: 'Other',
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('rejects empty files', () => {
    expect(classify({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toEqual({
      kind: 'empty',
      reason: 'Empty file.',
    });
  });

  it('rejects oversize files', () => {
    expect(
      classify({
        name: 'huge.pdf',
        type: 'application/pdf',
        size: MAX_FILE_SIZE_BYTES + 1,
      }),
    ).toEqual({ kind: 'too-large', reason: 'File too large — 50 MB max.' });
  });

  it('rejects unsupported extensions even when MIME looks plausible', () => {
    const result = classify({ name: 'note.txt', type: 'text/plain', size: 100 });
    expect(result.kind).toBe('unsupported');
  });

  it('rejects files with no extension', () => {
    expect(classify({ name: 'README', type: 'text/plain', size: 100 }).kind).toBe(
      'unsupported',
    );
  });

  it('treats extensions case-insensitively', () => {
    expect(classify({ name: 'image.PNG', type: 'image/png', size: 100 }).kind).toBe(
      'supported',
    );
  });
});
