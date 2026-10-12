import { createClient } from 'npm:@supabase/supabase-js@2.100.0';

// Is this request from the server itself (pg_cron / a DB trigger posting the
// vault 'service_role_key'), rather than an end user?
//
// A plain string compare against SUPABASE_SERVICE_ROLE_KEY is not enough: the
// project has two valid formats of service key (the legacy eyJ… JWT the vault
// holds, and the newer sb_secret_… key), and the function runtime is not
// guaranteed to be handed the same one the vault holds. That mismatch 403'd
// every release-payouts run, so held provider payouts never transferred
// (found 2026-10-11). So: accept an exact match cheaply, otherwise ask Auth
// whether the token really carries service-role access — format-agnostic, and
// it does not rely on the gateway's verify_jwt having checked the signature.
export async function isServiceRoleRequest(authHeader: string | null): Promise<boolean> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return false;

  const envKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (envKey && token === envKey) return true;

  // Only tokens that even claim to be a service key are worth a round trip;
  // an ordinary user session must not cost an extra Auth call.
  if (!token.startsWith('sb_secret_') && claimedRole(token) !== 'service_role') return false;

  const probe = createClient(Deno.env.get('SUPABASE_URL')!, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error;
}

// The unverified `role` claim of a JWT — a pre-filter only, never trusted alone.
function claimedRole(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}
