/** Provides small safe DOM factories that never interpret user-provided text as markup. */

/** Returns a required typed element or fails fast when the preserved HTML contract drifts. */
export function requiredElement<T extends Element>(
  document: Document,
  selector: string,
): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element is missing: ${selector}`);
  return element;
}

/** Creates one element with an optional class and textContent value. */
export function createNode<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Creates one textarea whose user-controlled value remains inert form data. */
export function createTextAreaNode(
  document: Document,
  className?: string,
  value?: string,
): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  if (className) element.className = className;
  if (value !== undefined) element.value = value;
  return element;
}
