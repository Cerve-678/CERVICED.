import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  // Supabase DB webhook sends the full row under "record"
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    user_id: string;
    title: string;
    message: string;
    booking_id: string | null;
    provider_id: string | null;
    type: string;
    priority: string;
    recipient_role: 'provider' | 'client';
  };
  schema: string;
}

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

// If "Enhanced Security for Push" is enabled on the Expo account, both /send and
// /getReceipts must be authenticated. Set the EXPO_ACCESS_TOKEN function secret to
// supply it; the header is simply omitted (and everything works) when it's not set.
function expoHeaders(): Record<string, string> {
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  return {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Poll the Expo receipt endpoint until the receipt for `ticketId` is available
// (or we exhaust our attempts). THIS is what surfaces the real APNs/FCM error
// — e.g. InvalidProviderToken, DeviceNotRegistered — which the push /send
// ticket ("ok") never reveals. Everything is logged so it shows up in the
// Edge Function logs instead of failing silently.
async function pollReceiptAndLog(
  supabase: ReturnType<typeof createClient>,
  ticketId: string,
  userId: string,
  pushToken: string,
) {
  const maxAttempts = 8;
  const delayMs = 3000; // ~24s total; receipts are usually ready within seconds
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: expoHeaders(),
        body: JSON.stringify({ ids: [ticketId] }),
      });
      const json = await res.json();
      const receipt = json?.data?.[ticketId];
      if (!receipt) continue; // not ready yet — try again

      if (receipt.status === 'ok') {
        console.log(`[push] receipt ok ticket=${ticketId} user=${userId}`);
      } else {
        // status === 'error' — the previously-invisible delivery failure
        console.error(
          `[push] receipt ERROR ticket=${ticketId} user=${userId} ` +
            `apns=${receipt?.details?.error ?? 'unknown'} msg=${receipt?.message ?? ''}`,
        );
        await handlePushError(supabase, userId, pushToken, receipt?.details?.error);
      }
      return;
    } catch (e) {
      console.error(`[push] receipt poll attempt ${attempt} failed: ${String(e)}`);
    }
  }
  console.warn(
    `[push] receipt for ticket=${ticketId} not available after ${maxAttempts} attempts`,
  );
}

// React to well-known Expo error codes. DeviceNotRegistered => the token is
// dead (app uninstalled / a new build minted a new token) and Expo says stop
// sending to it, so we null it out to prevent silent repeat failures.
// InvalidProviderToken / MismatchSenderId are project-level credential problems
// (APNs key not bound / revoked) — nothing to fix per-row, but now logged above.
async function handlePushError(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  pushToken: string,
  errorCode?: string,
) {
  if (errorCode === 'DeviceNotRegistered') {
    const { error } = await supabase
      .from('users')
      .update({ push_token: null })
      .eq('id', userId)
      .eq('push_token', pushToken);
    if (error) {
      console.error(`[push] failed clearing dead token user=${userId}: ${error.message}`);
    } else {
      console.warn(`[push] cleared DeviceNotRegistered token user=${userId}`);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();

    // Only act on INSERT events to the notifications table
    if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_id, title, message } = payload.record;

    if (!payload.record.id) {
      return new Response(JSON.stringify({ error: 'missing_notification_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to read the user's push_token (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Database webhooks are at-least-once delivery. Atomically claim this row
    // before calling Expo so a retry/concurrent webhook cannot show the same
    // notification twice. Keep the claim even if the downstream outcome is
    // uncertain: retrying an accepted-but-unacknowledged Expo request is the
    // exact failure mode that produces duplicate visible alerts.
    const { data: claimed, error: claimError } = await supabase.rpc(
      'claim_notification_push',
      { p_notification_id: payload.record.id },
    );

    if (claimError) {
      console.error(
        `[push] claim failed notification=${payload.record.id}: ${claimError.message}`,
      );
      return new Response(JSON.stringify({ error: 'claim_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!claimed) {
      console.log(`[push] duplicate skipped notification=${payload.record.id}`);
      return new Response(JSON.stringify({ sent: false, reason: 'duplicate' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRow, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', user_id)
      .single();

    if (error || !userRow?.push_token) {
      // User has no push token — they haven't granted permission or never logged in on a device
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pushToken = userRow.push_token;

    // Send to Expo Push Service. The notification title is sent as-is — provider
    // vs client is already clear from the title/message, and prefixing the
    // business name clipped long titles like "You have a new booking".
    const expoPushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify({
        to: pushToken,
        title,
        body: message,
        sound: 'default',
        channelId: 'default', // matches the Android channel created in the app
        priority: payload.record.priority === 'high' ? 'high' : 'normal',
        data: {
          booking_id: payload.record.booking_id,
          notification_id: payload.record.id,
          type: payload.record.type,
          recipient_role: payload.record.recipient_role,
        },
      }),
    });

    const result = await expoPushRes.json();
    const ticket = result?.data;

    // --- Surface the delivery outcome instead of failing silently ---
    if (ticket?.status === 'error') {
      // Rejected at the /send stage (e.g. malformed token, DeviceNotRegistered)
      console.error(
        `[push] send ERROR user=${user_id} ` +
          `err=${ticket?.details?.error ?? 'unknown'} msg=${ticket?.message ?? ''}`,
      );
      await handlePushError(supabase, user_id, pushToken, ticket?.details?.error);
    } else if (ticket?.id) {
      console.log(`[push] send ok user=${user_id} ticket=${ticket.id} — polling receipt`);
      // Poll the receipt so APNs/FCM errors reach the logs. Use waitUntil so it
      // runs after the response and isn't cut off by the pg_net 5s caller timeout.
      const receiptWork = pollReceiptAndLog(supabase, ticket.id, user_id, pushToken);
      // @ts-ignore  EdgeRuntime is provided by the Supabase Edge runtime
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(receiptWork);
      } else {
        await receiptWork;
      }
    }

    return new Response(JSON.stringify({ sent: true, expo_response: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[push] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
