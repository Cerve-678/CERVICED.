/**
 * Supabase data service — Phase 1
 * Central place for all database queries.
 * Import from here in screens instead of calling supabase directly.
 */

import { supabase, ensureFreshSession } from '../lib/supabase';
import type {
  DbProvider,
  DbBooking,
  DbNotification,
  DbBookmark,
  DbPromotion,
  DbPortfolioItem,
  BookingWithAddOns,
  ProviderWithServices,
  PortfolioItemWithProvider,
  NotificationWithContext,
  NotificationType,
  ReviewWithUser,
  DbReview,
  DbEventPlan,
  DbEventTask,
  DbEventChecklistItem,
} from '../types/database';

// ─────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────

/** Fetch all active providers, optionally filtered by service category */
export async function getProviders(category?: string): Promise<DbProvider[]> {
  let query = supabase
    .from('providers')
    .select('*')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('rating', { ascending: false });

  if (category && category !== 'ALL') {
    query = query.eq('service_category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Fetch a single provider by slug, with all services, images, and add-ons */
export async function getProviderBySlug(slug: string): Promise<ProviderWithServices | null> {
  const { data, error } = await supabase
    .from('providers')
    .select(`
      *,
      services (
        *,
        service_images ( * ),
        service_add_ons ( * )
      ),
      provider_specialties ( * )
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }

  // Rename nested arrays to match ProviderWithServices shape
  return {
    ...data,
    services: (data.services ?? []).map((s: any) => ({
      ...s,
      images: s.service_images ?? [],
      add_ons: s.service_add_ons ?? [],
    })),
    specialties: data.provider_specialties ?? [],
  } as ProviderWithServices;
}

/** Fetch the provider row that belongs to the currently logged-in user */
export async function getMyProviderProfile(): Promise<DbProvider | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('providers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ─────────────────────────────────────────────────────────
// PORTFOLIO
// ─────────────────────────────────────────────────────────

/** Fetch portfolio items, optionally filtered by category */
export async function getPortfolioItems(category?: string): Promise<PortfolioItemWithProvider[]> {
  let query = supabase
    .from('portfolio_items')
    .select(`
      *,
      provider: providers ( id, slug, display_name, service_category, logo_url )
    `)
    .order('created_at', { ascending: false });

  if (category && category !== 'All') {
    query = query.eq('category', category.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

/** Search portfolio by text (caption, tags, provider name) */
export async function searchPortfolio(query: string): Promise<PortfolioItemWithProvider[]> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select(`
      *,
      provider: providers ( id, slug, display_name, service_category, logo_url )
    `)
    .or(`caption.ilike.%${query}%,tags.cs.{${query}}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

// ─────────────────────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────────────────────

/** Fetch active, non-expired promotions. Optionally filter by service category. */
export async function getActivePromotions(category?: string): Promise<DbPromotion[]> {
  let query = supabase
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (category && category !== 'ALL') {
    query = query.eq('service_category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────
// BOOKMARKS
// ─────────────────────────────────────────────────────────

/** Fetch all providers bookmarked by the current user */
export async function getBookmarkedProviders(): Promise<DbProvider[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('provider: providers ( * )')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => row.provider).filter(Boolean);
}

/** Add a bookmark */
export async function addBookmark(providerId: string): Promise<void> {
  await ensureFreshSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: user.id, provider_id: providerId });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Remove a bookmark */
export async function removeBookmark(providerId: string): Promise<void> {
  await ensureFreshSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', user.id)
    .eq('provider_id', providerId);

  if (error) throw error;
}

/** Check if a specific provider is bookmarked */
export async function isProviderBookmarked(providerId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider_id', providerId)
    .single();

  return !!data;
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — Consumer side
// ─────────────────────────────────────────────────────────

/** Fetch all bookings for the current user, with add-ons */
export async function getMyBookings(): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      add_ons: booking_add_ons ( * ),
      provider_info: providers ( service_category )
    `)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Look up a provider's UUID by display_name (used at checkout to get provider_id) */
export async function getProviderIdByDisplayName(name: string): Promise<string | null> {
  const { data } = await supabase
    .from('providers')
    .select('id')
    .ilike('display_name', name)
    .eq('is_active', true)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/** Create a new booking with its add-ons */
export async function createBooking(
  booking: Omit<DbBooking, 'id' | 'created_at' | 'updated_at' | 'confirmed_at'>,
  addOnIds: { add_on_id: string; name_snapshot: string; price_snapshot: number }[]
): Promise<DbBooking> {
  await ensureFreshSession();

  // ── Validation ──────────────────────────────────────────
  // 1. Booking date must not be in the past
  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  if (booking.booking_date < todayStr) {
    throw new Error('Booking date cannot be in the past.');
  }

  // 2. Provider must be open on that day of the week
  const bookingDayOfWeek = new Date(booking.booking_date + 'T12:00:00').getDay(); // 0=Sun
  const { data: availability } = await supabase
    .from('provider_availability')
    .select('open_time, close_time, is_closed')
    .eq('provider_id', booking.provider_id)
    .eq('day_of_week', bookingDayOfWeek)
    .maybeSingle();

  if (availability?.is_closed) {
    throw new Error('The provider is not available on that day.');
  }

  // 3. Date must not be a blocked date
  const { data: blocked } = await supabase
    .from('provider_blocked_dates')
    .select('id')
    .eq('provider_id', booking.provider_id)
    .eq('blocked_date', booking.booking_date)
    .maybeSingle();

  if (blocked) {
    throw new Error('The provider is unavailable on that date.');
  }

  // 4. No overlapping confirmed/pending bookings for same provider + date
  //    Determine the service duration (default 60 min if unknown)
  let durationMinutes = 60;
  if (booking.service_id) {
    const { data: service } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', booking.service_id)
      .maybeSingle();
    if (service?.duration_minutes) durationMinutes = service.duration_minutes;
  }

  const timeParts = booking.booking_time.split(':');
  const h = Number(timeParts[0] ?? 0);
  const m = Number(timeParts[1] ?? 0);
  const startMins = h * 60 + m;
  const endMins = startMins + durationMinutes;

  const { data: conflicts } = await supabase
    .from('bookings')
    .select('booking_time, end_time, service_id')
    .eq('provider_id', booking.provider_id)
    .eq('booking_date', booking.booking_date)
    .in('status', ['pending', 'confirmed']);

  if (conflicts) {
    for (const existing of conflicts) {
      const existParts = existing.booking_time.split(':');
      const existStart = Number(existParts[0] ?? 0) * 60 + Number(existParts[1] ?? 0);

      // Determine existing booking's end time
      let existEnd = existStart + 60; // fallback
      if (existing.end_time) {
        const endParts = existing.end_time.split(':');
        existEnd = Number(endParts[0] ?? 0) * 60 + Number(endParts[1] ?? 0);
      } else if (existing.service_id) {
        const { data: svc } = await supabase
          .from('services')
          .select('duration_minutes')
          .eq('id', existing.service_id)
          .maybeSingle();
        if (svc?.duration_minutes) existEnd = existStart + svc.duration_minutes;
      }

      // Overlap check: two intervals overlap if one starts before the other ends
      if (startMins < existEnd && endMins > existStart) {
        throw new Error('That time slot is already booked. Please choose a different time.');
      }
    }
  }
  // ── End Validation ──────────────────────────────────────

  const { data, error } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single();

  if (error) throw error;

  if (addOnIds.length > 0) {
    const { error: addOnError } = await supabase
      .from('booking_add_ons')
      .insert(addOnIds.map(a => ({ ...a, booking_id: data.id })));
    if (addOnError) throw addOnError;
  }

  return data;
}

/** Update booking status */
export async function updateBookingStatus(
  bookingId: string,
  status: DbBooking['status']
): Promise<void> {
  await ensureFreshSession();
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);

  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — Provider side
// ─────────────────────────────────────────────────────────

/** Fetch all bookings for the provider owned by the current user */
export async function getProviderBookings(): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      add_ons: booking_add_ons ( * )
    `)
    .eq('provider_id', provider.id)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Fetch bookings for a provider on a specific date */
export async function getProviderBookingsByDate(
  providerId: string,
  date: string
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      add_ons: booking_add_ons ( * )
    `)
    .eq('provider_id', providerId)
    .eq('booking_date', date)
    .neq('status', 'cancelled')
    .order('booking_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────

/** Fetch notifications for the current user, filtered by role.
 *  Pass 'provider' to get provider-facing notifications only.
 *  Defaults to 'user' so existing call sites keep working.
 */
export async function getMyNotifications(
  role: 'user' | 'provider' = 'user'
): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('target_role', role)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

/** Mark a notification as read */
export async function markNotificationRead(notificationId: string): Promise<void> {
  await ensureFreshSession();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

/** Mark all notifications as read for a specific role ('user' or 'provider'). */
export async function markAllNotificationsRead(
  role: 'user' | 'provider' = 'user'
): Promise<void> {
  await ensureFreshSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('target_role', role)
    .eq('is_read', false);

  if (error) throw error;
}

/** Insert a notification for a provider (looks up their user_id from the providers table) */
export async function insertProviderNotification(params: {
  provider_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: 'high' | 'medium' | 'low';
  is_actionable?: boolean;
  booking_id?: string;
}): Promise<void> {
  const { data: provider } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', params.provider_id)
    .single();

  if (!provider?.user_id) return; // provider not found or no linked user

  await supabase.from('notifications').insert({
    user_id: provider.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? 'medium',
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id ?? null,
    provider_id: params.provider_id,
    target_role: 'provider',
  });
}

/**
 * Insert a notification for the customer whose booking was declined or cancelled by the provider.
 * Looks up the user_id from the booking row.
 */
export async function insertUserBookingNotification(params: {
  bookingId: string;
  type: 'booking_declined' | 'booking_cancelled';
}): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id, provider_name_snapshot, service_name_snapshot')
    .eq('id', params.bookingId)
    .single();

  if (!booking?.user_id) return;

  const isDeclined = params.type === 'booking_declined';
  const service = booking.service_name_snapshot ?? 'your appointment';
  const provider = booking.provider_name_snapshot ?? 'your provider';

  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: params.type,
    title: isDeclined ? 'Booking Declined' : 'Booking Cancelled',
    message: isDeclined
      ? `Your ${service} request with ${provider} was declined.`
      : `Your ${service} booking with ${provider} has been cancelled.`,
    priority: 'high',
    is_actionable: true,
    booking_id: params.bookingId,
    target_role: 'user',
  });
}

/** Count unread notifications for a specific role. */
export async function getUnreadNotificationCount(
  role: 'user' | 'provider' = 'user'
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('target_role', role)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────

/** Fetch reviews for a provider */
export async function getProviderReviews(providerId: string): Promise<ReviewWithUser[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      user: users ( name, avatar_url )
    `)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReviewWithUser[];
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
}): Promise<DbReview> {
  await ensureFreshSession();
  const { data, error } = await supabase
    .from('reviews')
    .insert(review)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Check if current user has already reviewed a booking */
export async function hasReviewedBooking(bookingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .single();

  return !!data;
}

// ─────────────────────────────────────────────────────────
// EVENT PLANS (My Plans)
// ─────────────────────────────────────────────────────────

/** Fetch all event plans for the current user */
export async function getMyEventPlans(): Promise<DbEventPlan[]> {
  const { data, error } = await supabase
    .from('event_plans')
    .select('*')
    .order('event_date', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Fetch tasks and checklist for an event plan */
export async function getEventPlanDetails(eventPlanId: string): Promise<{
  tasks: DbEventTask[];
  checklist: DbEventChecklistItem[];
}> {
  const [tasksResult, checklistResult] = await Promise.all([
    supabase
      .from('event_tasks')
      .select('*')
      .eq('event_plan_id', eventPlanId)
      .order('sort_order'),
    supabase
      .from('event_checklist_items')
      .select('*')
      .eq('event_plan_id', eventPlanId)
      .order('sort_order'),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (checklistResult.error) throw checklistResult.error;

  return {
    tasks: tasksResult.data ?? [],
    checklist: checklistResult.data ?? [],
  };
}

// ─────────────────────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────────────────────

/** Get available time slots for a provider on a given date */
// ─────────────────────────────────────────────────────────
// RESCHEDULE REQUESTS
// ─────────────────────────────────────────────────────────

/** Convert user's fuzzy reschedule chip labels to ISO YYYY-MM-DD date strings */
function resolveFuzzyDates(labels: string[]): string[] {
  const today = new Date();
  const results: string[] = [];
  for (const label of labels) {
    let d: Date | null = null;
    if (label === 'Tomorrow') {
      d = new Date(today); d.setDate(d.getDate() + 1);
    } else if (label === 'This Weekend') {
      const daysToSat = (6 - today.getDay() + 7) % 7 || 7;
      d = new Date(today); d.setDate(d.getDate() + daysToSat);
    } else if (label === 'Next Week') {
      const daysToMon = (8 - today.getDay()) % 7 || 7;
      d = new Date(today); d.setDate(d.getDate() + daysToMon);
    } else if (label === 'Next Month') {
      d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }
    if (d) results.push(d.toISOString().slice(0, 10));
  }
  return results;
}

/**
 * Create a reschedule request row in Supabase and return its ID.
 * preferredLabels are the chip labels ("Tomorrow", "Next Week", etc.)
 */
export async function createRescheduleRequest(
  bookingId: string,
  originalDate: string,
  originalTime: string,
  preferredLabels: string[]
): Promise<string> {
  await ensureFreshSession();
  const resolvedDates = resolveFuzzyDates(preferredLabels);
  const { data, error } = await supabase
    .from('booking_reschedule_requests')
    .insert({
      booking_id: bookingId,
      requested_by: 'user',
      original_date: originalDate,
      original_time: originalTime.length === 5 ? originalTime + ':00' : originalTime,
      requested_dates: resolvedDates,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as any).id as string;
}

/**
 * Get the most recent pending or provider_responded reschedule request for a booking.
 * Returns null if none found.
 */
export async function getPendingRescheduleRequest(bookingId: string): Promise<{
  id: string;
  status: string;
  requested_dates: string[] | null;
  provider_available_slots: { date: string; times: string[] }[] | null;
  original_date: string;
  original_time: string;
} | null> {
  const { data } = await supabase
    .from('booking_reschedule_requests')
    .select('id, status, requested_dates, provider_available_slots, original_date, original_time')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'provider_responded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return (data as any) ?? null;
}

/**
 * Provider accepts the reschedule and proposes available time slots.
 * Also updates the status to 'provider_responded'.
 */
export async function providerRespondReschedule(
  requestId: string,
  availableSlots: { date: string; times: string[] }[]
): Promise<void> {
  await ensureFreshSession();
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .update({
      status: 'provider_responded',
      provider_available_slots: availableSlots,
    })
    .eq('id', requestId);
  if (error) throw error;
}

/**
 * Provider declines the reschedule request.
 */
export async function providerDeclineReschedule(requestId: string): Promise<void> {
  await ensureFreshSession();
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);
  if (error) throw error;
}

/**
 * User confirms a reschedule slot — updates both the booking date/time and the request status.
 */
export async function confirmRescheduleSlot(
  bookingId: string,
  requestId: string,
  newDate: string,
  newTime: string
): Promise<void> {
  await ensureFreshSession();
  const newTimeDb = newTime.length === 5 ? newTime + ':00' : newTime;
  const [errors] = await Promise.all([
    supabase
      .from('bookings')
      .update({ booking_date: newDate, booking_time: newTimeDb })
      .eq('id', bookingId)
      .then(({ error }) => error),
    supabase
      .from('booking_reschedule_requests')
      .update({ status: 'confirmed' })
      .eq('id', requestId)
      .then(({ error }) => error),
  ]);
  if (errors) throw errors;
}

/**
 * Notify the customer (user) about a reschedule action — looks up user_id from the booking.
 */
export async function insertUserRescheduleNotification(params: {
  bookingId: string;
  type: 'reschedule_response' | 'reschedule_confirmed';
  title: string;
  message: string;
}): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('id', params.bookingId)
    .single();
  if (!booking?.user_id) return;
  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: 'high',
    is_actionable: true,
    booking_id: params.bookingId,
  });
}

/**
 * Insert a notification for the currently authenticated user.
 */
export async function insertCurrentUserNotification(params: {
  type: 'reschedule_request' | 'reschedule_response' | 'reschedule_confirmed';
  title: string;
  message: string;
  bookingId?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('notifications').insert({
    user_id: user.id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: 'medium',
    is_actionable: !!params.bookingId,
    ...(params.bookingId ? { booking_id: params.bookingId } : {}),
    target_role: 'user',
  });
}

export async function getAvailableSlots(
  providerId: string,
  date: string
): Promise<string[]> {
  const dayOfWeek = new Date(date).getDay();

  // Fetch provider's schedule for that day
  const { data: avail, error: availError } = await supabase
    .from('provider_availability')
    .select('*')
    .eq('provider_id', providerId)
    .eq('day_of_week', dayOfWeek)
    .single();

  if (availError || !avail || avail.is_closed) return [];

  // Fetch existing confirmed bookings on that date
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('booking_time, end_time')
    .eq('provider_id', providerId)
    .eq('booking_date', date)
    .in('status', ['confirmed', 'pending', 'in_progress']);

  // Generate 30-minute slots between open and close time
  const slots: string[] = [];
  const bookedTimes = new Set(
    (existingBookings ?? []).map((b: any) => b.booking_time.slice(0, 5))
  );

  const [openH, openM] = avail.open_time.split(':').map(Number);
  const [closeH, closeM] = avail.close_time.split(':').map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  // For today, skip slots that have already passed (+ 30-min buffer)
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = date === todayStr;
  const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : 0;

  while (current < end) {
    if (isToday && current <= nowMinutes + 30) {
      current += 30;
      continue;
    }
    const h = Math.floor(current / 60).toString().padStart(2, '0');
    const m = (current % 60).toString().padStart(2, '0');
    const slot = `${h}:${m}`;
    if (!bookedTimes.has(slot)) {
      slots.push(slot);
    }
    current += 30;
  }

  return slots;
}

// ─────────────────────────────────────────────────────────
// BOOKING MESSAGES  (user ↔ provider real-time chat)
// ─────────────────────────────────────────────────────────

export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_role: 'customer' | 'provider';
  content: string;
  created_at: string;
}

/** Fetch all messages for a booking, oldest first */
export async function getBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Send a message on a booking */
export async function sendBookingMessage(params: {
  bookingId: string;
  content: string;
  senderRole: 'customer' | 'provider';
}): Promise<BookingMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('booking_messages')
    .insert({
      booking_id: params.bookingId,
      sender_id: user.id,
      sender_role: params.senderRole,
      content: params.content,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Subscribe to new messages on a booking. Returns an unsubscribe function. */
export function subscribeToBookingMessages(
  bookingId: string,
  onMessage: (msg: BookingMessage) => void
): () => void {
  const channel = supabase
    .channel(`booking_messages:${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_messages',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => onMessage(payload.new as BookingMessage)
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
