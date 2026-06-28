import type { App } from 'obsidian';
import type { BoardStore } from '../model/store.svelte';

/** Shared context distributed by Board.svelte to Lane/Card (spec 6.1). */
export interface KfContext {
  store: BoardStore;
  app: App;
}

export const KF_CONTEXT = Symbol('kanban-flow-context');
