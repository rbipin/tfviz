// HtmlUtils.ts — Static utility class for HTML escaping, value truncation,
// and object flattening. No imports from other src/ modules.

import type { ActionType, ActionColor } from './types';

export class HtmlUtils {
  static readonly ACTION_COLORS: Readonly<Record<ActionType, ActionColor>> = {
    create:  { bg: '#eaf3de', text: '#3b6d11', border: '#97c459' },
    update:  { bg: '#faeeda', text: '#854f0b', border: '#ef9f27' },
    destroy: { bg: '#fcebeb', text: '#a32d2d', border: '#f09595' },
    replace: { bg: '#fbeaf0', text: '#993556', border: '#ed93b1' },
  };

  static readonly ACTION_LABELS: Readonly<Record<ActionType, string>> = {
    create:  '+ create',
    update:  '~ update',
    destroy: '- destroy',
    replace: '± replace',
  };

  /** Escape HTML special characters for safe inline rendering. */
  static esc(s: string | null | undefined): string {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Truncate a value to 120 characters with an ellipsis. */
  static trunc(val: unknown): string {
    const s = val === null ? 'null' : String(val as string | number | boolean);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }

  /**
   * Flatten a nested object into dot-notation keys.
   * e.g. { tags: { Name: "foo" } } → { "tags.Name": "foo" }
   */
  static flatten(obj: unknown, prefix = ''): Record<string, unknown> {
    if (obj === null || obj === undefined) return {};

    if (typeof obj !== 'object' || Array.isArray(obj)) {
      return prefix ? { [prefix]: obj } : {};
    }

    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(record)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(result, HtmlUtils.flatten(v, key));
      } else {
        result[key] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }

    return result;
  }
}
