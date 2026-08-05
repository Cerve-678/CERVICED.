# Provider Onboarding & Go-Live
#security

How a provider signs up and becomes visible to clients.

## The flow
1. **Signup wizard** — `RegistrationContext` + `src/services/providerRegistrationService.ts`, screens `AuthScreen` (`src/screens/auth/`) → `InfoRegScreen` (`src/screens/shared/InfoRegScreen.tsx` — also doubles as the edit-profile screen for business type/address/policy; `ProviderMyProfileScreen` edits everything else) → `BrandingScreen`. Sets business type, a **required, geocoded** real address + `address_release_policy` (default `on_confirmation` → [[Address Release]]), theme, etc.
2. **Add services** — a provider can't go live without services (`require_services_for_go_live.sql`).
3. **Go live** — `check_and_set_provider_live()` flips `has_gone_live`, one-way, the first time all conditions are met.

## `has_gone_live` — the visibility gate #security
Every client-facing query that joins providers must filter `has_gone_live = true` (pattern: `providers!inner(...)` + `.eq('alias.has_gone_live', true)`). Today this is **client-side filtering** — a missed filter leaks unlaunched providers. → move to **RLS on `providers`** ([[Client vs Server Authority]] #4).

**Three conditions, all required, checked by `check_and_set_provider_live(provider_id)`:**
1. At least one open availability day (`provider_schedule_gating.sql`).
2. At least one service (`require_services_for_go_live.sql`).
3. **New** — a real, geocoded address on file: `provider_private_details.full_address` non-blank **and** `latitude`/`longitude` non-null (`require_provider_address.sql`). A free-text address alone doesn't count — it must have actually geocoded. → [[Address Release]]

Three triggers can each complete the "last piece": `on_provider_service_insert`, the availability-change trigger, and `on_provider_address_change` (AFTER INSERT/UPDATE on `provider_private_details`). Same one-way design throughout — **never un-flips an already-live provider**, even one that went live before a given condition was tightened (verified for the address condition via a rolled-back transaction test on a real provider row that had `has_gone_live=true` with no coordinates on file).

## Related config
- `enforce_provider_user_id_unique.sql` — one provider per user.
- `provider_schedule_gating.sql`, `scheduling_settings.sql`, `service_buffer_settings.sql` → [[Availability & Slots]].
- `require_provider_address.sql` — the address go-live condition above; also adds `provider_private_details.latitude/longitude` and updates `stamp_booking_address_snapshot()` to prefer them → [[Address Release]].
- `provider_profile_theme.sql` — `profile_theme` = preset key or `custom:#bg:#card:#accent`; fixed palettes, don't follow viewer dark mode.
- `acuityTransferService.ts` — import an existing profile from an **Acuity Scheduling** link.

## Connections
[[Availability & Slots]] · [[Address Release]] · [[Client vs Server Authority]] · [[Services]] · [[Screens & Navigation]] · [[Client vs Provider Hats]]

## Open questions
- `provider_schedule_gating.sql` and `require_services_for_go_live.sql` were never added to `supabase/RUN_ALL_MIGRATIONS.sql` — a fresh environment today would have no go-live gating at all. `require_provider_address.sql`'s gating piece was deliberately left out of the bundle too, to avoid a misleading partial fix. Needs a dedicated pass. #todo
