import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';
import type { AdminDashboardOverview, AdminDashboardPeriod } from '../../types/adminDashboard';

// Wording and grouping for the admin dashboard. Display only: every number
// comes from admin_dashboard_overview(), which refuses non-admins.

export const DASHBOARD_PERIODS: Array<{ days: AdminDashboardPeriod; label: string }> = [
  { days: 7, label: '7 DAYS' },
  { days: 30, label: '30 DAYS' },
  { days: 90, label: '90 DAYS' },
];

/** "1,284" up to 10,000, then "12.9K" / "1.2M". */
export function formatCount(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) < 10_000) return v.toLocaleString('en-GB');
  if (Math.abs(v) < 1_000_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export type DeltaTone = 'good' | 'bad' | 'flat';

export interface DeltaView {
  /** "▲ 4 on the 30 days before" — the arrow carries direction without colour. */
  text: string;
  tone: DeltaTone;
}

/**
 * How this period compares with the one before it. `upIsGood` is false for
 * things like cancellations, where more is worse.
 */
export function describeDelta(
  current: number,
  previous: number,
  days: number,
  opts: { upIsGood?: boolean; format?: (n: number) => string } = {},
): DeltaView {
  const { upIsGood = true, format = formatCount } = opts;
  const diff = (Number(current) || 0) - (Number(previous) || 0);
  const span = `the ${days} days before`;
  if (diff === 0) return { text: `Same as ${span}`, tone: 'flat' };
  const up = diff > 0;
  return {
    text: `${up ? '▲' : '▼'} ${format(Math.abs(diff))} on ${span}`,
    tone: up === upIsGood ? 'good' : 'bad',
  };
}

/** "2 Nov" for a week's Monday. */
export function weekLabel(weekStart: string): string {
  return formatShortDayDate(weekStart).replace(/^\S+ /, '');
}

export type ProblemSeverity = 'critical' | 'warning' | 'good';

export interface ProblemRow {
  id: string;
  label: string;
  count: number;
  severity: ProblemSeverity;
  /** One plain line under the label, or null. */
  detail: string | null;
  /** Where tapping goes, if anywhere. */
  target: 'money' | null;
}

/**
 * The problems list, worst first. A row at zero still shows, as "good", so
 * "nothing failed" is visible rather than inferred from a missing row.
 */
export function buildProblemRows(p: AdminDashboardOverview['problems']): ProblemRow[] {
  const jobs = p.jobs_failing.slice(0, 3).map(j => `${j.name} (${j.count})`).join(', ');
  const rows: ProblemRow[] = [
    {
      id: 'jobs',
      label: 'Background jobs that failed, last 24 hours',
      count: p.jobs_failed_24h,
      severity: p.jobs_failed_24h > 0 ? 'critical' : 'good',
      detail: p.jobs_failed_24h > 0 && jobs ? jobs : null,
      target: null,
    },
    {
      id: 'payouts',
      label: 'Payouts to providers that failed',
      count: p.payouts_failed,
      severity: p.payouts_failed > 0 ? 'critical' : 'good',
      detail: p.payouts_failed > 0 ? 'Out of automatic retries. Open Money to send them again.' : null,
      target: p.payouts_failed > 0 ? 'money' : null,
    },
    {
      id: 'emails',
      label: "Booking confirmation emails that didn't send, last 7 days",
      count: p.emails_failing,
      severity: p.emails_failing > 0 ? 'warning' : 'good',
      detail: p.emails_failing > 0 ? 'They retry on their own. Still here means the retries are failing too.' : null,
      target: null,
    },
    {
      id: 'refunds',
      label: 'Refund requests passed to CERVICED',
      count: p.refunds_need_you,
      severity: p.refunds_need_you > 0 ? 'warning' : 'good',
      detail: p.refunds_open > p.refunds_need_you
        ? `${p.refunds_open - p.refunds_need_you} more still with the provider.`
        : null,
      target: p.refunds_need_you > 0 ? 'money' : null,
    },
    {
      id: 'support',
      label: 'Open support requests',
      count: p.support_open,
      severity: p.support_open > 0 ? 'warning' : 'good',
      detail: p.support_open > 0 ? 'Sent to the support inbox when they came in.' : null,
      target: null,
    },
  ];
  const rank: Record<ProblemSeverity, number> = { critical: 0, warning: 1, good: 2 };
  return rows.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** "Updated 11:52am" from the server's timestamp; empty if it can't be read. */
export function updatedLabel(generatedAt: string): string {
  const time = formatTime12Safe(new Date(generatedAt));
  return time ? `Updated ${time}` : '';
}

/** "£1,609.81", or "£80" when there are no pence. */
export function pounds(pence: number): string {
  const text = ((Number(pence) || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `£${text.replace(/\.00$/, '')}`;
}
