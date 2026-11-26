import { settleStuckFees, STUCK_FEE_AFTER_MS } from './feePayRequest.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// booking-fee inserts a fee row at 'processing' and then charges the saved
// card. If it stops part-way the row is left behind: it blocks every other fee
// on the visit, and if Stripe already took the money, the webhook can't record
// it (recordFeePaid only accepts a payment already bound to the row).

type Row = Record<string, unknown>;

/** Just enough of the Supabase query builder for feePayRequest's calls. */
function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: ((row: Row) => boolean)[] = [];
      let op: 'select' | 'update' | 'insert' = 'select';
      let payload: Row = {};
      let single = false;
      let limit = Infinity;
      const run = () => {
        if (op === 'insert') {
          rows.push({ ...payload });
          return { data: null, error: null };
        }
        const hit = rows.filter(row => filters.every(f => f(row))).slice(0, limit);
        if (op === 'update') hit.forEach(row => Object.assign(row, payload));
        // Copies, like a real read: a caller's row must not change under it.
        const copies = hit.map(row => ({ ...row }));
        const data = single ? copies[0] ?? null : copies;
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, value: unknown) => { filters.push(row => row[col] === value); return builder; },
        is: (col: string, value: unknown) => { filters.push(row => (row[col] ?? null) === value); return builder; },
        lte: (col: string, value: string) => { filters.push(row => String(row[col]) <= value); return builder; },
        order: () => builder,
        limit: (n: number) => { limit = n; return builder; },
        update: (values: Row) => { op = 'update'; payload = values; return builder; },
        insert: (values: Row) => { op = 'insert'; payload = values; return builder; },
        maybeSingle: () => { single = true; return Promise.resolve(run()); },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return builder;
    },
  };
}

function fakeStripe(intents: Row[]) {
  const cancelled: string[] = [];
  return {
    cancelled,
    paymentIntents: {
      retrieve: async (id: string) => {
        const intent = intents.find(i => i['id'] === id);
        if (!intent) throw new Error(`no intent ${id}`);
        return intent;
      },
      list: (params: { customer: string }) => ({
        async *[Symbol.asyncIterator]() {
          for (const intent of intents) if (intent['customer'] === params.customer) yield intent;
        },
      }),
      cancel: async (id: string) => { cancelled.push(id); return { id, status: 'canceled' }; },
    },
  };
}

const old = new Date(Date.now() - STUCK_FEE_AFTER_MS - 60_000).toISOString();

function world(feeOverrides: Row = {}, intents: Row[] = []) {
  const tables: Record<string, Row[]> = {
    booking_fee_charges: [{
      id: 'fee1', booking_id: 'b1', provider_id: 'p1', client_user_id: 'c1', kind: 'late', amount_pence: 1500,
      status: 'processing', payment_intent_id: null, created_at: old, ...feeOverrides,
    }],
    bookings: [{ id: 'b1', payment_intent_id: 'pi_booking', provider_name_snapshot: 'Lash Lab', service_name_snapshot: 'Lash lift' }],
    providers: [{ id: 'p1', user_id: 'provider-user' }],
    notifications: [],
  };
  const stripe = fakeStripe([
    { id: 'pi_booking', customer: 'cus_1', status: 'succeeded', metadata: {} },
    ...intents,
  ]);
  return { tables, stripe, admin: fakeAdmin(tables) };
}

describe('fee charges left at processing', () => {
  it('records a fee Stripe took but the row never heard about, and tells the client', async () => {
    const { tables, stripe, admin } = world({}, [{
      id: 'pi_fee', customer: 'cus_1', status: 'succeeded', amount_received: 1500, currency: 'gbp',
      metadata: { fee_charge_id: 'fee1' }, latest_charge: { balance_transaction: { fee: 43 } },
    }]);
    const result = await settleStuckFees(admin as never, stripe as never, 10);
    expect(result).toEqual({ charged: 1, released: 0 });
    const fee = tables['booking_fee_charges']![0]!;
    expect(fee).toMatchObject({ status: 'succeeded', payment_intent_id: 'pi_fee', stripe_fee_pence: 43, payout_pence: 1457, payout_status: 'held' });
    expect(tables['notifications']).toEqual([expect.objectContaining({ user_id: 'c1', type: 'fee_charged' })]);
  });

  it('frees a fee that never reached Stripe, and tells the provider nothing was taken', async () => {
    const { tables, stripe, admin } = world();
    expect(await settleStuckFees(admin as never, stripe as never, 10)).toEqual({ charged: 0, released: 1 });
    expect(tables['booking_fee_charges']![0]).toMatchObject({ status: 'failed', failure_reason: 'stopped_before_charging' });
    expect(tables['notifications']).toEqual([expect.objectContaining({ user_id: 'provider-user', type: 'fee_payment_lapsed' })]);
  });

  it("cancels a payment still waiting on the client's bank before freeing the row", async () => {
    const { tables, stripe, admin } = world({ payment_intent_id: 'pi_fee' }, [
      { id: 'pi_fee', customer: 'cus_1', status: 'requires_action', metadata: { fee_charge_id: 'fee1' } },
    ]);
    expect(await settleStuckFees(admin as never, stripe as never, 10)).toEqual({ charged: 0, released: 1 });
    expect(stripe.cancelled).toEqual(['pi_fee']);
    expect(tables['booking_fee_charges']![0]).toMatchObject({ status: 'failed' });
  });

  it('leaves a payment that is still going through for the next run', async () => {
    const { tables, stripe, admin } = world({ payment_intent_id: 'pi_fee' }, [
      { id: 'pi_fee', customer: 'cus_1', status: 'processing', metadata: { fee_charge_id: 'fee1' } },
    ]);
    expect(await settleStuckFees(admin as never, stripe as never, 10)).toEqual({ charged: 0, released: 0 });
    expect(tables['booking_fee_charges']![0]).toMatchObject({ status: 'processing' });
    expect(stripe.cancelled).toEqual([]);
  });

  it("doesn't touch a row booking-fee may still be working on", async () => {
    const { tables, stripe, admin } = world({ created_at: new Date().toISOString() });
    expect(await settleStuckFees(admin as never, stripe as never, 10)).toEqual({ charged: 0, released: 0 });
    expect(tables['booking_fee_charges']![0]).toMatchObject({ status: 'processing' });
  });

  it('is started by the payouts job, whose gate waits for the same 15 minutes', () => {
    const repo = join(__dirname, '..', '..', '..');
    expect(readFileSync(join(repo, 'supabase/functions/release-payouts/index.ts'), 'utf8')).toContain('settleStuckFees(admin, stripe, BATCH_LIMIT)');
    const gate = readFileSync(join(repo, 'supabase/migrations/20261126160000_release_payouts_settles_stuck_fees.sql'), 'utf8');
    expect(gate).toContain("WHERE status = 'processing'");
    expect(gate).toContain(`created_at <= now() - interval '${STUCK_FEE_AFTER_MS / 60_000} minutes'`);
  });
});
