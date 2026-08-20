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

const FRIENDLY_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /network|fetch failed|timeout|offline|connect/i,
    message: 'No internet connection. Please check your network and try again.' },
  { test: /rate limit|too many/i,
    message: 'Too many attempts. Please wait a moment and try again.' },
  { test: /already registered|already exists|duplicate key/i,
    message: 'That already exists. Please check your details and try again.' },
  { test: /invalid email|unable to validate email/i,
    message: "That email address doesn't look right. Please check it and try again." },
  { test: /password.*(weak|short|characters)/i,
    message: 'Please choose a stronger password — at least 8 characters.' },
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
export function toUserMessageAllowingDbGuard(
  error: unknown,
  fallback: string = GENERIC,
  context?: string,
): string {
  const code = (error as { code?: unknown } | null)?.code;
  const raw = (error as { message?: unknown } | null)?.message;
  if (code === 'P0001' && typeof raw === 'string' && raw.trim()) {
    reportError(error, context);
    return raw;
  }
  return toUserMessage(error, fallback, context);
}
