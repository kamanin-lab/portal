import { z } from 'zod';

export const PRODUCTION_URL = 'https://portal.kamanin.at';

export const passwordSchema = z.string()
  .min(8, { message: 'Das Passwort muss mindestens 8 Zeichen lang sein' })
  .regex(/[A-Z]/, { message: 'Mindestens ein Großbuchstabe erforderlich' })
  .regex(/[0-9]/, { message: 'Mindestens eine Zahl erforderlich' })
  .regex(/[^A-Za-z0-9]/, { message: 'Mindestens ein Sonderzeichen erforderlich' });

export const PASSWORD_RULES = [
  { label: 'Mindestens 8 Zeichen', test: (v: string) => v.length >= 8 },
  { label: '1 Großbuchstabe', test: (v: string) => /[A-Z]/.test(v) },
  { label: '1 Zahl', test: (v: string) => /[0-9]/.test(v) },
  { label: '1 Sonderzeichen', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;
