// supabase/functions/send-booking-update-email/index.ts
// Emails a client the two things the app tells them before an appointment:
// the address once it's shared, and the reminder. Called by the DATABASE
// (queue_booking_update_email, on the notification row), not the app.
//
// The app sends both as notifications. A client who booked on the website, or
// who turned notifications off, would never see them, so every client gets
// them by email as well (user decision 2026-11-23). Hanging this off the
// notification row means the email follows the notification's own rules:
// the provider's release setting, the fixed reminder timing, the client's
// reminder switch, group bookings and the reminder throttle.
//
// CALLER: the service role only, as send-booking-confirmation.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addressSharedEmail, appointmentReminderEmail } from '../_shared/emailTemplates.ts';
import { formatLongDate, formatTime12 } from '../_shared/bookingDates.ts';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { EMAILED_REMINDER_TIMING, londonToday, reminderIsDue, type ReminderTiming } from '../_shared/reminderEmailTiming.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  try {
    if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
      return json({ error: 'This endpoint is called by the database only.' }, 403);
    }
    const { notificationId } = await req.json();
    if (!notificationId) return json({ error: 'Missing notificationId.' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('id, type, booking_id, user_id, metadata, created_at')
      .eq('id', notificationId)
      .maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification?.booking_id) return json({ skipped: 'no booking' });
    if (notification.type !== 'address_released' && notification.type !== 'booking_reminder') {
      return json({ skipped: `not an emailed type: ${notification.type}` });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, user_id, status, customer_email, provider_id, provider_name_snapshot, service_name_snapshot, ' +
        'booking_date, booking_time, client_address, booking_instructions, group_booking_count, ' +
        'base_price, service_charge, amount_paid, payment_status',
      )
      .eq('id', notification.booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return json({ skipped: 'booking not found' });
    if (!booking.customer_email) return json({ skipped: 'no customer email' });
    // The notification was for the client who booked, not someone else on it.
    if (notification.user_id !== booking.user_id) return json({ skipped: 'not the booking client' });
    // Cancelled since the notification was written: nothing to go to.
    if (!['confirmed', 'in_progress'].includes(booking.status)) return json({ skipped: `status ${booking.status}` });

    // The server tags every reminder it writes with its timing. A client can
    // insert their own notification rows, and a provider can send one about
    // their own booking, so an untagged reminder isn't one of ours.
    const timing = notification.metadata?.reminder_timing as ReminderTiming | undefined;
    if (notification.type === 'booking_reminder' && !timing) return json({ skipped: 'untagged reminder' });

    // One email per booking for each kind (and each reminder timing): only
    // the first such row is emailed, so writing the row again by hand never
    // sends a second one.
    let earlier = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', booking.id)
      .eq('user_id', booking.user_id)
      .eq('type', notification.type)
      .lt('created_at', notification.created_at);
    if (timing) earlier = earlier.eq('metadata->>reminder_timing', timing);
    const { count: earlierCount, error: earlierError } = await earlier;
    if (earlierError) throw earlierError;
    if ((earlierCount ?? 0) > 0) return json({ skipped: 'already emailed for an earlier notification' });

    const [
      { data: provider, error: providerError },
      { data: venueRows, error: venueError },
      { data: clientAddressRow, error: clientAddressError },
    ] = await Promise.all([
      supabase.from('providers').select('business_type').eq('id', booking.provider_id).maybeSingle(),
      // Released venue only: the same check the app's client_bookings view
      // makes. An email can't be unsent, so it never carries an address the
      // client couldn't see in the app yet.
      supabase.rpc('booking_released_venue', { p_booking_id: booking.id }),
      // A mobile provider's client keeps their address here; the bookings
      // column is only the checkout funnel and is empty at rest.
      supabase.from('booking_client_addresses').select('address').eq('booking_id', booking.id).maybeSingle(),
    ]);
    if (providerError) throw providerError;
    if (venueError) throw venueError;
    if (clientAddressError) throw clientAddressError;

    const isMobile = provider?.business_type === 'mobile';
    const venue = Array.isArray(venueRows) ? venueRows[0] : null;
    const venueAddress: string | null = venue?.address?.trim() || null;

    const common = {
      providerName: booking.provider_name_snapshot?.trim() || 'your provider',
      service: booking.service_name_snapshot || 'your appointment',
      date: formatLongDate(booking.booking_date),
      time: formatTime12(booking.booking_time),
    };

    let mail: { subject: string; html: string };
    if (notification.type === 'address_released') {
      // A mobile provider comes to the client, so there's no address of
      // theirs to share; and never send one that isn't released.
      if (isMobile) return json({ skipped: 'mobile provider' });
      if (!venueAddress) return json({ skipped: 'venue not released' });
      mail = addressSharedEmail({
        ...common,
        address: venueAddress,
        directions: venue?.directions ?? null,
        groupCount: Number(booking.group_booking_count) || 1,
      });
    } else {
      const reminderTiming = timing ?? '24h';
      if (reminderTiming !== EMAILED_REMINDER_TIMING) {
        return json({ skipped: `reminder ${reminderTiming} is not the emailed one` });
      }
      const daysAhead = 1;
      if (!reminderIsDue(booking.booking_date, londonToday(), daysAhead)) {
        return json({ skipped: 'reminder outside its window' });
      }
      const { data: addOns, error: addOnsError } = await supabase
        .from('booking_add_ons').select('price_snapshot').eq('booking_id', booking.id).limit(50);
      if (addOnsError) throw addOnsError;
      // Same figures as the confirmation email and the in-app receipt: the
      // total less what left the card. A held request that was accepted is
      // being taken, so it counts as paid.
      const addOnsTotal = (addOns ?? []).reduce((sum, a) => sum + (Number(a.price_snapshot) || 0), 0);
      const total = (Number(booking.base_price) || 0) + addOnsTotal + (Number(booking.service_charge) || 0);
      const paid = ['fully_paid', 'deposit_paid', 'authorised'].includes(booking.payment_status ?? '')
        ? Number(booking.amount_paid) || 0 : 0;
      mail = appointmentReminderEmail({
        ...common,
        daysAhead,
        where: isMobile
          ? { kind: 'mobile', address: clientAddressRow?.address?.trim() || booking.client_address?.trim() || null }
          : venueAddress ? { kind: 'venue', address: venueAddress } : { kind: 'not_yet' },
        dueAtAppointment: Math.max(0, Math.round((total - paid) * 100) / 100),
        instructions: booking.booking_instructions,
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // One email per notification row, however often this is called.
        'Idempotency-Key': `booking-update-${notification.id}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: booking.customer_email, subject: mail.subject, html: mail.html }),
    });
    if (!res.ok) {
      console.error(`[booking-update-email] ${notification.type} ${booking.id} failed: ${await res.text()}`);
      return json({ error: 'Send failed.' }, 502);
    }
    return json({ sent: true, type: notification.type });
  } catch (error) {
    console.error(`[booking-update-email] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
