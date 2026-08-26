// supabase/functions/send-booking-confirmation/index.ts
// Sends the booking confirmation email. Called by the DATABASE, not the app.
//
// This used to run on the client: BookingContext built the HTML on the device
// and posted it up right after claiming the slot. That made the email
// conditional on the app staying open — close it a second too early, lose
// signal, and the booking existed while the confirmation simply never
// happened, silently. It also meant the phone decided what the email said.
//
// Now `queue_booking_confirmation_email()` fires on the bookings row itself
// and calls this with nothing but an id. Everything in the email is read here
// from the booking, so the content follows the record rather than whatever a
// client claimed at the time.
//
// CALLER: the service role only. The trigger authenticates with the
// service_role key from vault, exactly as send_push_on_notification_insert()
// already does — this is not reachable by a user session.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { bookingConfirmationEmail } from '../_shared/emailTemplates.ts';
import { escapeHtml } from '../_shared/escapeHtml.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** "2026-08-26" -> "Wednesday, 26 August 2026", matching the app's formatLongDate. */
function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** "14:30:00" -> "2:30 PM", matching the app's formatTime12. */
function formatTime12(value: string): string {
  const [hRaw, minRaw] = value.split(':');
  const h = Number(hRaw);
  if (Number.isNaN(h)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${minRaw ?? '00'} ${suffix}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt || jwt !== SERVICE_ROLE_KEY) {
      return json({ error: 'This endpoint is called by the database only.' }, 403);
    }

    const { bookingId } = await req.json();
    if (!bookingId) return json({ error: 'Missing bookingId.' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_name, customer_email, provider_name_snapshot, service_name_snapshot, ' +
        'provider_address_snapshot, client_address, booking_date, booking_time, provider_id',
      )
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError || !booking) return json({ error: 'Booking not found.' }, 404);
    if (!booking.customer_email) return json({ skipped: 'no customer email' });

    // A mobile provider travels to the client, so the address that belongs in
    // the client's confirmation is their own — the same rule the app applies
    // (see memory `mobile-vs-fixed-address-is-business-type`: the venue is
    // decided by business_type, never by whether client_address happens to be
    // populated).
    const { data: provider } = await supabase
      .from('providers')
      .select('business_type')
      .eq('id', booking.provider_id)
      .maybeSingle();

    const isMobile = provider?.business_type === 'mobile';
    const location = (isMobile ? booking.client_address : booking.provider_address_snapshot)
      || 'Address shared on confirmation';

    const { subject, html } = bookingConfirmationEmail({
      clientName: escapeHtml(booking.customer_name || 'there'),
      providerName: escapeHtml(booking.provider_name_snapshot || 'your provider'),
      service: escapeHtml(booking.service_name_snapshot || 'your appointment'),
      date: escapeHtml(formatLongDate(booking.booking_date)),
      time: escapeHtml(formatTime12(booking.booking_time)),
      location: escapeHtml(location),
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: booking.customer_email, subject, html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Recorded on the row, not just logged: "did this booking's confirmation
      // actually go out" has to be answerable from the data. Not answering it
      // is what let an unverified sending domain go unnoticed for months.
      await supabase
        .from('bookings')
        .update({ confirmation_email_error: errText.slice(0, 2000) })
        .eq('id', booking.id);
      console.error(`[booking-confirmation] ${booking.id} failed: ${errText}`);
      return json({ error: 'Send failed.' }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error(`[booking-confirmation] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
