// Inverse of parse.ts. Reassembles the board by joining verbatim segments with canonical
// blank-line spacing. Cards are emitted exactly as stored (titleRaw), so unknown notation
// (tags, ^blockId, @{date}, custom checkbox chars) round-trips without loss (spec 4.4).

import { completeString } from '../constants';
import type { Board, Lane } from '../model/types';

export function serializeBoard(board: Board): string {
  const sections: string[] = [];
  if (board.frontmatter) sections.push(board.frontmatter);
  for (const lane of board.lanes) sections.push(laneToMd(lane));
  if (board.archive) sections.push(board.archive.raw);
  if (board.settingsBlock) sections.push(board.settingsBlock);
  return sections.join('\n\n') + '\n';
}

function laneToMd(lane: Lane): string {
  // Blocks separated by a blank line. The whole card list is one block (single-newline joined).
  const blocks: string[] = [];
  if (lane.isComplete) blocks.push(completeString);
  for (const u of lane.unknownBlocks) blocks.push(u.raw);
  if (lane.cards.length) blocks.push(lane.cards.map((c) => c.titleRaw).join('\n'));

  const heading = '## ' + lane.title;
  return blocks.length ? heading + '\n\n' + blocks.join('\n\n') : heading;
}
