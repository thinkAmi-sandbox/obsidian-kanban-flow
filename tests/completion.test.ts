import { describe, it, expect } from 'vitest';
import {
  ADDED_MARKER,
  DONE_MARKER,
  markComplete,
  unmarkComplete,
  syncOnMove,
} from '../src/model/metadata';

// Completion-lane boundary sync (spec 5.3). today is injected for determinism.
const TODAY = '2026-06-27';

describe('completion sync', () => {
  it('mark complete: checks the box and appends a completion date', () => {
    expect(markComplete('- [ ] task', TODAY)).toBe(`- [x] task ${DONE_MARKER} ${TODAY}`);
  });

  it('mark complete: keeps registration date, overrides existing completion date', () => {
    const raw = `- [ ] task ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} 2026-06-10`;
    expect(markComplete(raw, TODAY)).toBe(
      `- [x] task ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} ${TODAY}`,
    );
  });

  it('unmark: removes all completion tokens and unchecks, keeps registration date', () => {
    const raw = `- [x] task ${ADDED_MARKER} 2026-06-01 ${DONE_MARKER} ${TODAY}`;
    expect(unmarkComplete(raw)).toBe(`- [ ] task ${ADDED_MARKER} 2026-06-01`);
  });

  it('non-boundary move leaves the card untouched (spec 5.3)', () => {
    const incomplete = `- [ ] task ${ADDED_MARKER} 2026-06-01`;
    expect(syncOnMove(incomplete, false, false, TODAY)).toBe(incomplete);
    // Even a manually-checked card in a non-complete lane is not normalized.
    expect(syncOnMove('- [x] weird', false, false, TODAY)).toBe('- [x] weird');
    // Reordering within a complete lane (complete -> complete) is also untouched.
    expect(syncOnMove('- [x] done', true, true, TODAY)).toBe('- [x] done');
  });

  it('syncOnMove into a complete lane', () => {
    expect(syncOnMove('- [ ] task', false, true, TODAY)).toBe(`- [x] task ${DONE_MARKER} ${TODAY}`);
  });

  it('syncOnMove out of a complete lane', () => {
    const raw = `- [x] task ${DONE_MARKER} 2026-06-20`;
    expect(syncOnMove(raw, true, false, TODAY)).toBe('- [ ] task');
  });

  it('multi-line card: only the first line is synced', () => {
    const raw = `- [ ] task\n  detail`;
    expect(markComplete(raw, TODAY)).toBe(`- [x] task ${DONE_MARKER} ${TODAY}\n  detail`);
  });
});
