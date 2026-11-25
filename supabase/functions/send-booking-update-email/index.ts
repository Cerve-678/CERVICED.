// supabase/functions/send-booking-update-email/index.ts
// Emails a client the two things the app tells them before an appointment:
// the address once it's shared, and the reminder. Called by the DATABASE
// (queue_booking_update_email, on the notification row), not the app.
//
// The app sends both as notifications. A client who booked on the website, or
// who turned notifications off, would never see them, so every client gets
// them by email as well (user decision 2026-11-23). Hanging this off the
// notification row means the email follows the notification's own rules:
// the provider's release setting, their reminder timing, the client's
// reminder switch, group bookings and the reminder throttle.
//
// CALLER: the service role only, as send-booking-confirmation.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addressSharedEmail, appointmentReminderEmail } from '../_shared/emailTemplates.ts';
import { formatLongDate, formatTime12 } from '../_shared/bookingDates.ts';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { emailedReminderTiming, type ReminderTiming } from '../_shared/reminderEmailTiming.ts';

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
      .select('id, type, booking_id, user_id, metadata')
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

    const [
      { data: provider, error: providerError },
      { data: venueRows, error: venueError },
    ] = await Promise.all([
      supabase.from('providers').select('business_type, automation_settings').eq('id', booking.provider_id).maybeSingle(),
      // Released venue only: the same check the app's client_bookings view
      // makes. An email can't be unsent, so it never carries an address the
      // client couldn't see in the app yet.
      supabase.rpc('booking_released_venue', { p_booking_id: booking.id }),
    ]);
    if (providerError) throw providerError;
    if (venueError) throw venueError;

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
      // Untagged reminders are the old job's, which were all 24h.
      const timing = (notification.metadata?.reminder_timing as ReminderTiming | undefined) ?? '24h';
      if (timing !== emailedReminderTiming(provider?.automation_settings?.clientReminderTiming)) {
        return json({ skipped: `reminder ${timing} is not the emailed one` });
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
        daysAhead: timing === '72h' ? 3 : timing === '48h' ? 2 : 1,
        where: isMobile
          ? { kind: 'mobile', address: booking.client_address?.trim() || null }
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
