import { describe, it, expect } from 'vitest';
import { toSafeHref, tokenizeTitle, type TitleToken } from '../src/ui/linkify';

// Autolinking of bare https URLs in card titles (spec 5.1).
//
// The card title comes from the board file, which is untrusted input (hand edits, sync from
// another device, other plugins). These tests pin down the two halves of the defence:
// what we refuse to turn into a link, and where a link ends.

type LinkToken = Extract<TitleToken, { kind: 'link' }>;

/** The single link in a title, or null when nothing was linkified. */
function onlyLink(title: string): LinkToken | null {
  const links = tokenizeTitle(title).filter((t) => t.kind === 'link');
  expect(links.length).toBeLessThanOrEqual(1);
  return links[0] ?? null;
}

const text = (title: string): string[] =>
  tokenizeTitle(title)
    .filter((t) => t.kind === 'text')
    .map((t) => t.text);

describe('linkify: accepted https URLs', () => {
  it('linkifies a title that is nothing but a URL', () => {
    expect(tokenizeTitle('https://example.com/a')).toEqual([
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
    ]);
  });

  it('keeps the surrounding prose as text tokens', () => {
    expect(tokenizeTitle('資料 https://example.com/a を見る')).toEqual([
      { kind: 'text', text: '資料 ' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: ' を見る' },
    ]);
  });

  it('linkifies every URL in the title', () => {
    const tokens = tokenizeTitle('https://a.example.com と https://b.example.com');
    expect(tokens.filter((t) => t.kind === 'link').map((t) => t.text)).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('keeps port, query and fragment', () => {
    const url = 'https://example.com:8443/path?a=1&b=2#frag';
    expect(onlyLink(url)?.href).toBe(url);
  });

  it('accepts an uppercase scheme but normalizes the href', () => {
    const link = onlyLink('HTTPS://EXAMPLE.COM/Path');
    // The displayed text stays verbatim; only the destination is the normalized form.
    expect(link?.text).toBe('HTTPS://EXAMPLE.COM/Path');
    expect(link?.href).toBe('https://example.com/Path');
  });

  it('accepts a Japanese path and percent-encodes it in the href', () => {
    const link = onlyLink('https://ja.wikipedia.org/wiki/日本語');
    expect(link?.text).toBe('https://ja.wikipedia.org/wiki/日本語');
    expect(link?.href).toBe('https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E');
  });

  it('converts an IDN host to punycode so the href cannot disagree with the resolver', () => {
    // Cyrillic "а" — visually identical to the ASCII apple.com.
    expect(onlyLink('https://аpple.com/')?.href).toBe('https://xn--pple-43d.com/');
  });
});

// The tokenizer's pattern only ever hands `https://…` candidates to the gate, so the scheme
// allowlist is exercised directly here: it is the check that must still hold if the pattern
// is ever widened.
describe('toSafeHref: the scheme allowlist', () => {
  it('accepts https and returns the normalized href', () => {
    expect(toSafeHref('https://example.com')).toBe('https://example.com/');
  });

  const denied = [
    'http://example.com/a',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'obsidian://open?vault=x&file=y',
    'app://obsidian.md/index.html',
    'ftp://example.com/a',
    'mailto:a@example.com',
    'not a url',
    'https://',
  ];

  for (const candidate of denied) {
    it(`rejects ${candidate}`, () => {
      expect(toSafeHref(candidate)).toBeNull();
    });
  }
});

describe('linkify: rejected schemes and hosts', () => {
  const rejected = [
    'http://example.com/a',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'obsidian://open?vault=x&file=y',
    'vbscript:msgbox(1)',
    'ftp://example.com/a',
    'example.com/a',
    'https://',
  ];

  for (const title of rejected) {
    it(`leaves ${title} as plain text`, () => {
      expect(onlyLink(title)).toBeNull();
      expect(text(title).join('')).toBe(title);
    });
  }

  it('refuses a URL carrying credentials (host-spoofing via userinfo)', () => {
    // Reads as google.com but resolves to evil.com.
    expect(onlyLink('https://www.google.com@evil.com/')).toBeNull();
    expect(toSafeHref('https://www.google.com@evil.com/')).toBeNull();
    expect(toSafeHref('https://user:pw@example.com/')).toBeNull();
  });

  it('refuses an over-long URL', () => {
    const long = `https://example.com/${'a'.repeat(2100)}`;
    expect(toSafeHref(long)).toBeNull();
    expect(onlyLink(long)).toBeNull();
  });

  it('does not linkify anything inside HTML-looking text', () => {
    const title = '<img src=x onerror=alert(1)>';
    expect(tokenizeTitle(title)).toEqual([{ kind: 'text', text: title }]);
  });

  it('stops the match at the angle bracket of an HTML-looking wrapper', () => {
    const link = onlyLink('<a href="https://example.com/a">x</a>');
    expect(link?.href).toBe('https://example.com/a');
  });
});

describe('linkify: where the link ends', () => {
  it('drops a trailing sentence period', () => {
    expect(onlyLink('詳細は https://example.com/a.')?.text).toBe('https://example.com/a');
  });

  it('drops trailing ASCII punctuation', () => {
    expect(onlyLink('https://example.com/a,')?.text).toBe('https://example.com/a');
    expect(onlyLink('https://example.com/a!?')?.text).toBe('https://example.com/a');
  });

  it('never swallows Japanese sentence punctuation', () => {
    expect(onlyLink('https://example.com/a。次の話')?.text).toBe('https://example.com/a');
    expect(onlyLink('https://example.com/a、そして')?.text).toBe('https://example.com/a');
  });

  it('drops the closing paren of a markdown link but keeps a balanced pair', () => {
    expect(onlyLink('[資料](https://example.com/a)')?.text).toBe('https://example.com/a');
    expect(onlyLink('https://example.com/a_(b)')?.text).toBe('https://example.com/a_(b)');
  });

  it('refuses a link followed flush by an invisible character', () => {
    // Spelled out rather than pasted: these characters are invisible in an editor.
    const RLO = String.fromCharCode(0x202e); // right-to-left override
    const ZWSP = String.fromCharCode(0x200b); // zero-width space
    // RLO reverses what follows, so a link whose text ends right against it must not be
    // shown as a complete, clickable destination.
    expect(onlyLink(`https://example.com/a${RLO}gnp.exe`)).toBeNull();
    expect(onlyLink(`https://example.com/a${ZWSP}evil`)).toBeNull();
    // A space in between is fine: nothing is glued to the link text.
    expect(onlyLink(`https://example.com/a ${RLO}gnp.exe`)?.text).toBe('https://example.com/a');
  });
});

describe('linkify: structural invariants', () => {
  it('returns no tokens for an empty title', () => {
    expect(tokenizeTitle('')).toEqual([]);
  });

  it('does not scan an absurdly long title', () => {
    const title = `https://example.com/a ${'x'.repeat(5000)}`;
    expect(tokenizeTitle(title)).toEqual([{ kind: 'text', text: title }]);
  });

  it('caps the number of links per title, leaving the rest as text', () => {
    const title = Array.from({ length: 40 }, (_, i) => `https://example.com/${i}`).join(' ');
    const tokens = tokenizeTitle(title);
    expect(tokens.filter((t) => t.kind === 'link')).toHaveLength(32);
    expect(tokens.map((t) => t.text).join('')).toBe(title);
  });
});
