import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261103000000_provider_told_request_confirmed.sql'),
  'utf8',
);

describe('provider notice when a request is confirmed', () => {
  it('fires only on pending to confirmed', () => {
    expect(sql).toContain("WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')");
  });

  it('goes to the provider, once per booking and once per group', () => {
    expect(sql).toContain("'medium', FALSE, NEW.id, NEW.provider_id, 'provider'");
    expect(sql).toContain("n.recipient_role = 'provider'");
    expect(sql).toContain('v_representative_id IS DISTINCT FROM NEW.id');
  });

  it("uses a notification type the table's constraint already allows", () => {
    expect(sql).toContain("v_provider_user_id, 'booking_confirmed'");
  });
});

describe('the provider notice reads like an instant booking', () => {
  const follow = fs.readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261103050000_provider_request_confirmed_reads_like_new_booking.sql'),
    'utf8',
  );

  it('uses the same title, priority and sentence as claim_cart_booking_slots', () => {
    expect(follow).toContain("'booking_confirmed', 'New Booking'");
    expect(follow).toContain("'. Check their client profile for anything important.'");
    expect(follow).toContain("'high', FALSE, NEW.id, NEW.provider_id, 'provider'");
  });

  it('refuses to apply over a changed live function', () => {
    expect(follow).toContain("<> '3b5426975cf93433a0be7b25a7a9a47c'");
  });
});
