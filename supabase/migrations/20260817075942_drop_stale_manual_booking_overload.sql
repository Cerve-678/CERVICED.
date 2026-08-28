-- CREATE OR REPLACE on provider_create_manual_booking with an added trailing
-- parameter created a SECOND overload instead of replacing the function —
-- Postgres treats differing argument lists as distinct functions. The old
-- 6-arg overload has no safety-ack check, so leaving it live would let any
-- caller bypass the new gate entirely by simply omitting the 7th argument.
-- Drop it so only the safety-ack-aware 7-arg version can be called.
DROP FUNCTION IF EXISTS public.provider_create_manual_booking(uuid, uuid, date, time, text, uuid[]);
