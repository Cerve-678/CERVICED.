/**
 * Supabase data service — Phase 1
 * Central place for all database queries.
 * Import from here in screens instead of calling supabase directly.
 */

import { supabase } from '../lib/supabase';
import { AvailabilityService } from './AvailabilityService';
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
  DbProviderAvailabilityWindow,
  DbProviderAvailabilityOverride,
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
    .eq('has_gone_live', true)
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
    .eq('has_gone_live', true)
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
    .eq('has_gone_live', true)
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

  // A user should have exactly one provider profile, but duplicates have crept in
  // during the account churn. Never throw on 0 or >1 rows: prefer the active
  // profile, then the oldest (the original), so identity resolution is
  // deterministic instead of crashing provider mode.
  const { data, error } = await supabase
    .from('providers')
    .select('*')
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

// ─────────────────────────────────────────────────────────
// PORTFOLIO
// ─────────────────────────────────────────────────────────

/** Fetch one provider's portfolio items (client work gallery), newest first */
export async function getProviderPortfolio(providerId: string): Promise<DbPortfolioItem[]> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select('*')
    .eq('provider_id', providerId)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as DbPortfolioItem[];
}

/** Add a portfolio item for a provider (image already uploaded to storage) */
export async function addPortfolioItem(
  providerId: string,
  imageUrl: string,
  aspectRatio: number = 1
): Promise<DbPortfolioItem> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .insert({ provider_id: providerId, image_url: imageUrl, aspect_ratio: aspectRatio })
    .select('*')
    .single();

  if (error) throw error;
  return data as DbPortfolioItem;
}

/** Delete a portfolio item by id */
export async function deletePortfolioItem(id: string): Promise<void> {
  const { error } = await supabase.from('portfolio_items').delete().eq('id', id);
  if (error) throw error;
}

/** Fetch portfolio items, optionally filtered by category */
export async function getPortfolioItems(category?: string): Promise<PortfolioItemWithProvider[]> {
  // !inner + provider.has_gone_live excludes portfolio items belonging to a
  // provider who hasn't published a schedule yet — they shouldn't surface
  // anywhere client-facing, not just in browse/search/profile.
  let query = supabase
    .from('portfolio_items')
    .select(`
      *,
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
    `)
    .eq('provider.is_active', true)
    .eq('provider.has_gone_live', true)
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
      provider: providers!inner ( id, slug, display_name, service_category, logo_url )
    `)
    .eq('provider.is_active', true)
    .eq('provider.has_gone_live', true)
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
    .select('*, providers!inner(display_name, logo_url)')
    .eq('providers.is_active', true)
    .eq('providers.has_gone_live', true)
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

/** Claim a promotion's scheduled notification. Returns false when another
 *  sender (the scheduled-promotion cron job) already claimed it — callers
 *  must claim BEFORE sending so clients never get the blast twice. */
export async function markScheduledNotifSent(promoId: string): Promise<boolean> {
  const { data } = await supabase
    .from('promotions')
    .update({ notify_sent_at: new Date().toISOString() })
    .eq('id', promoId)
    .is('notify_sent_at', null)
    .select('id');
  return (data ?? []).length > 0;
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
    recipient_role: 'client' as const,
    metadata: {},
  });
  if (error) throw error;
}

/** Send in-app promotion notifications to a provider's clients */
export async function sendPromotionNotificationsToClients(
  promotion: import('../types/database').DbPromotion,
  audience: 'all' | 'repeat' | 'bookmarked' | 'interested',
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

  if (audience === 'interested') {
    // This provider's own audience: bookmarked, followed, or previously
    // booked THIS provider. Never reaches other providers' clients, even
    // ones into the same service category — promotions stay per-provider.
    // See supabase/promotion_interest_targeting.sql for the definition.
    const { data, error } = await supabase.rpc('get_promotion_audience', {
      p_promotion_id: promotion.id,
    });
    if (error) throw error;
    userIds = (data ?? []).map((r: any) => r.user_id);
  } else if (audience === 'bookmarked') {
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
    recipient_role: 'client' as const,
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
    recipient_role: 'client' as const,
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
  // 'announcement' (not 'provider_message') — provider_message is a
  // provider-only type that NotificationsScreen hides in client mode,
  // so announcements sent under it were invisible to clients.
  const notifications = clientIds.map(uid => ({
    user_id: uid,
    type: 'announcement' as const,
    title: `${providerName} — ${title}`,
    message: body,
    is_read: false,
    priority: 'medium' as const,
    is_actionable: false,
    provider_id: provider.id,
    recipient_role: 'client' as const,
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
    .select('provider: providers!inner ( * )')
    .eq('provider.has_gone_live', true)
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

/**
 * Fetch the current user's bookings within a bounded recent window (default
 * 90 days back) plus everything upcoming — an unbounded `select('*')` over a
 * user's entire booking history doesn't scale as accounts age. Older bookings
 * remain reachable via getOlderBookings() for a "load more" affordance rather
 * than being fetched eagerly on every screen load.
 */
export async function getMyBookings(sinceDaysAgo = 90): Promise<BookingWithAddOns[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  // Read from client_bookings (not the base table): a security-invoker view
  // that masks the provider address until the release policy allows it, so the
  // address is enforced server-side rather than hidden by the UI.
  const { data, error } = await supabase
    .from('client_bookings')
    .select('*')
    .gte('booking_date', cutoffDate)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/**
 * Page further back than getMyBookings()'s default window. `beforeDate` should
 * be the oldest `booking_date` already loaded (YYYY-MM-DD) — since the initial
 * window always fetches full days (`gte`), paging with `lt` on that boundary
 * can't skip or duplicate same-day bookings.
 */
export async function getOlderBookings(beforeDate: string, limit = 30): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from('client_bookings')  // gated view — see getMyBookings
    .select('*')
    .lt('booking_date', beforeDate)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: true })
    .limit(limit);

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

/**
 * Check whether another active booking already occupies this exact slot.
 * Mirrors the bookings_no_double_book_idx partial unique index — the index is
 * the hard guarantee; this is the friendly pre-check so the user gets a clear
 * "slot taken" message instead of a failed insert.
 */
export async function isSlotTaken(
  providerId: string,
  bookingDate: string,
  bookingTime24: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('provider_id', providerId)
    .eq('booking_date', bookingDate)
    .eq('booking_time', bookingTime24)
    .not('status', 'in', '(cancelled,no_show)')
    .limit(1);
  if (error) return false; // fail open — the unique index is the backstop
  return (data?.length ?? 0) > 0;
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

  // 2. Provider must have published a schedule, and be open on that day.
  //    No availability row = the provider never set their hours — they are
  //    not bookable until they do (no silent default schedule).
  const bookingDayOfWeek = new Date(booking.booking_date + 'T12:00:00').getDay(); // 0=Sun
  const { data: availability } = await supabase
    .from('provider_availability')
    .select('open_time, close_time, is_closed')
    .eq('provider_id', booking.provider_id)
    .eq('day_of_week', bookingDayOfWeek)
    .maybeSingle();

  if (!availability) {
    throw new Error("This provider hasn't published their schedule yet, so they can't take bookings right now.");
  }
  if (availability.is_closed) {
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

  // 4. Determine this booking's real time span. Priority:
  //    caller-provided end_time → service duration_minutes → 60 min default.
  //    The span is what gets blocked in the calendar, so it must never be
  //    zero-length — an end_time equal to the start would leave the rest of
  //    the appointment open for someone else to book.
  const toMinutes = (t: string): number => {
    const [hh, mm] = t.split(':');
    return Number(hh ?? 0) * 60 + Number(mm ?? 0);
  };
  const startMins = toMinutes(booking.booking_time);

  let durationMinutes = 0;
  if (booking.end_time && toMinutes(booking.end_time) > startMins) {
    durationMinutes = toMinutes(booking.end_time) - startMins;
  }
  if (durationMinutes <= 0 && booking.service_id) {
    const { data: service } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', booking.service_id)
      .maybeSingle();
    if (service?.duration_minutes) durationMinutes = service.duration_minutes;
  }
  if (durationMinutes <= 0) durationMinutes = 60;

  const endMins = Math.min(startMins + durationMinutes, 23 * 60 + 59);
  const endTimeStr = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}:00`;

  // Persist the guaranteed end_time so every future overlap check, calendar
  // view and auto-complete job sees the appointment's true span
  booking = { ...booking, end_time: endTimeStr };

  // 5. No overlapping active bookings for same provider + date, respecting
  //    buffer gaps. Each booking's buffer comes from its OWN service (NULL
  //    falls back to the provider's global buffer_mins) so a 3-hour colour
  //    appointment's cleanup gap still applies even when the new request is
  //    for an unrelated quick service.
  const { data: providerBufferRow } = await supabase
    .from('providers')
    .select('buffer_mins')
    .eq('id', booking.provider_id)
    .maybeSingle();
  const providerBufferMins = (providerBufferRow as any)?.buffer_mins ?? 0;

  let newBufferBefore = 0;
  let newBufferAfter = providerBufferMins;
  if (booking.service_id) {
    const { data: newSvc } = await supabase
      .from('services')
      .select('buffer_before_mins, buffer_after_mins')
      .eq('id', booking.service_id)
      .maybeSingle();
    newBufferBefore = (newSvc as any)?.buffer_before_mins ?? 0;
    newBufferAfter = (newSvc as any)?.buffer_after_mins ?? providerBufferMins;
  }
  const newEffStart = startMins - newBufferBefore;
  const newEffEnd = endMins + newBufferAfter;

  const { data: conflicts } = await supabase
    .from('bookings')
    .select('booking_time, end_time, service_id')
    .eq('provider_id', booking.provider_id)
    .eq('booking_date', booking.booking_date)
    .in('status', ['pending', 'confirmed', 'in_progress']);

  if (conflicts) {
    for (const existing of conflicts) {
      const existParts = existing.booking_time.split(':');
      const existStart = Number(existParts[0] ?? 0) * 60 + Number(existParts[1] ?? 0);

      // Determine existing booking's end time and its own buffer
      let existEnd = existStart + 60; // fallback
      let existBufferBefore = 0;
      let existBufferAfter = providerBufferMins;
      if (existing.end_time) {
        const endParts = existing.end_time.split(':');
        existEnd = Number(endParts[0] ?? 0) * 60 + Number(endParts[1] ?? 0);
      }
      if (existing.service_id) {
        const { data: svc } = await supabase
          .from('services')
          .select('duration_minutes, buffer_before_mins, buffer_after_mins')
          .eq('id', existing.service_id)
          .maybeSingle();
        if (!existing.end_time && svc?.duration_minutes) existEnd = existStart + svc.duration_minutes;
        existBufferBefore = (svc as any)?.buffer_before_mins ?? 0;
        existBufferAfter = (svc as any)?.buffer_after_mins ?? providerBufferMins;
      }

      const existEffStart = existStart - existBufferBefore;
      const existEffEnd = existEnd + existBufferAfter;

      // Overlap check: two effective (buffer-padded) intervals overlap if
      // one starts before the other ends
      if (newEffStart < existEffEnd && newEffEnd > existEffStart) {
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

/** A provider_conversations row joined with the client's basic profile info */
export interface ProviderConversationWithClient {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string; avatar_url: string | null } | null;
}

/** Fetch all conversations for the current provider, most recently updated first */
export async function getProviderConversations(): Promise<ProviderConversationWithClient[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from('provider_conversations')
    .select(`
      *,
      client: users ( id, name, avatar_url )
    `)
    .eq('provider_id', provider.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ProviderConversationWithClient[];
}

/** A provider_conversations row joined with the provider's public info */
export interface UserConversationWithProvider {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  provider: { id: string; slug: string; display_name: string; logo_url: string | null } | null;
}

/** Fetch all conversations for the current client user, most recently updated first */
export async function getUserConversations(): Promise<UserConversationWithProvider[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('provider_conversations')
    .select(`
      *,
      provider: providers ( id, slug, display_name, logo_url )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as UserConversationWithProvider[];
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
export async function getMyNotifications(role: 'provider' | 'client'): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_role', role)
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

  const { error } = await supabase.from('notifications').insert({
    user_id: provider.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? 'medium',
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id ?? null,
    provider_id: params.provider_id,
    recipient_role: 'provider',
  });
  if (error) {
    // Surface the failure — callers decide whether it's fatal. Swallowing it
    // here is how RLS-blocked inserts went unnoticed.
    console.warn('[insertProviderNotification] insert failed:', error.message);
    throw error;
  }
}

/** Count unread notifications for the given recipient role */
export async function getUnreadNotificationCount(role: 'provider' | 'client'): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .eq('recipient_role', role);

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

// 12-hour "h:mm AM/PM" (AvailabilityService's format) -> 24-hour "HH:MM"
function to24HourTime(time12h: string): string {
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12h;
  let h = parseInt(match[1]!, 10);
  const m = match[2];
  const period = match[3]!.toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Get available time slots for a provider on a given date, as 24-hour
 * "HH:MM" strings. Delegates to AvailabilityService — this used to be a
 * second, independent slot-generation implementation (fixed 30-min grid,
 * no buffer/min-notice/booking-window awareness) that could offer a
 * provider reschedule-suggestion time their own policies would reject.
 */
export async function getAvailableSlots(
  providerId: string,
  date: string
): Promise<string[]> {
  const slots = await AvailabilityService.getAvailableSlots(providerId, date);
  return slots.filter(s => !s.isBooked).map(s => to24HourTime(s.time));
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
    .update({ remaining_balance: 0, payment_status: 'fully_paid' })
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

  const { error } = await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? 'medium',
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id,
    provider_id: params.provider_id ?? null,
    recipient_role: 'client',
  });
  if (error) {
    console.warn('[insertBookingUserNotification] insert failed:', error.message);
    throw error;
  }
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

/** Return every recurring working period, ordered for direct calendar display. */
export async function getProviderAvailabilityWindows(providerId: string): Promise<DbProviderAvailabilityWindow[]> {
  const { data, error } = await supabase
    .from('provider_availability_windows')
    .select('*')
    .eq('provider_id', providerId)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityWindow[];
}

/** Replace a provider's full weekly schedule atomically from the UI's point of view. */
export async function replaceProviderAvailabilityWindows(
  providerId: string,
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>,
): Promise<void> {
  const { error: removeError } = await supabase
    .from('provider_availability_windows')
    .delete()
    .eq('provider_id', providerId);
  if (removeError) throw removeError;
  if (windows.length === 0) return;
  const { error } = await supabase
    .from('provider_availability_windows')
    .insert(windows.map(w => ({ provider_id: providerId, ...w })));
  if (error) throw error;
}

export async function getProviderAvailabilityOverrides(
  providerId: string,
  fromDate?: string,
): Promise<DbProviderAvailabilityOverride[]> {
  let query = supabase
    .from('provider_availability_overrides')
    .select('*')
    .eq('provider_id', providerId)
    .order('availability_date')
    .order('start_time');
  if (fromDate) query = query.gte('availability_date', fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityOverride[];
}

export async function addProviderAvailabilityOverride(
  providerId: string,
  override: { availability_date: string; is_closed: boolean; start_time?: string | null; end_time?: string | null; reason?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('provider_availability_overrides')
    .insert({ provider_id: providerId, ...override });
  if (error) throw error;
}

export async function removeProviderAvailabilityOverride(id: string): Promise<void> {
  const { error } = await supabase.from('provider_availability_overrides').delete().eq('id', id);
  if (error) throw error;
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

/** Mirror the Automations screen settings onto the providers row so client
 *  screens and pg_cron jobs can read them (auth user_metadata cannot be). */
export async function updateProviderAutomationSettings(
  providerId: string,
  settings: NonNullable<DbProvider['automation_settings']>,
): Promise<void> {
  const { error } = await supabase
    .from('providers')
    .update({ automation_settings: settings })
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

/** Cancellation policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderCancellationPolicyById(providerId: string): Promise<number> {
  const { data } = await supabase
    .from('providers')
    .select('cancellation_notice_hours')
    .eq('id', providerId)
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

  await notifyClientIntakeFormSent(clientUserId, bookingId, provider.id, lf.title, provider.display_name);

  return mapIntakeForm(data);
}

/** Tell the client (in-app + push via DB trigger) that a form is waiting for them.
 *  Non-fatal — the form itself is already created when this runs. */
async function notifyClientIntakeFormSent(
  clientUserId: string,
  bookingId: string,
  providerId: string,
  formTitle: string,
  providerName?: string | null,
): Promise<void> {
  try {
    let name = providerName;
    if (!name) {
      const { data } = await supabase
        .from('providers')
        .select('display_name')
        .eq('id', providerId)
        .maybeSingle();
      name = (data as any)?.display_name ?? 'Your provider';
    }
    await supabase.from('notifications').insert({
      user_id: clientUserId,
      type: 'intake_form_received' as const,
      title: 'Form to Complete',
      message: `${name} sent you "${formTitle}" to fill in before your appointment.`,
      is_read: false,
      priority: 'high' as const,
      is_actionable: true,
      booking_id: bookingId,
      provider_id: providerId,
      recipient_role: 'client' as const,
      metadata: {},
    });
  } catch {
    // best-effort only
  }
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

  await notifyClientIntakeFormSent(clientUserId, bookingId, providerId, title);

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
// BOOKING INFO PACKS (prep/aftercare info attached to bookings —
// see supabase/info_packs_bookings.sql)
// ─────────────────────────────────────────────────────────

export interface BookingInfoPack {
  id: string;
  bookingId: string;
  providerId: string;
  title: string;
  service: string;
  content: string;
  viewedAt: string | null;
  createdAt: string;
}

function mapBookingInfoPack(d: any): BookingInfoPack {
  return {
    id:        d.id,
    bookingId: d.booking_id,
    providerId: d.provider_id,
    title:     d.title,
    service:   d.service ?? 'GENERAL',
    content:   d.content,
    viewedAt:  d.viewed_at ?? null,
    createdAt: d.created_at,
  };
}

/** Info packs the provider attached to one booking (client view) */
export async function getInfoPacksByBooking(bookingId: string): Promise<BookingInfoPack[]> {
  const { data, error } = await supabase
    .from('booking_info_packs')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []).map(mapBookingInfoPack);
}

/** Mark an info pack as read — clears it from the booking's attention badge */
export async function markInfoPackViewed(packId: string): Promise<void> {
  await supabase
    .from('booking_info_packs')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', packId);
}

/** Booking ids that need the client's attention (pending intake forms +
 *  unread info packs) → drives the "!" indicator on booking cards. */
export async function getMyBookingActionItems(): Promise<Record<string, number>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const counts: Record<string, number> = {};

  const [{ data: forms }, { data: packs }] = await Promise.all([
    supabase
      .from('booking_intake_forms')
      .select('booking_id')
      .eq('client_user_id', user.id)
      .eq('status', 'pending'),
    supabase
      .from('booking_info_packs')
      .select('booking_id')
      .eq('client_user_id', user.id)
      .is('viewed_at', null),
  ]);

  for (const r of [...(forms ?? []), ...(packs ?? [])]) {
    counts[r.booking_id] = (counts[r.booking_id] ?? 0) + 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────
// PROMO CODES (client redemption at checkout)
// ─────────────────────────────────────────────────────────

/** Look up a live promotion by promo code for a provider (by display name).
 *  Returns null when the code doesn't exist, is inactive, or is outside its
 *  validity window. */
export async function validatePromoCode(
  providerDisplayName: string,
  code: string,
): Promise<DbPromotion | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('display_name', providerDisplayName)
    .maybeSingle();
  if (!provider) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('promotions')
    .select('*')
    .eq('provider_id', (provider as any).id)
    .ilike('promo_code', trimmed)
    .eq('is_active', true)
    .lte('valid_from', today)
    .gte('valid_until', today)
    .limit(1)
    .maybeSingle();

  return (data as DbPromotion) ?? null;
}

// ─────────────────────────────────────────────────────────
// RESCHEDULE POLICY (client-side enforcement of provider limits)
// ─────────────────────────────────────────────────────────

export interface ProviderReschedulePolicy {
  /** null = unlimited */
  maxReschedules: number | null;
  /** hours of notice required before the appointment; 0 = same day allowed */
  rescheduleNoticeHours: number;
}

/** Parse the provider's booking_policies reschedule settings.
 *  Values come from registration: rescheduleNotice 'same_day'|'24h'|'48h'|'72h',
 *  maxReschedules '1'|'2'|'unlimited'. Missing policy = 1 reschedule, 24h notice
 *  (matches the app's historical defaults). */
function mapReschedulePolicyRow(data: any): ProviderReschedulePolicy {
  const fallback: ProviderReschedulePolicy = { maxReschedules: 1, rescheduleNoticeHours: 24 };
  const bp = (data as any)?.booking_policies as {
    rescheduleNotice?: string;
    maxReschedules?: string;
  } | null;
  if (!bp) return fallback;

  const max = bp.maxReschedules === 'unlimited'
    ? null
    : parseInt(bp.maxReschedules ?? '1', 10) || 1;
  const noticeMap: Record<string, number> = { same_day: 0, '24h': 24, '48h': 48, '72h': 72 };
  const notice = noticeMap[bp.rescheduleNotice ?? '24h'] ?? 24;
  return { maxReschedules: max, rescheduleNoticeHours: notice };
}

export async function getProviderReschedulePolicyByDisplayName(
  displayName: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from('providers')
    .select('booking_policies')
    .eq('display_name', displayName)
    .maybeSingle();
  return mapReschedulePolicyRow(data);
}

/** Reschedule policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderReschedulePolicyById(
  providerId: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from('providers')
    .select('booking_policies')
    .eq('id', providerId)
    .maybeSingle();
  return mapReschedulePolicyRow(data);
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

function mapContactRow(data: any): ProviderContactInfo | null {
  if (!data) return null;
  return {
    preferred_contact_methods: (data as any).preferred_contact_methods ?? ['in_app'],
    whatsapp_number: (data as any).whatsapp_number ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  };
}

export async function getProviderContactByDisplayName(displayName: string): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from('providers')
    .select('preferred_contact_methods, whatsapp_number, email, phone')
    .eq('display_name', displayName)
    .maybeSingle();
  return mapContactRow(data);
}

/** Provider contact info by provider id (stable) — prefer over the display-name variant. */
export async function getProviderContactById(providerId: string): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from('providers')
    .select('preferred_contact_methods, whatsapp_number, email, phone')
    .eq('id', providerId)
    .maybeSingle();
  return mapContactRow(data);
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

/**
 * Full address settings, INCLUDING full_address — provider-side only.
 * Never call this from a client screen: a client must not receive an address
 * the release policy hasn't unlocked. Clients use getProviderAddressPolicy*,
 * and the actual address arrives (gated) via the client_bookings view.
 */
export async function getProviderAddressSettings(providerId: string): Promise<ProviderAddressSettings | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('business_type, full_address, address_release_policy')
    .eq('id', providerId)
    .single();
  if (error || !data) return null;
  return data as ProviderAddressSettings;
}

/** Provider-side only — see getProviderAddressSettings. */
export async function getProviderAddressSettingsByDisplayName(displayName: string): Promise<ProviderAddressSettings | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('business_type, full_address, address_release_policy')
    .eq('display_name', displayName)
    .single();
  if (error || !data) return null;
  return data as ProviderAddressSettings;
}

/** Business type + release policy WITHOUT full_address — safe for client screens. */
export type ProviderAddressPolicy = Pick<ProviderAddressSettings, 'business_type' | 'address_release_policy'>;

/** Client-safe: release policy by provider id (stable), no address leaked. */
export async function getProviderAddressPolicy(providerId: string): Promise<ProviderAddressPolicy | null> {
  const { data } = await supabase
    .from('providers')
    .select('business_type, address_release_policy')
    .eq('id', providerId)
    .maybeSingle();
  return data ? (data as ProviderAddressPolicy) : null;
}

/** Client-safe fallback: release policy by display name, no address leaked. */
export async function getProviderAddressPolicyByDisplayName(displayName: string): Promise<ProviderAddressPolicy | null> {
  const { data } = await supabase
    .from('providers')
    .select('business_type, address_release_policy')
    .eq('display_name', displayName)
    .maybeSingle();
  return data ? (data as ProviderAddressPolicy) : null;
}

export interface ClientBookingSummary {
  id: string;
  service_name_snapshot: string;
  booking_date: string;
  booking_time: string;
  client_address: string | null;
}

/** Client's upcoming/pending bookings with a given (mobile) provider — used to pick which booking an address applies to when sending it via chat. */
export async function getClientBookingsForAddressShare(providerId: string): Promise<ClientBookingSummary[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service_name_snapshot, booking_date, booking_time, client_address')
    .eq('provider_id', providerId)
    .in('status', ['pending', 'upcoming'])
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });
  if (error) return [];
  return (data ?? []) as ClientBookingSummary[];
}

/** Save the address a client sends their mobile provider, for a specific booking. */
export async function setBookingClientAddress(bookingId: string, address: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ client_address: address })
    .eq('id', bookingId);
  if (error) throw error;
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

    // Provider explicitly turned deposits OFF → client pays in full, no
    // deposit option in the cart. (Previously this switch was ignored and
    // any leftover amount kept the deposit option alive.)
    if (policies && policies.depositRequired === false) {
      result[p.display_name] = { depositType: 'percentage', depositAmount: 0, depositAvailable: false };
    } else if (policies && policies.depositAmount) {
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
export async function getProviderSchedulingConstraints(providerIdOrDisplayName: string): Promise<{
  bookingWindowDays: number;
}> {
  // Prefer the real UUID when the caller has one — exact display_name
  // matching is fragile (case, punctuation, a provider renaming their
  // business) and silently returns nothing, which looks identical to a
  // provider with no constraints set instead of a failed lookup.
  const query = supabase.from('providers').select('booking_window_days');
  const { data } = UUID_RE.test(providerIdOrDisplayName)
    ? await query.eq('id', providerIdOrDisplayName).maybeSingle()
    : await query.eq('display_name', providerIdOrDisplayName).maybeSingle();
  return {
    bookingWindowDays: (data as any)?.booking_window_days ?? 60,
  };
}
