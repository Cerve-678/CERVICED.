-- Staging column for the "Years of experience" answer collected at provider
-- signup (SignUpStep4). Its permanent home is providers.years_experience;
-- this mirrors team_size/price_range, which are staged on users at signup and
-- copied into the providers row by InfoRegScreen's first-save prefill.
-- Additive, nullable, no default — safe to run against production.
--
-- Recorded version 20260928213516 was assigned by apply_migration's own clock
-- (authored as 20260928210000); file renamed to match the recorded version so a
-- fresh replay lines up with production. Frontier before apply: 20260928201412.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS years_experience INT
    CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 80));
