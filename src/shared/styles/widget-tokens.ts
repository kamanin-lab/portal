// KEEP IN SYNC WITH mcp-poc/widgets/shared/widget-tokens.ts
// 12 tokens locked per Phase 18 D-18-03. Do NOT add or remove keys.
// If you need a 13th token, reopen Phase 18 scope with Yuri first.

export const WIDGET_TOKENS = {
  accent: '--color-accent',
  bg: '--color-bg',
  border: '--color-border',
  danger: '--color-danger',
  fg: '--color-fg',
  muted: '--color-muted',
  'radius-lg': '--radius-lg',
  'radius-md': '--radius-md',
  subtle: '--color-subtle',
  success: '--color-success',
  surface: '--color-surface',
  warning: '--color-warning',
} as const

export type TokenKey = keyof typeof WIDGET_TOKENS

export const DEFAULT_TOKEN_VALUES: Record<TokenKey, string> = {
  accent: '#2B1878',
  bg: '#FAFAF9',
  border: '#E5E5E5',
  danger: '#DC2626',
  fg: '#333333',
  muted: '#444444',
  'radius-lg': '14px',
  'radius-md': '10px',
  subtle: '#777777',
  success: '#16A34A',
  surface: '#FFFFFF',
  warning: '#B45309',
}

export function readCurrentTokens(): Record<TokenKey, string> {
  return { ...DEFAULT_TOKEN_VALUES }
}
