import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tokenizeTitle } from '../src/ui/linkify';

// =============================================================================
// Property: tokenizeTitle is a LOSS-LESS split, and every link is verifiably https.
// =============================================================================
//
// tokenizeTitle decides which runs of a card title become anchors. Card.svelte renders
// the tokens in order and nothing else, so two invariants fully determine what the user
// sees and where a click goes:
//
//   1. Concatenating the tokens' `text` reproduces the title exactly. The card can then
//      never display something other than what the file says — no dropped characters, no
//      duplicated fragments, no reordering.
//   2. Every emitted link's `href` parses as `https:` with no embedded credentials. This
//      is the one guarantee the rendered `href` attribute rests on.
//
// Both are checked against titles built to provoke the boundary logic: URL-ish fragments,
// dangerous schemes, punctuation, brackets and invisible characters, freely interleaved.

const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

const fragmentArb = fc.constantFrom(
  'https://example.com',
  'https://example.com/a?b=1#c',
  'https://аpple.com/',
  'https://user:pw@example.com/',
  'https://www.google.com@evil.com/',
  'https://',
  'HTTPS://EXAMPLE.COM',
  'http://example.com',
  'javascript:alert(1)',
  'data:text/html,<script>x</script>',
  'obsidian://open?vault=v',
  'file:///etc/passwd',
  '資料をまとめる',
  '(',
  ')',
  '[label]',
  '.',
  '。',
  ' ',
  '\t',
  RLO,
  ZWSP,
  '<img onerror=x>',
);

const titleArb = fc
  .array(fragmentArb, { minLength: 0, maxLength: 12 })
  .map((parts) => parts.join(''));

describe('tokenizeTitle properties', () => {
  it('reproduces the title exactly when the tokens are concatenated', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        expect(
          tokenizeTitle(title)
            .map((t) => t.text)
            .join(''),
        ).toBe(title);
      }),
    );
  });

  it('only ever emits https links without credentials', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        for (const token of tokenizeTitle(title)) {
          if (token.kind !== 'link') continue;
          const url = new URL(token.href);
          expect(url.protocol).toBe('https:');
          expect(url.username).toBe('');
          expect(url.password).toBe('');
        }
      }),
    );
  });

  it('emits link text that is a verbatim slice of the title', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        for (const token of tokenizeTitle(title)) {
          if (token.kind !== 'link') continue;
          expect(title).toContain(token.text);
        }
      }),
    );
  });
});
