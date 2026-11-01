// What admin_money_overview() returns: money_needing_attention() in
// supabase/migrations/20261025211000_payout_retries_and_alerts.sql. Amounts
// are pence. Admin-only.

export type PayoutFailureCause = 'platform_balance' | 'provider_account' | 'other';

export interface AdminFailedPayout {
  payout_id: string;
  booking_id: string;
  provider_id: string;
  provider_name: string | null;
  amount_pence: number;
  /** 'held' = waiting for its next automatic try; 'failed' = out of tries. */
  status: 'held' | 'failed';
  attempt_count: number;
  failure_cause: PayoutFailureCause | null;
  last_failed_at: string | null;
  next_try_at: string | null;
  service_name: string | null;
  booking_date: string | null;
}

export interface AdminOwedShortfall {
  shortfall_id: string;
  provider_id: string;
  provider_name: string | null;
  owed_pence: number;
  source: 'refund' | 'cancellation' | 'fee_refund' | 'bank_dispute';
  created_at: string;
  service_name: string | null;
}

export interface AdminRefundRequest {
  request_id: string;
  booking_id: string;
  status: 'with_provider' | 'under_review';
  reason: string;
  message: string | null;
  provider_note: string | null;
  created_at: string;
  passed_to_cerviced_at: string | null;
  client_name: string | null;
  provider_name: string | null;
  service_name: string | null;
  booking_date: string | null;
  paid_pence: number;
  refunded_pence: number;
}

export interface AdminMoneyOverview {
  failed_count: number;
  failed: AdminFailedPayout[];
  owed_count: number;
  owed: AdminOwedShortfall[];
  refunds_count: number;
  refunds: AdminRefundRequest[];
}
