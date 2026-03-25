import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const successPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Verified – CERVICED</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #F5E6FA; font-family: Georgia, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 24px; padding: 48px 40px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 4px 32px rgba(163,66,195,0.14); }
    .brand { background: linear-gradient(135deg, #a342c3, #DA70D6); border-radius: 16px; padding: 20px 32px; display: inline-block; margin-bottom: 36px; }
    .brand-name { color: #fff; font-size: 30px; font-weight: 900; letter-spacing: 4px; font-family: Impact, 'Arial Black', sans-serif; }
    .brand-tag { color: rgba(255,255,255,0.85); font-size: 12px; letter-spacing: 1px; margin-top: 4px; }
    .check { font-size: 56px; margin-bottom: 20px; }
    h1 { color: #1a1a1a; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
    .label { color: #DA70D6; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 24px; }
    p { color: #555; font-size: 15px; line-height: 1.7; margin-bottom: 32px; }
    .footer { margin-top: 36px; color: #a342c3; font-size: 12px; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-name">CERVICED</div>
      <div class="brand-tag">Beauty at your fingertips</div>
    </div>
    <div class="check">✓</div>
    <h1>Email Verified</h1>
    <p class="label">You're all set</p>
    <p>Your email is confirmed. Open the <strong>CERVICED app</strong> on your phone and tap <strong>"I've verified my email"</strong> to enter your account.</p>
    <div class="footer">© CERVICED · cerviced.co</div>
  </div>
</body>
</html>`;

const errorPage = (message: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Failed – CERVICED</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #F5E6FA; font-family: Georgia, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 24px; padding: 48px 40px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 4px 32px rgba(163,66,195,0.14); }
    .brand { background: linear-gradient(135deg, #a342c3, #DA70D6); border-radius: 16px; padding: 20px 32px; display: inline-block; margin-bottom: 36px; }
    .brand-name { color: #fff; font-size: 30px; font-weight: 900; letter-spacing: 4px; font-family: Impact, 'Arial Black', sans-serif; }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h1 { color: #1a1a1a; font-size: 22px; font-weight: 700; margin-bottom: 16px; }
    p { color: #666; font-size: 14px; line-height: 1.7; }
    .footer { margin-top: 36px; color: #a342c3; font-size: 12px; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-name">CERVICED</div>
    </div>
    <div class="icon">⚠️</div>
    <h1>Link Expired</h1>
    <p>${message}. Please open the CERVICED app and request a new verification email.</p>
    <div class="footer">© CERVICED · cerviced.co</div>
  </div>
</body>
</html>`;

serve(async (req) => {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') ?? 'signup';

  if (!token_hash) {
    return new Response(errorPage('Invalid verification link'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as 'signup' | 'email',
  });

  if (error) {
    return new Response(errorPage('This verification link has expired or already been used'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return new Response(successPage(), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
});
