import { describe, expect, it } from 'vitest';
import { interpolate, isPluralLeaf, leafKeys, missingKeys, type LocaleTree } from '../src/i18n';
import en from '../../../apps/mobile/i18n/locales/en.json';
import ur from '../../../apps/mobile/i18n/locales/ur.json';

describe('i18n helpers (sample)', () => {
  const sample: LocaleTree = { a: 'A', b: { c: 'C', n: { one: '1', other: 'n' } } };

  it('lists leaves, treating plural groups as one leaf', () => {
    expect(leafKeys(sample)).toEqual(['a', 'b.c', 'b.n']);
  });
  it('finds missing keys', () => {
    expect(missingKeys(sample, { a: 'x' })).toEqual(['b.c', 'b.n']);
  });
  it('detects plural leaves', () => {
    expect(isPluralLeaf({ one: 'a', other: 'b' })).toBe(true);
    expect(isPluralLeaf({ one: 'a' })).toBe(false);
    expect(isPluralLeaf({ title: 'a', other: 'b' })).toBe(false);
  });
  it('interpolates %{name}', () => {
    expect(interpolate('%{count} tests', { count: 3 })).toBe('3 tests');
    expect(interpolate('hi %{who}', {})).toBe('hi %{who}');
  });
});

describe('app locale files', () => {
  it('every English key has an Urdu key', () => {
    expect(missingKeys(en as LocaleTree, ur as LocaleTree)).toEqual([]);
  });
  it('no Urdu key without an English key', () => {
    expect(missingKeys(ur as LocaleTree, en as LocaleTree)).toEqual([]);
  });
});
