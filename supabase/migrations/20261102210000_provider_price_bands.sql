-- Providers can pick several, narrower price bands. price_tier and
-- users.price_range stay, kept in step by the app, for what still reads them.
BEGIN;

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS price_bands text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS price_bands text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.providers ADD CONSTRAINT providers_price_bands_check
  CHECK (price_bands <@ ARRAY['under_25','25_50','50_75','75_100','100_150','150_200','200_300','300_plus']::text[]);
ALTER TABLE public.users ADD CONSTRAINT users_price_bands_check
  CHECK (price_bands <@ ARRAY['under_25','25_50','50_75','75_100','100_150','150_200','200_300','300_plus']::text[]);

-- Existing answers, widened to the bands that cover the same span.
UPDATE public.providers SET price_bands = CASE price_tier
    WHEN 'budget'  THEN ARRAY['under_25','25_50']
    WHEN 'mid'     THEN ARRAY['25_50','50_75']
    WHEN 'premium' THEN ARRAY['50_75','75_100']
    WHEN 'luxury'  THEN ARRAY['100_150','150_200','200_300','300_plus']
  END
 WHERE price_tier IN ('budget','mid','premium','luxury');

UPDATE public.users SET price_bands = CASE price_range
    WHEN 'budget'  THEN ARRAY['under_25','25_50']
    WHEN 'mid'     THEN ARRAY['25_50','50_75']
    WHEN 'premium' THEN ARRAY['50_75','75_100']
    WHEN 'luxury'  THEN ARRAY['100_150','150_200','200_300','300_plus']
  END
 WHERE price_range IN ('budget','mid','premium','luxury');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102210000', 'provider_price_bands')
ON CONFLICT DO NOTHING;

COMMIT;
