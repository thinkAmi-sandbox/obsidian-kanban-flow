import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { completeString } from '../src/constants';
import { parseBoard } from '../src/parser/parse';
import { serializeBoard } from '../src/parser/serialize';

// =============================================================================
// Property: the parse -> serialize round-trip is IDEMPOTENT (a fixed point),
//           NOT the identity.
// =============================================================================
//
// 重要な注意点 (why this is `f(f(x)) === f(x)` and NOT `f(x) === x`):
//
//   parseBoard() deliberately *canonicalizes* its input. It does not promise to
//   reproduce arbitrary text byte-for-byte. Specifically it:
//     1. normalizes newlines (CRLF/CR -> LF) and forces exactly one trailing LF
//        (see normalizeMd in src/parser/parse.ts),
//     2. canonicalizes blank-line spacing between blocks to a single blank line,
//     3. drops any content that appears before the first `## ` heading,
//     4. reorders/merges a lane's blocks on serialize: the `**Complete**` marker
//        comes first, then unknown blocks, then ALL cards merged into one list.
//
//   Because of (1)-(4), feeding raw user text into `f = serialize ∘ parse` may
//   legitimately change it, so asserting `f(x) === x` over generated input would
//   fail on these *expected* normalizations — a false alarm, not a bug.
//
//   The property that genuinely holds for ALL inputs is that the canonical form
//   is a FIXED POINT: applying f once normalizes, and applying it again changes
//   nothing. That is exactly what guards the real risks — data loss, unstable
//   ordering, and spacing drift across save/reload cycles — without flagging the
//   intended canonicalization. The existing example-based tests in
//   tests/roundtrip.test.ts already pin the `f(x) === x` identity for inputs that
//   are *already canonical* (the fixtures); this property generalizes the part
//   that must hold for every input.
//
// (For first-time readers: if you ever want the identity instead, you must first
//  bring the input to canonical form — i.e. compare against `f(x)`, not `x`.)
const f = (md: string): string => serializeBoard(parseBoard(md));

const pad = (n: number): string => String(n).padStart(2, '0');

const dateArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`);

// Safe alphabet: no newline, no '#', '*', '-', '%' so generated text can never
// accidentally form a heading / complete-marker / settings / list structural token.
const safeWord = fc
  .array(fc.constantFrom(...'abcdefghijkあいうえお漢字0123456789'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((cs) => cs.join(''));

// A single top-level card line, optionally carrying a tag, ➕/✅ metadata, and an
// indented continuation line (the kinds of notation the parser must preserve verbatim).
const cardLineArb = fc
  .record({
    check: fc.constantFrom(' ', 'x', '/', '-'), // includes custom checkbox chars
    text: safeWord,
    tag: fc.option(safeWord, { nil: null }),
    added: fc.option(dateArb, { nil: null }),
    done: fc.option(dateArb, { nil: null }),
    cont: fc.option(safeWord, { nil: null }),
  })
  .map(({ check, text, tag, added, done, cont }) => {
    let line = `- [${check}] ${text}`;
    if (tag) line += ` #${tag}`;
    if (added) line += ` ➕ ${added}`;
    if (done) line += ` ✅ ${done}`;
    if (cont) line += `\n  ${cont}`; // indented => not a new card / heading
    return line;
  });

// A block the parser cannot classify as a card -> preserved as an unknown block.
const unknownBlockArb = fc
  .record({ kind: fc.constantFrom('quote', 'para'), text: safeWord })
  .map(({ kind, text }) => (kind === 'quote' ? `> ${text}` : text));

// A lane: heading, optional complete marker, and a mix of cards / unknown blocks.
// Mixing the order is intentional — it exercises the reorder/merge canonicalization
// (note 4 above), which is precisely why the property is idempotence, not identity.
const laneArb = fc
  .record({
    title: safeWord,
    complete: fc.boolean(),
    blocks: fc.array(fc.oneof(cardLineArb, unknownBlockArb), { maxLength: 5 }),
  })
  .map(({ title, complete, blocks }) => {
    const parts = [`## ${title}`];
    if (complete) parts.push(completeString);
    parts.push(...blocks);
    return parts.join('\n\n');
  });

// An opaque archive section (parse/serialize treat everything after `***` as a raw blob).
const archiveArb = fc
  .array(fc.record({ ym: fc.tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 })), n: safeWord }), {
    minLength: 1,
    maxLength: 3,
  })
  .map(
    (items) =>
      '***\n\n## Archive\n\n' +
      items.map(({ ym, n }) => `### ${ym[0]}-${pad(ym[1])}\n\n- [x] ${n} ✅ ${ym[0]}-${pad(ym[1])}-10`).join('\n\n'),
  );

// A whole board document, with deliberately *non-canonical* spacing (variable blank-line
// gaps) and optional CRLF, so the test proves f converges those to the canonical form.
const boardMdArb = fc
  .record({
    frontmatter: fc.boolean(),
    lanes: fc.array(laneArb, { maxLength: 4 }),
    archive: fc.option(archiveArb, { nil: null }),
    settings: fc.boolean(),
    gap: fc.constantFrom('\n\n', '\n\n\n', '\n\n\n\n'),
    crlf: fc.boolean(),
  })
  .map(({ frontmatter, lanes, archive, settings, gap, crlf }) => {
    const secs: string[] = [];
    if (frontmatter) secs.push('---\nkanban-plugin: board\n---');
    secs.push(...lanes);
    if (archive) secs.push(archive);
    if (settings) secs.push('%% kanban:settings\n{"x":1}\n%%');
    let md = secs.join(gap) + '\n';
    if (crlf) md = md.replace(/\n/g, '\r\n');
    return md;
  });

describe('round-trip property: f = serialize ∘ parse is idempotent', () => {
  it('f(f(md)) === f(md) for generated board documents', () => {
    fc.assert(
      fc.property(boardMdArb, (md) => {
        const once = f(md);
        expect(f(once)).toBe(once); // the canonical form is a fixed point
      }),
    );
  });

  // Robustness: the fixed-point property must hold even for hostile, non-board text.
  it('f(f(s)) === f(s) for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const once = f(s);
        expect(f(once)).toBe(once);
      }),
    );
  });

  // Normalization guarantees the canonical output shape (note 1 above).
  it('canonical output ends with exactly one LF and contains no CR', () => {
    fc.assert(
      fc.property(boardMdArb, (md) => {
        const out = f(md);
        expect(out.endsWith('\n')).toBe(true);
        expect(out.endsWith('\n\n')).toBe(false);
        expect(out.includes('\r')).toBe(false);
      }),
    );
  });
});
