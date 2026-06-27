import { App, Modal, Setting } from 'obsidian';

export interface ConfirmOptions {
  title: string;
  message: string;
  cta: string;
  danger?: boolean;
}

/** Promise-based confirmation dialog (spec 5.5: irreversible actions require confirmation). */
export function confirmDialog(app: App, opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmModal(app, opts, resolve);
    modal.open();
  });
}

class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private opts: ConfirmOptions,
    private resolve: (value: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    this.contentEl.createEl('p', { text: this.opts.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()))
      .addButton((b) => {
        b.setButtonText(this.opts.cta).onClick(() => {
          this.settled = true;
          this.resolve(true);
          this.close();
        });
        if (this.opts.danger) b.setWarning();
        else b.setCta();
      });
  }

  onClose(): void {
    if (!this.settled) this.resolve(false);
  }
}
