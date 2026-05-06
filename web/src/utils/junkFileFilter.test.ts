import { isJunkFile } from './junkFileFilter';

describe('isJunkFile', () => {
  it.each([
    '.DS_Store',
    '.ds_store',
    'thumbs.db',
    'Thumbs.db',
    'desktop.ini',
    '.localized',
    '.Spotlight-V100',
    '.Trashes',
    '.fseventsd',
    '._resourceForkFile.pdf',
  ])('returns true for %s', (name) => {
    expect(isJunkFile({ name })).toBe(true);
  });

  it.each(['contract.pdf', 'image.png', 'My Notes.docx', 'spreadsheet.xlsx'])(
    'returns false for %s',
    (name) => {
      expect(isJunkFile({ name })).toBe(false);
    },
  );

  it('strips path separators before checking', () => {
    expect(isJunkFile({ name: 'subdir/.DS_Store' })).toBe(true);
    expect(isJunkFile({ name: 'subdir\\thumbs.db' })).toBe(true);
    expect(isJunkFile({ name: '/Users/me/contract.pdf' })).toBe(false);
  });

  it('treats an empty name as junk', () => {
    expect(isJunkFile({ name: '' })).toBe(true);
    expect(isJunkFile({ name: '/' })).toBe(true);
  });
});
