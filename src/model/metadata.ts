// Metadata separation rules (spec 4.2). All functions here are PURE and date-injected:
// "today" is never read from the clock in this module, so parser/metadata tests stay
// deterministic (spec 9 / plan point 6). The store is the only place that supplies todayStr().
//
// Marker convention (user-confirmed): ➕ = registration (added) date, ✅ = completion date.
// Tasks-plugin / Dataview compatible.

export const ADDED_MARKER = '➕'; // ➕
export const DONE_MARKER = '✅'; // ✅

/**
 * A single trailing metadata token. Matches `<space*><marker><space><YYYY-MM-DD>` anchored
 * at end of string. The leading whitespace is captured into `raw` so rebuilding is exact.
 */
export const META_RE = /\s*(➕|✅)\s(\d{4}-\d{2}-\d{2})$/;

/** Matches a top-level (un-indented) card line: `- [ ] `, `* [x] `, custom `- [/] `, etc. */
export const CARD_START_RE = /^[-*+] \[.\] /;

/** Captures the checkbox prefix of a card's first line: group 1 = up to `[`, group 2 = the check char. */
const CHECKBOX_RE = /^(\s*[-*+]\s+\[)(.)\]\s/;

export interface MetaToken {
  marker: string;
  date: string;
  /** Exact source text of the token, including its leading whitespace. */
  raw: string;
}

/** Splits a (possibly multi-line) card raw into its first line and the remainder (incl. leading \n). */
export function splitFirstLine(titleRaw: string): { first: string; rest: string } {
  const nl = titleRaw.indexOf('\n');
  if (nl === -1) return { first: titleRaw, rest: '' };
  return { first: titleRaw.slice(0, nl), rest: titleRaw.slice(nl) };
}

/**
 * Peels trailing metadata tokens off a single line, from the end, repeatedly (spec 4.2-2).
 * Returns the body (text before the trailing token run) and the tokens in source order.
 * Markers appearing earlier in the body (not in the trailing run) are left untouched.
 */
export function tokenizeTrailingMeta(line: string): { body: string; tokens: MetaToken[] } {
  let body = line;
  const tokens: MetaToken[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const m = body.match(META_RE);
    if (!m) break;
    tokens.unshift({ marker: m[1], date: m[2], raw: m[0] });
    body = body.slice(0, body.length - m[0].length);
  }
  return { body, tokens };
}

function rebuild(body: string, tokens: MetaToken[]): string {
  return body + tokens.map((t) => t.raw).join('');
}

function lastDateFor(titleRaw: string, marker: string): string | null {
  const { tokens } = tokenizeTrailingMeta(splitFirstLine(titleRaw).first);
  const matching = tokens.filter((t) => t.marker === marker);
  return matching.length ? matching[matching.length - 1].date : null;
}

/** Last registration (➕) date in the trailing run, or null (spec 4.2-3: value = last). */
export function getAddedDate(titleRaw: string): string | null {
  return lastDateFor(titleRaw, ADDED_MARKER);
}

/** Last completion (✅) date in the trailing run, or null. */
export function getDoneDate(titleRaw: string): string | null {
  return lastDateFor(titleRaw, DONE_MARKER);
}

/** Display title = first line with the checkbox prefix and trailing metadata removed (spec 4.4). */
export function getDisplayTitle(titleRaw: string): string {
  const { first } = splitFirstLine(titleRaw);
  const { body } = tokenizeTrailingMeta(first);
  const cm = body.match(CHECKBOX_RE);
  const text = cm ? body.slice(cm[0].length) : body.replace(/^\s*[-*+]\s+/, '');
  return text.trim();
}

function setCheckbox(line: string, char: string): string {
  const m = line.match(CHECKBOX_RE);
  if (!m) return line;
  const prefixLen = m[1].length; // up to and including '['
  return line.slice(0, prefixLen) + char + line.slice(prefixLen + 1);
}

/**
 * Crossing INTO a complete lane (spec 5.3): set the checkbox to `[x]` and append a fresh
 * `✅ <date>`, overriding any existing trailing completion token (spec 4.2-3/4 override).
 * The registration (➕) token is preserved.
 */
export function markComplete(titleRaw: string, date: string): string {
  const { first, rest } = splitFirstLine(titleRaw);
  const { body, tokens } = tokenizeTrailingMeta(first);
  const kept = tokens.filter((t) => t.marker !== DONE_MARKER);
  let line = setCheckbox(rebuild(body, kept), 'x');
  line += ` ${DONE_MARKER} ${date}`;
  return line + rest;
}

/**
 * Crossing OUT of a complete lane (spec 5.3): remove ALL trailing completion (✅) tokens
 * and reset the checkbox to `[ ]`. Registration (➕) tokens are kept.
 */
export function unmarkComplete(titleRaw: string): string {
  const { first, rest } = splitFirstLine(titleRaw);
  const { body, tokens } = tokenizeTrailingMeta(first);
  const kept = tokens.filter((t) => t.marker !== DONE_MARKER);
  const line = setCheckbox(rebuild(body, kept), ' ');
  return line + rest;
}

/**
 * Completion sync driven by a move (spec 5.3). Only touches the card when the move crosses
 * the complete-lane boundary; otherwise returns the raw unchanged.
 */
export function syncOnMove(
  titleRaw: string,
  fromComplete: boolean,
  toComplete: boolean,
  today: string,
): string {
  if (fromComplete === toComplete) return titleRaw;
  return toComplete ? markComplete(titleRaw, today) : unmarkComplete(titleRaw);
}

/** Builds a fresh card raw from plain display text, stamping the registration date (spec 5.2). */
export function makeCardRaw(displayText: string, addedDate: string, checked = false): string {
  return `- [${checked ? 'x' : ' '}] ${displayText} ${ADDED_MARKER} ${addedDate}`;
}

function pickDate(tokens: MetaToken[], marker: string): string | null {
  const matching = tokens.filter((t) => t.marker === marker);
  return matching.length ? matching[matching.length - 1].date : null;
}

/**
 * Replaces the first-line body of a card with new editor text (spec 4.2-4). The checkbox prefix
 * and continuation lines are preserved. Existing metadata (➕ registration / ✅ completion) is
 * carried over so editing the title does not drop dates; if the user typed a trailing date in
 * `newText`, that value overrides the existing one for its marker.
 */
export function setDisplayTitle(titleRaw: string, newText: string): string {
  const { first, rest } = splitFirstLine(titleRaw);
  const cm = first.match(CHECKBOX_RE);
  const prefix = cm ? first.slice(0, cm[0].length) : '';

  const existing = tokenizeTrailingMeta(first).tokens;
  const typed = tokenizeTrailingMeta(newText);
  const added = pickDate(typed.tokens, ADDED_MARKER) ?? pickDate(existing, ADDED_MARKER);
  const done = pickDate(typed.tokens, DONE_MARKER) ?? pickDate(existing, DONE_MARKER);

  let line = prefix + typed.body.replace(/\s+$/, '');
  if (added) line += ` ${ADDED_MARKER} ${added}`;
  if (done) line += ` ${DONE_MARKER} ${done}`;
  return line + rest;
}
