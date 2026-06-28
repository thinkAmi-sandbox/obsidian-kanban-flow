// Pure board-level operations extracted from BoardStore so they can be unit-tested without the
// Svelte runes compiler. The store ($state) calls these and assigns the results.

import { archiveString } from '../constants';
import type { RawBlock } from './types';

/** A `### YYYY-MM` month heading inside the archive section. */
const MONTH_HEADING_RE = /^### (\d{4}-\d{2})[ \t]*$/;

interface MonthSection {
  ym: string;
  /** Card lines under the heading, with surrounding blank lines trimmed. */
  body: string;
}

/**
 * Archives a card under its year-month heading (spec 4.3/5.6). The card moves verbatim: no
 * completion date is stamped and the checkbox is not changed. Cards are grouped under
 * `### YYYY-MM` subheadings sorted newest-first. Content that predates this grouping (flat cards
 * written straight under `## Archive`, or anything a manual/upstream edit left there) is kept in
 * place as a prefix and never reordered (spec 4.3「既存アーカイブの非破壊」). The `***` /
 * `## Archive` scaffold is created on first use.
 */
export function appendCardToArchiveByMonth(
  archive: RawBlock | null,
  cardRaw: string,
  yearMonth: string,
): RawBlock {
  if (!archive) {
    return { raw: `${archiveString}\n\n## Archive\n\n### ${yearMonth}\n\n${cardRaw}` };
  }

  const { prefix, sections } = splitArchive(archive.raw);

  // Bucket by month, merging any duplicate headings (defensive against hand-edited files), then
  // add the new card to its bucket.
  const byMonth = new Map<string, string>();
  for (const s of sections) {
    const prev = byMonth.get(s.ym);
    byMonth.set(s.ym, prev ? `${prev}\n${s.body}` : s.body);
  }
  const existing = byMonth.get(yearMonth);
  byMonth.set(yearMonth, existing ? `${existing}\n${cardRaw}` : cardRaw);

  const sorted = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  const sectionText = sorted.map(([ym, body]) => `### ${ym}\n\n${body}`).join('\n\n');
  return { raw: prefix ? `${prefix}\n\n${sectionText}` : sectionText };
}

/**
 * Splits archive raw into the leading prefix (`***`, `## Archive`, and any pre-grouping flat
 * content) and the list of `### YYYY-MM` month sections. Lines before the first month heading are
 * the prefix; every other line is bucketed under the heading above it.
 */
function splitArchive(raw: string): { prefix: string; sections: MonthSection[] } {
  const sections: MonthSection[] = [];
  const prefixLines: string[] = [];
  let current: { ym: string; lines: string[] } | null = null;

  for (const line of raw.split('\n')) {
    const m = line.match(MONTH_HEADING_RE);
    if (m) {
      if (current) sections.push({ ym: current.ym, body: current.lines.join('\n').trim() });
      current = { ym: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      prefixLines.push(line);
    }
  }
  if (current) sections.push({ ym: current.ym, body: current.lines.join('\n').trim() });
  return { prefix: prefixLines.join('\n').trim(), sections };
}
