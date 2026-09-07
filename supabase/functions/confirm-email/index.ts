import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The two outcome pages a verification link can land on. They were the last
// surface still carrying the retired orchid branding (a #a342c3 gradient and
// an Impact wordmark); they now use the app's own cream-and-chocolate base
// theme and real mark, so the page you land on looks like the app you just
// signed up for. One shell rather than two near-identical copies — they only
// ever differed by icon and wording.
const MARK =
  'https://ztrfpfvvejzaysrelmfm.supabase.co/storage/v1/object/public/public/brand/cerviced-mark.png';

const outcomePage = (o: {
  title: string;
  docTitle: string;
  kicker: string;
  icon: string;
  body: string;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${o.docTitle} – CERVICED</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bakbak+One&family=Jura:wght@400;600&display=swap" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #F5F1EC;
      font-family: 'Jura', 'Trebuchet MS', Verdana, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #000;
    }
    .card {
      background: #fff;
      border: 1px solid #EDEAEA;
      border-radius: 16px;
      padding: 44px 36px;
      max-width: 460px;
      width: 100%;
      text-align: center;
    }
    .mark { width: 72px; height: 72px; border-radius: 18px; display: block; margin: 0 auto 28px; }
    .icon { font-size: 44px; line-height: 1; margin-bottom: 18px; }
    h1 {
      font-family: 'Bakbak One', 'Arial Black', Impact, sans-serif;
      font-size: 26px; letter-spacing: 1px; line-height: 1.3; margin-bottom: 10px;
    }
    .kicker {
      color: #5C4033; font-size: 12px; letter-spacing: 2px;
      text-transform: uppercase; font-weight: 600; margin-bottom: 22px;
    }
    p { color: #7E6667; font-size: 15px; line-height: 1.7; }
    strong { color: #000; }
    .footer {
      margin-top: 32px; padding-top: 20px; border-top: 1px solid #EDEAEA;
      color: #7E6667; font-size: 11px; letter-spacing: 1.5px;
    }
  </style>
</head>
<body>
  <div class="card">
    <img class="mark" src="${MARK}" alt="CERVICED" />
    <div class="icon">${o.icon}</div>
    <h1>${o.title}</h1>
    <p class="kicker">${o.kicker}</p>
    <p>${o.body}</p>
    <div class="footer">© CERVICED · cerviced.co</div>
  </div>
</body>
</html>`;

const successPage = () =>
  outcomePage({
    docTitle: 'Email Verified',
    icon: '✓',
    title: 'Email verified',
    kicker: "You're all set",
    body: 'Your email is confirmed. Open the <strong>CERVICED app</strong> on your phone and tap <strong>“I’ve verified my email”</strong> to enter your account.',
  });

const errorPage = (message: string) =>
  outcomePage({
    docTitle: 'Verification Failed',
    icon: '⚠︎',
    title: 'Link expired',
    kicker: 'Nothing to worry about',
    body: `${message}. Open the CERVICED app and request a new verification email — the new link will work straight away.`,
  });

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
