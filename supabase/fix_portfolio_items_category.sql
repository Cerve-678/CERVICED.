-- addPortfolioItem never wrote a `category` on insert (no per-photo category
-- picker exists in the upload UI), so every portfolio_items row landed with
-- category = NULL. Explore's category filter tabs run `.eq('category', X)`,
-- which never matches NULL in Postgres — so every portfolio photo was
-- invisible under every specific-category tab while still appearing
-- (mislabeled as Nails by a client-side fallback) under "All". The app-side
-- insert path is now fixed to stamp category from the provider's own
-- service_category (see databaseService.ts addPortfolioItem) — this
-- backfills existing rows so past uploads become filterable too.
-- Safe to re-run: only touches rows that are still NULL.
UPDATE public.portfolio_items pi
SET category = p.service_category
FROM public.providers p
WHERE pi.provider_id = p.id
  AND pi.category IS NULL;
