import { Menu, Plugin, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import { KanbanView } from './KanbanView';
import { confirmDialog } from './ui/confirm';
import { BOARD_TEMPLATE, VIEW_TYPE, frontmatterKey } from './constants';

export default class KanbanFlowPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, (leaf) => new KanbanView(leaf));

    this.addCommand({
      id: 'create-new-kanban-flow-board',
      name: 'Kanban Flow ボードを新規作成',
      callback: () => void this.createNewBoard(),
    });

    this.addCommand({
      id: 'open-as-kanban-flow-board',
      name: 'アクティブなファイルを Kanban Flow ボードとして開く',
      checkCallback: (checking) => {
        const leaf = this.app.workspace.activeLeaf;
        const file = this.app.workspace.getActiveFile();
        const canOpen =
          !!leaf && !!file && file.extension === 'md' && leaf.view.getViewType() !== VIEW_TYPE;
        if (canOpen && !checking) void this.setKanbanView(leaf);
        return canOpen;
      },
    });

    this.addCommand({
      id: 'archive-completed-cards',
      name: '完了カードを年月別にアーカイブ',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(KanbanView);
        const count = view?.store?.completedCardCount() ?? 0;
        if (count === 0) return false;
        if (!checking) void this.archiveCompleted(view!, count);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, _source, leaf) =>
        this.onFileMenu(menu, file, leaf),
      ),
    );

    // External-edit reflection (spec 8.3) with the self-save echo guard (spec 6.5).
    // Debounced + skips events whose content equals what a view just wrote/loaded.
    const notify = debounce(
      (file: TFile, data: string) => this.reflectExternalEdit(file, data),
      300,
      true,
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        // Only bother reading the file if one of our boards is showing it.
        if (!this.kanbanViewsFor(file).length) return;
        void this.app.vault.read(file).then((data) => notify(file, data));
      }),
    );
  }

  onunload(): void {
    // Views are detached by Obsidian; nothing else to clean up.
  }

  private onFileMenu(menu: Menu, file: unknown, leaf?: WorkspaceLeaf): void {
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    const isKanban = !!this.app.metadataCache.getFileCache(file)?.frontmatter?.[frontmatterKey];

    if (leaf && leaf.view.getViewType() === VIEW_TYPE) {
      menu.addItem((item) =>
        item
          .setTitle('Markdown として開く')
          .setIcon('document')
          .onClick(() => void this.setMarkdownView(leaf)),
      );
      return;
    }

    if (isKanban) {
      menu.addItem((item) =>
        item
          .setTitle('Kanban Flow ボードとして開く')
          .setIcon('layout-dashboard')
          .onClick(() => {
            const target = leaf ?? this.app.workspace.getLeaf(false);
            void this.openFileInKanban(target, file);
          }),
      );
    }
  }

  private async archiveCompleted(view: KanbanView, count: number): Promise<void> {
    const ok = await confirmDialog(this.app, {
      title: '完了カードをアーカイブ',
      message: `完了レーンのカード ${count} 件を年月別にアーカイブへ移動します。よろしいですか？`,
      cta: 'アーカイブ',
    });
    if (ok) view.store?.archiveCompletedCards();
  }

  private async createNewBoard(): Promise<void> {
    const path = this.availableBoardPath();
    const file = await this.app.vault.create(path, BOARD_TEMPLATE);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
  }

  private availableBoardPath(): string {
    const base = 'Kanban Flow';
    let name = `${base}.md`;
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(name)) {
      name = `${base} ${i++}.md`;
    }
    return name;
  }

  private async setKanbanView(leaf: WorkspaceLeaf): Promise<void> {
    await leaf.setViewState({ type: VIEW_TYPE, state: leaf.view.getState(), active: true });
  }

  private async setMarkdownView(leaf: WorkspaceLeaf): Promise<void> {
    const file = (leaf.view as KanbanView).file;
    await leaf.setViewState({
      type: 'markdown',
      state: file ? { file: file.path, mode: 'source' } : leaf.view.getState(),
      active: true,
    });
  }

  private async openFileInKanban(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
    await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
  }

  private kanbanViewsFor(file: TFile): KanbanView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE)
      .map((leaf) => leaf.view as KanbanView)
      .filter((view) => view.file === file);
  }

  private reflectExternalEdit(file: TFile, data: string): void {
    for (const view of this.kanbanViewsFor(file)) {
      // Echo guard (spec 6.5): ignore the modify event our own save produced.
      if (data === view.getLastSavedData()) continue;
      view.setViewData(data, false); // full reparse -> replaceBoard (spec 8.3)
    }
  }
}
