# Provider Onboarding & Go-Live
#security

How a provider signs up and becomes visible to clients.

## The flow
1. **Signup wizard** — `RegistrationContext` + `src/services/providerRegistrationService.ts`, screens `AuthScreen` → `InfoRegScreen` → `BrandingScreen`. Sets business type, address + `address_release_policy` (default `on_confirmation` → [[Address Release]]), theme, etc.
2. **Add services** — a provider can't go live without services (`require_services_for_go_live.sql`).
3. **Go live** — flips `has_gone_live`.

## `has_gone_live` — the visibility gate #security
Every client-facing query that joins providers must filter `has_gone_live = true` (pattern: `providers!inner(...)` + `.eq('alias.has_gone_live', true)`). Today this is **client-side filtering** — a missed filter leaks unlaunched providers. → move to **RLS on `providers`** ([[Client vs Server Authority]] #4).

## Related config
- `enforce_provider_user_id_unique.sql` — one provider per user.
- `provider_schedule_gating.sql`, `scheduling_settings.sql`, `service_buffer_settings.sql` → [[Availability & Slots]].
- `provider_profile_theme.sql` — `profile_theme` = preset key or `custom:#bg:#card:#accent`; fixed palettes, don't follow viewer dark mode.
- `acuityTransferService.ts` — import an existing profile from an **Acuity Scheduling** link.

## Connections
[[Availability & Slots]] · [[Address Release]] · [[Client vs Server Authority]] · [[Services]] · [[Screens & Navigation]]

## Open questions
- Exact set of preconditions the app checks before allowing go-live? #needs-verification
