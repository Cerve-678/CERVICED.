// Where a bank dispute on one of the provider's own payments stands, and the
// line their payout list shows for it. Without this the list said "Returned"
// for a payout taken back for a dispute, and kept saying it after CERVICED
// won and paid them back (Provider Terms §9 "Bank disputes").

/** One row from provider_bank_dispute_states(): one dispute touching one booking or fee. */
export interface BankDisputeStateRow {
  bookingId: string;
  /** null for the booking's own payment; the fee charge's id for a late/no-show fee. */
  feeChargeId: string | null;
  role: 'disputed' | 'frozen';
  closed: boolean;
  outcome: 'won' | 'lost' | null;
  paidBackPence: number;
}

/**
 * open      a dispute on this payment is open
 * matching  the payment is disputed and CERVICED hasn't yet said which booking it is about
 * lost      the bank decided for the client
 * won       CERVICED won; paidBackPence is what was returned to the provider
 */
export type BankDisputeStage = 'open' | 'matching' | 'lost' | 'won';
export interface BankDisputeState { stage: BankDisputeStage; paidBackPence: number }

const PRIORITY: Record<BankDisputeStage, number> = { open: 3, matching: 2, lost: 1, won: 0 };

function stageOf(row: BankDisputeStateRow): BankDisputeStage | null {
  if (row.role === 'frozen') {
    // A frozen booking waits for CERVICED to match the dispute. Won before
    // anyone matched it: nothing was taken, the payout carries on. Lost: it
    // still waits until someone matches it.
    if (row.closed && row.outcome === 'won') return null;
    return 'matching';
  }
  if (!row.closed) return 'open';
  return row.outcome === 'lost' ? 'lost' : 'won';
}

/** Folds the rows into one state per booking payment and one per fee charge.
 *  With more than one dispute, the one still needing something wins. */
export function bankDisputeStates(rows: readonly BankDisputeStateRow[]): {
  byBooking: Map<string, BankDisputeState>;
  byFee: Map<string, BankDisputeState>;
} {
  const byBooking = new Map<string, BankDisputeState>();
  const byFee = new Map<string, BankDisputeState>();
  for (const row of rows) {
    const stage = stageOf(row);
    if (!stage) continue;
    const map = row.feeChargeId ? byFee : byBooking;
    const key = row.feeChargeId ?? row.bookingId;
    const current = map.get(key);
    const paidBackPence = (current?.paidBackPence ?? 0) + (stage === 'won' ? row.paidBackPence : 0);
    const next = !current || PRIORITY[stage] > PRIORITY[current.stage] ? stage : current.stage;
    map.set(key, { stage: next, paidBackPence });
  }
  return { byBooking, byFee };
}

type PayoutStatus = 'pending' | 'held' | 'transferred' | 'failed' | 'cancelled' | 'reversed';

/** The booking payment's line, or null to show its normal payout status. */
export function bookingDisputeLabel(state: BankDisputeState | undefined, payoutStatus: PayoutStatus): string | null {
  if (!state) return null;
  switch (state.stage) {
    case 'open': return payoutStatus === 'held' || payoutStatus === 'pending' ? 'On hold · bank dispute' : 'Taken back · bank dispute open';
    case 'matching': return 'On hold · bank dispute on this payment';
    case 'lost': return payoutStatus === 'cancelled' ? 'Not paid · bank dispute lost' : 'Taken back · bank dispute lost';
    case 'won': return state.paidBackPence > 0 ? 'Paid back · dispute won' : null;
  }
}

/** A late/no-show fee's line, or null to show its normal payout status.
 *  A fee taken back for a dispute CERVICED won is paid back by support, not
 *  automatically, so it says it is on its way rather than done. */
export function feeDisputeLabel(state: BankDisputeState | undefined, payoutStatus: PayoutStatus): string | null {
  if (!state) return null;
  switch (state.stage) {
    case 'open':
    case 'matching': return payoutStatus === 'reversed' ? 'Taken back · bank dispute open' : 'On hold · bank dispute';
    case 'lost': return payoutStatus === 'reversed' ? 'Taken back · bank dispute lost' : 'Not paid · bank dispute lost';
    case 'won': return payoutStatus === 'reversed' ? 'Dispute won · being paid back' : null;
  }
}
