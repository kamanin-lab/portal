import { describe, test, expect, vi } from 'vitest'
import { getCardStyle, toCardModel } from '../lib/quick-action-helpers'
import type { ProjectQuickAction } from '../types/project'

// ─── getCardStyle ─────────────────────────────────────────────────────────────

describe('getCardStyle', () => {
  test('primary_cta returns amber accent', () => {
    const style = getCardStyle('primary_cta')
    expect(style.accent).toBe('#D97706')
    expect(style.bg).toBe('#FFFBEB')
  })

  test('external_link returns cyan accent', () => {
    const style = getCardStyle('external_link')
    expect(style.accent).toBe('#0891B2')
    expect(style.bg).toBe('#ECFEFF')
  })

  test('create_task returns amber accent (same as primary_cta)', () => {
    const style = getCardStyle('create_task')
    expect(style.accent).toBe('#D97706')
  })
})

// ─── toCardModel ─────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<ProjectQuickAction> = {}): ProjectQuickAction {
  return {
    key: 'card-1',
    label: 'Freigeben',
    subtitle: 'Aktuell in Prüfung',
    iconToken: 'check',
    destinationKind: 'primary_cta',
    count: null,
    isEnabled: true,
    sortOrder: 1,
    url: null,
    ...overrides,
  }
}

describe('toCardModel', () => {
  const handlers = {
    openStep: vi.fn(),
    createTask: vi.fn(),
    openExternal: vi.fn(),
  }

  test('returns model with correct label, sub, accent, bg', () => {
    const model = toCardModel(makeCard(), null, () => null, handlers)
    expect(model.label).toBe('Freigeben')
    expect(model.sub).toBe('Aktuell in Prüfung')
    expect(model.accent).toBe('#D97706')
    expect(model.bg).toBe('#FFFBEB')
  })

  test('passes count through to the model', () => {
    const model = toCardModel(makeCard({ count: 3 }), null, () => null, handlers)
    expect(model.count).toBe(3)
  })

  test('null count stays null', () => {
    const model = toCardModel(makeCard({ count: null }), null, () => null, handlers)
    expect(model.count).toBeNull()
  })

  test('primary_cta: onClick calls openStep when primaryStepId is set', () => {
    const openStep = vi.fn()
    const model = toCardModel(makeCard({ destinationKind: 'primary_cta' }), 'step-123', () => null, { ...handlers, openStep })
    model.onClick()
    expect(openStep).toHaveBeenCalledWith('step-123')
  })

  test('primary_cta: onClick calls createTask when primaryStepId is null', () => {
    const createTask = vi.fn()
    const model = toCardModel(makeCard({ destinationKind: 'primary_cta' }), null, () => null, { ...handlers, createTask })
    model.onClick()
    expect(createTask).toHaveBeenCalled()
  })

  test('external_link: onClick calls openExternal with card url', () => {
    const openExternal = vi.fn()
    const model = toCardModel(
      makeCard({ destinationKind: 'external_link', url: 'https://example.com' }),
      null, () => null, { ...handlers, openExternal }
    )
    model.onClick()
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })

  test('external_link: onClick does nothing when url is null', () => {
    const openExternal = vi.fn()
    const model = toCardModel(
      makeCard({ destinationKind: 'external_link', url: null }),
      null, () => null, { ...handlers, openExternal }
    )
    model.onClick()
    expect(openExternal).not.toHaveBeenCalled()
  })

  test('create_task: onClick calls createTask', () => {
    const createTask = vi.fn()
    const model = toCardModel(makeCard({ destinationKind: 'create_task' }), null, () => null, { ...handlers, createTask })
    model.onClick()
    expect(createTask).toHaveBeenCalled()
  })
})
