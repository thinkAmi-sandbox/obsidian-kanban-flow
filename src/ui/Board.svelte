<script lang="ts">
  import { setContext } from 'svelte';
  import type { App } from 'obsidian';
  import type { BoardStore } from '../model/store.svelte';
  import { KF_CONTEXT, type KfContext } from './context';
  import { toColumns, type DndColumn, type DndItem } from './dnd';
  import Lane from './Lane.svelte';

  let { store, app }: { store: BoardStore; app: App } = $props();

  setContext<KfContext>(KF_CONTEXT, {
    get store() {
      return store;
    },
    get app() {
      return app;
    },
  });

  // Local D&D view. While not dragging, it tracks the store (so add/edit/delete/external edits
  // reflect); while dragging, consider/finalize own it and the store is touched only on finalize.
  // Populated by the $effect below on mount and whenever the store changes.
  let columns = $state<DndColumn[]>([]);
  let dragging = false;

  $effect(() => {
    const next = toColumns(store.board); // reactive read of store.board
    if (!dragging) columns = next;
  });

  function setColumnItems(laneId: string, items: DndItem[]): void {
    const col = columns.find((c) => c.id === laneId);
    if (col) col.items = items;
  }

  function handleConsider(laneId: string, e: CustomEvent<{ items: DndItem[] }>): void {
    dragging = true;
    setColumnItems(laneId, e.detail.items);
  }

  function handleFinalize(laneId: string, e: CustomEvent<{ items: DndItem[] }>): void {
    setColumnItems(laneId, e.detail.items);
    store.reconcile(columns);
    dragging = false;
  }
</script>

{#if store.error}
  <div class="kf-error">
    <strong>このファイルを解析できませんでした。</strong>
    <pre>{store.error}</pre>
    <p>Markdown で開いて内容を修正してください。</p>
  </div>
{:else if columns.length === 0}
  <div class="kf-empty">レーンがありません。Markdown モードで <code>## 見出し</code> を追加してください。</div>
{:else}
  <div class="kf-board">
    {#each columns as column (column.id)}
      <Lane
        {column}
        onconsider={(e) => handleConsider(column.id, e)}
        onfinalize={(e) => handleFinalize(column.id, e)}
      />
    {/each}
  </div>
{/if}

<style>
  .kf-board {
    display: flex;
    flex-direction: row;
    gap: 12px;
    align-items: flex-start;
    overflow-x: auto;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
  }
  .kf-error,
  .kf-empty {
    padding: 16px;
    color: var(--text-muted);
  }
  .kf-error pre {
    white-space: pre-wrap;
    color: var(--text-error);
  }
</style>
