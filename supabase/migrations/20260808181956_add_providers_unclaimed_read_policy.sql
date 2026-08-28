-- Additive SELECT policy so a logged-in client can read unclaimed/scraped
-- provider rows (is_claimed = false) for the claim-directory feature.
-- Narrowly scoped: only rows with is_claimed = false ever match, so this
-- can never expose a claimed-but-not-yet-live provider's row (those stay
-- gated behind providers_public_read's has_gone_live = true requirement).
-- providers_public_read is left untouched — this is purely additive.
create policy providers_unclaimed_read
  on public.providers
  for select
  to public
  using (is_claimed = false);;
