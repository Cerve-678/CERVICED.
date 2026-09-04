/**
 * send-rebooking-nudges
 *
 * DEPLOYMENT NOTE:
 * This function must be deployed to Supabase and scheduled via pg_cron or the
 * Supabase dashboard scheduler. Recommended schedule: once daily at 10:00 AM UTC.
 *   SELECT cron.schedule(
 *     'rebooking-nudges',
 *     '0 10 * * *',
 *     $$ SELECT net.http_post(url := 'https://<project>.functions.supabase.co/send-rebooking-nudges',
 *                             headers := '{"Authorization": "Bearer <service_role_key>"}') $$
 *   );
 *
 * WHAT IT DOES:
 * Reads each provider's `pa_rebooking_nudge_weeks` setting from user_metadata.
 * For each provider with this feature enabled, finds all clients whose most recent
 * COMPLETED booking with that provider was exactly N weeks ago (checked within a
 * ±1 day window). Sends each such client a nudge notification to rebook.
 * A `nudge_sent_at` timestamp (or similar deduplication) prevents repeated nudges
 * within the same cycle.
 *
 * PROVIDER SETTING:
 *   pa_rebooking_nudge_weeks: number | null (null = disabled, e.g. 4, 6, 8)
 *   Stored in auth.users.user_metadata for the provider's user account.
 *
 * DATA NEEDED FROM DB:
 *   - auth.users.user_metadata['pa_rebooking_nudge_weeks'] per provider user
 *   - bookings: provider_id, user_id, status ('completed'), booking_date,
 *               service_name_snapshot, provider_name_snapshot
 *   - notifications table: to insert the nudge, and to check if one was already
 *     sent recently (query for type='booking_reminder' within the past week per user+provider)
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

    // TODO: For each provider, read pa_rebooking_nudge_weeks from user_metadata.
    // If non-null, find clients whose last completed booking with this provider
    // was nudgeWeeks * 7 days ago (±1 day). Skip clients who already received
    // a nudge notification within the past 7 days.
    //
    // Example query shape:
    //
    // const { data: providers } = await supabase
    //   .from('providers')
    //   .select('id, user_id, display_name');
    //
    // for (const provider of providers ?? []) {
    //   const { data: { user } } = await supabase.auth.admin.getUserById(provider.user_id);
    //   const nudgeWeeks = user?.user_metadata?.pa_rebooking_nudge_weeks;
    //   if (!nudgeWeeks) continue; // feature disabled for this provider
    //
    //   const cutoffDate = new Date(now.getTime() - nudgeWeeks * 7 * 24 * 60 * 60 * 1000);
    //   const windowStart = new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    //   const windowEnd   = new Date(cutoffDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    //
    //   // Find the most recent completed booking per client within the window
    //   const { data: candidates } = await supabase
    //     .from('bookings')
    //     .select('user_id, booking_date, service_name_snapshot')
    //     .eq('provider_id', provider.id)
    //     .eq('status', 'completed')
    //     .gte('booking_date', windowStart)
    //     .lte('booking_date', windowEnd);
    //
    //   for (const c of candidates ?? []) {
    //     // Check: did this client already get a nudge from this provider in the last 7 days?
    //     const { count } = await supabase
    //       .from('notifications')
    //       .select('id', { count: 'exact', head: true })
    //       .eq('user_id', c.user_id)
    //       .eq('provider_id', provider.id)
    //       .eq('type', 'booking_reminder')
    //       .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
    //     if ((count ?? 0) > 0) continue;
    //
    //     await supabase.from('notifications').insert({
    //       user_id: c.user_id,
    //       type: 'booking_reminder',
    //       title: `Time to rebook with ${provider.display_name}?`,
    //       message: `It's been ${nudgeWeeks} week(s) since your last ${c.service_name_snapshot}. Book your next appointment now!`,
    //       priority: 'medium',
    //       is_actionable: true,
    //       provider_id: provider.id,
    //     });
    //   }
    // }

    return new Response(
      JSON.stringify({ ok: true, message: 'send-rebooking-nudges stub — not yet implemented' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
