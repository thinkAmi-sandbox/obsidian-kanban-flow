/** Svelte action: focus (and select) an input/textarea as soon as it mounts. */
export function autofocus(node: HTMLTextAreaElement | HTMLInputElement): void {
  node.focus();
  node.select();
}
