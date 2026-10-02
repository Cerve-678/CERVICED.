// src/utils/signupProfile.ts
//
// The one mapping from a finished signup (SignUpStep5's answers) to the
// `users` row it creates. Two paths write that row and they must write the
// same columns:
//   - email signup: answers ride in auth user_metadata until the OTP is
//     verified, then EmailVerificationScreen upserts the row.
//   - Apple (or any future social) sign-in: there is no OTP step, so
//     SignUpStep5 upserts the row directly once the session already exists.

/** Shape of the answers SignUpStep5 collects, keyed by the snake_case names
 *  stored in auth user_metadata on the email path. A type alias, not an
 *  interface, so it stays assignable to the auth call's Record<string, unknown>. */
export type SignupMetadata = {
  name: string;
  phone: string;
  role: 'user' | 'provider';
  dob: string;
  business_name: string | null;
  business_email: string | null;
  business_type: string | null;
  business_phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  hair_type: string | null;
  skin_type: string | null;
  allergies: string[];
  skin_concerns: string[];
  style_vibe: string | null;
  treatment_history: string[];
  medical_notes: string | null;
  photography_consent: boolean;
  service_interests: string[];
  service_locations: string[];
  location: string | null;
  maintenance_frequency: string;
  referral_source: string;
  gender: string | null;
  has_kids: boolean;
  price_range: string | null;
  team_size: string | null;
  preferred_contact_methods: string[] | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  specialties: string[] | null;
  preferred_payment_methods: string[] | null;
};

export interface SignupProfileRow extends Record<string, unknown> {
  id: string;
}

export function buildSignupProfileRow(args: {
  id: string;
  email: string;
  meta: Partial<SignupMetadata>;
  /** 'email', 'apple', … — the auth provider the account signed up with. */
  loginMethod: string;
}): SignupProfileRow {
  const { id, email, meta, loginMethod } = args;
  const role = meta.role ?? 'user';
  return {
    id,
    email,
    name: meta.name ?? '',
    phone: meta.phone ?? '',
    dob: meta.dob || null,
    role,
    // Set the hat ON for a client signup — the column defaults to false, so
    // leaving it out entirely would read as having no client profile and
    // lose the client tab. A provider signing up starts without one until
    // they add it (addClientProfile), which is the point of the column: it
    // is no longer inferred from whether `dob` happens to be set.
    //
    // Omitted rather than written as `false` for a provider, because this
    // is an UPSERT and an upsert only updates the columns it names. Writing
    // false would mean any re-run against an existing row — a repeated
    // verification, a retry — silently strips a client hat the account had
    // already added. Omitting it lets the column DEFAULT false apply on
    // insert while leaving an existing value untouched.
    ...(role !== 'provider' ? { has_client_profile: true } : {}),
    login_method: loginMethod,
    service_interests:         meta.service_interests         ?? [],
    business_name:             meta.business_name             ?? null,
    business_email:            meta.business_email            ?? null,
    business_type:             meta.business_type             ?? null,
    business_phone:            meta.business_phone            ?? null,
    instagram:                 meta.instagram                 ?? null,
    tiktok:                    meta.tiktok                    ?? null,
    website:                   meta.website                   ?? null,
    hair_type:                 meta.hair_type                 ?? null,
    skin_type:                 meta.skin_type                 ?? null,
    allergies:                 meta.allergies                 ?? [],
    skin_concerns:             meta.skin_concerns             ?? [],
    style_vibe:                meta.style_vibe                ?? null,
    treatment_history:         meta.treatment_history         ?? [],
    medical_notes:             meta.medical_notes             ?? null,
    photography_consent:       meta.photography_consent       ?? true,
    service_locations:         meta.service_locations         ?? [],
    location_text:             meta.location                  ?? null,
    maintenance_frequency:     meta.maintenance_frequency     ?? null,
    referral_source:           meta.referral_source           ?? null,
    gender:                    meta.gender                    ?? null,
    has_kids:                  meta.has_kids                  ?? false,
    team_size:                 meta.team_size                 ?? null,
    accessibility_notes:       meta.accessibility_notes       ?? null,
    languages_spoken:          meta.languages_spoken          ?? [],
    specialties:               meta.specialties               ?? [],
    price_range:               meta.price_range               ?? null,
    preferred_contact_methods: meta.preferred_contact_methods ?? [],
    preferred_payment_methods: meta.preferred_payment_methods ?? [],
  };
}
