-- Prevent double-bookings at the database level.
-- Step 1: clean up any existing duplicate active bookings before creating the index.
-- For each duplicate slot, keep the booking with the best status (confirmed > upcoming >
-- in_progress > pending) and cancel the rest. Uses created_at as tiebreaker.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider_id, booking_date, booking_time
      ORDER BY
        CASE status
          WHEN 'confirmed'   THEN 1
          WHEN 'upcoming'    THEN 2
          WHEN 'in_progress' THEN 3
          WHEN 'pending'     THEN 4
          ELSE 5
        END,
        created_at ASC
    ) AS rn
  FROM public.bookings
  WHERE status NOT IN ('cancelled', 'no_show')
)
UPDATE public.bookings
SET status = 'cancelled'
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 2: now that duplicates are resolved, create the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_book_idx
  ON bookings (provider_id, booking_date, booking_time)
  WHERE status NOT IN ('cancelled', 'no_show');
