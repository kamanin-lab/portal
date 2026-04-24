// MUST be byte-identical (below this import line) with mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts
// Any drift in FROZEN_KEYS between these two files is a protocol violation.
import { describe, it, expect } from 'vitest'
import { WIDGET_TOKENS } from '../widget-tokens'

const FROZEN_KEYS = [
  'accent','bg','border','danger','fg','muted',
  'radius-lg','radius-md','subtle','success','surface','warning',
] as const

describe('widget-tokens contract (Phase 18 D-18-03)', () => {
  it('exports exactly 12 keys in the frozen set', () => {
    const keys = Object.keys(WIDGET_TOKENS).sort()
    expect(keys).toEqual([...FROZEN_KEYS].sort())
  })

  it('every key maps to a valid CSS custom property name', () => {
    for (const [, cssVar] of Object.entries(WIDGET_TOKENS)) {
      expect(cssVar).toMatch(/^--[a-z0-9-]+$/)
    }
  })
})
