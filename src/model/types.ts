// Core data model (spec 4.4). Kept intentionally minimal: only what we structure is typed;
// everything we don't understand is preserved verbatim as raw text.

/** An opaque block we don't interpret but must round-trip in place (spec 4.4-4). */
export interface RawBlock {
  raw: string;
}

/**
 * A card. `titleRaw` is the FULL verbatim card text including the `- [ ] ` list marker,
 * the checkbox char, any trailing metadata, and indented continuation lines (multi-line
 * cards, spec 4.4-1). Completion state is derived from lane position, never stored here.
 * `id` is a render-stability key only; it is never serialized.
 */
export interface Card {
  id: string;
  titleRaw: string;
}

export interface Lane {
  id: string;
  /** Heading text after `## ` (verbatim). */
  title: string;
  /** Derived from a `**Complete**` paragraph under the heading (spec 4.1 / 5.3). */
  isComplete: boolean;
  cards: Card[];
  /** Bare paragraphs under the heading that are neither the complete marker nor cards. */
  unknownBlocks: RawBlock[];
}

export interface Board {
  /** Leading YAML block including the `---` fences, verbatim. Empty when absent. */
  frontmatter: string;
  lanes: Lane[];
  /** Everything from the `***` separator onward, verbatim (spec 4.3). */
  archive: RawBlock | null;
  /** The trailing `%% kanban:settings ... %%` block, verbatim (spec 4.4-2). */
  settingsBlock: string | null;
}
