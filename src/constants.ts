// Pure constants and string helpers. MUST stay free of any `obsidian` import so the
// parser/model layers remain testable as plain TypeScript (spec 9, M0).

export const VIEW_TYPE = 'kanban-flow';

/** Frontmatter key that identifies a Kanban board. Upstream-compatible (obsidian-kanban). */
export const frontmatterKey = 'kanban-plugin';

/** Paragraph marker under a heading that flags the lane as a "complete" lane. */
export const completeString = '**Complete**';

/** Thematic break that separates active lanes from the archive section. */
export const archiveString = '***';

/** Default content for a brand-new board (spec 4.1). Fixed 5 lanes; DONE is the complete lane. */
export const BOARD_TEMPLATE = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## TODO',
  '',
  '## DOING',
  '',
  '## TODAY',
  '',
  '## DONE',
  '',
  completeString,
  '',
  '## PENDING',
  '',
].join('\n');

/**
 * Detects a Kanban board from raw file text without the metadata cache.
 * Mirrors upstream `hasFrontmatterKeyRaw` (obsidian-kanban/src/helpers.ts:43-57).
 */
export function hasFrontmatterKeyRaw(data: string): boolean {
  if (!data) return false;
  const match = data.match(/---\s+([\w\W]+?)\s+---/);
  if (!match) return false;
  return new RegExp(`^\\s*${frontmatterKey}\\s*:`, 'm').test(match[1]);
}
