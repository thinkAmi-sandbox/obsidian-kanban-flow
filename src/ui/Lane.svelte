<script lang="ts">
  import { getContext } from 'svelte';
  import { Menu } from 'obsidian';
  import { dndzone } from 'svelte-dnd-action';
  import { KF_CONTEXT, type KfContext } from './context';
  import { confirmDialog } from './confirm';
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

  const { store, app } = getContext<KfContext>(KF_CONTEXT);

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

  // The bulk archive targets every complete lane at once (spec 5.6); this menu is the entry point
  // surfaced on the complete lane's header.
  function openLaneMenu(e: MouseEvent): void {
    e.preventDefault();
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle('完了カードをアーカイブ')
        .setIcon('archive')
        .onClick(() => void archiveCompleted()),
    );
    menu.showAtMouseEvent(e);
  }

  async function archiveCompleted(): Promise<void> {
    const count = store.completedCardCount();
    if (count === 0) return;
    const ok = await confirmDialog(app, {
      title: '完了カードをアーカイブ',
      message: `完了レーンのカード ${count} 件を年月別にアーカイブへ移動します。よろしいですか？`,
      cta: 'アーカイブ',
    });
    if (ok) store.archiveCompletedCards();
  }
</script>

<div class="kf-lane" class:kf-lane-complete={column.isComplete}>
  <div class="kf-lane-header">
    <span class="kf-lane-title">{column.title}</span>
    <span class="kf-lane-header-right">
      <span class="kf-lane-count">{column.items.length}</span>
      {#if column.isComplete}
        <button class="kf-lane-menu" aria-label="レーンメニュー" onclick={openLaneMenu}>⋯</button>
      {/if}
    </span>
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
  .kf-lane-header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .kf-lane-count {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.85em;
  }
  .kf-lane-menu {
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    font-size: 1em;
  }
  .kf-lane-menu:hover {
    color: var(--text-normal);
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
