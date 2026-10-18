// Booking date/time wording for emails, matching the app's formatLongDate /
// formatTime12 (src/utils/dateUtils.ts). Shared so every email that names an
// appointment words it the same way.

/** "2026-08-26" -> "Wednesday, 26 August 2026", matching the app's formatLongDate. */
export function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** "14:30:00" -> "2:30pm", matching the app's formatTime12. */
export function formatTime12(value: string): string {
  const [hRaw, minRaw] = value.split(':');
  const h = Number(hRaw);
  if (Number.isNaN(h)) return value;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const displayHour = h >= 12 ? String(hour12) : String(hour12).padStart(2, '0');
  return `${displayHour}:${minRaw ?? '00'}${suffix}`;
}
