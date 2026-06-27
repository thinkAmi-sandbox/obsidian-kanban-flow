import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import Board from './ui/Board.svelte';
import { BoardStore } from './model/store.svelte';
import { parseBoard } from './parser/parse';
import { todayStr } from './today';
import { VIEW_TYPE } from './constants';

/**
 * TextFileView host for one board. Mounts a single Board.svelte into contentEl and bridges
 * Obsidian's load/save lifecycle to the BoardStore (spec 6.1). Implements the self-save echo
 * guard via lastSavedData (spec 6.5).
 */
export class KanbanView extends TextFileView {
  store: BoardStore | null = null;
  private component: Record<string, unknown> | null = null;
  private lastSavedData = '';
  private saveTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? 'Kanban Flow';
  }

  getIcon(): string {
    return 'layout-dashboard';
  }

  /** Load entry point. Fresh load (or clear) remounts; otherwise it is an external edit. */
  setViewData(data: string, clear: boolean): void {
    if (clear || !this.store) {
      this.destroyComponent();
      let board: Board0;
      let error: string | null = null;
      try {
        board = parseBoard(data);
      } catch (e) {
        board = { frontmatter: '', lanes: [], archive: null, settingsBlock: null };
        error = this.describe(e);
      }
      this.store = new BoardStore(board, {
        requestSave: () => this.onStoreChanged(),
        today: () => todayStr(),
      });
      if (error) this.store.setError(error);
      this.component = mount(Board, {
        target: this.contentEl,
        props: { store: this.store, app: this.app },
      }) as Record<string, unknown>;
    } else {
      try {
        this.store.replaceBoard(parseBoard(data));
      } catch (e) {
        this.store.setError(this.describe(e));
      }
    }
    this.lastSavedData = data;
  }

  /**
   * Called by the store after every mutation. We persist the board ourselves via vault.modify
   * (self-debounced) rather than relying on TextFileView's save plumbing, then keep this.data in
   * sync so a switch/close that calls getViewData() returns the latest content.
   */
  private onStoreChanged(): void {
    if (!this.store || this.store.error) return;
    this.data = this.store.serialize();
    this.lastSavedData = this.data; // echo guard (spec 6.5)
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 150);
  }

  private async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.file || !this.store || this.store.error) return;
    const data = this.store.serialize();
    this.data = data;
    this.lastSavedData = data;
    await this.app.vault.modify(this.file, data);
  }

  /** Save exit point. Returns the in-memory data Obsidian writes to disk. */
  getViewData(): string {
    if (this.store && !this.store.error) {
      this.data = this.store.serialize();
      this.lastSavedData = this.data;
    }
    return this.data;
  }

  /** Intentionally empty — cleanup is handled by setViewData/onClose (upstream KanbanView.tsx:481-500). */
  clear(): void {}

  async onClose(): Promise<void> {
    await this.flush();
    this.destroyComponent();
  }

  /** The last data this view wrote or loaded; used by the plugin's modify guard (spec 6.5). */
  getLastSavedData(): string {
    return this.lastSavedData;
  }

  private describe(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private destroyComponent(): void {
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
    this.store = null;
    this.contentEl.empty();
  }
}

// Local alias to satisfy the safeParse return type without importing the Board type name
// (which collides with the Board.svelte component import).
type Board0 = ReturnType<typeof parseBoard>;
