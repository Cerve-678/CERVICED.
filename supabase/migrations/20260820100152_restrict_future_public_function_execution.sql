-- App migrations create public functions as postgres. Require every future
-- Data API function grant to be explicit and reviewed alongside its auth/RLS
-- contract; existing functions are handled by dedicated hardening migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
