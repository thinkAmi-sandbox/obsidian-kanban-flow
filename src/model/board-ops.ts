// Pure board-level operations extracted from BoardStore so they can be unit-tested without the
// Svelte runes compiler. The store ($state) calls these and assigns the results.

import { archiveString } from '../constants';
import type { RawBlock } from './types';

/**
 * Appends a card's raw text to the archive section (spec 4.3). The card is moved verbatim:
 * no completion date is stamped and the checkbox is not changed. Creates the `***` / `## Archive`
 * scaffold on first use; otherwise appends as a new list item (single-newline join).
 */
export function appendCardToArchive(archive: RawBlock | null, cardRaw: string): RawBlock {
  if (!archive) {
    return { raw: `${archiveString}\n\n## Archive\n\n${cardRaw}` };
  }
  return { raw: `${archive.raw}\n${cardRaw}` };
}
