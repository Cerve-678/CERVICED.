/**
 * Turns any thrown error into something safe to show a user.
 *
 * Raw errors from the data layer are implementation detail: they name tables,
 * columns, constraints, RPCs and policies ("duplicate key value violates unique
 * constraint providers_pkey", "new row violates row-level security policy").
 * Showing those to a client or provider is both confusing and an unnecessary
 * disclosure of how the backend is built, so screens should render this
 * instead of `e.message`.
 *
 * Developers lose nothing: the original error is still logged in full via
 * `logger`/`reportError` at the throw site and by `toUserMessage` itself.
 */
import { reportError } from './logger';

/**
 * Supabase Auth's own guard against "changing" a password to its current
 * value — 422 same_password. Exported so a caller can special-case its
 * dialog title: this isn't really a failure, just a rejected no-op, so
 * "Error" reads wrong next to it.
 */
export const SAME_PASSWORD_MESSAGE = 'Your new password needs to be different from your current one.';

const FRIENDLY_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /network|fetch failed|timeout|offline|connect/i,
    message: 'No internet connection. Please check your network and try again.' },
  { test: /rate limit|too many/i,
    message: 'Too many attempts. Please wait a moment and try again.' },
  // Only Supabase auth says "already registered", so this stays safe to make
  // email-specific; the generic clause below still covers duplicate-key writes.
  { test: /already registered|already been registered/i,
    message: 'An account with this email already exists. Try logging in instead.' },
  { test: /already exists|duplicate key/i,
    message: 'That already exists. Please check your details and try again.' },
  { test: /invalid email|unable to validate email/i,
    message: "That email address doesn't look right. Please check it and try again." },
  { test: /password.*weak|weak.*password/i,
    message: "Your password isn't strong enough. Try mixing letters, numbers, and symbols." },
  { test: /password.*(short|characters)/i,
    message: 'Your password needs to be at least 8 characters long.' },
  { test: /new password should be different/i, message: SAME_PASSWORD_MESSAGE },
  { test: /invalid login|invalid credentials|email not confirmed/i,
    message: "That email or password doesn't match an account." },
  { test: /permission|row-level security|not authorized|unauthorized|jwt/i,
    message: "You don't have permission to do that. Try signing out and back in." },
  { test: /payment|card|declined/i,
    message: 'That payment could not be completed. Please check your details or try another card.' },
];

const GENERIC = 'Something went wrong. Please try again.';

/**
 * @param error    the caught error, in any shape
 * @param fallback shown when nothing more specific matches — keep it plain and
 *                 action-oriented ("Could not save your changes."), never
 *                 technical
 * @param context  logged, never shown; helps devs find the throw site
 */
export function toUserMessage(
  error: unknown,
  fallback: string = GENERIC,
  context?: string,
): string {
  reportError(error, context);

  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: unknown } | null)?.message;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  const match = FRIENDLY_PATTERNS.find(p => p.test.test(raw));
  return match ? match.message : fallback;
}

/**
 * Same as `toUserMessage`, but a database guard message is shown verbatim.
 *
 * A "guard" here means a `RAISE EXCEPTION` in one of our own RPCs, which
 * arrives as SQLSTATE `P0001`. Those messages are written for the person
 * reading them, not for a developer: the all-or-nothing group booking RPCs
 * raise things like "Booking X is already completed" to name exactly which
 * sibling blocked a transition, and swapping that for a generic message throws
 * away the only actionable part of the failure.
 *
 * Every other coded error — RLS `42501`, unique violation `23505`, anything
 * Postgres or PostgREST raised on its own — is implementation detail and takes
 * the normal friendly-message path above.
 *
 * Note a PostgREST error is a plain `{ message, code, details }` object, not an
 * `Error` instance, so this matches on the SQLSTATE rather than the shape.
 */
/**
 * P0001 guards whose wording was written for a developer reading a log, not
 * for the person the app shows it to — mapped to copy that is. Checked before
 * the verbatim pass-through below, so a guard reaches a user unchanged only
 * when we haven't decided it shouldn't.
 *
 * Keep this list to guards that genuinely read badly (a raw status pair, a
 * UUID, "caller"). Translating a guard that already speaks to the user throws
 * away the specific number or name that made it worth showing.
 */
const GUARD_TRANSLATIONS: { test: RegExp; message: string }[] = [
  // provider_update_booking_status()'s state machine: "Invalid status
  // transition: in_progress -> in_progress". Raw DB status strings, and the
  // real cause is almost always a screen acting on a status that has since
  // moved on somewhere else.
  { test: /invalid status transition/i,
    message: 'This booking has already been updated somewhere else. Check its current status and try again.' },
  // The group RPCs name the offending booking by UUID, which is meaningless
  // to a provider and needlessly exposes an internal id.
  { test: /not owned by caller|no provider profile for caller|is not part of group/i,
    message: "You don't have permission to change this booking. Try signing out and back in." },
  { test: /^no (proposals|selections) supplied/i,
    message: 'Add at least one date and time first.' },
];

export function toUserMessageAllowingDbGuard(
  error: unknown,
  fallback: string = GENERIC,
  context?: string,
): string {
  const code = (error as { code?: unknown } | null)?.code;
  const raw = (error as { message?: unknown } | null)?.message;
  if (code === 'P0001' && typeof raw === 'string' && raw.trim()) {
    reportError(error, context);
    const translated = GUARD_TRANSLATIONS.find(g => g.test.test(raw));
    return translated ? translated.message : raw;
  }
  return toUserMessage(error, fallback, context);
}
