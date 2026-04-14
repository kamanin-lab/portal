import { describe, test, expect } from 'vitest'
import { slugify } from '../lib/slugify'

describe('slugify', () => {
  test('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  test.each([
    ['ä', 'ae'],
    ['Ä', 'ae'],
    ['ö', 'oe'],
    ['Ö', 'oe'],
    ['ü', 'ue'],
    ['Ü', 'ue'],
    ['ß', 'ss'],
  ])('replaces German umlaut "%s" with "%s"', (umlaut, replacement) => {
    expect(slugify(umlaut)).toBe(replacement)
  })

  test('replaces spaces with hyphens', () => {
    expect(slugify('website projekt')).toBe('website-projekt')
  })

  test('replaces special characters with hyphens', () => {
    expect(slugify('Projekt (2026)!')).toBe('projekt-2026')
  })

  test('collapses multiple non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('a   b---c')).toBe('a-b-c')
  })

  test('removes leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
    expect(slugify('---test---')).toBe('test')
  })

  test('truncates to maxLength (default 60)', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBe(60)
  })

  test('truncates to custom maxLength', () => {
    expect(slugify('abcdefghij', 5)).toBe('abcde')
  })

  test('strips trailing hyphens after truncation', () => {
    // "abc-def" truncated at 4 chars = "abc-" → trailing hyphen removed → "abc"
    expect(slugify('abc def', 4)).toBe('abc')
  })

  test('handles German project name correctly', () => {
    expect(slugify('Müller & Söhne GmbH')).toBe('mueller-soehne-gmbh')
  })
})
