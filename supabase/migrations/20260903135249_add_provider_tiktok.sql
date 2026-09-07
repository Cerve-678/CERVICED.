-- users.tiktok is collected at signup but providers has no equivalent
-- column, so the answer has never had anywhere to land. Purely additive,
-- same shape as the existing instagram/website columns.
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS tiktok TEXT;
