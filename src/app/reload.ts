/**
 * Silent reload support: when the file changes on disk while the buffer is
 * clean, the new text is applied as one minimal edit (common prefix and
 * suffix kept) so the cursor and the scroll position survive and undo can
 * bring the previous text back.
 */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * The smallest single replacement turning `before` into `after`, or `null`
 * when the texts are equal. Never splits a surrogate pair.
 */
export function minimalChange(before: string, after: string): TextChange | null {
  if (before === after) {
    return null;
  }
  const max = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < max && before.charCodeAt(prefix) === after.charCodeAt(prefix)) {
    prefix += 1;
  }
  if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) {
    prefix -= 1;
  }
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  if (suffix > 0 && isHighSurrogate(before.charCodeAt(before.length - suffix))) {
    suffix -= 1;
  }
  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}
