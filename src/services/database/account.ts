// Database access: Sign-in, session, account lifecycle, client points, the signed-in user's own provider ids and saved cards.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { getPaymentRequestError } from "../../utils/paymentRequestError";
import type { SavedCard } from "../../features/payments/savedCards";
import { clearCachedReads, supabase } from "../../lib/supabase";
import type { AuthChangeEvent, AuthError, Session, User } from "@supabase/supabase-js";
import type { DbBookingRescheduleRequest } from "../../types/database";
import { logger, reportError } from "../../utils/logger";

export interface AuthSessionSummary {
  userId: string;
  email: string | null;
  refreshToken: string | null;
  userMetadata: Record<string, unknown>;
}

function summarizeAuthSession(session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>): AuthSessionSummary {
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    refreshToken: session.refresh_token ?? null,
    userMetadata: session.user.user_metadata as Record<string, unknown>,
  };
}

export async function refreshAuthSession(refreshToken: string): Promise<void> {
  const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw error;
}

/**
 * The signed-in user, read from the session stored on this device. Same shape
 * as `supabase.auth.getUser()`, without its round trip to the Auth server.
 * getUser() exists for servers, where a forged cookie could claim to be
 * anyone; here the session is the user's own, and every query still sends its
 * access token for the database to verify, so RLS stays the enforcement point.
 * Calling getUser() before each query added a network round trip to almost
 * every screen load. A network call only happens when the token is due to
 * refresh. Signed out → `user` is null with no error.
 */
export async function getSessionUser(): Promise<{
  data: { user: User | null };
  error: AuthError | null;
}> {
  const { data, error } = await supabase.auth.getSession();
  return { data: { user: data.session?.user ?? null }, error };
}

export async function getCurrentAuthUserId(): Promise<string | null> {
  const { data, error } = await getSessionUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

/** The server keeps an admin-made blank provider offline until its owner has
 * been assigned. Read the same auth metadata flag for the go-live checklist. */
export async function getCurrentAccountDetailsPending(): Promise<boolean> {
  const { data, error } = await getSessionUser();
  if (error) throw error;
  return data.user?.app_metadata?.['details_pending'] === true;
}

export function setAuthAutoRefresh(active: boolean): void {
  if (active) supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
}

export function subscribeToAuthStateChanges(
  onChange: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
): () => void {
  // Auth invokes listeners while holding its session lock. Profile queries
  // need that same lock to obtain a token, so awaiting them here deadlocks
  // login/restore and subsequent requests throughout the app.
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const timer = setTimeout(() => {
      pending.delete(timer);
      void Promise.resolve().then(() => onChange(event, session)).catch(error => {
        reportError(error, 'auth:state-change');
      });
    }, 0);
    pending.add(timer);
  });
  return () => {
    subscription.unsubscribe();
    pending.forEach(clearTimeout);
    pending.clear();
  };
}

export async function signOutCurrentSession(): Promise<void> {
  // 'local' ends only this device's session. The default ('global') also
  // kills the account's sessions on every other phone, which keep a token
  // that still passes RLS until it expires — so the app looks signed in
  // there, but anything that checks the session server-side (payments)
  // fails with a 401 "session expired".
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  invalidateOwnProviderIds();
  forgetSavedCards();
}

export async function clearUserStorageFolder(
  bucket: string,
  userId: string,
): Promise<void> {
  const { data, error: listError } = await supabase.storage.from(bucket).list(userId);
  if (listError) throw listError;
  if (!data || data.length === 0) return;
  const { error } = await supabase.storage
    .from(bucket)
    .remove(data.map(file => `${userId}/${file.name}`));
  if (error) throw error;
}

/**
 * Forget every remembered read, so the next load of each screen goes to the
 * server. For explicit refreshes (pull-to-refresh): the person asked for the
 * latest, so a 30-second-old answer isn't good enough.
 */
export function forgetCachedReads(): void {
  clearCachedReads();
}

export function subscribeToUserBookingChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`user-bookings-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        clearCachedReads();
        onChange();
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function subscribeToRescheduleRequestChanges(
  onChange: (row: DbBookingRescheduleRequest | null) => void,
): () => void {
  const channel = supabase
    .channel("reschedule-request-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "booking_reschedule_requests" },
      (payload) => {
        clearCachedReads();
        onChange(
          payload.eventType === "DELETE"
            ? null
            : (payload.new as DbBookingRescheduleRequest),
        );
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export interface NotificationInsertRow {
  id: string;
  title: string;
  message: string;
  type: string;
  booking_id: string | null;
  provider_id: string | null;
  recipient_role: "provider" | "client";
  metadata: Record<string, unknown> | null;
}

export function subscribeToNotificationInserts(
  userId: string,
  onInsert: (row: NotificationInsertRow) => void,
): () => void {
  const channel = supabase
    .channel(`notification-inserts-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      payload => {
        clearCachedReads();
        onInsert(payload.new as NotificationInsertRow);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthSessionSummary> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Authentication succeeded without a session");
  return summarizeAuthSession(data.session);
}

// Apple hands over the person's name on their first authorisation only, and it
// isn't in the identity token, so it's kept here until AuthContext creates the
// users row that sign-in leads to (createSocialProfileIfMissing).
let appleNameFromSignIn = "";

export async function signInWithAppleIdToken(
  token: string,
  fullName?: { givenName?: string | null; familyName?: string | null } | null,
): Promise<AuthSessionSummary> {
  appleNameFromSignIn = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ").trim();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token });
  if (error) throw error;
  if (!data.session) throw new Error("Authentication succeeded without a session");
  return summarizeAuthSession(data.session);
}

export async function signInWithGoogleIdToken(token: string): Promise<AuthSessionSummary> {
  // Google's name comes from the session; don't let an earlier Apple attempt's
  // name land on this account.
  appleNameFromSignIn = "";
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
  if (error) throw error;
  if (!data.session) throw new Error("Authentication succeeded without a session");
  return summarizeAuthSession(data.session);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function verifyRecoveryOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) throw error;
}

export async function verifySignupOtp(
  email: string,
  token: string,
): Promise<AuthSessionSummary & { authSession: Session }> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("Verification succeeded without a session");
  return { ...summarizeAuthSession(data.session), authSession: data.session };
}

/** Emails a 6-digit sign-in code (the website's sign-in). A new email gets a
 * real CERVICED account, created when the code is entered, so its bookings,
 * receipts and reminders work like the app's. Entered with verifySignupOtp. */
export async function sendEmailSignInCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** The signed-in account's id and email, or null when signed out. */
export async function getSignedInAccount(): Promise<{ id: string; email: string } | null> {
  const { data, error } = await getSessionUser();
  if (error) throw error;
  const user = data.user;
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

export async function updateCurrentPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function updatePasswordAndSignOut(password: string): Promise<void> {
  await updateCurrentPassword(password);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}): Promise<{ hasIdentity: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: params.metadata },
  });
  if (error) throw error;
  return { hasIdentity: (data.user?.identities?.length ?? 0) > 0 };
}

export async function removePortfolioStorageObject(path: string): Promise<void> {
  const { error } = await supabase.storage.from("portfolio").remove([path]);
  if (error) throw error;
}

export async function getCurrentUserStoredPushToken(): Promise<string | null> {
  const { data: authData, error: authError } = await getSessionUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("push_token")
    .eq("id", authData.user.id)
    .single();
  if (error) throw error;
  return data?.push_token ?? null;
}

export interface DevResetResult {
  ok?: boolean;
  error?: string;
  deleted?: {
    bookings?: number;
    reviews?: number;
    transactions?: number;
    notifications?: number;
    schedule_windows?: number;
    availability_days?: number;
    [key: string]: number | undefined;
  };
}

export async function runDevReset(
  kind: "client" | "provider_bookings" | "provider",
): Promise<DevResetResult> {
  // Admins only: admin_dev_reset refuses anyone else, then runs the
  // self-scoped dev_reset_* function, which signed-in accounts can no longer
  // call directly (migration 20261103110000).
  const { data, error } = await supabase.rpc("admin_dev_reset", { p_kind: kind });
  if (error) throw error;
  return (data ?? {}) as DevResetResult;
}

// Terms end up interpolated into a PostgREST `.or()` filter string — strip
// the characters that are structurally meaningful to that syntax (comma
// separates conditions, parens group them) so a term containing one can't
// break out of its intended ilike condition.
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[(),%_*"\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Creates or completes the app profile after Supabase has verified the
 * account's email. Auth verification remains in the screen; database writes
 * stay behind this shared service boundary. */
export async function upsertVerifiedUserProfile(
  profile: { id: string } & Record<string, unknown>,
): Promise<{ role: string | null; hasClientProfile: boolean; deletionRequested: boolean }> {
  // Read back what the row actually holds, so the app opens from the server's
  // answer rather than the sign-up details it sent.
  const { data, error } = await supabase
    .from("users")
    .upsert(profile, { onConflict: "id" })
    .select("role, has_client_profile, deletion_requested_at")
    .single();
  if (error) throw error;
  return {
    role: data.role ?? null,
    hasClientProfile: data.has_client_profile === true,
    deletionRequested: data.deletion_requested_at != null,
  };
}

/** Creates the users row for an account that signed in through Apple, which
 * has no verification step to create one. Starts as a client with whatever
 * Apple shared; anything missing is asked for by the Before You Can Book
 * checklist. Never overwrites: an account that already has a row, including a
 * provider's, is left exactly as it is. */
export async function createSocialProfileIfMissing(account: {
  id: string;
  email: string;
  loginMethod: string;
  nameFromSession?: string | undefined;
}): Promise<void> {
  const { error } = await supabase.from("users").upsert(
    {
      id: account.id,
      email: account.email,
      name: appleNameFromSignIn || account.nameFromSession || "",
      role: "user",
      has_client_profile: true,
      login_method: account.loginMethod,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
  appleNameFromSignIn = "";
}

/** Persists client-profile fields for the signed-in account. */
export async function updateClientProfileFields(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  // Selecting the id back is what makes a no-op detectable: an UPDATE matching
  // zero rows is not a Postgres error, so without this a lost session (RLS
  // `auth.uid() = id` matching nothing) returned success having written nothing
  // — and addClientProfile would flip the account to the client hat locally
  // while the database still had no record of it, so the hat vanished on the
  // next launch.
  const { data, error } = await supabase
    .from("users")
    .update(fields)
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`updateClientProfileFields matched no row for user ${userId}`);
  }
}

export type AccountDeletionResult = {
  ok?: boolean;
  error?: string;
  full_account_deleted?: boolean;
};

export async function cancelAccountDeletionRequest(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw error;
  return (data ?? {}) as AccountDeletionResult;
}

export async function deleteClientAccountProfile(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("delete_client_profile");
  if (error) throw error;
  return (data ?? {}) as AccountDeletionResult;
}

export async function deleteProviderAccountProfile(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("delete_provider_profile");
  if (error) throw error;
  // The account no longer owns this row, so discovery should start showing
  // it again (to them as much as anyone) rather than serving a stale
  // "that's yours" answer for the rest of the session.
  invalidateOwnProviderIds();
  return (data ?? {}) as AccountDeletionResult;
}

/** Current signed-in client's loyalty points balance (sum of client_points_ledger). */
export async function getClientPointsBalance(): Promise<number> {
  const { data, error } = await supabase.rpc("get_client_points_balance");
  if (error) throw error;
  return (data ?? 0) as number;
}

export type ClientPointsReason =
  | "booking_completed"
  | "review_left"
  | "first_booking"
  | "birthday_bonus"
  | "first_review"
  | "profile_completed"
  | "returning_client";

export interface ClientPointsLedgerEntry {
  id: string;
  delta: number;
  reason: ClientPointsReason;
  created_at: string;
}

/** Current signed-in client's points history, most recent first. */
export async function getClientPointsHistory(limit = 50): Promise<ClientPointsLedgerEntry[]> {
  const { data, error } = await supabase.rpc("get_client_points_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ClientPointsLedgerEntry[];
}

/**
 * DATABASE SERVICE — SINGLE ACCESS POINT
 *
 * RULES:
 * 1. This is the ONLY file that may import the Supabase client and call .from().
 *    Screens import functions from here — they never touch supabase directly.
 * 2. Every client-facing provider query MUST include .eq('has_gone_live', true)
 *    unless the provider is reading their own record (document that exception).
 * 3. Functions throw on error — never swallow errors or return null on failure.
 * 4. All parameters and return types must be explicitly typed — no `any`.
 */

// ─────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// OWN-PROFILE EXCLUSION
// ─────────────────────────────────────────────────────────

/**
 * Ids of the provider rows the signed-in user owns.
 *
 * A provider wearing their client hat is a normal client in every other
 * respect, which means every discovery surface (Home's sections, Explore's
 * feed, Search, Becca) was happily recommending them their own business —
 * a result they can neither book nor usefully browse. These ids are what
 * the client-facing queries below filter themselves out by.
 *
 * Returns *every* owned row rather than a single canonical one: a handful
 * of accounts picked up duplicate provider rows during account churn (see
 * getProviderProfileForUserId, which resolves that ambiguity for the
 * provider hat), and excluding only the canonical row would leave the
 * duplicate showing in the feed.
 *
 * Memoised per auth user id, so a whole Explore refresh costs one lookup
 * rather than one per query, and so logging in as someone else can never
 * inherit the previous account's ids. Ownership only changes when a
 * profile is created or deleted — both of which invalidate it explicitly.
 */
let ownProviderIdsCache: { userId: string; ids: string[] } | null = null;

/** Drop the memoised ownership answer — called wherever this file changes
 *  which provider rows the current account owns (registration, claim,
 *  profile deletion, sign-out). Deliberately not exported: nothing outside
 *  this file can change that ownership without going through one of those. */
export function invalidateOwnProviderIds(): void {
  ownProviderIdsCache = null;
}

export async function getOwnProviderIds(): Promise<string[]> {
  // getSession() reads the locally cached session; getUser() (used elsewhere
  // in this file where the answer must be authoritative) costs a network
  // round trip, which is not worth paying on every discovery query.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return [];
  if (ownProviderIdsCache?.userId === userId) return ownProviderIdsCache.ids;

  const { data: rows, error } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId);

  // The one deliberate exception to this file's "always throw" rule, and it
  // is scoped to exactly this lookup: it decorates an otherwise valid query
  // rather than producing the query's result. Failing hard here would blank
  // out Home and Explore over a filter whose worst-case absence is seeing
  // your own card once. Logged, and deliberately not cached, so the next
  // call retries.
  if (error) {
    logger.warn(
      "[databaseService] Own-provider lookup failed; discovery will not self-exclude:",
      error.message,
    );
    return [];
  }

  const ids = (rows ?? []).map((row: { id: string }) => row.id);
  ownProviderIdsCache = { userId, ids };
  return ids;
}

/** A uuid no provider row can hold. Standing in for "nothing to exclude"
 *  keeps ownProviderIdExclusion() a plain string, so each client-facing
 *  query below takes one unconditional `.not(…)` instead of branching its
 *  whole builder on whether the viewer happens to be a provider. Every
 *  column it is applied to is NOT NULL, so no row is lost to SQL's
 *  `NULL NOT IN (…)` being NULL rather than true. */
const NO_SUCH_PROVIDER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * PostgREST value for `.not(column, "in", …)` — the provider rows the
 * signed-in user owns, for recommendation queries only. Plain browse and
 * explicit searches allow the owner’s business. Matches nothing for an account with no provider profile.
 */
export async function ownProviderIdExclusion(): Promise<string> {
  const ids = await getOwnProviderIds();
  return `(${(ids.length ? ids : [NO_SUCH_PROVIDER_ID]).join(",")})`;
}

// The last saved-card list, for the one signed-in account. The function behind
// it takes 1–10s, so the cart starts the read and the payment sheet shows the
// answer the moment it opens instead of waiting with the client watching.
// Brand, last 4 and expiry only, in memory; cleared on sign-out and removal.
let savedCardsCache: { userId: string; cards: SavedCard[]; fetchedAt: number } | null = null;
let savedCardsRequest: { userId: string; promise: Promise<SavedCard[]> } | null = null;
// Bumped on every forget, so a read begun before it can't store its answer.
let savedCardsGeneration = 0;

/** The cards last read for this account, or undefined if none have been. */
export function getCachedSavedCards(userId: string): SavedCard[] | undefined {
  return savedCardsCache?.userId === userId ? savedCardsCache.cards : undefined;
}

/** Drop the remembered list, so the next read goes to Stripe. */
export function forgetSavedCards(): void {
  savedCardsCache = null;
  savedCardsRequest = null;
  savedCardsGeneration += 1;
}

/** The signed-in client's saved cards, read live from Stripe (CERVICED stores
 *  no card details). Empty until they save one. A list read within
 *  `maxAgeMs` is returned as is, and callers arriving while a read is in
 *  flight share it rather than starting another. */
export async function listSavedCards({ maxAgeMs = 0 }: { maxAgeMs?: number } = {}): Promise<SavedCard[]> {
  const generation = savedCardsGeneration;
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Could not load your saved cards. Please try again.');
  const userId = user.id;
  if (savedCardsCache?.userId === userId && Date.now() - savedCardsCache.fetchedAt < maxAgeMs) {
    return savedCardsCache.cards;
  }
  if (savedCardsRequest?.userId === userId) return savedCardsRequest.promise;

  const request = { userId, promise: fetchSavedCards() };
  savedCardsRequest = request;
  try {
    const cards = await request.promise;
    // Not if a removal or sign-out forgot the list while this was in flight.
    if (generation === savedCardsGeneration) savedCardsCache = { userId, cards, fetchedAt: Date.now() };
    return cards;
  } finally {
    if (savedCardsRequest === request) savedCardsRequest = null;
  }
}

async function fetchSavedCards(): Promise<SavedCard[]> {
  const { data, error } = await supabase.functions.invoke('client-saved-cards', {
    body: { action: 'list' },
  });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Could not load your saved cards. Please try again.');
  if (!Array.isArray(data?.cards)) throw new Error('Could not load your saved cards. Please try again.');
  return (data.cards as unknown[]).flatMap((raw): SavedCard[] => {
    const c = raw as Partial<SavedCard>;
    if (typeof c.id !== 'string' || typeof c.last4 !== 'string' ||
        typeof c.expMonth !== 'number' || typeof c.expYear !== 'number') return [];
    return [{
      id: c.id,
      brand: typeof c.brand === 'string' ? c.brand : 'unknown',
      last4: c.last4,
      expMonth: c.expMonth,
      expYear: c.expYear,
      wallet: typeof c.wallet === 'string' ? c.wallet : null,
    }];
  });
}

/** What the Payment Sheet needs to save a new card: the Customer (got or
 *  created server-side), an ephemeral key over it, and a SetupIntent secret. */
export async function createSavedCardSetup(): Promise<{
  customerId: string;
  ephemeralKeySecret: string;
  setupIntentClientSecret: string;
}> {
  const { data, error } = await supabase.functions.invoke('client-saved-cards', {
    body: { action: 'setup' },
  });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Could not open card setup. Please try again.');
  if (typeof data?.customerId !== 'string' || typeof data?.ephemeralKeySecret !== 'string' ||
      typeof data?.setupIntentClientSecret !== 'string') {
    throw new Error('Could not open card setup. Please try again.');
  }
  const expectsLive = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']?.startsWith('pk_live_') === true;
  if (typeof data.livemode !== 'boolean' || data.livemode !== expectsLive) {
    throw new Error('Payment configuration does not match this app. Please contact support.');
  }
  return {
    customerId: data.customerId,
    ephemeralKeySecret: data.ephemeralKeySecret,
    setupIntentClientSecret: data.setupIntentClientSecret,
  };
}

/** Removes one of the signed-in client's own saved cards from Stripe. */
export async function removeSavedCard(paymentMethodId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('client-saved-cards', {
    body: { action: 'remove', paymentMethodId },
  });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Could not remove that card. Please try again.');
  forgetSavedCards();
}
