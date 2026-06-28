import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ADDED_MARKER,
  DONE_MARKER,
  getAddedDate,
  getDoneDate,
  tokenizeTrailingMeta,
} from '../src/model/metadata';

// =============================================================================
// Property: tokenizeTrailingMeta is a LOSS-LESS split.
// =============================================================================
//
// tokenizeTrailingMeta(line) peels trailing `➕/✅ <date>` tokens off the end of a
// line and returns { body, tokens }. By design each token's leading whitespace is
// captured into `token.raw`, so the original line can be reconstructed EXACTLY by
// concatenation. Every other metadata operation (markComplete, unmarkComplete,
// setDisplayTitle, ...) rebuilds lines from this split, so this exact-reconstruction
// invariant is the foundation the whole metadata layer rests on.

const pad = (n: number): string => String(n).padStart(2, '0');

const dateArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`);

const safeWord = fc
  .array(fc.constantFrom(...'abcdefghあいう漢字0123456789'.split('')), { minLength: 1, maxLength: 8 })
  .map((cs) => cs.join(''));

// A body that is guaranteed NOT to end with a metadata-looking token, so the trailing
// tokens we append below are exactly the ones tokenize will peel back off.
const bodyArb = fc
  .record({ check: fc.constantFrom(' ', 'x', '/'), text: safeWord })
  .map(({ check, text }) => `- [${check}] ${text}`);

const tokenArb = fc.record({
  marker: fc.constantFrom(ADDED_MARKER, DONE_MARKER),
  date: dateArb,
});

describe('tokenizeTrailingMeta property: loss-less reconstruction', () => {
  it('body + tokens.raw.join("") === line, for any string', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (line) => {
        const { body, tokens } = tokenizeTrailingMeta(line);
        expect(body + tokens.map((t) => t.raw).join('')).toBe(line);
      }),
    );
  });

  it('reconstructs realistic card lines and reports the LAST value per marker (spec 4.2-3)', () => {
    fc.assert(
      fc.property(bodyArb, fc.array(tokenArb, { maxLength: 6 }), (body, toks) => {
        // Single space between marker and date matches META_RE; tokens are appended in order.
        const line = body + toks.map((t) => ` ${t.marker} ${t.date}`).join('');

        const { body: gotBody, tokens } = tokenizeTrailingMeta(line);

        // 1. Exact reconstruction still holds.
        expect(gotBody + tokens.map((t) => t.raw).join('')).toBe(line);
        // 2. Because the body cannot look like a token, tokenize peels exactly what we appended.
        expect(gotBody).toBe(body);
        expect(tokens.map((t) => ({ marker: t.marker, date: t.date }))).toEqual(toks);
        // 3. Each token is well-formed.
        for (const t of tokens) {
          expect([ADDED_MARKER, DONE_MARKER]).toContain(t.marker);
          expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }

        // 4. getAddedDate / getDoneDate return the LAST occurrence of each marker, or null.
        const lastOf = (marker: string): string | null => {
          const hits = toks.filter((t) => t.marker === marker);
          return hits.length ? hits[hits.length - 1].date : null;
        };
        expect(getAddedDate(line)).toBe(lastOf(ADDED_MARKER));
        expect(getDoneDate(line)).toBe(lastOf(DONE_MARKER));
      }),
    );
  });
});
