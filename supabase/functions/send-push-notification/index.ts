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
  };
  schema: string;
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

    // Use service role to read the user's push_token (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    // Send to Expo Push Service
    const expoPushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body: message,
        sound: 'default',
        priority: payload.record.priority === 'high' ? 'high' : 'normal',
        data: {
          booking_id: payload.record.booking_id,
          notification_id: payload.record.id,
          type: payload.record.type,
        },
      }),
    });

    const result = await expoPushRes.json();

    return new Response(JSON.stringify({ sent: true, expo_response: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
