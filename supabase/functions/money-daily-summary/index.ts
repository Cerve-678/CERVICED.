import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { sendSupportAlert } from '../_shared/supportAlert.ts';
import { moneySummaryEmail } from '../_shared/emailTemplates.ts';
import { summarizeMoneyAttention, type MoneyAttention } from '../_shared/payoutRetry.ts';

// The daily email to support listing every money thing waiting on a person:
// failed payouts to providers, money providers owe, open refund requests.
// Called by pg_cron through process_money_daily_summary() at 08:00 UTC, which
// already skips the call on a day with nothing waiting. Service role only.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { data, error } = await admin.rpc('money_needing_attention');
    if (error) throw error;
    const lines = summarizeMoneyAttention(data as MoneyAttention);
    const total = lines.failed.length + lines.owed.length + lines.refunds.length;
    const sent = total > 0 ? await sendSupportAlert(moneySummaryEmail(lines), 'money-daily-summary') : false;
    console.log(`[money-daily-summary] waiting=${total} sent=${sent}`);
    return new Response(JSON.stringify({ waiting: total, sent }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[money-daily-summary] failed: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Summary failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
