// Hand-written, line-based parser (spec 4.4, no mdast). Top-down: peel the outermost
// containers (frontmatter, settings, archive) first, then split the remainder into lanes,
// then each lane body into blank-line-separated runs classified as complete-marker / cards /
// unknown blocks. Anything not understood is preserved verbatim.

import { completeString } from '../constants';
import { CARD_START_RE } from '../model/metadata';
import type { Board, Card, Lane } from '../model/types';

/** Normalize newlines to \n and guarantee exactly one trailing newline (spec 9 / plan point 5). */
export function normalizeMd(md: string): string {
  let s = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/\n+$/, '');
  return s + '\n';
}

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${idCounter++}`;
}

export function parseBoard(md: string): Board {
  idCounter = 0;
  const norm = normalizeMd(md);

  // 1. Frontmatter: leading `---` ... `---` block, kept verbatim (without trailing newline).
  let frontmatter = '';
  let body = norm;
  const fm = norm.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    frontmatter = fm[0].replace(/\n$/, '');
    body = norm.slice(fm[0].length);
  }

  // 2. Settings block at the very tail.
  let settingsBlock: string | null = null;
  const sm = body.match(/%% kanban:settings\n[\s\S]*?\n%%[ \t]*\n?$/);
  if (sm) {
    settingsBlock = sm[0].replace(/\n+$/, '');
    body = body.slice(0, sm.index);
  }

  // 3. Archive: from the first standalone `***` line to the end (before settings).
  let archive: Board['archive'] = null;
  const am = body.match(/^\*\*\*[ \t]*$/m);
  if (am && am.index !== undefined) {
    archive = { raw: body.slice(am.index).trim() };
    body = body.slice(0, am.index);
  }

  // 4. Lanes.
  const lanes = parseLanes(body);

  return { frontmatter, lanes, archive, settingsBlock };
}

function parseLanes(region: string): Lane[] {
  const trimmed = region.replace(/^\n+/, '').replace(/\n+$/, '');
  if (!trimmed) return [];

  const lanes: Lane[] = [];
  let cur: { title: string; bodyLines: string[] } | null = null;

  for (const line of trimmed.split('\n')) {
    const h = line.match(/^## (.*)$/);
    if (h) {
      if (cur) lanes.push(buildLane(cur.title, cur.bodyLines.join('\n')));
      cur = { title: h[1], bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
    // Content before the first heading is ignored (not a valid board shape).
  }
  if (cur) lanes.push(buildLane(cur.title, cur.bodyLines.join('\n')));
  return lanes;
}

function buildLane(title: string, bodyText: string): Lane {
  const lane: Lane = {
    id: nextId('lane'),
    title,
    isComplete: false,
    cards: [],
    unknownBlocks: [],
  };

  const trimmed = bodyText.replace(/^\n+/, '').replace(/\n+$/, '');
  if (!trimmed) return lane;

  // Blank-line-separated runs. A card list is one run of consecutive non-blank lines.
  for (const run of trimmed.split(/\n[ \t]*\n+/)) {
    const r = run.replace(/\n+$/, '');
    if (r === completeString) {
      lane.isComplete = true;
    } else if (CARD_START_RE.test(r.split('\n', 1)[0])) {
      lane.cards.push(...parseCardRun(r));
    } else {
      lane.unknownBlocks.push({ raw: r });
    }
  }
  return lane;
}

/** Splits a list run into cards; indented continuation lines attach to the current card. */
function parseCardRun(run: string): Card[] {
  const cards: Card[] = [];
  let curLines: string[] | null = null;
  for (const line of run.split('\n')) {
    if (CARD_START_RE.test(line)) {
      if (curLines) cards.push({ id: nextId('card'), titleRaw: curLines.join('\n') });
      curLines = [line];
    } else if (curLines) {
      curLines.push(line);
    } else {
      curLines = [line];
    }
  }
  if (curLines) cards.push({ id: nextId('card'), titleRaw: curLines.join('\n') });
  return cards;
}
