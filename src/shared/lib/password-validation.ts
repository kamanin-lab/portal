/** Shared password validation rules — use everywhere passwords are set or changed */

export interface PasswordRule {
  key: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: 'Mindestens 8 Zeichen', test: (p) => p.length >= 8 },
  { key: 'uppercase', label: 'Mindestens ein Großbuchstabe', test: (p) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'Mindestens eine Ziffer', test: (p) => /\d/.test(p) },
  { key: 'special', label: 'Mindestens ein Sonderzeichen', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

export function validatePassword(password: string): { valid: boolean; results: { key: string; passed: boolean }[] } {
  const results = PASSWORD_RULES.map(rule => ({ key: rule.key, passed: rule.test(password) }))
  return { valid: results.every(r => r.passed), results }
}
