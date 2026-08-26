// supabase/functions/_shared/escapeHtml.ts
// Names, service titles and addresses all end up inside HTML email bodies.
// They are user-controlled text, so they are escaped at every interpolation
// point rather than trusted because "it's only a name".
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
