// What admin_dashboard_overview(p_days) returns:
// supabase/migrations/20261103110000_admin_dashboard_and_dev_tools_admin_only.sql.
// Counts only, no personal fields. "_prev" is the same-length period just
// before this one. Money is pence. Admin-only.

export type AdminDashboardPeriod = 7 | 30 | 90;

export interface AdminDashboardWeek {
  /** Monday of the week, YYYY-MM-DD. */
  week_start: string;
  accounts: number;
  providers: number;
}

export interface AdminDashboardOverview {
  period_days: number;
  generated_at: string;
  accounts: {
    total: number;
    new: number;
    new_prev: number;
    clients_total: number;
    clients_new: number;
    clients_new_prev: number;
    /** Accounts that signed in during the period. */
    active: number;
    deleted: number;
  };
  /** Profiles people made themselves; scraped listings are counted apart. */
  providers: {
    total: number;
    new: number;
    new_prev: number;
    live: number;
    not_live: number;
    link_only: number;
    listings_unclaimed: number;
    claims_pending: number;
  };
  /** Twelve weeks, oldest first, ending with the current week. */
  weekly: AdminDashboardWeek[];
  bookings: {
    made: number;
    made_prev: number;
    completed: number;
    cancelled: number;
    upcoming: number;
  };
  money: {
    paid_in_pence: number;
    paid_in_prev_pence: number;
    fees_pence: number;
    refunded_pence: number;
  };
  problems: {
    jobs_failed_24h: number;
    jobs_failing: Array<{ name: string; count: number }>;
    payouts_failed: number;
    emails_failing: number;
    checkouts_abandoned: number;
    support_open: number;
    refunds_open: number;
    refunds_need_you: number;
  };
}
