/**
 * send-appointment-reminders
 *
 * DEPLOYMENT NOTE:
 * This function must be deployed to Supabase and scheduled via pg_cron or the
 * Supabase dashboard scheduler. Recommended schedule: every 30 minutes.
 *   SELECT cron.schedule(
 *     'appointment-reminders',
 *     '*/30 * * * *',
 *     $$ SELECT net.http_post(url := 'https://<project>.functions.supabase.co/send-appointment-reminders',
 *                             headers := '{"Authorization": "Bearer <service_role_key>"}') $$
 *   );
 *
 * WHAT IT DOES:
 * Reads each provider's `pa_client_reminder_timing` setting from user_metadata,
 * finds all upcoming bookings whose appointment is exactly N hours away (±15 min
 * window to avoid duplicate delivery), and inserts a push notification for each
 * client. A `reminder_sent_at` column on bookings prevents double-firing.
 *
 * PROVIDER SETTING:
 *   pa_client_reminder_timing: number (hours before appointment, e.g. 24, 48, 1)
 *   Stored in auth.users.user_metadata for the provider's user account.
 *
 * DATA NEEDED FROM DB:
 *   - auth.users.user_metadata['pa_client_reminder_timing'] per provider user
 *   - bookings: id, user_id, provider_id, booking_date, booking_time, service_name_snapshot,
 *               provider_name_snapshot, status ('confirmed'), reminder_sent_at
 *   - notifications table: for inserting the reminder row
 *   - (optional) push_tokens table: for Expo push delivery via send-push-notification fn
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

    // TODO: For each provider user, read pa_client_reminder_timing from user_metadata.
    // Then find bookings whose (booking_date + booking_time) falls within
    // [now + reminderHours - 15min, now + reminderHours + 15min] and have not had
    // a reminder sent yet (reminder_sent_at IS NULL).
    //
    // Example query shape:
    //
    // const { data: providers } = await supabase
    //   .from('providers')
    //   .select('id, user_id');
    //
    // for (const provider of providers ?? []) {
    //   const { data: { user } } = await supabase.auth.admin.getUserById(provider.user_id);
    //   const reminderHours = user?.user_metadata?.pa_client_reminder_timing ?? 24;
    //   const targetTime = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);
    //   const windowStart = new Date(targetTime.getTime() - 15 * 60 * 1000).toISOString();
    //   const windowEnd   = new Date(targetTime.getTime() + 15 * 60 * 1000).toISOString();
    //
    //   const { data: bookings } = await supabase
    //     .from('bookings')
    //     .select('id, user_id, service_name_snapshot, provider_name_snapshot, booking_date, booking_time')
    //     .eq('provider_id', provider.id)
    //     .eq('status', 'confirmed')
    //     .is('reminder_sent_at', null)
    //     // Filter bookings where (booking_date || 'T' || booking_time) is within window
    //     .gte('booking_date', windowStart.split('T')[0])
    //     .lte('booking_date', windowEnd.split('T')[0]);
    //
    //   for (const booking of bookings ?? []) {
    //     await supabase.from('notifications').insert({
    //       user_id: booking.user_id,
    //       type: 'booking_reminder',
    //       title: 'Appointment Reminder',
    //       message: `Your ${booking.service_name_snapshot} with ${booking.provider_name_snapshot} is coming up in ${reminderHours} hour(s).`,
    //       priority: 'high',
    //       is_actionable: true,
    //       booking_id: booking.id,
    //     });
    //     await supabase
    //       .from('bookings')
    //       .update({ reminder_sent_at: now.toISOString() })
    //       .eq('id', booking.id);
    //   }
    // }

    return new Response(
      JSON.stringify({ ok: true, message: 'send-appointment-reminders stub — not yet implemented' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
