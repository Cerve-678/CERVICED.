// Database access: Bookmarks, provider follows, following people and Recommend.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { PublicProviderSummary } from "../../types/database";
import { type CircleRow, groupCircleRows } from "../../features/social/presentation";
import type { CircleByProvider, ContactMatch, FollowStatus, PeopleListKind, PersonListEntry, PersonSummary, ProviderSharing, SocialSettings, SocialSettingsUpdate } from "../../features/social/types";
import { getSessionUser } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT, PUBLIC_PROVIDER_SUMMARY_SELECT } from "./providers";

// ─────────────────────────────────────────────────────────
// BOOKMARKS
// ─────────────────────────────────────────────────────────

/** Fetch all providers bookmarked by the current user */
export async function getBookmarkedProviders(): Promise<PublicProviderSummary[]> {
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`provider: providers!inner (${PUBLIC_PROVIDER_SUMMARY_SELECT})`)
    .eq("provider.has_gone_live", true)
    .eq("provider.is_active", true)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? [])
    .map((row) => row.provider)
    .filter(Boolean) as unknown as PublicProviderSummary[];
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID_RE.test(id);

/** Fresh ownership check for viewer actions; never trust a delayed UI lookup
 * or the session ownership cache when writing a bookmark/follow. */
async function assertNotOwnProvider(providerId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .eq("id", providerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new Error("You can't bookmark or follow your own profile.");
}

/** Add a bookmark */
export async function addBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  await assertNotOwnProvider(providerId, user.id);

  const { error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, provider_id: providerId });

  if (error && error.code !== "23505") throw error; // ignore duplicate
}

/** Remove a bookmark */
export async function removeBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("provider_id", providerId);

  if (error) throw error;
}

/** Check if a specific provider is bookmarked */
export async function isProviderBookmarked(
  providerId: string,
): Promise<boolean> {
  if (!isUuid(providerId)) return false; // static/demo provider

  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return false;

  const { data } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .single();

  return !!data;
}

// ─────────────────────────────────────────────────────────
// PROVIDER FOLLOWS
// ─────────────────────────────────────────────────────────

/**
 * Turns the provider-profile bell on/off. The bell IS the follow: on creates
 * the provider_follows row, off deletes it. Clearing a flag instead used to
 * leave the row behind, and every other reader of provider_follows
 * (promotion/announcement audiences, follower counts) kept counting a client
 * who had switched the bell off.
 */
export async function setProviderFollowNotify(
  providerId: string,
  enabled: boolean,
): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  await assertNotOwnProvider(providerId, user.id);
  const { error } = enabled
    ? await supabase
        .from("provider_follows")
        .upsert(
          { user_id: user.id, provider_id: providerId, notify_enabled: true },
          { onConflict: "user_id,provider_id" },
        )
    : await supabase
        .from("provider_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("provider_id", providerId);
  if (error) throw error;
}

/** Get the total follower count for a specific provider (used on provider side) */
export async function getProviderFollowerCount(
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("provider_follows")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw error;
  return count ?? 0;
}

/** Get the follower count for the currently logged-in provider */
export async function getMyFollowerCount(): Promise<number> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!providerRow) return 0;
  return getProviderFollowerCount(providerRow.id);
}

// ─────────────────────────────────────────────────────────
// FOLLOWING PEOPLE, RECOMMEND, "SHOW WHERE I GO"
// ─────────────────────────────────────────────────────────
// Every rule (approval, under-18 defaults, blocks, who shows on a card) is
// enforced by the SECURITY DEFINER functions in migration
// 20261108220000_follow_people_and_recommend.sql. The tables have no RLS
// policies, so these RPCs are the only way in.

interface SocialSettingsRow {
  is_minor: boolean;
  is_private: boolean;
  show_where_i_go: boolean;
  findable_by_phone: boolean;
  where_i_go_notice_seen: boolean;
  followers: number;
  following: number;
  requests: number;
}

function mapSocialSettings(row: SocialSettingsRow): SocialSettings {
  return {
    isMinor: row.is_minor,
    isPrivate: row.is_private,
    showWhereIGo: row.show_where_i_go,
    findableByPhone: row.findable_by_phone,
    whereIGoNoticeSeen: row.where_i_go_notice_seen,
    followers: Number(row.followers) || 0,
    following: Number(row.following) || 0,
    requests: Number(row.requests) || 0,
  };
}

interface PersonRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  my_status: FollowStatus | null;
  follows_me: FollowStatus | null;
}

function mapPerson(row: PersonRow): PersonSummary {
  return {
    userId: row.user_id,
    name: (row.name ?? '').trim() || 'CERVICED member',
    avatarUrl: row.avatar_url || null,
    myStatus: row.my_status,
    followsMe: row.follows_me,
  };
}

export async function getMySocialSettings(): Promise<SocialSettings> {
  const { data, error } = await supabase.rpc('get_my_social_settings');
  if (error) throw error;
  return mapSocialSettings(data as SocialSettingsRow);
}

export async function updateMySocialSettings(
  update: SocialSettingsUpdate,
): Promise<SocialSettings> {
  const { data, error } = await supabase.rpc('update_my_social_settings', {
    p_is_private: update.isPrivate ?? null,
    p_show_where_i_go: update.showWhereIGo ?? null,
    p_findable_by_phone: update.findableByPhone ?? null,
  });
  if (error) throw error;
  return mapSocialSettings(data as SocialSettingsRow);
}

export async function markWhereIGoNoticeSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_where_i_go_notice_seen');
  if (error) throw error;
}

/** Returns 'pending' on a private account, 'accepted' on an open one. */
export async function requestFollow(personId: string): Promise<FollowStatus> {
  if (!isUuid(personId)) throw new Error('This person isn’t available to follow.');
  const { data, error } = await supabase.rpc('request_follow', { p_target: personId });
  if (error) throw error;
  return data as FollowStatus;
}

export async function respondFollowRequest(followerId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_follow_request', {
    p_follower: followerId,
    p_accept: accept,
  });
  if (error) throw error;
}

/** Unfollow, or cancel a request I sent. */
export async function unfollowPerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('unfollow_person', { p_target: personId });
  if (error) throw error;
}

/** Remove someone who follows me. They aren't told. */
export async function removeFollower(followerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_follower', { p_follower: followerId });
  if (error) throw error;
}

export async function blockPerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('block_person', { p_target: personId });
  if (error) throw error;
}

export async function unblockPerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_person', { p_target: personId });
  if (error) throw error;
}

/**
 * Compares sha256 hashes of the device's contact numbers (normalised with
 * normalisePhoneForMatching) against accounts. Nothing sent is stored.
 */
/** Most hashes one match_contact_hashes call accepts (server cap). */
export const CONTACT_HASH_BATCH_LIMIT = 1000;

export async function matchContactHashes(hashes: readonly string[]): Promise<ContactMatch[]> {
  const unique = Array.from(new Set(hashes));
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CONTACT_HASH_BATCH_LIMIT) {
    chunks.push(unique.slice(i, i + CONTACT_HASH_BATCH_LIMIT));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase.rpc('match_contact_hashes', { p_hashes: chunk });
      if (error) throw error;
      return (data ?? []) as (PersonRow & { phone_hash: string })[];
    }),
  );
  return results.flat().map((row) => ({
    ...mapPerson(row),
    phoneHash: row.phone_hash,
  }));
}

export async function getMyPeople(kind: PeopleListKind): Promise<PersonListEntry[]> {
  const { data, error } = await supabase.rpc('get_my_people', { p_kind: kind });
  if (error) throw error;
  return (
    (data ?? []) as {
      user_id: string;
      name: string | null;
      avatar_url: string | null;
      status: FollowStatus | 'blocked';
      since: string;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    name: (row.name ?? '').trim() || 'CERVICED member',
    avatarUrl: row.avatar_url || null,
    status: row.status,
    since: row.since,
  }));
}

export async function getMyProviderSharing(providerId: string): Promise<ProviderSharing> {
  const { data, error } = await supabase.rpc('get_my_provider_sharing', {
    p_provider: providerId,
  });
  if (error) throw error;
  const row = data as { can_recommend: boolean; recommended: boolean; hidden: boolean };
  return {
    canRecommend: row.can_recommend,
    recommended: row.recommended,
    hidden: row.hidden,
  };
}

export async function setProviderRecommendation(providerId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_provider_recommendation', {
    p_provider: providerId,
    p_on: on,
  });
  if (error) throw error;
}

/** My own name, picture and the live providers I recommend (not hidden), for my own face in the ring. */
export interface MyRecommends {
  name: string | null;
  avatarUrl: string | null;
  providerIds: string[];
}

export async function getMyRecommendedProviders(): Promise<MyRecommends> {
  const { data, error } = await supabase.rpc('get_my_recommended_providers');
  if (error) throw error;
  const row = data as { name: string | null; avatar_url: string | null; provider_ids: string[] | null };
  return {
    name: row.name,
    avatarUrl: row.avatar_url || null,
    providerIds: row.provider_ids ?? [],
  };
}

/** "Don't show this one": keeps my face off this provider's cards. */
export async function setProviderHidden(providerId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_provider_hidden', {
    p_provider: providerId,
    p_hidden: hidden,
  });
  if (error) throw error;
}

/** Most provider ids one get_circle_for_providers call accepts (server cap). */
export const CIRCLE_BATCH_LIMIT = 300;

/**
 * People I follow who recommend or have been to each provider, for the face
 * stack on cards. One call per list of cards — never call it per card.
 */
export async function getCircleForProviders(
  providerIds: readonly string[],
): Promise<CircleByProvider> {
  const ids = Array.from(new Set(providerIds.filter(isUuid))).slice(0, CIRCLE_BATCH_LIMIT);
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc('get_circle_for_providers', {
    p_provider_ids: ids,
  });
  if (error) throw error;
  return groupCircleRows((data ?? []) as CircleRow[]);
}
