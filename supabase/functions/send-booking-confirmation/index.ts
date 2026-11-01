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
import { formatLongDate, formatTime12 } from '../_shared/bookingDates.ts';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';

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

/** Same shape as the app's formatBookingRef: "CRV-" + the stored ref, else
 *  the first 8 hex characters of the id. */
function formatBookingRef(b: { booking_ref?: string | null; id: string }): string {
  const stored = b.booking_ref?.trim();
  if (stored) return `CRV-${stored.toUpperCase()}`;
  return b.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Not a plain string compare: the vault holds the legacy eyJ… service key
    // while the runtime may be handed the newer sb_secret_… one, and an exact
    // match 403'd every call from 10 Oct 2026 (no confirmation email went out
    // for three weeks). isServiceRoleRequest accepts either, as release-payouts
    // has since its own 403 on 11 Oct.
    if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
      return json({ error: 'This endpoint is called by the database only.' }, 403);
    }

    const { bookingId } = await req.json();
    if (!bookingId) return json({ error: 'Missing bookingId.' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_email, provider_name_snapshot, service_name_snapshot, ' +
        'provider_address_snapshot, client_address, booking_date, booking_time, provider_id, ' +
        'booking_ref, base_price, service_charge, deposit_amount, amount_paid, payment_type, payment_status',
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
    // Independent reads: the venue rule needs the provider's business_type,
    // and the itemised services need the add-on snapshots written alongside
    // the booking (claim_cart_booking_slots sets the money and the status in
    // the same UPDATE that queues this email, so both are final by now).
    const [{ data: provider }, { data: addOns, error: addOnsError }] = await Promise.all([
      supabase.from('providers').select('business_type').eq('id', booking.provider_id).maybeSingle(),
      supabase.from('booking_add_ons').select('name_snapshot, price_snapshot').eq('booking_id', booking.id).limit(50),
    ]);
    if (addOnsError) throw addOnsError;

    const isMobile = provider?.business_type === 'mobile';
    const location = (isMobile ? booking.client_address : booking.provider_address_snapshot)
      || 'Address shared on confirmation';

    // Raw — the template escapes its own HTML and leaves the subject as plain
    // text, so a service called "Gel manicure & art" no longer reaches the
    // inbox as "Gel manicure &amp; art".
    const { subject, html } = bookingConfirmationEmail({
      providerName: booking.provider_name_snapshot?.trim() || 'your provider',
      service: booking.service_name_snapshot || 'your appointment',
      date: formatLongDate(booking.booking_date),
      time: formatTime12(booking.booking_time),
      location,
      reference: formatBookingRef(booking),
      basePrice: Number(booking.base_price) || 0,
      addOns: (addOns ?? []).map((a) => ({ name: a.name_snapshot ?? 'Add-on', price: Number(a.price_snapshot) || 0 })),
      serviceCharge: Number(booking.service_charge) || 0,
      depositAmount: Number(booking.deposit_amount) || 0,
      amountPaid: Number(booking.amount_paid) || 0,
      paymentType: booking.payment_type ?? 'full',
      paymentStatus: booking.payment_status ?? 'pending',
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // The database retries a confirmation it never saw confirmed
        // (retry_unsent_booking_confirmations), so the same booking can reach
        // here more than once. Resend collapses repeats of one key within 24h,
        // which is what stops a slow first attempt plus a retry becoming two
        // emails.
        'Idempotency-Key': `booking-confirmation-${booking.id}`,
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

    // Recorded here, by the only party that knows Resend accepted it, so the
    // retry job can tell "never sent" from "sent". Without it, every booking
    // was sent up to three times once emails got through again (2026-10-31):
    // this half of a3ffa2fe (25 Sep) never reached main, though its retry job
    // went live. A failed stamp is logged, not surfaced: the email did go out,
    // and the idempotency key above covers a needless retry.
    const { error: stampError } = await supabase
      .from('bookings')
      .update({ confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null })
      .eq('id', booking.id);
    if (stampError) {
      console.error(`[booking-confirmation] ${booking.id} sent but could not be recorded: ${stampError.message}`);
    }

    return json({ sent: true });
  } catch (error) {
    console.error(`[booking-confirmation] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
