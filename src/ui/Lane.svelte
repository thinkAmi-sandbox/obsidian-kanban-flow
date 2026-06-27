<script lang="ts">
  import { getContext } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { KF_CONTEXT, type KfContext } from './context';
  import { autofocus } from './actions';
  import { CARD_DND_TYPE, FLIP_DURATION_MS, type DndColumn, type DndItem } from './dnd';
  import Card from './Card.svelte';

  let {
    column,
    onconsider,
    onfinalize,
  }: {
    column: DndColumn;
    onconsider: (e: CustomEvent<{ items: DndItem[] }>) => void;
    onfinalize: (e: CustomEvent<{ items: DndItem[] }>) => void;
  } = $props();

  const { store } = getContext<KfContext>(KF_CONTEXT);

  let adding = $state(false);
  let draft = $state('');

  function startAdd(): void {
    draft = '';
    adding = true;
  }

  function commitAdd(): void {
    const text = draft.trim();
    if (text) store.addCard(column.id, text);
    draft = '';
    adding = false;
  }

  function cancelAdd(): void {
    draft = '';
    adding = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    // Ignore keys while an IME composition is active so confirming a Japanese conversion with
    // Enter/Escape does not also create/cancel the card.
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelAdd();
    }
  }
</script>

<div class="kf-lane" class:kf-lane-complete={column.isComplete}>
  <div class="kf-lane-header">
    <span class="kf-lane-title">{column.title}</span>
    <span class="kf-lane-count">{column.items.length}</span>
  </div>

  <div
    class="kf-lane-cards"
    use:dndzone={{ items: column.items, type: CARD_DND_TYPE, flipDurationMs: FLIP_DURATION_MS, dropTargetStyle: {} }}
    onconsider={onconsider}
    onfinalize={onfinalize}
  >
    {#each column.items as item (item.id)}
      <Card card={item} />
    {/each}
  </div>

  <div class="kf-lane-add">
    {#if adding}
      <textarea
        class="kf-add-input"
        placeholder="カードのタイトル…"
        bind:value={draft}
        onkeydown={onKeydown}
        onblur={commitAdd}
        use:autofocus
        rows="2"
      ></textarea>
    {:else}
      <button class="kf-add-button" onclick={startAdd}>+ カードを追加</button>
    {/if}
  </div>
</div>

<style>
  .kf-lane {
    display: flex;
    flex-direction: column;
    flex: 0 0 272px;
    max-height: 100%;
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 8px;
    box-sizing: border-box;
  }
  .kf-lane-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    padding: 4px 6px 8px;
  }
  .kf-lane-count {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.85em;
  }
  .kf-lane-cards {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 24px;
  }
  .kf-lane-add {
    padding-top: 6px;
  }
  .kf-add-button {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .kf-add-button:hover {
    background: var(--background-modifier-hover);
  }
  .kf-add-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font: inherit;
  }
</style>
