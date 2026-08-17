// Display-only autolinking of bare https URLs inside a card's display title (spec 5.1).
//
// Card text is UNTRUSTED input: the board file can be edited by hand, written by other
// plugins, or arrive from another device via sync. Everything here is therefore built to
// fail closed — anything we cannot positively prove to be a plain `https:` URL stays plain
// text. Two rules carry most of the security weight:
//
//   1. This module returns TOKENS, never HTML. The caller renders them through Svelte's
//      normal text/attribute bindings, so `{@html}` / innerHTML never enters the card path
//      and HTML injection is structurally impossible.
//   2. A candidate is accepted only after `new URL()` agrees it is `https:` — the regex
//      below only *finds* candidates, it never decides whether one is safe.
//
// This module is pure (no `obsidian` / DOM imports) so it stays unit-testable like the
// parser and metadata layers.

/** A run of the display title: either inert text or an accepted external link. */
export type TitleToken =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string };

/** Titles longer than this are not scanned at all (bounded work per render). */
const MAX_TITLE_LENGTH = 4096;

/** Candidates longer than this are rejected outright. */
const MAX_URL_LENGTH = 2048;

/** At most this many links per card; the rest of the title renders as text. */
const MAX_LINKS_PER_TITLE = 32;

/**
 * Finds `https://…` candidates. Deliberately narrow — when in doubt it is better to stop
 * early and linkify less than to swallow trailing prose into the destination.
 *
 * The character class stops the match at:
 * - whitespace (JS `\s`, which already covers NBSP and the ideographic space)
 * - quoting/bracketing characters that commonly wrap a URL in prose: `<>"'`, backtick, backslash
 * - invisible characters: `\p{Cc}` (C0/C1 controls) and `\p{Cf}` (soft hyphen, zero-width and
 *   bidi controls such as RLO). Without this, an RLO inside the match could make a link's own
 *   text read right-to-left, e.g. showing `…/exe.png` for a path ending in `.exe`.
 * - Japanese full-width punctuation, which in practice ends a sentence rather than a URL
 *
 * A fresh RegExp is returned per call because the `g` flag carries mutable `lastIndex`.
 */
function urlCandidatePattern(): RegExp {
  return /https:\/\/[^\s<>"'`\\\p{Cc}\p{Cf}、。，．！？「」『』（）【】]+/giu;
}

/** Invisible characters that must not sit flush against a link (see `urlCandidatePattern`). */
const INVISIBLE_RE = /[\p{Cc}\p{Cf}]/u;

/** Trailing characters that are far more likely to be prose/markdown than part of the URL. */
const TRAILING_PUNCTUATION = '.,;:!?*';

/** Closing brackets are dropped only when the URL does not open them itself. */
const BRACKET_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];

function countChar(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

/**
 * Trims prose that the greedy match swallowed: `see https://example.com/a.` must link to
 * `https://example.com/a`, and `[label](https://example.com/a)` must not keep the `)` that
 * belongs to the markdown syntax — while `https://example.com/a_(b)` keeps its own pair.
 */
function trimTrailingPunctuation(candidate: string): string {
  let out = candidate;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (TRAILING_PUNCTUATION.includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const pair = BRACKET_PAIRS.find(([, close]) => close === last);
    if (pair && countChar(out, pair[1]) > countChar(out, pair[0])) {
      out = out.slice(0, -1);
      continue;
    }
    break;
  }
  return out;
}

/**
 * The security gate. Returns the normalized href to put in the DOM, or null to leave the
 * text inert. Rejections, in order:
 * - over-long input (bounded work, and no realistic legitimate case)
 * - anything `new URL()` refuses to parse
 * - any scheme other than `https:` — this is what keeps `javascript:`, `data:`, `file:` and
 *   `obsidian://` out, and it is an allowlist rather than a blocklist on purpose
 * - embedded credentials: `https://www.google.com@evil.com/` reads as Google but resolves
 *   to evil.com, so such URLs are never turned into a clickable link
 *
 * There is deliberately no separate host check: `https:` is a "special scheme", so a URL with
 * an empty host fails to parse at all and is already rejected above.
 *
 * The returned value is `URL.href`, i.e. the parser's own normalization (IDN hosts become
 * punycode), so the attribute can never disagree with what the browser will resolve.
 */
export function toSafeHref(candidate: string): string | null {
  if (candidate.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

/**
 * Splits a display title into text/link tokens. Concatenating every token's `text` always
 * reproduces the input exactly: this function never rewrites, drops or reorders characters,
 * it only marks which runs are safe to render as an anchor.
 */
export function tokenizeTitle(title: string): TitleToken[] {
  if (!title) return [];
  if (title.length > MAX_TITLE_LENGTH) return [{ kind: 'text', text: title }];

  const tokens: TitleToken[] = [];
  const pattern = urlCandidatePattern();
  let cursor = 0;
  let links = 0;
  let match: RegExpExecArray | null;

  while (links < MAX_LINKS_PER_TITLE && (match = pattern.exec(title)) !== null) {
    const candidate = trimTrailingPunctuation(match[0]);
    const end = match.index + candidate.length;
    const href = toSafeHref(candidate);
    // A character the pattern refused to include, sitting flush against the link, would be
    // invisible next to visible link text — refuse the link rather than show a truncated one.
    const flush = title.charAt(end);
    if (!href || (flush !== '' && INVISIBLE_RE.test(flush))) continue;

    if (match.index > cursor) tokens.push({ kind: 'text', text: title.slice(cursor, match.index) });
    tokens.push({ kind: 'link', text: candidate, href });
    cursor = end;
    pattern.lastIndex = end;
    links++;
  }

  if (cursor < title.length) tokens.push({ kind: 'text', text: title.slice(cursor) });
  return tokens;
}
