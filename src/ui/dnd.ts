// Thin adaptor between svelte-dnd-action and the store (spec 6.3). The board is projected into
// plain (non-proxy) column/item objects for the library to mutate freely; on finalize the result
// is reconciled back into the store. Keeping the library-facing objects plain avoids interference
// between svelte-dnd-action's array bookkeeping and Svelte's $state proxies (plan point 4).

import type { Board } from '../model/types';

export const CARD_DND_TYPE = 'kf-card';
export const FLIP_DURATION_MS = 150;

export interface DndItem {
  id: string;
  titleRaw: string;
}

export interface DndColumn {
  id: string;
  title: string;
  isComplete: boolean;
  items: DndItem[];
}

/** Snapshot the store board into plain column/item objects for the D&D zones. */
export function toColumns(board: Board): DndColumn[] {
  return board.lanes.map((lane) => ({
    id: lane.id,
    title: lane.title,
    isComplete: lane.isComplete,
    items: lane.cards.map((card) => ({ id: card.id, titleRaw: card.titleRaw })),
  }));
}
