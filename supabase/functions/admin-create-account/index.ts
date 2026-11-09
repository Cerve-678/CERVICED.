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
// Blank providers (action 'start_blank_provider'): an admin can also open a
// provider account with no details at all, sign straight into it and set the
// profile up, then add the real person's details later ('add_details'). Until
// then the login is a made-up address at BLANK_EMAIL_DOMAIN that nobody can
// receive mail at, app_metadata.details_pending is true, and an admin can get
// back in with 'open_blank' (which sets a fresh password and returns it). Both
// follow-ups refuse any account that isn't an admin-made blank one, so neither
// can be pointed at a real person's account.
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
// Mirrored by BLANK_ACCOUNT_EMAIL_DOMAIN in src/services/databaseService.ts.
const BLANK_EMAIL_DOMAIN = 'pending.cerviced.co';
const BLANK_NAME = 'New provider';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

interface AddDetailsInput {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  dob: string;
  password: string | null;
}

function parsePassword(value: unknown): string | null | { error: string } {
  const password = typeof value === 'string' && value.length > 0 ? value : null;
  if (password !== null && password.length < 8) return { error: 'The password needs at least 8 characters.' };
  if (password !== null && password.length > 72) return { error: 'The password can be at most 72 characters.' };
  return password;
}

function parseAddDetails(body: Record<string, unknown>): AddDetailsInput | string {
  const userId = typeof body.userId === 'string' && UUID_RE.test(body.userId) ? body.userId : null;
  if (!userId) return 'Missing which account to update.';
  const name = text(body.name);
  if (!name) return 'Add their name.';
  const email = text(body.email)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return 'Add a real email address. It is what they sign in with.';
  if (email.endsWith(`@${BLANK_EMAIL_DOMAIN}`)) return 'Add their own email address.';
  const dob = typeof body.dob === 'string' ? body.dob.trim() : '';
  const dobProblem = checkDob(dob);
  if (dobProblem) return dobProblem;
  const password = parsePassword(body.password);
  if (password !== null && typeof password === 'object') return password.error;
  return { userId, name, email, phone: text(body.phone), dob, password };
}

function blankEmail(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `new-provider-${id}@${BLANK_EMAIL_DOMAIN}`;
}

function emailTakenResponse(error: unknown): Response | null {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) {
    return json({ error: 'An account with this email already exists. They can sign in with it, or reset the password from the sign-in screen.' }, 409);
  }
  if (code === 'weak_password') {
    return json({ error: 'That password is too weak. Leave it blank to have one made up.' }, 400);
  }
  return null;
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

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const action = body?.action ?? 'create';
    if (action === 'create') return await createAccount(admin, caller.id, body);
    if (action === 'start_blank_provider') return await startBlankProvider(admin, caller.id);
    if (action === 'open_blank') return await openBlank(admin, caller.id, body);
    if (action === 'add_details') return await addDetails(admin, caller.id, body);
    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[admin-create-account] unexpected error:', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
});

type Admin = ReturnType<typeof createClient>;

/** Creates the login and the users row together, undoing the login if the row fails. */
async function createLoginAndProfile(admin: Admin, callerId: string, account: {
  email: string; password: string; role: 'provider' | 'user'; name: string; phone: string | null;
  dob: string | null; businessName: string | null; detailsPending: boolean;
}): Promise<{ userId: string } | Response> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    // The whole point: no verification step, and no email from Auth.
    email_confirm: true,
    // What normal sign-up puts here too. AuthContext falls back to it if the
    // profile row is ever slow to read.
    user_metadata: {
      name: account.name,
      role: account.role,
      phone: account.phone ?? '',
      dob: account.dob ?? '',
      business_name: account.businessName,
    },
    app_metadata: {
      created_by_admin: callerId,
      created_by_admin_at: new Date().toISOString(),
      ...(account.detailsPending ? { details_pending: true } : {}),
    },
  });
  if (createError || !created?.user) {
    const known = emailTakenResponse(createError);
    if (known) return known;
    console.error('[admin-create-account] createUser failed:', createError);
    return json({ error: 'Something went wrong.' }, 500);
  }
  const userId = created.user.id;

  // The same row EmailVerificationScreen writes after a normal sign-up.
  // A provider starts without the client hat (column default false), as
  // they do through sign-up; a client gets it.
  const { error: profileError } = await admin.from('users').insert({
    id: userId,
    email: account.email,
    name: account.name,
    phone: account.phone ?? '',
    ...(account.dob ? { dob: account.dob } : {}),
    role: account.role,
    login_method: 'email',
    ...(account.role === 'user' ? { has_client_profile: true } : {}),
    business_name: account.businessName,
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
    admin_user_id: callerId,
    action: 'create_account',
    target_id: userId,
    detail: {
      account_type: account.role === 'provider' ? 'provider' : 'client',
      ...(account.detailsPending ? { details_pending: true } : {}),
    },
  });
  if (logError) console.error('[admin-create-account] could not log the account in admin_actions:', logError);

  console.log(`[admin-create-account] ${callerId} created ${account.role} account ${userId}${account.detailsPending ? ' (blank)' : ''}`);
  return { userId };
}

async function createAccount(admin: Admin, callerId: string, body: unknown): Promise<Response> {
  const input = parseInput(body);
  if (typeof input === 'string') return json({ error: input }, 400);
  const generated = input.password === null;
  const password = input.password ?? generatePassword();
  const result = await createLoginAndProfile(admin, callerId, {
    email: input.email,
    password,
    role: input.accountType === 'provider' ? 'provider' : 'user',
    name: input.name,
    phone: input.phone,
    dob: input.dob,
    businessName: input.businessName,
    detailsPending: false,
  });
  if (result instanceof Response) return result;
  return json({
    userId: result.userId,
    email: input.email,
    accountType: input.accountType,
    // Only sent back when it was made up here: the admin already knows one
    // they typed.
    ...(generated ? { generatedPassword: password } : {}),
  });
}

async function startBlankProvider(admin: Admin, callerId: string): Promise<Response> {
  const email = blankEmail();
  const password = generatePassword();
  const result = await createLoginAndProfile(admin, callerId, {
    email, password, role: 'provider', name: BLANK_NAME, phone: null, dob: null, businessName: null, detailsPending: true,
  });
  if (result instanceof Response) return result;
  // Returned so the app can sign straight in. Never shown to anyone: it is
  // replaced by open_blank on the next visit and by add_details at hand-over.
  return json({ userId: result.userId, email, password });
}

/** The admin-made blank account behind userId, or the response refusing it. */
async function loadBlank(admin: Admin, userId: unknown) {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) return json({ error: 'Missing which account.' }, 400);
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return json({ error: 'That account no longer exists.' }, 404);
  const meta = data.user.app_metadata ?? {};
  if (!meta.created_by_admin || meta.details_pending !== true) {
    return json({ error: 'Their details have already been added, so this account is theirs now.' }, 409);
  }
  return data.user;
}

async function openBlank(admin: Admin, callerId: string, body: Record<string, unknown> | null): Promise<Response> {
  const user = await loadBlank(admin, body?.userId);
  if (user instanceof Response) return user;
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error('[admin-create-account] open_blank could not set a password:', error);
    return json({ error: 'Something went wrong.' }, 500);
  }
  console.log(`[admin-create-account] ${callerId} reopened blank account ${user.id}`);
  return json({ userId: user.id, email: user.email, password });
}

async function addDetails(admin: Admin, callerId: string, body: Record<string, unknown> | null): Promise<Response> {
  const input = parseAddDetails(body ?? {});
  if (typeof input === 'string') return json({ error: input }, 400);
  const user = await loadBlank(admin, input.userId);
  if (user instanceof Response) return user;

  const generated = input.password === null;
  const password = input.password ?? generatePassword();

  // The users row first, keeping what it held so it can be put back. Then the
  // login, the owner's sign-in and details_pending = false in ONE auth update:
  // the account is never left with the owner's password while still flagged
  // as a blank one (which open_blank would happily reset). If that update
  // fails, the row is restored and nothing has changed.
  const { data: before, error: readError } = await admin.from('users')
    .select('email, name, phone, dob')
    .eq('id', user.id)
    .maybeSingle();
  if (readError || !before) {
    console.error('[admin-create-account] add_details could not read the users row:', readError);
    return json({ error: 'Something went wrong.' }, 500);
  }

  const { error: rowError } = await admin.from('users')
    .update({ email: input.email, name: input.name, phone: input.phone ?? '', dob: input.dob })
    .eq('id', user.id);
  if (rowError) {
    if ((rowError as { code?: string }).code === '23505') return emailTakenResponse({ code: 'email_exists' })!;
    console.error('[admin-create-account] add_details could not update the users row:', rowError);
    return json({ error: 'Something went wrong.' }, 500);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: input.email,
    email_confirm: true,
    password,
    user_metadata: { ...(user.user_metadata ?? {}), name: input.name, phone: input.phone ?? '', dob: input.dob },
    app_metadata: {
      ...(user.app_metadata ?? {}),
      details_pending: false,
      details_added_by_admin: callerId,
      details_added_at: new Date().toISOString(),
    },
  });
  if (authError) {
    const { error: undoError } = await admin.from('users').update(before).eq('id', user.id);
    if (undoError) console.error('[admin-create-account] add_details could not restore the users row:', undoError);
    const known = emailTakenResponse(authError);
    if (known) return known;
    console.error('[admin-create-account] add_details could not update the login:', authError);
    return json({ error: 'Something went wrong.' }, 500);
  }

  // check_and_set_provider_live keeps a blank account offline while
  // details_pending is true (migration 20261109260000). Nothing else re-runs it
  // now that the flag is clear, so do it here: a profile that's otherwise
  // ready goes live straight away. A failure only delays that until their next
  // profile save, so it is logged rather than failing the hand-over.
  const { data: providerRows, error: providersError } = await admin.from('providers')
    .select('id')
    .eq('user_id', user.id);
  if (providersError) {
    console.error('[admin-create-account] add_details could not read the provider rows:', providersError);
  } else {
    for (const row of (providerRows ?? []) as Array<{ id: string }>) {
      const { error: liveError } = await admin.rpc('check_and_set_provider_live', { p_provider_id: row.id });
      if (liveError) console.error('[admin-create-account] add_details could not re-check going live:', liveError);
    }
  }

  console.log(`[admin-create-account] ${callerId} added details to blank account ${user.id}`);
  return json({
    userId: user.id,
    email: input.email,
    accountType: 'provider',
    ...(generated ? { generatedPassword: password } : {}),
  });
}
