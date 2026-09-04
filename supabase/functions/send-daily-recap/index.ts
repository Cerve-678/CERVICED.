/**
 * send-daily-recap
 *
 * DEPLOYMENT NOTE:
 * This function must be deployed to Supabase and scheduled via pg_cron or the
 * Supabase dashboard scheduler. Recommended schedule: daily at 8:00 PM UTC
 * (so providers see tomorrow's bookings at the end of their working day).
 *   SELECT cron.schedule(
 *     'daily-recap',
 *     '0 20 * * *',
 *     $$ SELECT net.http_post(url := 'https://<project>.functions.supabase.co/send-daily-recap',
 *                             headers := '{"Authorization": "Bearer <service_role_key>"}') $$
 *   );
 *
 * WHAT IT DOES:
 * Reads each provider's `pa_new_booking_recap` setting from user_metadata.
 * For providers with this feature enabled, queries all confirmed/pending bookings
 * for the next calendar day, aggregates them into a summary (count, list of times
 * and client names), and inserts a notification for the provider's user account.
 * The notification lands in their Notifications tab so they wake up knowing their
 * schedule for tomorrow.
 *
 * PROVIDER SETTING:
 *   pa_new_booking_recap: boolean (true = enabled)
 *   Stored in auth.users.user_metadata for the provider's user account.
 *
 * DATA NEEDED FROM DB:
 *   - auth.users.user_metadata['pa_new_booking_recap'] per provider user
 *   - providers: id, user_id, display_name
 *   - bookings: provider_id, booking_date, booking_time, customer_name,
 *               service_name_snapshot, status ('confirmed' | 'pending')
 *   - notifications table: for inserting the recap notification to the provider's user_id
 *     (note: this goes to the PROVIDER, not the client — use user_id = provider.user_id directly)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    // TODO: For each provider with pa_new_booking_recap enabled, find all
    // confirmed/pending bookings for tomorrow and send them a recap notification.
    //
    // Example query shape:
    //
    // const { data: providers } = await supabase
    //   .from('providers')
    //   .select('id, user_id, display_name');
    //
    // for (const provider of providers ?? []) {
    //   const { data: { user } } = await supabase.auth.admin.getUserById(provider.user_id);
    //   const recapEnabled = user?.user_metadata?.pa_new_booking_recap ?? false;
    //   if (!recapEnabled) continue;
    //
    //   const { data: bookings } = await supabase
    //     .from('bookings')
    //     .select('booking_time, customer_name, service_name_snapshot')
    //     .eq('provider_id', provider.id)
    //     .eq('booking_date', tomorrowStr)
    //     .in('status', ['confirmed', 'pending'])
    //     .order('booking_time', { ascending: true });
    //
    //   if (!bookings || bookings.length === 0) continue; // no appointments tomorrow
    //
    //   const count = bookings.length;
    //   const lines = bookings.map(b =>
    //     `${b.booking_time?.slice(0, 5) ?? '?'} — ${b.customer_name ?? 'Client'} (${b.service_name_snapshot ?? 'Service'})`
    //   );
    //   const message = `You have ${count} appointment${count > 1 ? 's' : ''} tomorrow:\n${lines.join('\n')}`;
    //
    //   await supabase.from('notifications').insert({
    //     user_id: provider.user_id,   // goes to the PROVIDER's notification feed
    //     type: 'booking_reminder',
    //     title: `Tomorrow's Schedule — ${count} booking${count > 1 ? 's' : ''}`,
    //     message,
    //     priority: 'medium',
    //     is_actionable: false,
    //     provider_id: provider.id,
    //   });
    // }

    return new Response(
      JSON.stringify({ ok: true, message: 'send-daily-recap stub — not yet implemented', tomorrow: tomorrowStr }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
