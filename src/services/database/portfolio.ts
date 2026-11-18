// Database access: Portfolio photos, saved photos and Explore collections.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { VENUE_PORTFOLIO_CATEGORY } from "../../features/providers/venuePhotos";
import type { DbPortfolioItem, DiscoverServiceWithProvider, PortfolioItemWithProvider } from "../../types/database";
import { COLLECTION_COLORS, type CollectionColor, type ExploreCollection } from "../../types/collections";
import { getSessionUser, ownProviderIdExclusion } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT } from "./providers";

// ─────────────────────────────────────────────────────────
// PORTFOLIO
// ─────────────────────────────────────────────────────────

const PORTFOLIO_WORK_LIMIT = 30;
/** Venue shots are an "about the business" detail, not a gallery to browse —
 *  a handful is the whole point of them, so they get their own small budget. */
const PORTFOLIO_VENUE_LIMIT = 12;

const PORTFOLIO_ITEM_COLUMNS =
  "id, provider_id, service_id, image_url, caption, category, tags, price, aspect_ratio, is_featured, created_at, vibe_tags, occasion_tags, trend_names, hair_type_shown, skin_tone_shown";

/**
 * One provider's photos, already separated into the work gallery and the
 * venue/workspace shots, newest first.
 *
 * The venue exclusion is done in SQL, NOT by fetching one list and dividing it
 * afterwards. Every caller was already splitting the result — but the row cap
 * was applied to the combined list, so a provider's venue photos silently ate
 * their work gallery's budget: eight shots of the room meant eight fewer
 * pieces of actual work reaching the profile, their own editor, and Becca's
 * count.
 *
 * `includeVenue` is opt-in and costs the only second query, because just two
 * of the four callers ever display venue shots (the client profile's
 * Additional Information, and the InfoReg address step that manages them).
 * The other two read `work` alone and stay on a single query — fewer round
 * trips than before this split, not more.
 *
 * The work query mirrors getPortfolioItems' exclusion: a NULL category is a
 * legacy work photo (it predates the venue uploader), and in SQL
 * `category <> 'venue'` is NULL rather than true for those, so a bare .neq()
 * would drop them.
 */
export async function getProviderPortfolio(
  providerId: string,
  options?: { includeVenue?: boolean },
): Promise<{ work: DbPortfolioItem[]; venue: DbPortfolioItem[] }> {
  const workQuery = supabase
    .from("portfolio_items")
    .select(PORTFOLIO_ITEM_COLUMNS)
    .eq("provider_id", providerId)
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PORTFOLIO_WORK_LIMIT);

  if (!options?.includeVenue) {
    const { data, error } = await workQuery;
    if (error) throw error;
    return { work: (data ?? []) as DbPortfolioItem[], venue: [] };
  }

  const [workResult, venueResult] = await Promise.all([
    workQuery,
    supabase
      .from("portfolio_items")
      .select(PORTFOLIO_ITEM_COLUMNS)
      .eq("provider_id", providerId)
      .eq("category", VENUE_PORTFOLIO_CATEGORY)
      .order("created_at", { ascending: false })
      .limit(PORTFOLIO_VENUE_LIMIT),
  ]);

  if (workResult.error) throw workResult.error;
  if (venueResult.error) throw venueResult.error;
  return {
    work: (workResult.data ?? []) as DbPortfolioItem[],
    venue: (venueResult.data ?? []) as DbPortfolioItem[],
  };
}

/**
 * Add a portfolio item for a provider (image already uploaded to storage).
 * Stamps `category` from the provider's own service_category at insert
 * time — portfolio photos never had a per-photo category picker in the
 * upload UI, so without this every row landed with category = NULL, which
 * made it invisible to every Explore category-filter tab (NULL never
 * matches a Postgres `.eq()`) despite still showing under "All".
 */
export async function addPortfolioItem(
  providerId: string,
  imageUrl: string,
  aspectRatio: number = 1,
  category?: string,
): Promise<DbPortfolioItem> {
  let resolvedCategory = category;
  if (!resolvedCategory) {
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("service_category")
      .eq("id", providerId)
      .single();
    if (providerError) throw providerError;
    resolvedCategory = provider.service_category;
  }

  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({
      provider_id: providerId,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      category: resolvedCategory,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as DbPortfolioItem;
}

/**
 * Branding → Your Photos: marks exactly these portfolio photos as the ones a
 * page style's hero opens on (Editorial, Snapshot, Hush)
 * (portfolio_items.is_featured, which nothing else sets), and no others. At
 * most HERO_PHOTO_LIMIT are sent (features/providers/heroPhotos). The provider's
 * own rows only: RLS portfolio_owner_all.
 *
 * Two updates, not one transaction: if the second fails after the first,
 * nothing is picked, and the hero falls back to the newest photos rather than
 * showing a half-saved choice.
 */
export async function setHeroPortfolioPhotos(providerId: string, itemIds: readonly string[]): Promise<void> {
  const { error: clearError } = await supabase
    .from("portfolio_items")
    .update({ is_featured: false })
    .eq("provider_id", providerId)
    .eq("is_featured", true);
  if (clearError) throw clearError;
  if (itemIds.length === 0) return;

  const { error } = await supabase
    .from("portfolio_items")
    .update({ is_featured: true })
    .eq("provider_id", providerId)
    .in("id", [...itemIds]);
  if (error) throw error;
}

/** Delete a portfolio item by id */
export async function deletePortfolioItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("portfolio_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// Explore's masonry cards do not need the full portfolio row (personalisation
// fields and service linkage are used by other callers). Keep its network
// response small without narrowing the shared getPortfolioItems() contract.
const EXPLORE_PORTFOLIO_SELECT = `
  id, provider_id, image_url, caption, category, tags, price, aspect_ratio,
  provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
`;

/** Fetch the lean portfolio projection used by Explore's public masonry feed. */
export async function getExplorePortfolioItems(
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
  offset = 0,
): Promise<PortfolioItemWithProvider[]> {
  let query = supabase
    .from("portfolio_items")
    .select(EXPLORE_PORTFOLIO_SELECT)
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .order("created_at", { ascending: false });

  if (category && category !== "All") {
    query = query.eq("category", category.toUpperCase());
  }

  const { data, error } = await (offset > 0
    ? query.range(offset, offset + limit - 1)
    : query.limit(limit));
  if (error) throw error;
  // The public projection is intentionally narrower than DbPortfolioItem,
  // while the Explore mapper only reads the selected card fields above.
  return (data ?? []) as unknown as PortfolioItemWithProvider[];
}

/** Fetch portfolio items, optionally filtered by category */
export async function getPortfolioItems(
  category?: string,
  limit: number | null = DEFAULT_PROVIDER_QUERY_LIMIT,
  options?: { excludeOwnProvider?: boolean },
  offset = 0,
): Promise<PortfolioItemWithProvider[]> {
  // !inner + provider.has_gone_live excludes portfolio items belonging to a
  // provider who hasn't published a schedule yet — they shouldn't surface
  // anywhere client-facing, not just in browse/search/profile.
  let query = supabase
    .from("portfolio_items")
    .select(
      `
      *,
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
    `,
    )
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Venue/workspace shots are excluded from Explore's discovery feed and
    // Becca's inspiration search. getProviderPortfolio() (the provider
    // profile's own Portfolio grid) is deliberately NOT filtered — that is
    // where these are meant to be seen. Written as an OR with is-null rather
    // than a plain .neq(): in SQL `category <> 'venue'` is NULL (not true)
    // for a NULL category, so a bare .neq would silently drop the legacy
    // category-less rows mapDbPortfolioItem still has a fallback for.
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .order("created_at", { ascending: false });

  // Explore is an intentional exception: providers should be able to browse
  // their own published work alongside everyone else's. Other discovery
  // callers retain the default self-exclusion so they do not recommend the
  // provider's own business back to them.
  if (options?.excludeOwnProvider !== false) {
    query = query.not("provider_id", "in", await ownProviderIdExclusion());
  }

  if (category && category !== "All") {
    query = query.eq("category", category.toUpperCase());
  }

  if (limit != null) {
    query = offset > 0
      ? query.range(offset, offset + limit - 1)
      : query.limit(limit);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

/** Search portfolio by text (caption, tags, provider name) */
export async function searchPortfolio(
  query: string,
): Promise<PortfolioItemWithProvider[]> {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select(
      `
      *,
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
    `,
    )
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Unlike getPortfolioItems (the passive discovery/inspiration feed),
    // this is an explicit text search — a provider's own work is allowed
    // to turn up here (see ownProviderIdExclusion).
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .or(`caption.ilike.%${query}%,tags.cs.{${query}}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

/**
 * Fetch services that have at least one photo, with provider info, for the
 * mixed Explore discovery feed. The !inner join on service_images excludes
 * services with no photo.
 *
 * `audience` filters on the per-service services.audience column ('women' |
 * 'men' | 'kids' | 'everyone') — distinct from `category`, which filters on
 * the provider's whole-business service_category. Powers HomeScreen's Male/
 * Kids Services sections, which need the actual matching service listings
 * (not just providers whose entire business is registered as MALE/KIDS).
 */
export async function getDiscoverServices(
  category?: string,
  limit: number | null = 40,
  audience?: "women" | "men" | "kids" | "everyone",
  options?: { excludeOwnProvider?: boolean },
  offset = 0,
): Promise<DiscoverServiceWithProvider[]> {
  let query = supabase
    .from("services")
    .select(
      `
      id, provider_id, name, description, price, service_category,
      service_images!inner ( url, sort_order, aspect_ratio, fit ),
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
    `,
    )
    .eq("is_active", true)
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Pagination must have a stable order. Without this, a next page can
    // repeat or skip services as Postgres is free to return rows in any order.
    .order("created_at", { ascending: false });

  if (options?.excludeOwnProvider !== false) {
    query = query.not("provider_id", "in", await ownProviderIdExclusion());
  }

  // Filtered on the SERVICE's own category, not the provider's whole
  // service_categories array — a provider who offers both Hair and Makeup
  // overlaps both, so array-overlap put their Makeup services in the Hair
  // section (and vice versa) just because the provider also does Hair.
  // Each service row already carries its own real category (stamped at
  // save time in providerRegistrationService.ts), so a client browsing
  // "Hair" should see only services actually filed under Hair.
  if (category && category !== "All") {
    query = query.eq("service_category", category.toUpperCase());
  }
  if (audience) {
    query = query.eq("audience", audience);
  }
  if (limit != null) {
    query = offset > 0
      ? query.range(offset, offset + limit - 1)
      : query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DiscoverServiceWithProvider[];
}

/**
 * How many cards Explore's feed holds for a filter in total, not just the
 * pages loaded so far: every portfolio item getPortfolioItems would return,
 * plus one card per photo of every service getDiscoverServices would return
 * (mapDbServiceToCards makes a card per photo). Head-only counts, so no rows
 * come back. Same filters as those two queries, own work included, as Explore
 * passes excludeOwnProvider: false.
 */
export async function getDiscoverFeedTotal(category?: string): Promise<number> {
  let portfolioQuery = supabase
    .from("portfolio_items")
    .select("id, provider: providers!inner ( id )", { count: "exact", head: true })
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`);
  let imageQuery = supabase
    .from("service_images")
    .select(
      "service_id, service: services!inner ( id, provider: providers!inner ( id ) )",
      { count: "exact", head: true },
    )
    .eq("service.is_active", true)
    .eq("service.provider.is_active", true)
    .eq("service.provider.has_gone_live", true);
  if (category && category !== "All") {
    portfolioQuery = portfolioQuery.eq("category", category.toUpperCase());
    imageQuery = imageQuery.eq("service.service_category", category.toUpperCase());
  }
  const [portfolio, images] = await Promise.all([portfolioQuery, imageQuery]);
  if (portfolio.error) throw portfolio.error;
  if (images.error) throw images.error;
  return (portfolio.count ?? 0) + (images.count ?? 0);
}

/**
 * Provider ids with at least one active service tagged `audience`, WITHOUT
 * requiring a photo. Deliberately separate from getDiscoverServices (which
 * !inner-joins service_images for its photo feed): a provider whose new
 * "Men's Cut" has no photo yet must still qualify for HomeScreen's Male/Kids
 * sections — the photo requirement should only gate whether a service CARD
 * can render for it, not whether the provider appears at all. Mirrors the
 * hair-type filter's broad/narrow split (provider-level match in
 * getProvidersAvailability's hairType param, per-service refinement
 * elsewhere), just scoped to services.audience.
 */
export async function getProviderIdsByServiceAudience(
  audience: "women" | "men" | "kids" | "everyone",
  limit = 200,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("services")
    .select("provider_id, provider:providers!inner ( id )")
    .eq("is_active", true)
    .eq("audience", audience)
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    .limit(limit);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.provider_id as string))];
}

/**
 * Resolve the user's saved/"hearted" IDs (from `useBookmarkStore.savedPortfolioIds`,
 * a mix of raw portfolio_item ids and `service-<id>` prefixed ids from the
 * mixed discovery feed) into full rows, batched by kind — no N+1.
 * Powers the Explore screen's Favourites tab.
 *
 * Legacy `provider-<id>` ids (Explore used to show provider cover-photo cards,
 * built from the Branding backdrop) are skipped rather than hydrated, so an
 * old heart can't put a provider's profile backdrop back into Favourites.
 */
export async function getSavedPortfolioDetails(ids: string[]): Promise<{
  portfolioItems: PortfolioItemWithProvider[];
  services: DiscoverServiceWithProvider[];
}> {
  // service ids carry a per-image suffix (`service-<id>__<imageIndex>`, one
  // id per carousel photo — see mapDbServiceToCards) so multiple saved ids
  // can point at the same underlying service; strip the suffix and dedupe
  // before querying, one row per service regardless of how many of its
  // photos were saved.
  const serviceIds = [
    ...new Set(
      ids
        .filter((id) => id.startsWith("service-"))
        .map((id) => id.slice("service-".length).replace(/__\d+$/, "")),
    ),
  ];
  const portfolioIds = ids.filter(
    (id) => !id.startsWith("provider-") && !id.startsWith("service-"),
  );

  const [portfolioResult, serviceResult] = await Promise.all([
    portfolioIds.length > 0
      ? supabase
          .from("portfolio_items")
          .select(
            `
            *,
            provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
          `,
          )
          .in("id", portfolioIds)
          .eq("provider.is_active", true)
          .eq("provider.has_gone_live", true)
          // Same venue exclusion as getPortfolioItems: this is the Favourites
          // tab of the same Explore feed, so a legacy saved id pointing at a
          // venue shot must not put one back into a browse surface it can no
          // longer be discovered in.
          .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? supabase
          .from("services")
          .select(
            `
            id, provider_id, name, description, price,
            service_images ( url, sort_order ),
            provider: providers!inner ( id, slug, display_name, service_category, logo_url, logo_framing, rating, review_count )
          `,
          )
          .in("id", serviceIds)
          .eq("is_active", true)
          .eq("provider.is_active", true)
          .eq("provider.has_gone_live", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (portfolioResult.error) throw portfolioResult.error;
  if (serviceResult.error) throw serviceResult.error;

  return {
    portfolioItems: (portfolioResult.data ?? []) as PortfolioItemWithProvider[],
    services: (serviceResult.data ??
      []) as unknown as DiscoverServiceWithProvider[],
  };
}

// ─────────────────────────────────────────────────────────
// SAVED PORTFOLIO ITEMS
// ─────────────────────────────────────────────────────────

/** Load the user's saved portfolio item IDs from Supabase */
export async function getSavedPortfolioIds(): Promise<string[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("users")
    .select("saved_portfolio")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return (data?.saved_portfolio as string[]) ?? [];
}

/** Save a portfolio item ID to the user's saved list */
export async function savePortfolioItemToDb(itemId: string): Promise<void> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return;
  // Append the item ID to the JSONB array if not already present
  const { error } = await supabase.rpc("append_saved_portfolio_item", {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

/** Remove a portfolio item ID from the user's saved list */
export async function unsavePortfolioItemFromDb(itemId: string): Promise<void> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return;
  const { error } = await supabase.rpc("remove_saved_portfolio_item", {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// EXPLORE COLLECTIONS
// Folders of hearted Explore photos. RLS keeps every row owner-only, only
// accepts an item that's in the owner's saved_portfolio, and a trigger takes
// an un-hearted photo out of every collection — so none of that is
// re-checked here.
// ─────────────────────────────────────────────────────────

const COLLECTIONS_QUERY_LIMIT = 50; // the database caps an account at 50
const COLLECTION_ITEMS_QUERY_LIMIT = 2000;

interface ExploreCollectionRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

function toCollectionColor(value: string): CollectionColor {
  return (COLLECTION_COLORS as readonly string[]).includes(value)
    ? (value as CollectionColor)
    : "pink";
}

function mapCollectionRow(
  row: ExploreCollectionRow,
  itemIds: string[],
): ExploreCollection {
  return {
    id: row.id,
    name: row.name,
    color: toCollectionColor(row.color),
    createdAt: row.created_at,
    itemIds,
  };
}

/** The signed-in account's collections, oldest first, with their item ids. */
export async function getMyCollections(): Promise<ExploreCollection[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];
  const { data: rows, error } = await supabase
    .from("explore_collections")
    .select("id, name, color, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(COLLECTIONS_QUERY_LIMIT);
  if (error) throw error;
  const collections = (rows ?? []) as ExploreCollectionRow[];
  if (collections.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("explore_collection_items")
    .select("collection_id, item_id, added_at")
    .in(
      "collection_id",
      collections.map((c) => c.id),
    )
    .order("added_at", { ascending: true })
    .limit(COLLECTION_ITEMS_QUERY_LIMIT);
  if (itemsError) throw itemsError;

  const byCollection = new Map<string, string[]>();
  for (const item of (items ?? []) as { collection_id: string; item_id: string }[]) {
    const list = byCollection.get(item.collection_id) ?? [];
    list.push(item.item_id);
    byCollection.set(item.collection_id, list);
  }
  return collections.map((row) =>
    mapCollectionRow(row, byCollection.get(row.id) ?? []),
  );
}

export async function createCollection(
  name: string,
  color: CollectionColor,
): Promise<ExploreCollection> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Sign in to make a collection");
  const { data, error } = await supabase
    .from("explore_collections")
    .insert({ user_id: user.id, name: name.trim(), color })
    .select("id, name, color, created_at")
    .single();
  if (error) throw error;
  return mapCollectionRow(data as ExploreCollectionRow, []);
}

export async function updateCollection(
  collectionId: string,
  changes: { name?: string; color?: CollectionColor },
): Promise<void> {
  const patch: { name?: string; color?: CollectionColor } = {};
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.color !== undefined) patch.color = changes.color;
  const { error } = await supabase
    .from("explore_collections")
    .update(patch)
    .eq("id", collectionId);
  if (error) throw error;
}

/** Deletes the folder only — its photos stay in Favourites. */
export async function deleteCollection(collectionId: string): Promise<void> {
  const { error } = await supabase
    .from("explore_collections")
    .delete()
    .eq("id", collectionId);
  if (error) throw error;
}

export async function addItemToCollection(
  collectionId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("explore_collection_items")
    .upsert(
      { collection_id: collectionId, item_id: itemId },
      { onConflict: "collection_id,item_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeItemFromCollection(
  collectionId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("explore_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  if (error) throw error;
}
