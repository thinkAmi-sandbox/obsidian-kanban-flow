<script lang="ts">
  import { getContext } from 'svelte';
  import { getDisplayTitle } from '../model/metadata';
  import { KF_CONTEXT, type KfContext } from './context';
  import { confirmDialog } from './confirm';
  import { autofocus, icon } from './actions';
  import type { DndItem } from './dnd';

  let { card }: { card: DndItem } = $props();
  const { store, app } = getContext<KfContext>(KF_CONTEXT);

  const title = $derived(getDisplayTitle(card.titleRaw));

  // Inline editing is local component state; it commits to the store only on blur/Enter
  // and is discarded on Escape (spec / plan point 2: no per-keystroke saves).
  let editing = $state(false);
  let draft = $state('');

  function startEdit(): void {
    draft = title;
    editing = true;
  }

  function commit(): void {
    if (!editing) return;
    editing = false;
    const next = draft.trim();
    if (next && next !== title) store.updateCardTitle(card.id, next);
  }

  function cancel(): void {
    editing = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    // Ignore keys while an IME composition is active so confirming a Japanese conversion with
    // Enter/Escape does not also commit/cancel the card edit.
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  async function confirmDelete(): Promise<void> {
    const ok = await confirmDialog(app, {
      title: 'カードを削除',
      message: `「${title}」を削除しますか？この操作は取り消せません(カードはファイルから削除されます)。`,
      cta: '削除',
      danger: true,
    });
    if (ok) store.deleteCard(card.id);
  }
</script>

<div class="kf-card" role="listitem">
  {#if editing}
    <textarea
      class="kf-card-edit"
      bind:value={draft}
      onkeydown={onKeydown}
      onblur={commit}
      use:autofocus
      rows="2"
    ></textarea>
  {:else}
    <div
      class="kf-card-title"
      role="button"
      tabindex="0"
      ondblclick={startEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          startEdit();
        }
      }}
    >
      {title}
    </div>
    <button class="kf-card-delete" aria-label="カードを削除" onclick={confirmDelete} use:icon={'trash'}></button>
  {/if}
</div>

<style>
  .kf-card {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.9em;
  }
  .kf-card-title {
    white-space: pre-wrap;
    word-break: break-word;
    padding-right: 16px;
    cursor: text;
  }
  .kf-card-delete {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    opacity: 0;
  }
  .kf-card-delete:hover {
    color: var(--text-error);
  }
  .kf-card:hover .kf-card-delete {
    opacity: 1;
  }
  .kf-card-delete :global(svg) {
    width: 14px;
    height: 14px;
  }
  .kf-card-edit {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font: inherit;
  }
</style>
