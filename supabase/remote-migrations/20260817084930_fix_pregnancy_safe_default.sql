-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817084930
-- Remote name: fix_pregnancy_safe_default
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.services ALTER COLUMN is_pregnancy_safe SET DEFAULT true;

UPDATE public.services
   SET is_pregnancy_safe = true
 WHERE is_pregnancy_safe = false;
