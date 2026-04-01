/**
 * Supabase data service — Phase 1
 * Central place for all database queries.
 * Import from here in screens instead of calling supabase directly.
 */

import { supabase } from '../lib/supabase';
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: user.id, provider_id: providerId });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Remove a bookmark */
export async function removeBookmark(providerId: string): Promise<void> {
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
      add_ons: booking_add_ons ( * )
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

/** Fetch all notifications for the current user */
export async function getMyNotifications(): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

/** Mark a notification as read */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

/** Mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
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
  });
}

/** Count unread notifications */
export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
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

  while (current < end) {
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
