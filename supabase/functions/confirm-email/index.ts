import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// "Quiet Signal" design (see supabase/functions/_shared/emailTemplates.ts):
// no card, no gradient, no button chrome — a hairline rule under the
// wordmark carries the identity, typeset in the app's real client-hat faces
// (Bakbak One / Jura) and real palette. This is a browser landing page (not
// an email client), so prefers-color-scheme dark mode support is reliable
// here.
const PAGE_STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jura:wght@400;500;600;700&family=Bakbak+One&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { color-scheme: light dark; }
    body { background: #FBF7F8; color: #1A1418; font-family: 'Jura', Georgia, serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .wrap { max-width: 420px; width: 100%; }
    .mark { font-family: 'Bakbak One', 'Arial Black', sans-serif; font-size: 13px; letter-spacing: 4px; }
    .rule { width: 34px; height: 2px; margin: 14px 0 40px; background: #3F1E36; }
    h1 { font-size: 25px; font-weight: 400; line-height: 1.3; margin: 0 0 20px; letter-spacing: 0.2px; }
    p { font-size: 15px; line-height: 1.8; margin: 0 0 34px; color: rgba(26,20,24,0.78); }
    .foot { margin-top: 52px; font-size: 11.5px; color: rgba(26,20,24,0.42); }

    @media (prefers-color-scheme: dark) {
      body { background: #17151A; color: #F0ECE7; }
      .rule { background: #E5ECF4; }
      p { color: rgba(240,236,231,0.78); }
      .foot { color: rgba(240,236,231,0.42); }
    }
  </style>
`;

const successPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Verified – CERVICED</title>
  ${PAGE_STYLE}
</head>
<body>
  <div class="wrap">
    <div class="mark">CERVICED</div>
    <div class="rule">&nbsp;</div>
    <h1>Email verified.</h1>
    <p>Your email is confirmed. Open the CERVICED app on your phone and tap "I've verified my email" to enter your account.</p>
    <div class="foot">CERVICED &middot; cerviced.co</div>
  </div>
</body>
</html>`;

const errorPage = (message: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Failed – CERVICED</title>
  ${PAGE_STYLE}
</head>
<body>
  <div class="wrap">
    <div class="mark">CERVICED</div>
    <div class="rule">&nbsp;</div>
    <h1>Link expired.</h1>
    <p>${message}. Please open the CERVICED app and request a new verification email.</p>
    <div class="foot">CERVICED &middot; cerviced.co</div>
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
