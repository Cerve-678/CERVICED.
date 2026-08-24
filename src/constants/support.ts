// The one place the app's support address lives. Screens link to it via
// supportMailtoUrl() instead of hardcoding a mailto: string, so the address
// only ever has to change here. Kept in sync with the SUPPORT_EMAIL constant
// in supabase/functions/send-support-request/index.ts, which is where the
// in-app "Report a Problem" form is actually delivered (the recipient is
// hardcoded server-side on purpose — the client never chooses it).
export const SUPPORT_EMAIL = 'support@cerviced.co';

export function supportMailtoUrl(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
