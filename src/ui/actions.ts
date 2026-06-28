import { setIcon } from 'obsidian';

/** Svelte action: focus (and select) an input/textarea as soon as it mounts. */
export function autofocus(node: HTMLTextAreaElement | HTMLInputElement): void {
  node.focus();
  node.select();
}

/** Svelte action: render a lucide icon into the node via Obsidian's setIcon. */
export function icon(node: HTMLElement, name: string): void {
  setIcon(node, name);
}
