-- Backfill: provider_logo_snapshot on existing bookings
-- A cart write-path bug meant provider_logo_snapshot was written as NULL on
-- every booking for a stretch of time, even when the provider had a real
-- logo_url — this is why logos don't render for existing bookings on the
-- Bookings screen. The app now also falls back to the provider's live
-- logo_url at read time (see mapDbBookingToConfirmed in BookingContext.tsx),
-- but this backfill fixes the stored snapshot too so historical bookings are
-- correct even outside that fallback path (e.g. exports, receipts).

UPDATE public.bookings b
SET provider_logo_snapshot = p.logo_url
FROM public.providers p
WHERE b.provider_id = p.id
  AND b.provider_logo_snapshot IS NULL
  AND p.logo_url IS NOT NULL;
