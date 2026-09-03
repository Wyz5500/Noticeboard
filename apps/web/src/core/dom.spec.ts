/** Verifies shared DOM factories keep user-controlled text inert. */
import { describe, expect, it } from 'vitest';

import { createTextAreaNode } from './dom.js';

class FakeTextArea {
  public className = '';
  public textContent = '';
  public value = '';
}

class FakeDocument {
  /** Creates the textarea element requested by the safe factory. */
  createElement(tag: string): FakeTextArea {
    if (tag !== 'textarea') throw new Error(`Unexpected tag: ${tag}`);
    return new FakeTextArea();
  }
}

describe('safe DOM factories', () => {
  /** Proves textarea drafts are assigned by the shared safe factory without becoming markup. */
  it('creates a textarea with an inert user-controlled value', () => {
    const draft = '<script>window.hacked=true</script>\n第二行';

    const textarea = createTextAreaNode(
      new FakeDocument() as unknown as Document,
      'comment-textarea',
      draft,
    );

    expect(textarea.className).toBe('comment-textarea');
    expect(textarea.value).toBe(draft);
    expect(textarea.textContent).toBe('');
  });
});
