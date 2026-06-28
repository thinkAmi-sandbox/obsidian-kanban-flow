// Single source of truth for one board (spec 6.1, StateManager pattern via Svelte 5 runes).
// All state mutations live here; the UI (and the D&D layer) only call these methods. Each
// mutation drives requestSave(). "today" is injected so this module never reads the clock.

import { serializeBoard } from '../parser/serialize';
import { archiveYearMonth, makeCardRaw, setDisplayTitle, syncOnMove } from './metadata';
import { appendCardToArchiveByMonth } from './board-ops';
import type { Board, Card, Lane } from './types';

export interface StoreCallbacks {
  requestSave: () => void;
  today: () => string;
}

/** Minimal shape the D&D layer feeds into reconcile(): lane id + ordered card ids. */
export interface ReconcileColumn {
  id: string;
  items: { id: string }[];
}

export class BoardStore {
  board: Board = $state({ frontmatter: '', lanes: [], archive: null, settingsBlock: null });
  /** Non-null when the file could not be parsed; the view shows a fallback instead of crashing. */
  error: string | null = $state(null);

  private cb: StoreCallbacks;
  private idSeq = 0;

  constructor(board: Board, cb: StoreCallbacks) {
    this.board = board;
    this.cb = cb;
  }

  serialize(): string {
    return serializeBoard(this.board);
  }

  /** External-edit replacement (spec 8.3). Does not drive a save. */
  replaceBoard(next: Board): void {
    this.board = next;
    this.error = null;
  }

  setError(message: string): void {
    this.error = message;
  }

  private newId(): string {
    return `local-${this.idSeq++}`;
  }

  private lane(laneId: string): Lane | undefined {
    return this.board.lanes.find((l) => l.id === laneId);
  }

  private laneOfCard(cardId: string): Lane | undefined {
    return this.board.lanes.find((l) => l.cards.some((c) => c.id === cardId));
  }

  // --- Card operations (spec 5.2 / 5.3) ---

  addCard(laneId: string, displayText: string): void {
    const lane = this.lane(laneId);
    if (!lane) return;
    const raw = makeCardRaw(displayText, this.cb.today(), lane.isComplete);
    lane.cards.push({ id: this.newId(), titleRaw: raw });
    this.cb.requestSave();
  }

  updateCardTitle(cardId: string, newText: string): void {
    const lane = this.laneOfCard(cardId);
    const card = lane?.cards.find((c) => c.id === cardId);
    if (!card) return;
    card.titleRaw = setDisplayTitle(card.titleRaw, newText);
    this.cb.requestSave();
  }

  /**
   * Reconcile the whole board to a drag-and-drop arrangement (spec 5.3 / plan 4). The view is a
   * list of columns (lane id + ordered card ids). Card objects are kept by identity; a card whose
   * lane crossed the complete boundary gets its completion synced. Idempotent: calling it again
   * with an already-applied arrangement changes nothing (the two-zone finalize fires twice).
   */
  reconcile(columns: ReconcileColumn[]): void {
    const index = new Map<string, { card: Card; complete: boolean }>();
    for (const lane of this.board.lanes) {
      for (const card of lane.cards) index.set(card.id, { card, complete: lane.isComplete });
    }

    for (const col of columns) {
      const lane = this.lane(col.id);
      if (!lane) continue;
      const next: Card[] = [];
      for (const item of col.items) {
        const entry = index.get(item.id);
        if (!entry) continue; // unknown / shadow placeholder ids are ignored
        if (entry.complete !== lane.isComplete) {
          entry.card.titleRaw = syncOnMove(
            entry.card.titleRaw,
            entry.complete,
            lane.isComplete,
            this.cb.today(),
          );
        }
        next.push(entry.card);
      }
      lane.cards = next;
    }
    this.cb.requestSave();
  }

  /** Move a card to a target lane/index, applying completion-boundary sync only (spec 5.3). */
  moveCard(cardId: string, toLaneId: string, toIndex: number): void {
    const from = this.laneOfCard(cardId);
    const to = this.lane(toLaneId);
    if (!from || !to) return;
    const idx = from.cards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    const [card] = from.cards.splice(idx, 1);
    card.titleRaw = syncOnMove(card.titleRaw, from.isComplete, to.isComplete, this.cb.today());
    const clamped = Math.max(0, Math.min(toIndex, to.cards.length));
    to.cards.splice(clamped, 0, card);
    this.cb.requestSave();
  }

  /** Number of cards currently in complete lanes — the bulk-archive target (spec 5.6). */
  completedCardCount(): number {
    let n = 0;
    for (const lane of this.board.lanes) if (lane.isComplete) n += lane.cards.length;
    return n;
  }

  /**
   * Bulk-archive every card in every complete lane, grouped by year-month (spec 5.6 / 4.3).
   * Cards move verbatim (no ✅, no [x]); the grouping key is the completion date, falling back to
   * the registration date, then today. Returns the number of cards moved (0 = no-op, no save).
   */
  archiveCompletedCards(): number {
    const today = this.cb.today();
    let moved = 0;
    for (const lane of this.board.lanes) {
      if (!lane.isComplete || lane.cards.length === 0) continue;
      for (const card of lane.cards) {
        const ym = archiveYearMonth(card.titleRaw, today);
        this.board.archive = appendCardToArchiveByMonth(this.board.archive, card.titleRaw, ym);
        moved++;
      }
      lane.cards = [];
    }
    if (moved > 0) this.cb.requestSave();
    return moved;
  }

  deleteCard(cardId: string): void {
    const from = this.laneOfCard(cardId);
    if (!from) return;
    const idx = from.cards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    from.cards.splice(idx, 1);
    this.cb.requestSave();
  }

  /** Helper used by the D&D layer to read a lane's plain (non-proxy) card list. */
  laneCards(laneId: string): Card[] {
    const lane = this.lane(laneId);
    return lane ? lane.cards : [];
  }
}
