import { describe, it, expect } from 'vitest';
import {
  ADDED_MARKER,
  DONE_MARKER,
  getAddedDate,
  getDoneDate,
  getDisplayTitle,
  makeCardRaw,
  setDisplayTitle,
} from '../src/model/metadata';

// Metadata separation rules (spec 4.2).
describe('metadata separation', () => {
  it('extracts a trailing registration date', () => {
    const raw = `- [ ] 資料を作成する ${ADDED_MARKER} 2026-06-01`;
    expect(getAddedDate(raw)).toBe('2026-06-01');
    expect(getDoneDate(raw)).toBeNull();
    expect(getDisplayTitle(raw)).toBe('資料を作成する');
  });

  it('extracts both registration and completion dates', () => {
    const raw = `- [x] 資料 ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} 2026-06-11`;
    expect(getAddedDate(raw)).toBe('2026-06-01');
    expect(getDoneDate(raw)).toBe('2026-06-11');
    expect(getDisplayTitle(raw)).toBe('資料');
  });

  it('ignores a marker+date that sits in the body, not the trailing run (spec 4.2-2)', () => {
    const raw = `- [ ] ${ADDED_MARKER} 2026-01-01 を調べる`;
    expect(getAddedDate(raw)).toBeNull();
    expect(getDisplayTitle(raw)).toBe(`${ADDED_MARKER} 2026-01-01 を調べる`);
  });

  it('with multiple same-marker tokens, value is the last (spec 4.2-3)', () => {
    const raw = `- [ ] t ${ADDED_MARKER} 2026-01-01 ${ADDED_MARKER} 2026-02-02`;
    expect(getAddedDate(raw)).toBe('2026-02-02');
  });

  it('tolerates missing metadata', () => {
    expect(getAddedDate('- [ ] no meta')).toBeNull();
    expect(getDoneDate('- [ ] no meta')).toBeNull();
    expect(getDisplayTitle('- [ ] no meta')).toBe('no meta');
  });

  it('only the first line carries metadata (spec 4.2-1)', () => {
    const raw = `- [ ] line1 ${ADDED_MARKER} 2026-06-01\n  - sub ${DONE_MARKER} 2026-06-02`;
    expect(getAddedDate(raw)).toBe('2026-06-01');
    expect(getDoneDate(raw)).toBeNull();
  });

  it('hand-typed trailing date is treated as metadata on save (spec 4.2-4)', () => {
    const edited = `- [ ] new title ${ADDED_MARKER} 2026-03-03`;
    expect(getAddedDate(edited)).toBe('2026-03-03');
    expect(getDisplayTitle(edited)).toBe('new title');
  });

  it('makeCardRaw stamps the registration date', () => {
    expect(makeCardRaw('買い物', '2026-06-27')).toBe(`- [ ] 買い物 ${ADDED_MARKER} 2026-06-27`);
  });
});

// Title editing must not silently drop metadata (spec 4.2-4).
describe('setDisplayTitle', () => {
  it('keeps the existing registration date when only the title changes', () => {
    const raw = `- [ ] テスト ${ADDED_MARKER} 2026-06-27`;
    expect(setDisplayTitle(raw, 'テスト2あいう')).toBe(`- [ ] テスト2あいう ${ADDED_MARKER} 2026-06-27`);
  });

  it('keeps the checkbox state and both dates', () => {
    const raw = `- [x] done ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} 2026-06-10`;
    expect(setDisplayTitle(raw, 'renamed')).toBe(
      `- [x] renamed ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} 2026-06-10`,
    );
  });

  it('lets a hand-typed trailing date override the existing one', () => {
    const raw = `- [ ] テスト ${ADDED_MARKER} 2026-06-27`;
    expect(setDisplayTitle(raw, `テスト ${ADDED_MARKER} 2026-01-01`)).toBe(
      `- [ ] テスト ${ADDED_MARKER} 2026-01-01`,
    );
  });

  it('preserves continuation lines (multi-line card)', () => {
    const raw = `- [ ] line1 ${ADDED_MARKER} 2026-06-27\n  - sub`;
    expect(setDisplayTitle(raw, 'edited')).toBe(`- [ ] edited ${ADDED_MARKER} 2026-06-27\n  - sub`);
  });
});
