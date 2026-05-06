import { formatBytes } from './fileSize';

describe('formatBytes', () => {
  it('formats 0 bytes', () => expect(formatBytes(0)).toBe('0 B'));
  it('formats exact 1023 bytes', () => expect(formatBytes(1023)).toBe('1023 B'));
  it('formats exactly 1 KB', () => expect(formatBytes(1024)).toBe('1.0 KB'));
  it('formats fractional KB', () => expect(formatBytes(1536)).toBe('1.5 KB'));
  it('formats just under 1 MB', () => expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB'));
  it('formats exactly 1 MB', () => expect(formatBytes(1024 * 1024)).toBe('1.0 MB'));
  it('formats fractional MB', () => expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB'));
  it('formats exactly 1 GB', () => expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB'));
  it('formats fractional GB', () => expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB'));
});
