import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { appendCardToArchiveByMonth } from '../src/model/board-ops';
import { parseBoard } from '../src/parser/parse';
import { serializeBoard } from '../src/parser/serialize';

// =============================================================================
// Property: appendCardToArchiveByMonth holds its invariants over ANY sequence of
//           appends (spec 4.3 / 5.6).
// =============================================================================
//
// The example-based tests pin a few fixed 2-3 append scenarios. The real spec
// guarantees are sequence- and order-independent, which is what these properties
// exercise by replaying randomly-ordered month buckets:
//   (a) `### YYYY-MM` headings are sorted newest-first,
//   (b) each month appears as exactly one heading (buckets are merged),
//   (c) no archived card is ever lost,
//   (d) the result stays round-trippable through parse/serialize,
//   (e) pre-existing flat archive content (note: legacy / hand-edited) is preserved.

const pad = (n: number): string => String(n).padStart(2, '0');

const ymArb = fc
  .tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 }))
  .map(([y, m]) => `${y}-${pad(m)}`);

// YYYY-MM is fixed-width and zero-padded, so lexicographic order == chronological order.
const MONTH_HEADING = /^### (\d{4}-\d{2})$/gm;

describe('appendCardToArchiveByMonth property: archive invariants', () => {
  it('headings sorted newest-first, deduped, and no card lost', () => {
    fc.assert(
      fc.property(fc.array(ymArb, { minLength: 1, maxLength: 30 }), (yms) => {
        let archive: { raw: string } | null = null;
        const cards: string[] = [];
        yms.forEach((ym, i) => {
          const cardRaw = `- [x] card-${i} ✅ ${ym}-15`; // unique by index
          cards.push(cardRaw);
          archive = appendCardToArchiveByMonth(archive, cardRaw, ym);
        });
        const raw = archive!.raw;
        const headings = [...raw.matchAll(MONTH_HEADING)].map((m) => m[1]);

        // (b) one heading per distinct month, covering exactly the months we used.
        expect(new Set(headings).size).toBe(headings.length);
        expect(new Set(headings)).toEqual(new Set(yms));
        // (a) newest-first ordering.
        expect(headings).toEqual([...headings].sort().reverse());
        // (c) every appended card survives verbatim.
        for (const c of cards) expect(raw).toContain(c);
      }),
    );
  });

  it('the archived board round-trips (serialize ∘ parse is a fixed point)', () => {
    fc.assert(
      fc.property(fc.array(ymArb, { minLength: 1, maxLength: 15 }), (yms) => {
        let archive: { raw: string } | null = null;
        yms.forEach((ym, i) => {
          archive = appendCardToArchiveByMonth(archive, `- [x] c${i} ✅ ${ym}-15`, ym);
        });
        const board = parseBoard('---\nkanban-plugin: board\n---\n\n## TODO\n');
        board.archive = archive;

        const out = serializeBoard(board);
        expect(serializeBoard(parseBoard(out))).toBe(out);
      }),
    );
  });

  it('preserves pre-existing flat archive content as an untouched prefix (spec 4.3)', () => {
    const PREFIX = '***\n\n## Archive\n\n- [x] legacy ✅ 2026-04-01';
    fc.assert(
      fc.property(fc.array(ymArb, { minLength: 1, maxLength: 10 }), (yms) => {
        let archive: { raw: string } = { raw: PREFIX };
        yms.forEach((ym, i) => {
          archive = appendCardToArchiveByMonth(archive, `- [x] c${i} ✅ ${ym}-15`, ym);
        });
        expect(archive.raw.startsWith(PREFIX)).toBe(true);
        expect(archive.raw).toContain('- [x] legacy ✅ 2026-04-01');
      }),
    );
  });
});
