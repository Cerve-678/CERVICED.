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
