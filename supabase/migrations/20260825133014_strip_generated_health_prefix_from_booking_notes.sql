-- bookings.notes is the CLIENT's own free-text note, and nothing else.
--
-- Until 2026-08-20 checkout prepended a generated
-- "Health info: Allergies: … | Medical notes: …" line to it (removed from
-- CartScreen.tsx in commit b5a94ac). 27 of the 28 non-empty notes in this
-- database are therefore text no client ever typed. It surfaced twice:
--   * on the client's own booking under "YOUR NOTES" — often the only thing
--     there, on a booking where they had written nothing at all;
--   * to the provider as a "Client note", restating facts the Health & Alerts
--     section of ProviderBookingDetailScreen already reads live off the
--     profile.
-- Copying health-adjacent data into a free-text field also froze it: a client
-- updating their allergies afterwards left a stale copy on every past booking
-- forever, which is the opposite of what a provider needs before an
-- appointment.
--
-- Strips only the generated first line, anchored at the start of the note, and
-- keeps whatever the client actually wrote after it (1 of the 27 rows has real
-- client text; the other 26 were nothing but the generated line). Those 26
-- become NULL rather than an empty string, so every "does this booking have a
-- note" check reads false the same way it does for a booking made since the
-- app-side fix.
--
-- Safe to re-run: the anchored pattern no longer matches once stripped.
UPDATE bookings
SET notes = NULLIF(btrim(regexp_replace(notes, '^Health info:[^\n]*(\n|$)', '')), '')
WHERE notes ~ '^Health info:';
