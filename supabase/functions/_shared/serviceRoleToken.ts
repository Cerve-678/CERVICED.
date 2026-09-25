// supabase/functions/_shared/serviceRoleToken.ts
// Is this bearer token a service-role JWT?
//
// For functions that are called by the DATABASE (pg_net from a trigger) and
// must refuse everyone else. It reads the `role` claim; it does NOT verify the
// signature, so it is only safe on a function deployed with `verify_jwt = true`
// (see supabase/config.toml), where the gateway has already rejected any token
// not signed by this project.
//
// Why not compare against Deno.env SUPABASE_SERVICE_ROLE_KEY: that string can
// differ from the key the trigger reads from vault (rotation, or the key format
// changing) while both are perfectly valid service-role credentials. An exact
// match then 403s the database's own call — the booking is written, the
// trigger stamps confirmation_email_queued_at, and no email is ever sent.
export function isServiceRoleToken(token: string): boolean {
  const parts = token.split('.');
  const claims = parts[1];
  if (parts.length !== 3 || !claims) return false;
  try {
    const b64 = claims.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
