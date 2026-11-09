// supabase/functions/admin-create-account/index.ts
// Lets a CERVICED admin open an account for someone on the spot, usually a
// provider being onboarded in person, so the account is ready before they
// leave. The account is the same as one made through normal sign-up (an auth
// login plus the public.users row EmailVerificationScreen writes) except:
//
//   - the email is marked confirmed, so there's no verification code to enter;
//   - no email is sent at all (no code, no welcome). The admin hands over the
//     login details themselves.
//
// The provider then signs in with that email and password and carries on from
// there exactly like anyone else who has just signed up: InfoReg creates the
// providers row on first save, and has_gone_live gating is untouched.
//
// Only admin_users may call this, checked here against the caller's own
// session. Each account created is logged in admin_actions ('create_account'),
// which Admin → Accounts you created lists (admin_created_accounts()), and
// also stamped on the auth user's app_metadata, which its holder can't edit.
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type AccountType = 'provider' | 'client';

interface CreateAccountInput {
  accountType: AccountType;
  name: string;
  email: string;
  phone: string | null;
  /** YYYY-MM-DD, at least 16 years ago — the same rule as sign-up. */
  dob: string;
  businessName: string | null;
  /** Blank means "make one up": a readable one is generated and returned. */
  password: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 200;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

/** Returns the parsed input, or the reason it can't be used. */
function parseInput(raw: unknown): CreateAccountInput | string {
  if (!raw || typeof raw !== 'object') return 'Missing account details.';
  const body = raw as Record<string, unknown>;
  const accountType = body.accountType;
  if (accountType !== 'provider' && accountType !== 'client') return 'Choose provider or client.';
  const name = text(body.name);
  if (!name) return 'Add their name.';
  const email = text(body.email)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return 'Add a real email address. It is what they sign in with.';
  const dob = typeof body.dob === 'string' ? body.dob.trim() : '';
  const dobProblem = checkDob(dob);
  if (dobProblem) return dobProblem;
  const businessName = text(body.businessName);
  if (accountType === 'provider' && !businessName) return 'Add the business name.';
  const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;
  if (password !== null && password.length < 8) return 'The password needs at least 8 characters.';
  if (password !== null && password.length > 72) return 'The password can be at most 72 characters.';
  return {
    accountType,
    name,
    email,
    phone: text(body.phone),
    dob,
    businessName: accountType === 'provider' ? businessName : null,
    password,
  };
}

// Mirrors validateDob in src/utils/validation.ts.
function checkDob(dob: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return 'Add their date of birth.';
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return 'That date of birth isn\'t a real date.';
  }
  const sixteenth = new Date(Date.UTC(year + 16, month - 1, day));
  if (sixteenth.getTime() > Date.now()) return 'They must be at least 16.';
  return null;
}

// No look-alike characters (0/O, 1/l/I), since this is read aloud or typed
// from a message. Always has an upper-case letter and a number, which is what
// the sign-up screen's strength meter calls strong.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(): string {
  for (;;) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const chars = Array.from(bytes, b => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
    const candidate = [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
      .map(group => group.join(''))
      .join('-');
    if (/[A-Z]/.test(candidate) && /[0-9]/.test(candidate) && /[a-z]/.test(candidate)) return candidate;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Not signed in.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
    const caller = callerData?.user;
    if (callerError || !caller) return json({ error: 'Not signed in.' }, 401);

    const { data: adminRow, error: adminError } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (adminError) {
      console.error('[admin-create-account] admin check failed:', adminError);
      return json({ error: 'Something went wrong.' }, 500);
    }
    if (!adminRow) return json({ error: 'Admin accounts only.' }, 403);

    const input = parseInput(await req.json().catch(() => null));
    if (typeof input === 'string') return json({ error: input }, 400);

    const generated = input.password === null;
    const password = input.password ?? generatePassword();
    const role = input.accountType === 'provider' ? 'provider' : 'user';

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password,
      // The whole point: no verification step, and no email from Auth.
      email_confirm: true,
      // What normal sign-up puts here too. AuthContext falls back to it if the
      // profile row is ever slow to read.
      user_metadata: {
        name: input.name,
        role,
        phone: input.phone ?? '',
        dob: input.dob,
        business_name: input.businessName,
      },
      app_metadata: {
        created_by_admin: caller.id,
        created_by_admin_at: new Date().toISOString(),
      },
    });
    if (createError || !created?.user) {
      const code = (createError as { code?: string } | null)?.code;
      const message = createError?.message ?? '';
      if (code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) {
        return json({ error: 'An account with this email already exists. They can sign in with it, or reset the password from the sign-in screen.' }, 409);
      }
      if (code === 'weak_password') {
        return json({ error: 'That password is too weak. Leave it blank to have one made up.' }, 400);
      }
      console.error('[admin-create-account] createUser failed:', createError);
      return json({ error: 'Something went wrong.' }, 500);
    }

    const userId = created.user.id;

    // The same row EmailVerificationScreen writes after a normal sign-up.
    // A provider starts without the client hat (column default false), as
    // they do through sign-up; a client gets it.
    const { error: profileError } = await admin.from('users').insert({
      id: userId,
      email: input.email,
      name: input.name,
      phone: input.phone ?? '',
      dob: input.dob,
      role,
      login_method: 'email',
      ...(role === 'user' ? { has_client_profile: true } : {}),
      business_name: input.businessName,
    });
    if (profileError) {
      // Don't leave a login with no profile behind: undo it so the admin can
      // simply try again.
      console.error('[admin-create-account] profile insert failed, removing the login:', profileError);
      const { error: undoError } = await admin.auth.admin.deleteUser(userId);
      if (undoError) console.error('[admin-create-account] could not remove the login:', undoError);
      return json({ error: 'Something went wrong.' }, 500);
    }

    // The record Admin → Accounts you created reads. The account is already
    // usable by now, so a failure here is logged rather than undoing it; the
    // app_metadata stamp above still says who made it.
    const { error: logError } = await admin.from('admin_actions').insert({
      admin_user_id: caller.id,
      action: 'create_account',
      target_id: userId,
      detail: { account_type: input.accountType },
    });
    if (logError) console.error('[admin-create-account] could not log the account in admin_actions:', logError);

    console.log(`[admin-create-account] ${caller.id} created ${role} account ${userId}`);
    return json({
      userId,
      email: input.email,
      accountType: input.accountType,
      // Only sent back when it was made up here: the admin already knows one
      // they typed.
      ...(generated ? { generatedPassword: password } : {}),
    });
  } catch (err) {
    console.error('[admin-create-account] unexpected error:', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
