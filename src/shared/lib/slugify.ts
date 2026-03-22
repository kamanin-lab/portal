/**
 * Shared slugify function for normalizing folder/file names.
 * Frontend copy of supabase/functions/_shared/slugify.ts.
 *
 * Rules:
 * - German umlauts replaced (ae, oe, ue, ss)
 * - All non-alphanumeric characters replaced with hyphens
 * - Leading/trailing hyphens removed
 * - Truncated to maxLength (trailing hyphens stripped after truncation)
 */
export function slugify(input: string, maxLength = 60): string {
  return input
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}
