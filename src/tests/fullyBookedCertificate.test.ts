import { readFileSync } from 'fs';
import { join } from 'path';
import { fullyBookedLine } from '../components/FullyBookedCertificate';

describe('the Fully Booked certificate line', () => {
  it('names the month it was for', () => {
    expect(fullyBookedLine('2026-11-30')).toBe('Every slot you opened for November has been booked.');
    // Filled mid-November with everything to the end of December booked.
    expect(fullyBookedLine('2026-12-31')).toBe('Every slot you opened for December has been booked.');
  });

  it('falls back to the date for anything that is not a month end', () => {
    expect(fullyBookedLine('2026-12-01')).toBe('Every slot you opened, up to Tuesday 1st December, has been booked.');
  });
});

// The rules the server keeps, read from the migration that makes them.
const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261101200000_fully_booked_certificate.sql'),
  'utf8',
);
const check = MIGRATION.slice(
  MIGRATION.indexOf('FUNCTION public.process_provider_fully_booked_alerts'),
  MIGRATION.indexOf('$function$;', MIGRATION.indexOf('FUNCTION public.process_provider_fully_booked_alerts')),
);

describe('noticing a schedule has filled', () => {
  it('uses the same free-slot check as the client profile', () => {
    expect(check).toContain('public.get_services_open_within(');
  });

  it('never counts a closed schedule, a link-only provider or one with nothing set up', () => {
    expect(check).toContain('AND NOT public.provider_schedule_is_closed(p.id)');
    expect(check).toContain("COALESCE(p.booking_mode, '') <> 'external'");
    expect(check).toContain('s.is_active = TRUE AND s.duration_minutes > 0');
  });

  it('notices a shorter run once, on the change to full, and not for a same-day refill', () => {
    expect(check).toContain('IF v_has_state AND v_was_full THEN');
    expect(check).toContain("v_open_since > now() - INTERVAL '24 hours'");
  });

  it('says nothing with under a week left to book, so month end before a release is never "full"', () => {
    expect(check).toContain('CONTINUE WHEN v_horizon < 7;');
    expect(check.indexOf('CONTINUE WHEN v_horizon < 7;')).toBeLessThan(check.indexOf('INSERT INTO public.provider_fully_booked_state'));
  });

  it('never calls a blocked-out diary with no bookings full', () => {
    expect(check).toContain("v_open := v_open OR NOT EXISTS (");
  });

  it('counts at most once a week, so a rolling window gaining a day does not keep re-awarding it', () => {
    expect(check).toContain("f.filled_at > now() - INTERVAL '7 days'");
  });

  it('logs one provider failing instead of stopping everyone', () => {
    expect(check).toContain("RAISE WARNING 'fully booked check failed for provider %");
  });

  it('gives a certificate only for a whole month, at most once a month', () => {
    expect(check).toContain('IF v_month_end - v_today + 1 >= 28');
    expect(check).toContain('f.certificate_month = date_trunc');
    expect(MIGRATION).toContain('provider_fully_booked_fills_one_certificate_a_month');
    const unseen = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.get_my_unseen_fully_booked'));
    expect(unseen.slice(0, 600)).toContain('f.certificate_month IS NOT NULL');
  });

  it('only sends a notification for a shorter run', () => {
    const short = check.slice(check.indexOf('CONTINUE WHEN NOT v_new_fill;'));
    expect(short).toContain("jsonb_build_object('kind', 'fully_booked'");
    expect(short).not.toContain('certificate_month');
  });

  it('earns achievements only from whole months', () => {
    const ach = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.get_my_provider_achievements'));
    expect(ach).toContain('WHERE f.provider_id = v_provider_id AND f.certificate_month IS NOT NULL');
  });

  it('only tells them during the day', () => {
    expect(check.lastIndexOf('CONTINUE WHEN NOT v_daytime')).toBeLessThan(check.indexOf('INSERT INTO public.provider_fully_booked_fills'));
  });

  it('keeps what was recorded private, and checks every hour', () => {
    for (const table of ['provider_fully_booked_state', 'provider_fully_booked_fills']) {
      expect(MIGRATION).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(MIGRATION).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`);
    }
    expect(MIGRATION).toContain("schedule := '40 * * * *'");
  });

  it('refuses to apply over a function that changed after this was written', () => {
    expect(MIGRATION.match(/rebuild from live/g)).toHaveLength(2);
  });
});
