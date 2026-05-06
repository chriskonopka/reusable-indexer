import { relativeTimeLabel } from './dateLabels';

const at = (offsetMs: number): string =>
  new Date(Date.now() - offsetMs).toISOString();

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('relativeTimeLabel', () => {
  it('returns "just now" for 0 seconds ago', () => {
    expect(relativeTimeLabel(at(0))).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    expect(relativeTimeLabel(at(59 * SEC))).toBe('just now');
  });

  it('returns "1m ago" for exactly 60 seconds ago', () => {
    expect(relativeTimeLabel(at(60 * SEC))).toBe('1m ago');
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    expect(relativeTimeLabel(at(59 * MIN))).toBe('59m ago');
  });

  it('returns "1h ago" for exactly 1 hour ago', () => {
    expect(relativeTimeLabel(at(60 * MIN))).toBe('1h ago');
  });

  it('returns "23h ago" for 23 hours ago', () => {
    expect(relativeTimeLabel(at(23 * HOUR))).toBe('23h ago');
  });

  it('returns "1d ago" for exactly 24 hours ago', () => {
    expect(relativeTimeLabel(at(24 * HOUR))).toBe('1d ago');
  });

  it('returns "6d ago" for 6 days ago', () => {
    expect(relativeTimeLabel(at(6 * DAY))).toBe('6d ago');
  });

  it('returns "1w ago" for exactly 7 days ago', () => {
    expect(relativeTimeLabel(at(WEEK))).toBe('1w ago');
  });

  it('returns "4w ago" for 28 days ago', () => {
    expect(relativeTimeLabel(at(28 * DAY))).toBe('4w ago');
  });

  it('returns "1mo ago" for 35 days ago', () => {
    expect(relativeTimeLabel(at(35 * DAY))).toBe('1mo ago');
  });

  it('returns "11mo ago" for 330 days ago', () => {
    expect(relativeTimeLabel(at(330 * DAY))).toBe('11mo ago');
  });

  it('returns "1y ago" for 365 days ago', () => {
    expect(relativeTimeLabel(at(365 * DAY))).toBe('1y ago');
  });

  it('returns "2y ago" for 730 days ago', () => {
    expect(relativeTimeLabel(at(730 * DAY))).toBe('2y ago');
  });

  it('accepts an explicit `now` parameter', () => {
    const base = new Date('2026-01-01T12:00:00Z');
    const iso = new Date('2026-01-01T11:58:00Z').toISOString(); // 2 minutes ago
    expect(relativeTimeLabel(iso, base)).toBe('2m ago');
  });
});
