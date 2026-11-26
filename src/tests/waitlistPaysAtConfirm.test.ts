import { readFileSync } from 'fs';
import { join } from 'path';
import {
  formatCountdown,
  heldTimeRangeLabel,
  holdSecondsLeft,
  placeInLineLabel,
  sortWaitlistPlaces,
  waitlistCardState,
  buildWaitlistHoldCartItem,
  nextWaitingFor,
  firstNameOf,
  isOutsideHoursRefusal,
  providerOfferRefusalMessage,
  waitlistDatesLabel,
} from '../features/bookings/waitlist';
import type { MyWaitlistPlace, RebookableService } from '../services/databaseService';
import { formatTime12Safe } from '../utils/dateUtils';

const NOW = new Date('2026-11-10T14:00:00Z').getTime();

function place(over: Partial<MyWaitlistPlace> = {}): MyWaitlistPlace {
  return {
    id: 'w1',
    providerId: 'p1',
    serviceId: 's1',
    serviceName: 'Classic Full Set',
    providerName: 'Studio Ren',
    preferredDates: null,
    notes: null,
    status: 'waiting',
    placeInLine: 2,
    createdAt: '2026-11-01T10:00:00Z',
    holdBookingId: null,
    offeredBookingId: null,
    offeredDate: null,
    offeredTime: null,
    offerExpiresAt: null,
    offerEndedAt: null,
    ...over,
  };
}

describe('how a waitlist place reads', () => {
  it('counts places as people say them', () => {
    expect(placeInLineLabel(1)).toBe('1st in line');
    expect(placeInLineLabel(2)).toBe('2nd in line');
    expect(placeInLineLabel(3)).toBe('3rd in line');
    expect(placeInLineLabel(11)).toBe('11th in line');
    expect(placeInLineLabel(22)).toBe('22nd in line');
    expect(placeInLineLabel(null)).toBe('In line');
  });

  it('says the dates the client gave', () => {
    expect(waitlistDatesLabel(null)).toBe('Any day');
    expect(waitlistDatesLabel(['2026-11-18', '2026-11-30'])).toBe('18 – 30 Nov');
    expect(waitlistDatesLabel(['2026-11-18'])).toBe('18 Nov onward');
  });

  it('gives a held slot its start and end time, or just the start', () => {
    expect(heldTimeRangeLabel('14:00:00', 120)).toBe(`${formatTime12Safe('14:00')} – ${formatTime12Safe('16:00')}`);
    expect(heldTimeRangeLabel('14:00', null)).toBe(formatTime12Safe('14:00'));
    expect(heldTimeRangeLabel(null, 60)).toBeNull();
  });

  it('counts down whole seconds and never below zero', () => {
    expect(holdSecondsLeft('2026-11-10T14:15:00Z', NOW)).toBe(900);
    expect(holdSecondsLeft('2026-11-10T13:59:00Z', NOW)).toBe(0);
    expect(holdSecondsLeft(null, NOW)).toBe(0);
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('which card a place shows', () => {
  const held = place({
    status: 'notified', holdBookingId: 'b1', offeredBookingId: 'b1',
    offerExpiresAt: '2026-11-10T14:10:00Z', placeInLine: null,
  });

  it('is held only while the hold has time left', () => {
    expect(waitlistCardState(held, NOW)).toBe('held');
    expect(waitlistCardState(held, NOW + 11 * 60_000)).toBe('gone');
  });

  it('is gone once the hold ended, and waiting before any offer', () => {
    expect(waitlistCardState(place({ status: 'expired' }), NOW)).toBe('gone');
    expect(waitlistCardState(place(), NOW)).toBe('waiting');
  });

  it('puts held first, then waiting, then ended', () => {
    const order = sortWaitlistPlaces(
      [place({ id: 'gone', status: 'expired' }), place({ id: 'wait' }), { ...held, id: 'held' }],
      NOW,
    ).map(p => p.id);
    expect(order).toEqual(['held', 'wait', 'gone']);
  });
});

describe('paying for a held slot', () => {
  const live: RebookableService = {
    id: 's1', name: 'Classic Full Set', price: 65, durationMinutes: 120, categoryName: 'Lashes',
    providerSlug: 'studio-ren', providerDisplayName: 'Studio Ren', addOns: [],
  };

  it('goes into the cart at its fixed time, carrying the hold', () => {
    const item = buildWaitlistHoldCartItem({
      holdBookingId: 'b1', holdExpiresAt: '2026-11-10T14:15:00Z',
      bookingDate: '2026-11-20', bookingTime: '14:00:00',
      providerId: 'p1', providerImage: 'https://x/logo.png', live,
    });
    expect(item).toMatchObject({
      providerId: 'p1',
      selectedDate: '2026-11-20',
      selectedTime: '14:00',
      service: { id: 's1', price: 65, duration: '2h' },
      waitlistHold: { bookingId: 'b1', expiresAt: '2026-11-10T14:15:00Z' },
      forceNewInstance: true,
    });
  });
});

describe('the migration keeps waitlist slots paid for', () => {
  // Comments describe the old bugs by name, so assertions read the code only.
  const sql = readFileSync(
    join(__dirname, '..', '..', 'supabase/migrations/20261113210000_waitlist_pays_at_confirm.sql'),
    'utf8',
  ).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  const fn = (name: string) => {
    const start = sql.indexOf(`FUNCTION public.${name}(`);
    expect(start).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf('$function$;', start));
  };

  it('drops the claim that booked a slot with nothing paid', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.claim_waitlist_hold(uuid);');
  });

  it('never inserts a pending booking straight from the waitlist', () => {
    const offer = fn('offer_waitlist_slot');
    // The row is inserted as a hold; only finalize_checkout makes it a booking.
    expect(offer).toContain("w.user_id, w.provider_id, v_service.id, 'on_hold'");
    expect(offer).not.toContain("v_service.id, 'pending'");
    expect(fn('invite_next_waitlist_entry')).not.toContain('INSERT INTO public.bookings');
  });

  it('lets checkout reuse the held row without outlasting it', () => {
    const prepare = fn('prepare_checkout');
    expect(prepare).toContain("waitlist_hold_id");
    expect(prepare).toContain('v_expiry := LEAST(v_expiry, v_wl_hold.hold_expires_at)');
    expect(prepare).toContain('b.user_id = auth.uid()');
  });

  it('refuses a second checkout while a payment on the hold is going through', () => {
    // Re-pointing the hold at a new checkout would leave the first payment
    // finalising with no booking.
    const prepare = fn('prepare_checkout');
    expect(prepare).toContain('cb.id = v_wl_hold.hold_batch_id');
    expect(prepare).toContain('cb.payment_intent_id IS NOT NULL');
  });

  it("keeps checkout's policy and promo rules, and applies them to the held row too", () => {
    // prepare_checkout was rebuilt on top of 20261113090000 (policy snapshot
    // and consent) and 20261113100000 (promo priced at checkout); losing
    // either would charge full price or bind a client to terms they never saw.
    const prepare = fn('prepare_checkout');
    expect(prepare).toContain('changed their booking policy after you added');
    expect(prepare).toContain('v_subtotal := v_service.price - v_discount + v_add_ons_total');
    expect(prepare).toContain('policy_snapshot, policy_accepted_at, promotion_id, promo_discount');
    expect(prepare).toContain('base_price = v_service.price - v_discount');
    expect(prepare).toContain('policy_snapshot = v_policy_snapshot');
    expect(prepare).toContain('promo_discount = v_discount');
  });

  it('writes the names on a waitlist row on the server', () => {
    const snapshots = fn('set_waitlist_entry_snapshots');
    expect(snapshots).toContain('p.has_gone_live = true');
    expect(snapshots).toContain('NEW.user_name_snapshot');
    expect(sql).toContain('BEFORE INSERT ON public.provider_waitlist');
  });

  it("leaves a waitlist hold to the waitlist's own expiry", () => {
    expect(fn('expire_cart_holds').match(/AND b\.waitlist_entry_id IS NULL/g)).toHaveLength(2);
    expect(fn('cancel_checkout')).toContain('SET hold_batch_id = NULL');
  });

  it('only calls the notification formatter that exists', () => {
    // format_notification_time takes a time only. A (date, text) call inside
    // the invite's exception handler made every offer fail silently.
    expect(sql).not.toMatch(/format_notification_time\(\s*[^)(,]*(date|p_booking_date|h\.booking_date)\s*,/);
    expect(sql).not.toMatch(/to_char\(\s*[a-z_.]+\s*\)/i);
  });

  it('stops clients editing their own place in line', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Waitlist participants can see and manage their entries"');
    expect(sql).not.toMatch(/ON public\.provider_waitlist\s+FOR (UPDATE|ALL)/);
  });
});

describe('a held slot is paid for through the Cart', () => {
  const HOOK = readFileSync(join(__dirname, '../features/bookings/useWaitlistHoldActions.ts'), 'utf8');
  const BOOKINGS = readFileSync(join(__dirname, '../screens/client/BookingsScreen.tsx'), 'utf8');
  const PROFILE = readFileSync(join(__dirname, '../screens/client/ProviderProfileScreen.tsx'), 'utf8');

  it('puts the held slot in the cart and opens the Cart', () => {
    expect(HOOK).toContain('addToCart(buildWaitlistHoldCartItem({');
    expect(HOOK).toContain('openCart();');
  });

  it('does it the same way from Bookings and from the provider page', () => {
    expect(BOOKINGS).toContain('useWaitlistHoldActions({');
    expect(PROFILE).toContain('useWaitlistHoldActions({');
  });
});

describe('the "slot opened" notification opens the ticket on the provider page', () => {
  const TAP = readFileSync(join(__dirname, '../services/notificationTapHandler.ts'), 'utf8');
  const LIST = readFileSync(join(__dirname, '../screens/shared/NotificationsScreen.tsx'), 'utf8');
  const ACTIVITY = readFileSync(join(__dirname, '../screens/client/ActivityCentreScreen.tsx'), 'utf8');
  const PROFILE = readFileSync(join(__dirname, '../screens/client/ProviderProfileScreen.tsx'), 'utf8');

  it('sends a push tap, the in-app list and the Activity Centre there with the hold', () => {
    expect(TAP).toContain("openWaitlistHoldId: booking_id");
    expect(LIST).toContain("openWaitlistHoldId: bookingId");
    expect(ACTIVITY).toContain("openWaitlistHoldId: target.bookingId");
  });

  it('opens that hold\'s ticket, or says the slot has gone', () => {
    expect(PROFILE).toContain('place.holdBookingId === openWaitlistHoldId');
    expect(PROFILE).toContain("tr('discover.profile.slotGoneTitle')");
  });
});

describe("who a freed slot goes to next", () => {
  const e = (id: string, service_id: string | null, position: number, status = 'waiting') =>
    ({ id, service_id, position, status, created_at: `2026-11-0${position}T10:00:00Z` });

  it('picks the same service first, then any service, in queue order', () => {
    const list = [e('any1', null, 1), e('s2', 's', 3), e('s1', 's', 2), e('other', 't', 1)];
    expect(nextWaitingFor(list, 's')?.id).toBe('s1');
    expect(nextWaitingFor(list, 'u')?.id).toBe('any1');
  });

  it('skips the client holding it and anyone not waiting', () => {
    const list = [e('held', 's', 1, 'notified'), e('s2', 's', 2), e('s3', 's', 3)];
    expect(nextWaitingFor(list, 's', 's2')?.id).toBe('s3');
    expect(nextWaitingFor([], 's')).toBeNull();
  });

  it('uses the first name', () => {
    expect(firstNameOf('Jo Martin')).toBe('Jo');
    expect(firstNameOf('  ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('a provider offering a time outside their hours', () => {
  it('is asked only when the refusal is about their own hours', () => {
    expect(isOutsideHoursRefusal({ code: 'P0001', message: "This appointment is outside the provider's working hours" })).toBe(true);
    expect(isOutsideHoursRefusal({ code: 'P0001', message: 'This service has to start by 3:30pm' })).toBe(true);
    expect(isOutsideHoursRefusal({ code: 'P0001', message: 'Provider is unavailable on this date' })).toBe(false);
    expect(isOutsideHoursRefusal({ code: '42501', message: "outside the provider's working hours" })).toBe(false);
    expect(isOutsideHoursRefusal(null)).toBe(false);
  });
});

describe("a provider's offer that clashes with their own booking", () => {
  it('says so in their words, and leaves every other refusal as it was', () => {
    expect(providerOfferRefusalMessage({ code: 'P0001', message: 'That time is no longer available' }, 'x'))
      .toBe('You already have a booking at that time. Pick another time.');
    expect(providerOfferRefusalMessage({ code: 'P0001', message: 'Provider is unavailable on this date' }, 'fallback')).toBe('fallback');
    expect(providerOfferRefusalMessage(null, 'fallback')).toBe('fallback');
  });
});
