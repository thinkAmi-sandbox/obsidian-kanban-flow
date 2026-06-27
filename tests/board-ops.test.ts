import { describe, it, expect } from 'vitest';
import { appendCardToArchive } from '../src/model/board-ops';
import { parseBoard } from '../src/parser/parse';
import { serializeBoard } from '../src/parser/serialize';

// Archive semantics (spec 4.3): cards are archived verbatim and the section stays round-trippable.
describe('appendCardToArchive', () => {
  it('creates the archive scaffold on first use', () => {
    const archive = appendCardToArchive(null, '- [ ] left over');
    expect(archive.raw).toBe('***\n\n## Archive\n\n- [ ] left over');
  });

  it('appends to an existing archive as a new list item', () => {
    const first = appendCardToArchive(null, '- [x] one ✅ 2026-05-10');
    const second = appendCardToArchive(first, '- [ ] two');
    expect(second.raw).toBe('***\n\n## Archive\n\n- [x] one ✅ 2026-05-10\n- [ ] two');
  });

  it('archived card survives a parse round-trip and lands under ## Archive', () => {
    const board = parseBoard(['---', 'kanban-plugin: board', '---', '', '## TODO', ''].join('\n'));
    board.archive = appendCardToArchive(board.archive, '- [ ] archived task ➕ 2026-06-01');

    const out = serializeBoard(board);
    expect(out).toContain('***\n\n## Archive\n\n- [ ] archived task ➕ 2026-06-01');

    // Re-parsing keeps the archive intact (idempotent output).
    expect(serializeBoard(parseBoard(out))).toBe(out);
  });

  it('does not mutate completion state when archiving an incomplete card (spec 4.3)', () => {
    const archive = appendCardToArchive(null, '- [ ] still open');
    expect(archive.raw).toContain('- [ ] still open'); // no [x], no ✅ added
  });
});
