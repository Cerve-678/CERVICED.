-- Sign-up Step 1 now asks a Beauty Professional whether they take bookings on
-- their own booking page (Fresha, Treatwell, …). Like every other sign-up
-- answer, it is staged on `users` until the provider's first InfoReg save
-- copies it to providers.external_booking_url (getUserSignupPrefillInfo).
--
-- Additive and nullable: existing rows and the client sign-up path are
-- unaffected. Read/write is already covered by the users row's own-row RLS.
alter table public.users
  add column if not exists external_booking_url text;
