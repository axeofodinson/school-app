// Locale-file helpers (pure). The app's typed t() lives in apps/mobile/i18n;
// these let tests check that every English key has an Urdu key (CLAUDE.md).

export type LocaleTree = { [key: string]: string | LocaleTree };

/** Plural leaves are objects whose keys are only plural categories. */
const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

export function isPluralLeaf(node: unknown): node is Record<string, string> {
  if (!node || typeof node !== 'object') return false;
  const keys = Object.keys(node);
  return (
    keys.length > 0 &&
    keys.includes('other') &&
    keys.every(
      (k) => PLURAL_KEYS.has(k) && typeof (node as Record<string, unknown>)[k] === 'string',
    )
  );
}

/** Dotted paths of every leaf (a string or a plural group). */
export function leafKeys(tree: LocaleTree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || isPluralLeaf(v)) out.push(path);
    else out.push(...leafKeys(v, path));
  }
  return out;
}

/** Keys present in `source` but missing from `target`. */
export function missingKeys(source: LocaleTree, target: LocaleTree): string[] {
  const have = new Set(leafKeys(target));
  return leafKeys(source).filter((k) => !have.has(k));
}

/** Replace `%{name}` placeholders (the format the existing locale files use). */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/%\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}
