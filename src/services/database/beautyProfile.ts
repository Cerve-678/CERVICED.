// Database access: The client's beauty profile.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { toPickList } from "../../features/beauty-profile/pickList";

// ─────────────────────────────────────────────────────────
// CLIENT BEAUTY PROFILE
// ─────────────────────────────────────────────────────────

export interface ClientBeautyProfile {
  // Hair
  hairType: string[];
  scalpCondition: string[];
  hairGoals: string[];
  treatmentHistory: string[];
  // Skin — a list since multi-pick (see features/beauty-profile/pickList.ts)
  skinType: string[];
  skinTone: string | null;
  skinConcerns: string[];
  sensitiveAreas: string[];
  // Nails
  nailLength: string[];
  nailShape: string[];
  nailCondition: string[];
  nailService: string[];
  nailStyle: string[];
  nailColours: string[];
  // Lashes & Brows
  lashStyle: string[];
  lashStatus: string | null;
  browStyle: string[];
  browCondition: string[];
  // Makeup
  makeupCoverage: string[];
  makeupFinish: string[];
  makeupEyes: string[];
  makeupLips: string[];
  // General
  styleVibe: string[];
  // Health & Consent
  allergies: string[];
  medicalNotes: string | null;
  photographyConsent: boolean;
}

/** The profile columns both RPCs return. Every field the booked service
 *  category(ies) don't get comes back null. */
interface BeautyProfileFields {
  hair_type: string[] | string | null;
  scalp_condition: string[] | string | null;
  hair_goals: string[] | null;
  treatment_history: string[] | null;
  /** text[] once 20261108240000 is applied; a single string before it. Read through toPickList. */
  skin_type: string[] | string | null;
  skin_tone: string | null;
  skin_concerns: string[] | null;
  sensitive_areas: string[] | null;
  nail_length: string[] | string | null;
  nail_shape: string[] | string | null;
  nail_condition: string[] | null;
  nail_service: string[] | null;
  nail_style: string[] | null;
  nail_colours: string[] | null;
  lash_style: string[] | string | null;
  lash_status: string | null;
  brow_style: string[] | string | null;
  brow_condition: string[] | string | null;
  makeup_coverage: string[] | string | null;
  makeup_finish: string[] | string | null;
  makeup_eyes: string[] | string | null;
  makeup_lips: string[] | string | null;
  style_vibe: string[] | string | null;
  allergies: string[] | null;
  medical_notes: string | null;
  photography_consent: boolean | null;
}

/** One row of get_client_beauty_profile_for_booking. */
interface BookingBeautyProfileRow extends BeautyProfileFields {
  service_category: string | null;
}

/** One row of get_client_beauty_profile_for_provider. */
interface ClientBeautyProfileRow extends BeautyProfileFields {
  service_categories: string[] | null;
}

function toClientBeautyProfile(d: BeautyProfileFields): ClientBeautyProfile {
  return {
    hairType: toPickList(d.hair_type),
    scalpCondition: toPickList(d.scalp_condition),
    hairGoals: d.hair_goals ?? [],
    treatmentHistory: d.treatment_history ?? [],
    skinType: toPickList(d.skin_type),
    skinTone: d.skin_tone ?? null,
    skinConcerns: d.skin_concerns ?? [],
    sensitiveAreas: d.sensitive_areas ?? [],
    nailLength: toPickList(d.nail_length),
    nailShape: toPickList(d.nail_shape),
    nailCondition: d.nail_condition ?? [],
    nailService: d.nail_service ?? [],
    nailStyle: d.nail_style ?? [],
    nailColours: d.nail_colours ?? [],
    lashStyle: toPickList(d.lash_style),
    lashStatus: d.lash_status ?? null,
    browStyle: toPickList(d.brow_style),
    browCondition: toPickList(d.brow_condition),
    makeupCoverage: toPickList(d.makeup_coverage),
    makeupFinish: toPickList(d.makeup_finish),
    makeupEyes: toPickList(d.makeup_eyes),
    makeupLips: toPickList(d.makeup_lips),
    styleVibe: toPickList(d.style_vibe),
    allergies: d.allergies ?? [],
    medicalNotes: d.medical_notes ?? null,
    photographyConsent: d.photography_consent ?? false,
  };
}

/**
 * The client's Beauty Profile for one booking, or null when it isn't shared
 * with this provider: the booking is still a request, or was declined,
 * cancelled or missed, or the caller isn't its provider. Null means "not
 * shared", never "nothing on file", so a caller must not render it as an
 * empty profile (that would read as "no allergies").
 */
export async function getClientBeautyProfileForBooking(
  bookingId: string,
): Promise<ClientBeautyProfile | null> {
  // Goes through a SECURITY DEFINER RPC (not a direct table select). It
  // only answers the provider on this booking, once they have accepted it,
  // and returns null for every field the booked service's category doesn't
  // get, so a nail booking never brings the client's hair, skin or makeup
  // details onto the provider's phone. Allergies, medical notes and
  // photography consent always come back. See
  // 20261108190000_beauty_profile_shared_by_booked_service.sql and
  // 20261110131224_beauty_profile_after_accept.sql.
  const { data, error } = await supabase
    .rpc("get_client_beauty_profile_for_booking", { p_booking_id: bookingId })
    .maybeSingle();

  // A genuine RPC failure must not be indistinguishable from "no allergies on
  // file" — this is health/safety data, so a transient error has to surface
  // as an error, not silently read as a confirmed-clear profile. The caller
  // decides how to degrade (see CLAUDE.md).
  if (error) throw error;
  if (!data) return null;

  return toClientBeautyProfile(data as BookingBeautyProfileRow);
}

/**
 * A client's Beauty Profile as one of their providers sees it, outside any
 * single booking (My Clientele). Same gate as the booking page: null until
 * this provider has accepted a booking with them (confirmed, in progress or
 * completed), and only the fields the categories of those bookings get —
 * allergies, medical notes and photography consent always. Null means "not
 * shared", never "nothing on file". See
 * 20261118205332_clientele_notes_and_beauty_profile.sql.
 */
export async function getClientBeautyProfileForProvider(
  clientUserId: string,
): Promise<ClientBeautyProfile | null> {
  const { data, error } = await supabase
    .rpc("get_client_beauty_profile_for_provider", { p_client_id: clientUserId })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toClientBeautyProfile(data as ClientBeautyProfileRow);
}

// ─────────────────────────────────────────────────────────
// PROVIDER'S PRIVATE NOTES ON A CLIENT
// ─────────────────────────────────────────────────────────

export interface ClientNote {
  note: string;
  updatedAt: string;
}

/** This provider's own note on a client, or null if they haven't written
 *  one. The client never sees it. */
export async function getMyClientNote(clientUserId: string): Promise<ClientNote | null> {
  const { data, error } = await supabase
    .rpc("get_my_client_note", { p_client_id: clientUserId })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { note: string; updated_at: string };
  return { note: row.note, updatedAt: row.updated_at };
}

/** Saves (or, when blank, deletes) this provider's note on a client. Returns
 *  when it was saved, or null when it was cleared. */
export async function saveMyClientNote(
  clientUserId: string,
  note: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("save_my_client_note", {
    p_client_id: clientUserId,
    p_note: note,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
