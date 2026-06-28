import { describe, it, expect } from 'vitest';
import { appendCardToArchiveByMonth } from '../src/model/board-ops';
import { parseBoard } from '../src/parser/parse';
import { serializeBoard } from '../src/parser/serialize';

// Archive semantics (spec 4.3 / 5.6): completed cards are archived verbatim, grouped under
// `### YYYY-MM` headings sorted newest-first, and the section stays round-trippable.
describe('appendCardToArchiveByMonth', () => {
  it('creates the archive scaffold with a month heading on first use', () => {
    const archive = appendCardToArchiveByMonth(null, '- [x] one ✅ 2026-06-20', '2026-06');
    expect(archive.raw).toBe('***\n\n## Archive\n\n### 2026-06\n\n- [x] one ✅ 2026-06-20');
  });

  it('appends to an existing month heading as a new list item', () => {
    const first = appendCardToArchiveByMonth(null, '- [x] one ✅ 2026-06-20', '2026-06');
    const second = appendCardToArchiveByMonth(first, '- [x] two ✅ 2026-06-25', '2026-06');
    expect(second.raw).toBe(
      '***\n\n## Archive\n\n### 2026-06\n\n- [x] one ✅ 2026-06-20\n- [x] two ✅ 2026-06-25',
    );
  });

  it('adds a new month heading and sorts headings newest-first', () => {
    const june = appendCardToArchiveByMonth(null, '- [x] june ✅ 2026-06-20', '2026-06');
    const both = appendCardToArchiveByMonth(june, '- [x] may ✅ 2026-05-10', '2026-05');
    expect(both.raw).toBe(
      '***\n\n## Archive\n\n### 2026-06\n\n- [x] june ✅ 2026-06-20\n\n### 2026-05\n\n- [x] may ✅ 2026-05-10',
    );
  });

  it('inserts a newer month above an existing older one', () => {
    const may = appendCardToArchiveByMonth(null, '- [x] may ✅ 2026-05-10', '2026-05');
    const both = appendCardToArchiveByMonth(may, '- [x] june ✅ 2026-06-20', '2026-06');
    expect(both.raw).toBe(
      '***\n\n## Archive\n\n### 2026-06\n\n- [x] june ✅ 2026-06-20\n\n### 2026-05\n\n- [x] may ✅ 2026-05-10',
    );
  });

  it('preserves pre-existing flat archive content (spec 4.3「既存アーカイブの非破壊」)', () => {
    const flat = { raw: '***\n\n## Archive\n\n- [x] legacy ✅ 2026-04-01' };
    const next = appendCardToArchiveByMonth(flat, '- [x] new ✅ 2026-06-20', '2026-06');
    expect(next.raw).toBe(
      '***\n\n## Archive\n\n- [x] legacy ✅ 2026-04-01\n\n### 2026-06\n\n- [x] new ✅ 2026-06-20',
    );
  });

  it('does not mutate completion state of the archived card (spec 4.3)', () => {
    const archive = appendCardToArchiveByMonth(null, '- [ ] still open ➕ 2026-06-01', '2026-06');
    expect(archive.raw).toContain('- [ ] still open ➕ 2026-06-01'); // no [x], no ✅ added
  });

  it('archived cards survive a parse round-trip', () => {
    const board = parseBoard(['---', 'kanban-plugin: board', '---', '', '## TODO', ''].join('\n'));
    board.archive = appendCardToArchiveByMonth(board.archive, '- [x] task ✅ 2026-06-20', '2026-06');

    const out = serializeBoard(board);
    expect(out).toContain('## Archive\n\n### 2026-06\n\n- [x] task ✅ 2026-06-20');
    // Re-parsing keeps the archive intact (idempotent output).
    expect(serializeBoard(parseBoard(out))).toBe(out);
  });
});
