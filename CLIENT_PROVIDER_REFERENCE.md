# Client & Provider Reference

How clients and providers are defined, what data each holds, how the two sides interact, and how to think about provider uniqueness when building features.

---

## The Two Sides

Every account in CERVICED has a `role` field in the `users` table: `'user'` (client) or `'provider'`. The `activeMode` in `AuthContext` controls which experience is shown — `'client'` or `'provider'`. These can differ because of the dual-role system.

| | Client | Provider |
|---|---|---|
| `users.role` | `'user'` | `'provider'` |
| Has a `providers` row | No | Yes |
| Primary navigator | `TabNavigator` | `ProviderTabNavigator` |
| `activeMode` | `'client'` | `'provider'` |

---

## The Dual-Role System

A single account can be both a client and a provider. The mode is toggled with `switchMode()` from `AuthContext`. The current mode is stored in AsyncStorage as `@active_mode`.

**Client → Provider upgrade:** `upgradeToProvider()` — updates `users.role` to `'provider'`, creates or updates the `providers` row, stores social/contact info.

**Provider → Client profile add:** `addClientProfile()` — writes beauty profile data to the `users` row, switches `activeMode` to `'client'`.

`hasClientProfile` on `UserData` is `true` when the user has a DOB on file (used as the proxy for "has completed client onboarding").

---

## Client — Full Data Definition

All client data lives on the `users` table. There is no separate client table.

### Identity

| Field | Type | What it is |
|---|---|---|
| `id` | UUID | Primary key — matches Supabase auth user ID |
| `email` | TEXT | Personal email — used for auth |
| `name` | TEXT | Full name |
| `phone` | TEXT | Personal phone number |
| `dob` | DATE | Date of birth — also used as proxy for profile completion |
| `role` | `'user' \| 'provider'` | Account type |
| `login_method` | TEXT | `'email'` — social login coming later |
| `avatar_url` | TEXT | Profile photo |
| `expo_push_token` | TEXT | Device token for push notifications |
| `is_verified` | BOOLEAN | Admin-verified account |

### Beauty Profile
*Collected during signup (Step 4) and editable in `BeautyProfileScreen`. Visible to providers when they view a client's booking.*

| Field | Type | Options |
|---|---|---|
| `hair_type` | TEXT | Straight, Wavy, Curly, Coily, 4A, 4B, 4C |
| `skin_type` | TEXT | Normal, Oily, Dry, Combination, Sensitive |
| `skin_concerns` | TEXT[] | Acne, Redness, Dry patches, Oiliness, Hyperpigmentation, Sensitivity, Fine lines, Uneven tone, None |
| `style_vibe` | TEXT | Natural, Glam, Minimal, Bold, Classic, Edgy, Soft, Trendy |
| `allergies` | TEXT[] | Latex, Fragrances, Dyes/PPD, Nuts, Nickel, Sulfates, Parabens, Lanolin, Shellfish, Gluten, None known |
| `treatment_history` | TEXT[] | Facials, Lash extensions, Brow tinting, Hair colour, Nails, Waxing, Dermaplaning, Microneedling, Chemical peels, None |
| `medical_notes` | TEXT | Free text — pregnancy, conditions, anything the provider must know |
| `photography_consent` | BOOLEAN | Whether the provider may photograph results for their portfolio |

### Preferences
*Collected during signup (Step 5) and used for matching, discovery, and personalisation.*

| Field | Type | What it is |
|---|---|---|
| `service_interests` | TEXT[] | Which service categories they want (HAIR, NAILS, LASHES etc.) |
| `service_locations` | TEXT[] | Cities they're willing to travel to (Birmingham, Manchester, London) |
| `maintenance_frequency` | TEXT | Every week, Bi-weekly, Monthly, 3 months, Occasionally |
| `referral_source` | TEXT | Instagram, TikTok, Snapchat, X, Referral, Google, YouTube, Friend, Other |

### Business (only present if account is also a provider)

| Field | Type | What it is |
|---|---|---|
| `business_name` | TEXT | Trading name |
| `business_email` | TEXT | Booking/business email |
| `business_phone` | TEXT | Business phone number |
| `instagram` | TEXT | Instagram handle (no @) |
| `tiktok` | TEXT | TikTok handle (no @) |
| `website` | TEXT | Website URL |

---

## Provider — Full Data Definition

A provider account has two rows: one in `users` (identity + beauty profile if dual-role) and one in `providers` (the business profile).

The `providers` row is linked to `users` via `providers.user_id`.

### Core Identity

| Field | Type | What it is |
|---|---|---|
| `id` | UUID | Provider's own primary key |
| `user_id` | UUID | Links to `users.id` |
| `slug` | TEXT | URL-safe unique identifier (e.g. `glow-by-sarah`) |
| `display_name` | TEXT | Business/trading name shown to clients |
| `service_category` | ServiceCategory | Primary category (see below) |
| `custom_service_type` | TEXT | Free text if category is `'OTHER'` |
| `is_active` | BOOLEAN | Whether the provider appears in search |
| `is_featured` | BOOLEAN | Admin-promoted on home/explore |
| `is_verified` | BOOLEAN | Admin-verified |
| `rating` | FLOAT | Average review score |
| `review_count` | INTEGER | Total number of reviews |
| `years_experience` | INTEGER | Years in the industry |

### Location & Reach

| Field | Type | What it is |
|---|---|---|
| `location_text` | TEXT | Human-readable location (e.g. "Digbeth, Birmingham") |
| `latitude` | FLOAT | For map/proximity search |
| `longitude` | FLOAT | For map/proximity search |
| `full_address` | TEXT | Full address — released to clients based on policy |
| `address_release_policy` | enum | When the full address is revealed: `always`, `on_confirmation`, `day_before`, `two_days_before`, `three_days_before`, `five_days_before`, `week_before`, `manual` |
| `business_type` | enum | `salon`, `studio`, `home_based`, `mobile` |

### Branding

| Field | Type | What it is |
|---|---|---|
| `logo_url` | TEXT | Provider's logo/photo |
| `gradient` | TEXT[] | Two hex colours for the profile card gradient |
| `accent_color` | TEXT | Hex colour used for UI accents on their profile |
| `about_text` | TEXT | Bio / about section |
| `slots_text` | TEXT | Human-readable availability summary (e.g. "Weekday evenings + Saturdays") |

### Contact & Communication

| Field | Type | Options |
|---|---|---|
| `phone` | TEXT | Business phone |
| `email` | TEXT | Booking email |
| `instagram` | TEXT | Instagram handle |
| `website` | TEXT | Website URL |
| `preferred_contact_methods` | TEXT[] | `in_app`, `email`, `whatsapp`, `phone` |
| `whatsapp_number` | TEXT | WhatsApp number if contact method includes WhatsApp |

### Booking Policies
*Stored as a JSONB object in `providers.booking_policies`.*

| Key | What it is |
|---|---|
| `cancelNotice` | How much notice required to cancel |
| `cancelPenalty` | What happens if cancelled late |
| `cancelNote` | Free text note on cancellation policy |
| `rescheduleNotice` | How much notice to reschedule |
| `maxReschedules` | Max number of reschedules allowed |
| `rescheduleNote` | Free text on reschedule policy |
| `depositRequired` | Whether a deposit is required to book |
| `depositType` | Fixed amount or percentage |
| `depositAmount` | The amount/percentage |
| `depositNote` | Free text on deposit policy |
| `noShowAction` | What happens on no-show |
| `noShowNote` | Free text on no-show policy |

### Discoverability Tags
*Used by search, filters, Becca, and personalised feed matching.*

| Field | Type | What it is |
|---|---|---|
| `style_tags` | TEXT[] | Style aesthetic (e.g. Natural & minimal, Full glam, Editorial) |
| `occasion_tags` | TEXT[] | Occasions catered to (e.g. Bridal, Prom, Everyday) |
| `expertise_tags` | TEXT[] | What they specialise in |
| `technique_tags` | TEXT[] | Specific techniques (e.g. Balayage, Nano brows) |
| `inclusive_flags` | TEXT[] | Who they serve (e.g. All skin tones, Kids, Men, Wheelchair accessible) |
| `price_tier` | enum | `budget`, `mid`, `premium`, `luxury` |
| `auto_accept_bookings` | BOOLEAN | Bookings confirmed instantly vs. manual approval |

---

## Service Categories

Every provider belongs to exactly one primary category.

| Category | Specialties available |
|---|---|
| `HAIR` | Natural & textured, Afro hair, Colour & balayage, Extensions & weaves, Locs & braids, Bridal & occasion, Men's cuts, Children's hair, Relaxers & perms, Blow-dries & styling |
| `NAILS` | Nail art, Acrylic sets, Gel manicure, Infills, Gel extensions, Pedicures, SNS/dip powder, Gel-X |
| `LASHES` | Classic lashes, Volume, Mega volume, Hybrid, Lash lifts, Lash tints |
| `BROWS` | Threading, Waxing, Lamination, Microblading, Nano brows, Henna brows, Tinting & shaping |
| `MUA` | Bridal, Prom & occasion, Editorial, Airbrush, Film & TV, SFX, All skin tones, Deep/dark skin specialist |
| `AESTHETICS` | Facials, Microneedling, Chemical peels, LED therapy, Dermaplaning, Injectables, Body treatments |
| `MALE` | Men's grooming services |
| `KIDS` | Children's services |
| `OTHER` | Massage, Body waxing, Spray tanning, Body sculpting, Holistic therapies |

The category determines which specialties the provider sees in their account settings and which clients are matched to them.

---

## Provider Settings — The Full Picture

These are stored in AsyncStorage under `@provider_extras` (not yet in the database — future migration needed). They make each provider unique.

### Business Setup

| Setting | Type | Options |
|---|---|---|
| Service setting | TEXT | Salon or studio, Home studio, Mobile — I come to you, Multiple settings |
| Travel radius | TEXT | Free text (e.g. "10 miles") — only if mobile |
| Price tier | TEXT | £ Great value, ££ Mid-range, £££ Premium, ££££ Luxury |
| Accepts new clients | TEXT | Yes / Waitlist only / Not currently taking new clients |
| Walk-ins welcome | BOOLEAN | Clients can book without advance notice |
| Group bookings | BOOLEAN | Bridal parties, hen dos, group sessions |

### Professional Credentials

| Setting | Type | What it is |
|---|---|---|
| Qualifications | TEXT | Free text (NVQ Level 3, VTCT, City & Guilds etc.) |
| Professionally insured | BOOLEAN | Holds valid professional indemnity insurance |
| DBS checked | BOOLEAN | Important for providers working with children or vulnerable adults |
| Patch test policy | TEXT | Always required / New clients only / Recommended but optional / Not required |
| Online consultations | BOOLEAN | Clients can book virtual consultation before appointment |
| Consultation required | BOOLEAN | All new clients must consult first |

### Style & Products

| Setting | Type | Options |
|---|---|---|
| Style aesthetic | TEXT[] | Natural & minimal, Full glam, Edgy & creative, Classic & timeless, Bohemian, Bridal & romantic, Editorial & high-fashion |
| Products used | TEXT | Free text (e.g. Olaplex, KÉRASTASE, Mylee, Lash FX) |
| Vegan & cruelty-free | BOOLEAN | Uses only vegan products |

### Accessibility & Inclusion

| Setting | Type | Options |
|---|---|---|
| Languages spoken | TEXT[] | English, French, Arabic, Urdu, Punjabi, Bengali, Gujarati, Yoruba, Igbo, Twi/Akan, Somali, Polish, Portuguese, Spanish, Mandarin, Hindi, Tamil, Turkish |
| Accessibility | TEXT[] | Wheelchair accessible, Parking available, Ground floor access, Home visits for mobility, Step-free entrance |
| Clientele served | TEXT[] | Women, Men, Children, Seniors, Bridal & wedding parties, All welcome |

### Availability Windows

| Setting | Type | Options |
|---|---|---|
| Available when | TEXT[] | Weekday mornings, Weekday afternoons, Weekday evenings, Saturdays, Sundays, Same-day bookings |

---

## Provider Automations

Toggles that change how the provider's account behaves. Stored in AsyncStorage under `@provider_extras`.

| Automation | What it does |
|---|---|
| Auto-confirm bookings | New bookings confirmed instantly — no manual approval |
| Auto-send intake form on confirmation | Sends the default form from the provider's form library when a booking is confirmed |
| Require deposit from new clients | First-time clients must pay a deposit |
| Enable waitlist | Fully booked days show a waitlist option instead of "unavailable" |
| Auto review request | 2 hours after marking complete, client is asked to leave a review |
| Post-appointment check-in | Day after the appointment, client gets a follow-up message |
| Birthday greeting | Client receives a personalised birthday message |
| Daily booking recap | Provider gets a morning push notification summarising the day's appointments |

---

## Provider Schedule

Each provider has up to 7 rows in `provider_availability` (one per day of the week) and any number of rows in `provider_blocked_dates`.

**`provider_availability`** — weekly recurring schedule
- `day_of_week`: 0 = Sunday, 1 = Monday … 6 = Saturday
- Display order in the app: Mon → Sun (1, 2, 3, 4, 5, 6, 0)
- Default on signup: Mon–Fri open 09:00–18:00, Sat–Sun closed
- `is_closed: true` means the provider doesn't work that day

**`provider_blocked_dates`** — one-off days off
- A specific calendar date the provider is unavailable
- Has an optional `reason` field
- Overrides availability — a blocked date makes that entire day unavailable even if it's normally a working day

Both tables are checked by `AvailabilityService` when building the booking calendar.

---

## Provider Services

Each service belongs to a provider and lives in the `services` table. Services have:

- Name, description, price (and optional `price_max` for ranges), duration
- `category_name` — the sub-category within the provider's main category
- `sort_order` — controls display order on the profile
- `is_active` — toggles visibility without deleting

### Service discoverability tags
*Each service can have its own tags for fine-grained search and Becca matching.*

| Tag type | What it targets |
|---|---|
| `tags` | General keywords |
| `technique_tags` | Specific techniques (e.g. "Balayage", "Lash lift") |
| `outcome_tags` | What the service achieves (e.g. "Defined curls", "Natural brows") |
| `occasion_tags` | When it's relevant (e.g. "Wedding", "Everyday") |
| `trend_names` | Current trend names clients search for |

### Service safety fields

| Field | What it is |
|---|---|
| `is_pregnancy_safe` | Safe during pregnancy |
| `patch_test_required` | Requires 48h patch test before |
| `min_age` | Minimum client age |
| `contraindications` | Conditions that prevent treatment |
| `aftercare_notes` | What the client must do after |
| `service_type` | `treatment`, `enhancement`, `maintenance`, or `restorative` |

---

## How Provider Uniqueness Works

Every provider on CERVICED is different. A lash tech who does volume lashes from a home studio in Digbeth, only takes female clients, requires a patch test, uses vegan adhesive, and speaks English and French is a fundamentally different product offering from a nail artist who does nail art, works from a salon in Broad Street, is open Saturdays and Sundays, and accepts walk-ins.

The system accommodates this through layers:

**Layer 1 — Category** defines the context. Service category determines which specialties are shown, which intake form templates are pre-populated, and which client profiles match.

**Layer 2 — Tags** define discoverability. Style tags, technique tags, occasion tags, and inclusive flags allow two providers in the same category to attract completely different client profiles. A "Deep/dark skin specialist" MUA and a "Film & TV SFX" MUA are both `MUA` but serve entirely different audiences.

**Layer 3 — Settings** define operations. One provider accepts walk-ins, another requires a consultation. One is mobile and travels, another only works from their studio. These settings filter out mismatched clients before they even reach the booking screen.

**Layer 4 — Schedule** defines access. Each provider's individual weekly hours and blocked dates mean the available slots shown to a client are specific to that provider at that moment.

**Layer 5 — Policies** define trust. Deposit requirements, cancellation terms, reschedule limits — these vary by provider and are shown to clients before booking.

**Layer 6 — Intake forms** define preparation. A nail artist might want to know about medication that affects nail health. A lash tech needs to know about eye conditions. A MUA needs to know about skin sensitivities. Each provider builds their own form library tailored to their services.

---

## When Building a Feature — Questions to Ask

When a new feature touches provider-side data:

- **Is this feature the same for all providers, or does it need to vary by category?**
  A scheduling feature looks different for a mobile provider (travel time between clients) vs. a salon-based provider (back-to-back slots).

- **Is this feature the same for all providers, or does it depend on their settings?**
  A "require deposit" feature only applies if the provider has enabled it. An "auto-send intake form" only applies if they have a form in their library.

- **Does this feature use client beauty profile data?**
  If yes — the provider should only see relevant data. A nail artist does not need to know a client's hair type.

- **Does this feature affect how the provider appears to clients?**
  If yes — confirm it is reflected in the provider's public profile and discoverable through search and Becca.

- **Is the feature accessible to a dual-role user on both sides?**
  A provider who is also a client should be able to use this feature in both modes without data collision.

---

## Key Relationships

```
users (1)
  ├── providers (0 or 1)         — the business profile
  │     ├── services (many)      — the service menu
  │     │     ├── service_images
  │     │     └── service_add_ons
  │     ├── provider_availability (up to 7) — weekly schedule
  │     ├── provider_blocked_dates (many)   — days off
  │     ├── provider_form_library (many)    — reusable intake templates
  │     ├── portfolio_items (many)
  │     └── promotions (many)
  │
  ├── bookings (many as client)
  ├── bookings (many as provider, via providers.id)
  ├── notifications (many)
  ├── bookmarks (many)
  └── reviews (many as reviewer)
```
