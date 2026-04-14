/**
 * Wave 0 RED test stubs for recommendation_reminder email copy.
 *
 * These tests cover EMAIL-01:
 *   - subject() returns correct German plural form for 1 and 3 recommendations
 *   - cta === "Im Portal ansehen"
 *   - title === "Offene Empfehlungen"
 *
 * Currently FAILING (RED) because EMAIL_COPY does not yet have a
 * "recommendation_reminder" key. Plan 02 will add it and make these GREEN.
 */

import { describe, it, expect } from 'vitest'
import { EMAIL_COPY } from '../../../../supabase/functions/_shared/emailCopy'

describe('EMAIL_COPY.recommendation_reminder', () => {
  it('EMAIL-01: subject(1) returns singular German form', () => {
    const subject = EMAIL_COPY.recommendation_reminder.de.subject as (count: number) => string
    expect(subject(1)).toBe(
      'Erinnerung: 1 offene Empfehlung wartet auf Ihre Entscheidung'
    )
  })

  it('EMAIL-01: subject(3) returns plural German form', () => {
    const subject = EMAIL_COPY.recommendation_reminder.de.subject as (count: number) => string
    expect(subject(3)).toBe(
      'Erinnerung: 3 offene Empfehlungen warten auf Ihre Entscheidung'
    )
  })

  it('EMAIL-01: cta is "Im Portal ansehen"', () => {
    expect(EMAIL_COPY.recommendation_reminder.de.cta).toBe('Im Portal ansehen')
  })

  it('EMAIL-01: title is "Offene Empfehlungen"', () => {
    expect(EMAIL_COPY.recommendation_reminder.de.title).toBe('Offene Empfehlungen')
  })
})
