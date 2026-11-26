// Database access: Reviews.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { getPaymentRequestError } from "../../utils/paymentRequestError";
import { supabase } from "../../lib/supabase";
import type { DbReview, PublicReviewWithUser, ReviewWithUser } from "../../types/database";
import type { ProviderBookingTip } from "../../features/provider-bookings/tipPresentation";
import { type BookingReviewState, mergeBookingReviewStates } from "../../features/bookings/reviewState";
import { type MyProviderReviewRow, type PublicReviewRow, toMyProviderReview, toPublicReview } from "../../features/providers/reviewPresentation";
import { DEFAULT_REVIEWS_QUERY_LIMIT } from "./providers";
import { isUuid } from "./social";

// ─────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────

/**
 * Fetch reviews for a provider.
 *
 * Through get_provider_reviews, not the table: an anonymous review is hidden
 * from direct reads, and the RPC returns it with the reviewer blanked. It also
 * resolves reviewer names itself, so there is no second round trip.
 */
export async function getProviderReviews(
  providerId: string,
  options: { limit?: number } = {},
): Promise<PublicReviewWithUser[]> {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? DEFAULT_REVIEWS_QUERY_LIMIT), 1),
    DEFAULT_REVIEWS_QUERY_LIMIT,
  );
  const { data, error } = await supabase.rpc("get_provider_reviews", {
    p_provider_id: providerId,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as PublicReviewRow[]).map(toPublicReview);
}

/**
 * Fetch reviews for the currently authenticated provider. An anonymous review
 * comes back with no reviewer, booking, service or tip — the booking would
 * name the client.
 */
export async function getMyProviderReviews(): Promise<ReviewWithUser[]> {
  const { data, error } = await supabase.rpc("get_my_provider_reviews", {
    p_limit: DEFAULT_REVIEWS_QUERY_LIMIT,
  });
  if (error) throw error;
  return ((data ?? []) as MyProviderReviewRow[]).map(toMyProviderReview);
}

/** Submit a review for a completed booking */
export async function submitReview(review: {
  booking_id: string;
  provider_id: string;
  service_id: string | null;
  user_id: string;
  rating: number;
  comment?: string;
  tip_amount?: number;
  /** Hide who wrote it from everyone, the provider included. */
  is_anonymous?: boolean;
}): Promise<DbReview> {
  const { data, error } = await supabase
    .from("reviews")
    .insert(review)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Check if current user has already reviewed a booking */
export async function hasReviewedBooking(bookingId: string): Promise<boolean> {
  // maybeSingle, not single: "no review yet" is the normal case and single()
  // treats it as a PGRST116 error. This is called on every booking-detail mount.
  const { data, error } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  // A failed read must not look like "not reviewed yet": that re-shows Rate.
  if (error) throw error;
  return !!data;
}

/**
 * Review and tip state for a set of bookings, fetched together for the
 * Bookings list.
 *
 * The list used to initialise its rated/tipped buttons from empty component
 * state on every mount. The database rows existed, but the next visit showed
 * "Rate" and "Tip" again until a detail screen happened to be opened.
 */
export async function getBookingReviewStates(
  bookingIds: readonly string[],
): Promise<BookingReviewState[]> {
  // `reviews.booking_id` is UUID. Never let a local optimistic `booking_*`
  // id poison the whole PostgREST `.in()` cast.
  const ids = [...new Set(bookingIds.filter(isUuid))];
  if (ids.length === 0) return [];

  const [{ data: reviews, error: reviewError }, { data: tips, error: tipError }] = await Promise.all([
    supabase.from("reviews").select("booking_id").in("booking_id", ids),
    supabase.from("booking_tips").select("booking_id").in("booking_id", ids).eq("status", "succeeded"),
  ]);
  if (reviewError) throw reviewError;
  if (tipError) throw tipError;
  return mergeBookingReviewStates(
    (reviews ?? []).map((row: { booking_id: string }) => row.booking_id),
    (tips ?? []).map((row: { booking_id: string }) => row.booking_id),
  );
}

/**
 * The tip actually paid for a booking, or null when there isn't one.
 *
 * Only booking_tips counts. reviews.tip_amount is the old recorded-only
 * amount (no money moved, and the client could write any value to it), so it
 * must not make a booking read as tipped.
 */
export async function getBookingTip(bookingId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("booking_tips")
    .select("amount_pence")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { amount_pence: number }).amount_pence) / 100 : null;
}

/**
 * The paid tip on one of the provider's own bookings, or null when there isn't
 * one. Reads booking_tips only (the provider-read RLS policy scopes it to their
 * bookings) — never the old recorded-only reviews.tip_amount.
 */
export async function getProviderBookingTip(bookingId: string): Promise<ProviderBookingTip | null> {
  const { data, error } = await supabase
    .from("booking_tips")
    .select("amount_pence, payout_pence, payout_status, release_after")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    amount_pence: number;
    payout_pence: number | null;
    payout_status: ProviderBookingTip["payoutStatus"];
    release_after: string | null;
  };
  return {
    amountPence: row.amount_pence,
    payoutPence: row.payout_pence,
    payoutStatus: row.payout_status,
    releaseAfter: row.release_after,
  };
}

export interface BookingTipPaymentSheet {
  tipId: string;
  clientSecret: string;
  customerId: string;
  ephemeralKeySecret: string;
}

/** Starts a voluntary post-appointment Stripe tip. The server owns both the
 * amount validation and the booking/provider entitlement checks. */
export async function startBookingTipPayment(bookingId: string, amountPence: number): Promise<BookingTipPaymentSheet> {
  const { data, error } = await supabase.functions.invoke('booking-tip', {
    body: { action: 'start', bookingId, amountPence },
  });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Could not open tip payment. Please try again.');
  if (typeof data?.tipId !== 'string' || typeof data?.clientSecret !== 'string' ||
      typeof data?.customerId !== 'string' || typeof data?.ephemeralKeySecret !== 'string') {
    throw new Error('Could not open tip payment. Please try again.');
  }
  const expectsLive = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']?.startsWith('pk_live_') === true;
  if (typeof data.livemode !== 'boolean' || data.livemode !== expectsLive) {
    throw new Error('Payment configuration does not match this app. Please contact support.');
  }
  return data as BookingTipPaymentSheet;
}

/** The webhook is authoritative; this closes the normal app path promptly. */
export async function confirmBookingTipPayment(tipId: string): Promise<'succeeded' | 'processing'> {
  const { data, error } = await supabase.functions.invoke('booking-tip', { body: { action: 'confirm', tipId } });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Your tip is processing. Please check again shortly.');
  // 'processing' = Stripe has it but it isn't recorded yet (the webhook will
  // finish it). Only 'succeeded' may be shown to the client as paid.
  return data?.status === 'succeeded' ? 'succeeded' : 'processing';
}
