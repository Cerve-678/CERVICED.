-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260820100152
-- Remote name: restrict_future_public_function_execution
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- App migrations create public functions as postgres. Require every future
-- Data API function grant to be explicit and reviewed alongside its auth/RLS
-- contract; existing functions are handled by dedicated hardening migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
