-- `users` carried three permissive UPDATE policies, all PUBLIC and all with the
-- identical USING (auth.uid() = id). Permissive policies OR together, so the
-- extra two granted nothing the third did not — they were just accumulated
-- drift, and three near-identical names made it harder to reason about who can
-- write this table.
--
-- users_owner_update is the one kept: same USING, plus the explicit
-- WITH CHECK the other two lacked. (For UPDATE, a policy with no WITH CHECK
-- falls back to its USING expression, so all three checked the same thing —
-- dropping the other two is behaviour-preserving, not a tightening.)

drop policy if exists "Users can update own profile" on public.users;
drop policy if exists users_own_update on public.users;
