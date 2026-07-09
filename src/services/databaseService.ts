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
  DbPromotionWithProvider,
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
  DbBookingRescheduleRequest,
  DbProviderAvailability,
  DbProviderBlockedDate,
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

/**
 * Search providers by keyword against service names and descriptions.
 * Only returns providers who actually offer a matching service.
 * Also matches against provider display name and about text.
 * Optionally filtered by service category chip.
 */
export async function searchProviders(
  query: string,
  category?: string
): Promise<DbProvider[]> {
  const q = query.trim();
  if (!q) return getProviders(category);

  // 1. Find provider IDs where a service name or description matches
  const { data: serviceMatches } = await supabase
    .from('services')
    .select('provider_id')
    .eq('is_active', true)
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`);

  // 2. Find provider IDs where display_name or about_text matches
  const { data: nameMatches } = await supabase
    .from('providers')
    .select('id')
    .eq('is_active', true)
    .or(`display_name.ilike.%${q}%,about_text.ilike.%${q}%`);

  const serviceIds = (serviceMatches ?? []).map((r: any) => r.provider_id as string);
  const nameIds    = (nameMatches ?? []).map((r: any) => r.id as string);
  const allIds     = [...new Set([...serviceIds, ...nameIds])];

  if (allIds.length === 0) return [];

  // 3. Fetch those providers, applying optional category filter
  let providerQuery = supabase
    .from('providers')
    .select('*')
    .in('id', allIds)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('rating', { ascending: false });

  if (category && category !== 'ALL') {
    providerQuery = providerQuery.eq('service_category', category);
  }

  const { data, error } = await providerQuery;
  if (error) throw error;
  return data ?? [];
}

/**
 * Log a search event to Supabase for analytics.
 * Fire-and-forget — never blocks the UI. Zero-result searches are the most
 * valuable signal: they show what clients want that no provider offers yet.
 */
export async function logSearchEvent(params: {
  query: string;
  categoryFilter?: string;
  resultsCount: number;
  userId?: string;
}): Promise<void> {
  try {
    await supabase.from('search_events').insert({
      query: params.query.trim().toLowerCase(),
      category_filter: params.categoryFilter ?? null,
      results_count: params.resultsCount,
      user_id: params.userId ?? null,
    });
  } catch {
    // Never let analytics logging break the search experience
  }
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
      provider: providers ( id, slug, display_name, service_category, logo_url, rating, review_count )
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

/** Fetch active, non-expired promotions with provider info. Optionally filter by service category. */
export async function getActivePromotions(category?: string): Promise<DbPromotionWithProvider[]> {
  let query = supabase
    .from('promotions')
    .select('*, providers(display_name, logo_url)')
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (category && category !== 'ALL') {
    query = query.eq('service_category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbPromotionWithProvider[];
}

/** Fetch active, non-expired promotions for a specific provider UUID (client-facing) */
export async function getProviderActivePromotions(providerDbId: string): Promise<DbPromotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('provider_id', providerDbId)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString().split('T')[0])
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Fetch all promotions belonging to the currently signed-in provider */
export async function getMyPromotions(): Promise<DbPromotion[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface UpsertPromotionInput {
  id?: string;
  title: string;
  description?: string;
  discount_text?: string;
  discount_percent?: number;
  discount_amount?: number;
  service_category?: string;
  service_ids?: string[] | null;
  promo_code?: string | null;
  valid_from: string;
  valid_until: string;
  is_active?: boolean;
  image_url?: string | null;
  scheduled_notify_at?: string | null;
  notify_sent_at?: string | null;
}

/** Create or update a promotion for the currently signed-in provider */
export async function upsertPromotion(input: UpsertPromotionInput): Promise<DbPromotion> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!provider) throw new Error('No provider profile found');

  const row = {
    ...input,
    provider_id: provider.id,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from('promotions')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data as DbPromotion;
}

/** Toggle the is_active flag on a promotion */
export async function togglePromotion(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
}

/** Permanently delete a promotion */
export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Partial update — only the fields provided are changed, no full replace */
export async function patchPromotion(id: string, patch: Partial<UpsertPromotionInput>): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

/** Fetch active services for the currently signed-in provider */
export async function getMyProviderServices(): Promise<import('../types/database').DbService[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('provider_id', provider.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Mark a promotion's scheduled notification as sent */
export async function markScheduledNotifSent(promoId: string): Promise<void> {
  await supabase
    .from('promotions')
    .update({ notify_sent_at: new Date().toISOString() })
    .eq('id', promoId);
}

/** Get all unique clients who have booked this provider, with stats */
export async function getProviderClientele(): Promise<import('../types/database').ClienteleMember[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('user_id, customer_name, customer_email, booking_date, base_price, add_ons_total')
    .eq('provider_id', provider.id)
    .in('status', ['completed', 'confirmed'])
    .order('booking_date', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  const map = new Map<string, import('../types/database').ClienteleMember>();
  for (const b of data) {
    const spent = (b.base_price ?? 0) + (b.add_ons_total ?? 0);
    const existing = map.get(b.user_id);
    if (existing) {
      existing.booking_count++;
      existing.total_spent += spent;
    } else {
      map.set(b.user_id, {
        user_id: b.user_id,
        customer_name: b.customer_name ?? 'Unknown',
        customer_email: b.customer_email ?? '',
        booking_count: 1,
        last_booking_date: b.booking_date,
        total_spent: spent,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.booking_count - a.booking_count);
}

/** All bookings for a specific client with the current provider */
export async function getClientBookingHistory(clientUserId: string): Promise<import('../types/database').DbBooking[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('provider_id', provider.id)
    .eq('user_id', clientUserId)
    .order('booking_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Send a rebook nudge notification to a specific client */
export async function sendRebookPrompt(userId: string, providerName: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'booking_reminder' as const,
    title: `${providerName} misses you!`,
    message: "It's been a while — book your next appointment now.",
    is_read: false,
    priority: 'medium' as const,
    is_actionable: true,
    provider_id: provider?.id ?? null,
    metadata: {},
  });
  if (error) throw error;
}

/** Send in-app promotion notifications to a provider's clients */
export async function sendPromotionNotificationsToClients(
  promotion: import('../types/database').DbPromotion,
  audience: 'all' | 'repeat' | 'bookmarked',
): Promise<{ sent: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id, display_name')
    .eq('user_id', user.id)
    .single();

  if (!provider) throw new Error('No provider profile');

  let userIds: string[] = [];

  if (audience === 'bookmarked') {
    const { data } = await supabase
      .from('bookmarks')
      .select('user_id')
      .eq('provider_id', provider.id);
    userIds = (data ?? []).map((r: any) => r.user_id);
  } else {
    const { data } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('provider_id', provider.id)
      .in('status', ['completed', 'confirmed']);

    const rows = data ?? [];

    if (audience === 'repeat') {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      userIds = [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
    } else {
      userIds = [...new Set(rows.map((r: any) => r.user_id))];
    }
  }

  if (userIds.length === 0) return { sent: 0 };

  const badge =
    promotion.discount_text ??
    (promotion.discount_percent ? `${promotion.discount_percent}% OFF` :
    promotion.discount_amount ? `£${promotion.discount_amount} OFF` : 'Special Offer');

  const notifications = userIds.map(uid => ({
    user_id: uid,
    type: 'promotion' as const,
    title: `${badge} — ${provider.display_name ?? 'Your provider'}`,
    message: promotion.title,
    is_read: false,
    priority: 'medium' as const,
    is_actionable: false,
    provider_id: provider.id,
  }));

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) throw error;
  return { sent: userIds.length };
}

/** Send a promotion notification to a single specific client */
export async function sendPromoToClient(
  promotion: import('../types/database').DbPromotion,
  userId: string,
): Promise<void> {
  const badge =
    promotion.discount_text ??
    (promotion.discount_percent ? `${promotion.discount_percent}% OFF` :
    promotion.discount_amount ? `£${promotion.discount_amount} OFF` : 'Special Offer');

  const baseMsg = promotion.description ?? promotion.title;
  const message = promotion.promo_code
    ? `${baseMsg} — Use code: ${promotion.promo_code}`
    : baseMsg;

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'promotion' as const,
    title: `${badge} — ${promotion.title}`,
    message,
    is_read: false,
    priority: 'medium' as const,
    is_actionable: true,
    provider_id: promotion.provider_id,
    metadata: {
      promo_id: promotion.id,
      ...(promotion.promo_code ? { promo_code: promotion.promo_code } : {}),
    },
  });
  if (error) throw error;
}

/** Broadcast an announcement to a pre-filtered list of client user IDs */
export async function sendAnnouncement(
  title: string,
  body: string,
  clientIds: string[],
): Promise<{ sent: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: provider } = await supabase
    .from('providers')
    .select('id, display_name')
    .eq('user_id', user.id)
    .single();

  if (!provider) throw new Error('No provider profile');
  if (clientIds.length === 0) return { sent: 0 };

  const providerName = (provider as any).display_name ?? 'Your provider';
  const notifications = clientIds.map(uid => ({
    user_id: uid,
    type: 'provider_message' as const,
    title: `${providerName} — ${title}`,
    message: body,
    is_read: false,
    priority: 'medium' as const,
    is_actionable: false,
    provider_id: provider.id,
  }));

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) throw error;
  return { sent: clientIds.length };
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

/** Add a bookmark */
export async function addBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: user.id, provider_id: providerId });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

/** Remove a bookmark */
export async function removeBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

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
  if (!isUuid(providerId)) return false; // static/demo provider

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

/** Fetch reviews for the currently authenticated provider */
export async function getMyProviderReviews(): Promise<ReviewWithUser[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  return getProviderReviews(provider.id);
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

// ─────────────────────────────────────────────────────────
// RESCHEDULE REQUESTS
// ─────────────────────────────────────────────────────────

/** Create or replace a reschedule request when a user initiates one */
export async function upsertRescheduleRequest(params: {
  booking_id: string;
  original_date: string;
  original_time: string;
  requested_dates: string[];
}): Promise<void> {
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .upsert(
      {
        booking_id: params.booking_id,
        requested_by: 'user' as const,
        original_date: params.original_date,
        original_time: params.original_time,
        requested_dates: params.requested_dates,
        provider_available_slots: null,
        status: 'pending' as const,
        reschedule_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'booking_id' }
    );
  if (error) throw error;
}

/** Get the active (pending or provider_responded) reschedule request for a booking */
export async function getActiveRescheduleRequest(
  bookingId: string
): Promise<DbBookingRescheduleRequest | null> {
  const { data, error } = await supabase
    .from('booking_reschedule_requests')
    .select('*')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'provider_responded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DbBookingRescheduleRequest | null;
}

/** Provider responds with their available slots */
export async function respondToRescheduleRequest(
  bookingId: string,
  availableSlots: { date: string; times: string[] }[]
): Promise<void> {
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .update({
      provider_available_slots: availableSlots,
      status: 'provider_responded' as const,
      updated_at: new Date().toISOString(),
    })
    .eq('booking_id', bookingId)
    .eq('status', 'pending');
  if (error) throw error;
}

/** Mark a reschedule request as confirmed or rejected */
export async function closeRescheduleRequest(
  bookingId: string,
  status: 'confirmed' | 'rejected'
): Promise<void> {
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId);
  if (error) throw error;
}

/** Update a booking's date and time after a confirmed reschedule */
export async function updateBookingDateTime(
  bookingId: string,
  bookingDate: string,
  bookingTime: string,
  endTime: string
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      booking_date: bookingDate,
      booking_time: bookingTime,
      end_time: endTime,
    })
    .eq('id', bookingId);
  if (error) throw error;
}

/** Mark the remaining balance on a deposit booking as collected */
export async function markBalanceCollected(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ remaining_balance: 0, payment_status: 'paid' })
    .eq('id', bookingId);
  if (error) throw error;
}

/** Provider initiates a reschedule by proposing new slots directly */
export async function upsertProviderRescheduleRequest(params: {
  booking_id: string;
  original_date: string;
  original_time: string;
  proposed_slots: { date: string; times: string[] }[];
}): Promise<void> {
  const { error } = await supabase
    .from('booking_reschedule_requests')
    .upsert(
      {
        booking_id: params.booking_id,
        requested_by: 'provider' as const,
        original_date: params.original_date,
        original_time: params.original_time,
        requested_dates: [],
        provider_available_slots: params.proposed_slots,
        status: 'provider_responded' as const,
        reschedule_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'booking_id' }
    );
  if (error) throw error;
}

/** Send a notification to the user who made a booking (provider → user direction) */
export async function insertBookingUserNotification(params: {
  booking_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: 'high' | 'medium' | 'low';
  is_actionable?: boolean;
  provider_id?: string;
}): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('id', params.booking_id)
    .single();
  if (!booking?.user_id) return;

  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? 'medium',
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id,
    provider_id: params.provider_id ?? null,
  });
}

// ── Provider Availability ─────────────────────────────────────────────────────

export async function getProviderAvailability(providerId: string): Promise<DbProviderAvailability[]> {
  const { data, error } = await supabase
    .from('provider_availability')
    .select('*')
    .eq('provider_id', providerId)
    .order('day_of_week');
  if (error) throw error;
  return data ?? [];
}

export async function updateProviderAutoAccept(
  providerId: string,
  autoAccept: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('providers')
    .update({ auto_accept_bookings: autoAccept })
    .eq('id', providerId);
  if (error) throw error;
}

export async function updateProviderScheduleSettings(
  providerId: string,
  settings: {
    booking_window_days: number;
    slot_interval_mins: number;
    buffer_mins: number;
    min_booking_notice_hrs: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from('providers')
    .update(settings)
    .eq('id', providerId);
  if (error) throw error;
}

/** Persist cancellation notice hours to providers table (0 = anytime). */
export async function updateProviderCancellationPolicy(
  providerId: string,
  noticeHours: number,
): Promise<void> {
  const { error } = await supabase
    .from('providers')
    .update({ cancellation_notice_hours: noticeHours })
    .eq('id', providerId);
  if (error) throw error;
}

/** Fetch a provider's cancellation notice window by display name. Returns 0 (anytime) on error. */
export async function getProviderCancellationPolicy(displayName: string): Promise<number> {
  const { data } = await supabase
    .from('providers')
    .select('cancellation_notice_hours')
    .eq('display_name', displayName)
    .maybeSingle();
  return (data as any)?.cancellation_notice_hours ?? 0;
}

export async function upsertProviderAvailability(
  providerId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  isClosed: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('provider_availability')
    .upsert(
      { provider_id: providerId, day_of_week: dayOfWeek, open_time: openTime, close_time: closeTime, is_closed: isClosed },
      { onConflict: 'provider_id,day_of_week' },
    );
  if (error) throw error;
}

export async function getProviderBlockedDates(providerId: string): Promise<DbProviderBlockedDate[]> {
  const { data, error } = await supabase
    .from('provider_blocked_dates')
    .select('*')
    .eq('provider_id', providerId)
    .order('blocked_date');
  if (error) throw error;
  return data ?? [];
}

export async function addProviderBlockedDate(
  providerId: string,
  date: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('provider_blocked_dates')
    .insert({ provider_id: providerId, blocked_date: date, reason });
  if (error) throw error;
}

export async function removeProviderBlockedDate(id: string): Promise<void> {
  const { error } = await supabase.from('provider_blocked_dates').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// CLIENT BEAUTY PROFILE
// ─────────────────────────────────────────────────────────

export interface ClientBeautyProfile {
  // Hair
  hairType:         string | null;
  scalpCondition:   string | null;
  hairGoals:        string[];
  treatmentHistory: string[];
  // Skin
  skinType:         string | null;
  skinTone:         string | null;
  skinConcerns:     string[];
  sensitiveAreas:   string[];
  // Nails
  nailLength:       string | null;
  nailShape:        string | null;
  // Lashes & Brows
  lashStyle:        string | null;
  lashStatus:       string | null;
  browStyle:        string | null;
  browCondition:    string | null;
  // Makeup
  makeupCoverage:   string | null;
  makeupFinish:     string | null;
  makeupEyes:       string | null;
  makeupLips:       string | null;
  // General
  styleVibe:        string | null;
  // Health & Consent
  allergies:        string[];
  medicalNotes:     string | null;
  photographyConsent: boolean;
}

export async function getClientBeautyProfile(userId: string): Promise<ClientBeautyProfile | null> {
  const EMPTY_PROFILE: ClientBeautyProfile = {
    hairType: null, scalpCondition: null, hairGoals: [], treatmentHistory: [],
    skinType: null, skinTone: null, skinConcerns: [], sensitiveAreas: [],
    nailLength: null, nailShape: null,
    lashStyle: null, lashStatus: null, browStyle: null, browCondition: null,
    makeupCoverage: null, makeupFinish: null, makeupEyes: null, makeupLips: null,
    styleVibe: null, allergies: [], medicalNotes: null, photographyConsent: true,
  };

  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        hair_type, scalp_condition, hair_goals, treatment_history,
        skin_type, skin_tone, skin_concerns, sensitive_areas,
        nail_length, nail_shape,
        lash_style, lash_status, brow_style, brow_condition,
        makeup_coverage, makeup_finish, makeup_eyes, makeup_lips,
        style_vibe, allergies, medical_notes, photography_consent
      `)
      .eq('id', userId)
      .single();

    if (error || !data) {
      const { data: exists } = await supabase.from('users').select('id').eq('id', userId).single();
      return exists ? EMPTY_PROFILE : null;
    }

    const d = data as any;
    return {
      hairType:           d.hair_type           ?? null,
      scalpCondition:     d.scalp_condition      ?? null,
      hairGoals:          d.hair_goals           ?? [],
      treatmentHistory:   d.treatment_history    ?? [],
      skinType:           d.skin_type            ?? null,
      skinTone:           d.skin_tone            ?? null,
      skinConcerns:       d.skin_concerns        ?? [],
      sensitiveAreas:     d.sensitive_areas      ?? [],
      nailLength:         d.nail_length          ?? null,
      nailShape:          d.nail_shape           ?? null,
      lashStyle:          d.lash_style           ?? null,
      lashStatus:         d.lash_status          ?? null,
      browStyle:          d.brow_style           ?? null,
      browCondition:      d.brow_condition       ?? null,
      makeupCoverage:     d.makeup_coverage      ?? null,
      makeupFinish:       d.makeup_finish        ?? null,
      makeupEyes:         d.makeup_eyes          ?? null,
      makeupLips:         d.makeup_lips          ?? null,
      styleVibe:          d.style_vibe           ?? null,
      allergies:          d.allergies            ?? [],
      medicalNotes:       d.medical_notes        ?? null,
      photographyConsent: d.photography_consent  ?? true,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// INTAKE FORMS
// ─────────────────────────────────────────────────────────

export interface IntakeFormQuestion {
  id:       string;
  type:     'text' | 'yesno' | 'choice';
  label:    string;
  required: boolean;
  options?: string[];
}

export interface IntakeForm {
  id:                string;
  bookingId:         string;
  providerId:        string;
  clientUserId:      string;
  title:             string;
  questions:         IntakeFormQuestion[];
  answers:           Record<string, string> | null;
  status:            'pending' | 'completed';
  sentAt:            string;
  completedAt:       string | null;
  requiresSignature: boolean;
  clientSignature:   string | null;
  libraryFormId:     string | null;
}

// ── Library forms (saved to provider's form library, not yet sent) ───────────

export interface LibraryForm {
  id:                string;
  providerId:        string;
  title:             string;
  questions:         IntakeFormQuestion[];
  serviceNames:      string[];   // provider's service names this form covers
  autoSend:          boolean;    // auto-send when matching service is booked
  requiresSignature: boolean;
  sentCount:         number;
  createdAt:         string;
}

export async function getProviderFormLibrary(): Promise<LibraryForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const { data } = await supabase
    .from('provider_form_library')
    .select('*')
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapLibraryForm);
}

export async function saveFormToLibrary(params: {
  title:             string;
  questions:         IntakeFormQuestion[];
  serviceNames:      string[];
  autoSend:          boolean;
  requiresSignature: boolean;
}): Promise<LibraryForm> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error('No provider profile');
  const { data, error } = await supabase
    .from('provider_form_library')
    .insert({
      provider_id:        provider.id,
      title:              params.title,
      questions:          params.questions,
      service_names:      params.serviceNames,
      auto_send:          params.autoSend,
      requires_signature: params.requiresSignature,
    })
    .select()
    .single();
  if (error) throw error;
  return mapLibraryForm(data);
}

export async function updateLibraryForm(id: string, params: Partial<{
  title:             string;
  questions:         IntakeFormQuestion[];
  serviceNames:      string[];
  autoSend:          boolean;
  requiresSignature: boolean;
}>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined)             patch['title']              = params.title;
  if (params.questions !== undefined)         patch['questions']          = params.questions;
  if (params.serviceNames !== undefined)      patch['service_names']      = params.serviceNames;
  if (params.autoSend !== undefined)          patch['auto_send']          = params.autoSend;
  if (params.requiresSignature !== undefined) patch['requires_signature'] = params.requiresSignature;
  patch['updated_at'] = new Date().toISOString();
  const { error } = await supabase.from('provider_form_library').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteLibraryForm(id: string): Promise<void> {
  const { error } = await supabase.from('provider_form_library').delete().eq('id', id);
  if (error) throw error;
}

export async function sendLibraryFormToClient(
  libraryFormId: string,
  bookingId: string,
  clientUserId: string,
): Promise<IntakeForm> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error('No provider profile');

  // Fetch the library form to copy its content
  const { data: lf, error: lfErr } = await supabase
    .from('provider_form_library')
    .select('*')
    .eq('id', libraryFormId)
    .single();
  if (lfErr || !lf) throw new Error('Library form not found');

  // Create the sent instance
  const { data, error } = await supabase
    .from('booking_intake_forms')
    .insert({
      booking_id:         bookingId,
      provider_id:        provider.id,
      client_user_id:     clientUserId,
      title:              lf.title,
      questions:          lf.questions,
      requires_signature: lf.requires_signature,
      library_form_id:    libraryFormId,
    })
    .select()
    .single();
  if (error) throw error;

  // Increment sent_count on the library form
  await supabase
    .from('provider_form_library')
    .update({ sent_count: (lf.sent_count ?? 0) + 1 })
    .eq('id', libraryFormId);

  return mapIntakeForm(data);
}

function mapLibraryForm(d: any): LibraryForm {
  return {
    id:                d.id,
    providerId:        d.provider_id,
    title:             d.title,
    questions:         d.questions ?? [],
    serviceNames:      d.service_names ?? [],
    autoSend:          d.auto_send ?? false,
    requiresSignature: d.requires_signature ?? false,
    sentCount:         d.sent_count ?? 0,
    createdAt:         d.created_at,
  };
}

export async function createIntakeForm(
  bookingId: string,
  providerId: string,
  clientUserId: string,
  title: string,
  questions: IntakeFormQuestion[],
): Promise<IntakeForm> {
  const { data, error } = await supabase
    .from('booking_intake_forms')
    .insert({ booking_id: bookingId, provider_id: providerId, client_user_id: clientUserId, title, questions })
    .select()
    .single();

  if (error) throw error;
  return mapIntakeForm(data);
}

export async function getIntakeFormByBooking(bookingId: string): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from('booking_intake_forms')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapIntakeForm(data);
}

export async function getIntakeFormById(formId: string): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from('booking_intake_forms')
    .select('*')
    .eq('id', formId)
    .single();

  if (error || !data) return null;
  return mapIntakeForm(data);
}

export async function submitIntakeFormAnswers(
  formId: string,
  answers: Record<string, string>,
  signature?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    answers,
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
  if (signature !== undefined) patch['client_signature'] = signature;
  const { error } = await supabase
    .from('booking_intake_forms')
    .update(patch)
    .eq('id', formId);
  if (error) throw error;
}

export async function getPendingIntakeFormsForMe(): Promise<IntakeForm[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('booking_intake_forms')
    .select('*')
    .eq('client_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []).map(mapIntakeForm);
}

export async function getMyProviderIntakeForms(): Promise<IntakeForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const { data } = await supabase
    .from('booking_intake_forms')
    .select('*')
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false })
    .limit(15);
  return (data ?? []).map(mapIntakeForm);
}

// ─────────────────────────────────────────────────────────
// PROVIDER CONTACT METHODS (for client-side contact sheet)
// ─────────────────────────────────────────────────────────

export interface ProviderContactInfo {
  preferred_contact_methods: string[];
  whatsapp_number: string | null;
  email: string | null;
  phone: string | null;
}

export async function getProviderContactByDisplayName(displayName: string): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from('providers')
    .select('preferred_contact_methods, whatsapp_number, email, phone')
    .eq('display_name', displayName)
    .single();

  if (!data) return null;
  return {
    preferred_contact_methods: (data as any).preferred_contact_methods ?? ['in_app'],
    whatsapp_number: (data as any).whatsapp_number ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  };
}

function mapIntakeForm(d: any): IntakeForm {
  return {
    id:                d.id,
    bookingId:         d.booking_id,
    providerId:        d.provider_id,
    clientUserId:      d.client_user_id,
    title:             d.title,
    questions:         d.questions ?? [],
    answers:           d.answers ?? null,
    status:            d.status,
    sentAt:            d.sent_at,
    completedAt:       d.completed_at ?? null,
    requiresSignature: d.requires_signature ?? false,
    clientSignature:   d.client_signature ?? null,
    libraryFormId:     d.library_form_id ?? null,
  };
}

// ─────────────────────────────────────────────────────────
// PROVIDER LOCATIONS — real coordinates from DB
// ─────────────────────────────────────────────────────────

export interface ProviderLocationData {
  address: string;
  coordinates: { latitude: number; longitude: number };
  phone: string;
}

/** Fetch location data for a set of providers by their display names */
export async function getProviderLocationsByDisplayNames(
  displayNames: string[]
): Promise<Record<string, ProviderLocationData>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from('providers')
    .select('display_name, location_text, latitude, longitude, phone')
    .in('display_name', displayNames);

  if (error || !data) return {};

  const result: Record<string, ProviderLocationData> = {};
  for (const p of data) {
    if (p.latitude != null && p.longitude != null) {
      result[p.display_name] = {
        address: p.location_text ?? 'Address will be confirmed by provider',
        coordinates: { latitude: Number(p.latitude), longitude: Number(p.longitude) },
        phone: p.phone ?? 'Phone will be confirmed by provider',
      };
    }
  }
  return result;
}

/** Returns a set of display names that belong to mobile providers. */
export async function getMobileProviderDisplayNames(displayNames: string[]): Promise<Set<string>> {
  if (displayNames.length === 0) return new Set();
  const { data, error } = await supabase
    .from('providers')
    .select('display_name, business_type')
    .in('display_name', displayNames);
  if (error || !data) return new Set();
  return new Set(
    (data as Array<{ display_name: string; business_type: string | null }>)
      .filter(p => p.business_type === 'mobile')
      .map(p => p.display_name)
  );
}

// ─────────────────────────────────────────────────────────
// ADDRESS RELEASE POLICY
// ─────────────────────────────────────────────────────────

export interface ProviderAddressSettings {
  business_type: 'salon' | 'studio' | 'home_based' | 'mobile' | null;
  full_address: string | null;
  address_release_policy: 'always' | 'on_confirmation' | 'day_before' | 'two_days_before' | 'three_days_before' | 'five_days_before' | 'week_before' | 'manual' | null;
}

/** Fetch a provider's address/business-type settings by provider UUID. */
export async function getProviderAddressSettings(providerId: string): Promise<ProviderAddressSettings | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('business_type, full_address, address_release_policy')
    .eq('id', providerId)
    .single();
  if (error || !data) return null;
  return data as ProviderAddressSettings;
}

/** Fetch a provider's address/business-type settings by display name (for client-side use). */
export async function getProviderAddressSettingsByDisplayName(displayName: string): Promise<ProviderAddressSettings | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('business_type, full_address, address_release_policy')
    .eq('display_name', displayName)
    .single();
  if (error || !data) return null;
  return data as ProviderAddressSettings;
}

/** Manually release the full address for a specific booking to the client. */
export async function releaseBookingAddress(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ address_released_at: new Date().toISOString() })
    .eq('id', bookingId);
  if (error) throw error;
}

/** Fetch the address_released_at timestamp for a booking. */
export async function getBookingAddressReleasedAt(bookingId: string): Promise<string | null> {
  const { data } = await supabase
    .from('bookings')
    .select('address_released_at')
    .eq('id', bookingId)
    .single();
  return (data as any)?.address_released_at ?? null;
}

// ─────────────────────────────────────────────────────────
// USER INTERACTIONS — analytics / personalization
// ─────────────────────────────────────────────────────────

/** Record a user interaction for the personalization algorithm */
export async function trackUserInteraction(interaction: {
  type: 'view' | 'search' | 'favorite' | 'book' | 'offer_view';
  providerId?: string;
  serviceCategory?: string;
  durationSeconds?: number;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_interactions').insert({
      user_id: user.id,
      type: interaction.type,
      provider_id: interaction.providerId ?? null,
      service_category: interaction.serviceCategory ?? null,
      duration_seconds: interaction.durationSeconds ?? null,
    });
  } catch {
    // Silent — analytics must never block the UI
  }
}

// ─────────────────────────────────────────────────────────
// PROVIDER FOLLOWS
// ─────────────────────────────────────────────────────────

/** Follow a provider */
export async function followProvider(providerId: string): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('provider_follows')
    .insert({ user_id: user.id, provider_id: providerId });
  if (error && error.code !== '23505') throw error;
}

/** Unfollow a provider */
export async function unfollowProvider(providerId: string): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('provider_follows')
    .delete()
    .eq('user_id', user.id)
    .eq('provider_id', providerId);
  if (error) throw error;
}

/** Check if the current user follows a provider */
export async function checkIsFollowing(providerId: string): Promise<boolean> {
  if (!UUID_RE.test(providerId)) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('provider_follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider_id', providerId)
    .maybeSingle();
  return !!data;
}

/** Get the total follower count for a specific provider (used on provider side) */
export async function getProviderFollowerCount(providerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('provider_follows')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId);
  if (error) throw error;
  return count ?? 0;
}

/** Get the follower count for the currently logged-in provider */
export async function getMyFollowerCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!providerRow) return 0;
  return getProviderFollowerCount(providerRow.id);
}

// ─────────────────────────────────────────────────────────
// SAVED PORTFOLIO ITEMS
// ─────────────────────────────────────────────────────────

/** Load the user's saved portfolio item IDs from Supabase */
export async function getSavedPortfolioIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('users')
    .select('saved_portfolio')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return (data?.saved_portfolio as string[]) ?? [];
}

/** Save a portfolio item ID to the user's saved list */
export async function savePortfolioItemToDb(itemId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Append the item ID to the JSONB array if not already present
  const { error } = await supabase.rpc('append_saved_portfolio_item', {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

/** Remove a portfolio item ID from the user's saved list */
export async function unsavePortfolioItemFromDb(itemId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.rpc('remove_saved_portfolio_item', {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────

export interface NotificationPreferences {
  bookingConfirm: boolean;
  bookingReminder: boolean;
  bookingUpdates: boolean;
  promotions: boolean;
  newProviders: boolean;
  weeklySummary: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  bookingConfirm: true,
  bookingReminder: true,
  bookingUpdates: true,
  promotions: false,
  newProviders: true,
  weeklySummary: false,
};

/** Load the user's notification preferences from Supabase */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_NOTIF_PREFS;
  const { data, error } = await supabase
    .from('users')
    .select('notification_preferences')
    .eq('id', user.id)
    .single();
  if (error) return DEFAULT_NOTIF_PREFS;
  return { ...DEFAULT_NOTIF_PREFS, ...(data?.notification_preferences ?? {}) };
}

/** Persist the user's notification preferences to Supabase */
export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('users')
    .update({ notification_preferences: prefs })
    .eq('id', user.id);
  if (error) throw error;
}

/** Count how many users have bookmarked the currently logged-in provider */
export async function getMyBookmarkCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!providerRow) return 0;
  const { count, error } = await supabase
    .from('bookmarks')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerRow.id);
  if (error) throw error;
  return count ?? 0;
}

/** Update the maximum number of confirmed bookings a provider accepts per day (0 = unlimited) */
export async function updateProviderMaxBookingsPerDay(
  providerId: string,
  maxPerDay: number,
): Promise<void> {
  const { error } = await supabase
    .from('providers')
    .update({ max_bookings_per_day: maxPerDay })
    .eq('id', providerId);
  if (error) throw error;
}

/**
 * Fetch a provider's auto-accept flag and daily booking cap.
 * Returns defaults (false, 0) on any error so callers can treat it as safe.
 */
export async function getProviderBookingCapSettings(
  providerId: string,
): Promise<{ auto_accept: boolean; max_per_day: number }> {
  const { data, error } = await supabase
    .from('providers')
    .select('auto_accept_bookings, max_bookings_per_day')
    .eq('id', providerId)
    .single();
  if (error || !data) return { auto_accept: false, max_per_day: 0 };
  return {
    auto_accept: (data as any).auto_accept_bookings ?? false,
    max_per_day: (data as any).max_bookings_per_day ?? 0,
  };
}

/**
 * Count non-cancelled, non-no_show bookings for a provider on a given date.
 * Used to enforce max_bookings_per_day.
 */
export async function countProviderBookingsOnDate(
  providerId: string,
  date: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId)
    .eq('booking_date', date)
    .not('status', 'in', '("cancelled","no_show")');
  if (error) throw error;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────
// DEPOSIT POLICIES
// ─────────────────────────────────────────────────────────

export interface ProviderDepositPolicy {
  depositType: 'percentage' | 'fixed';
  depositAmount: number;
  depositAvailable: boolean;
}

/** Fetch deposit policies for multiple providers by display name (batch). Falls back to 20% default if no policy set. */
export async function getProviderDepositPoliciesByDisplayNames(
  displayNames: string[]
): Promise<Record<string, ProviderDepositPolicy>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from('providers')
    .select('display_name, booking_policies')
    .in('display_name', displayNames);

  if (error || !data) return {};

  const defaultPolicy: ProviderDepositPolicy = { depositType: 'percentage', depositAmount: 20, depositAvailable: true };
  const result: Record<string, ProviderDepositPolicy> = {};

  for (const p of data) {
    const policies = p.booking_policies as {
      depositRequired?: boolean;
      depositType?: string;
      depositAmount?: string;
      depositNote?: string;
    } | null;

    if (policies && policies.depositAmount) {
      const depositType: 'percentage' | 'fixed' = policies.depositType === 'fixed' ? 'fixed' : 'percentage';
      const depositAmount = Number(policies.depositAmount);
      result[p.display_name] = {
        depositType,
        depositAmount: depositAmount > 0 ? depositAmount : 20,
        depositAvailable: true,
      };
    } else {
      result[p.display_name] = { ...defaultPolicy };
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// SCHEDULING CONSTRAINTS
// ─────────────────────────────────────────────────────────

/**
 * Fetch the scheduling constraints configured by a provider.
 * Returns sensible defaults when the provider is not found.
 */
export async function getProviderSchedulingConstraints(displayName: string): Promise<{
  minBookingNoticeHrs: number;
  bookingWindowDays: number;
}> {
  const { data } = await supabase
    .from('providers')
    .select('min_booking_notice_hrs, booking_window_days')
    .eq('display_name', displayName)
    .maybeSingle();
  return {
    minBookingNoticeHrs: (data as any)?.min_booking_notice_hrs ?? 0,
    bookingWindowDays: (data as any)?.booking_window_days ?? 60,
  };
}
