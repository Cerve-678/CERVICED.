// supabase/functions/revoke-apple-sign-in/index.ts
// Revokes a person's Sign in with Apple link when they delete their account.
//
// App Store Review Guideline 5.1.1(v): an app that offers Sign in with Apple
// must revoke the user's Apple tokens when they delete their account. Supabase
// never hands the app Apple's refresh token, so the app asks Apple for a fresh
// one-time authorization code at the moment of deletion (AuthContext) and sends
// it here. This function swaps the code for Apple's tokens and revokes them, so
// CERVICED disappears from the person's "Sign in with Apple" list.
//
// Nothing is stored. The code is single-use and expires in five minutes.
//
// The caller must be signed in (verify_jwt = true in config.toml), and the
// Apple account the code belongs to must be the caller's own Apple identity.
//
// Secrets (Apple Developer → Keys → a key with "Sign in with Apple" enabled):
//   APPLE_TEAM_ID                 10-character Team ID
//   APPLE_SIGN_IN_KEY_ID          the key's 10-character Key ID
//   APPLE_SIGN_IN_PRIVATE_KEY     the .p8 file's contents (PEM, newlines kept)
//   APPLE_BUNDLE_ID               optional, defaults to com.cerviced.app
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}

/** Apple's client_secret: an ES256 JWT signed with the Sign in with Apple key.
 *  WebCrypto's ECDSA output is already the raw r||s form JWS expects. */
async function appleClientSecret(teamId: string, keyId: string, pem: string, clientId: string): Promise<string> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${base64UrlJson({ alg: 'ES256', kid: keyId })}.${base64UrlJson({
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  })}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Not signed in.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: 'Not signed in.' }, 401);

    const appleIdentity = user.identities?.find((identity) => identity.provider === 'apple');
    if (!appleIdentity) return json({ error: 'This account does not use Sign in with Apple.' }, 400);

    const body = await req.json().catch(() => null);
    const code = typeof body?.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
    if (!code || code.length > 512) return json({ error: 'Missing authorization code.' }, 400);

    const teamId = Deno.env.get('APPLE_TEAM_ID');
    const keyId = Deno.env.get('APPLE_SIGN_IN_KEY_ID');
    const privateKey = Deno.env.get('APPLE_SIGN_IN_PRIVATE_KEY');
    const clientId = Deno.env.get('APPLE_BUNDLE_ID') || 'com.cerviced.app';
    if (!teamId || !keyId || !privateKey) {
      console.error('[revoke-apple-sign-in] Apple key secrets are not set');
      return json({ error: 'Apple sign-in revocation is not configured.' }, 500);
    }

    const clientSecret = await appleClientSecret(teamId, keyId, privateKey, clientId);

    const tokenRes = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || typeof tokens.refresh_token !== 'string') {
      console.error('[revoke-apple-sign-in] code exchange failed', tokenRes.status, tokens?.error);
      return json({ error: 'Apple did not accept the code.' }, 502);
    }

    // The code came from the caller's device; make sure it is their own Apple
    // account before revoking anything.
    const appleSub = typeof tokens.id_token === 'string' ? decodeJwtPayload(tokens.id_token).sub : null;
    const identitySub = appleIdentity.identity_data?.sub ?? appleIdentity.id;
    if (!appleSub || appleSub !== identitySub) {
      console.error('[revoke-apple-sign-in] code belongs to a different Apple account', user.id);
      return json({ error: 'That Apple account is not the one linked to this account.' }, 403);
    }

    const revokeRes = await fetch(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: tokens.refresh_token,
        token_type_hint: 'refresh_token',
      }),
    });
    if (!revokeRes.ok) {
      console.error('[revoke-apple-sign-in] revoke failed', revokeRes.status, await revokeRes.text());
      return json({ error: 'Apple did not revoke the link.' }, 502);
    }

    return json({ revoked: true });
  } catch (e) {
    console.error('[revoke-apple-sign-in] unexpected error', e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
