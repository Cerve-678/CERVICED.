/**
 * The link-only Dashboard's derived pieces — today's hours, this week vs
 * last week, Profile strength and the "Becca noticed" line. Pure, so each is testable without the phone calendar or the
 * database. Design: https://claude.ai/artifact/DrnMGFGGk5HJZW9ij1F9FN
 */
import type { DbProviderAvailability, DbProviderDailyStat } from '../../types/database';
import { DAY_NAMES_FULL, dateToYMD, formatTime12Safe } from '../../utils/dateUtils';
import { DASHBOARD_WEEK_DAYS, hoursFor, startOfDay } from './diaryDays';
import { sumLinkOnlyStats, type DayBar, type LinkOnlyTotals } from './linkOnlyAnalytics';

/** "Open today 9am–6pm", "Closed today", or null when there are no hours
 *  for today. */
export function todayHoursLabel(hours: readonly DbProviderAvailability[], today: Date): string | null {
  const row = hoursFor(hours, today);
  if (!row) return null;
  if (row.is_closed) return 'Closed today';
  const open = compactTime(row.open_time);
  const close = compactTime(row.close_time);
  return open && close ? `Open today ${open}–${close}` : null;
}

/** "09:00:00" → "9am", "17:30:00" → "5:30pm". Takes a Date too. */
export function compactTime(value: string | Date): string | null {
  return formatTime12Safe(value)?.replace(':00', '').replace(/\s/g, '').replace(/^0/, '').toLowerCase() ?? null;
}

export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export interface WeekComparison {
  thisWeek: LinkOnlyTotals;
  lastWeek: LinkOnlyTotals;
}

/** Splits 14 days of counters into the last seven days (ending today) and
 *  the seven before that. Days with no row count as zero. */
export function compareWeeks(rows: readonly DbProviderDailyStat[], today: Date): WeekComparison {
  const cutoff = startOfDay(today);
  cutoff.setDate(cutoff.getDate() - (DASHBOARD_WEEK_DAYS - 1));
  const cutoffYmd = dateToYMD(cutoff);
  return {
    thisWeek: sumLinkOnlyStats(rows.filter(row => row.day >= cutoffYmd)),
    lastWeek: sumLinkOnlyStats(rows.filter(row => row.day < cutoffYmd)),
  };
}

/** "▲ 4", "▼ 9", or null when nothing changed. */
export function trendLabel(now: number, before: number): { text: string; up: boolean } | null {
  const diff = now - before;
  if (diff === 0) return null;
  return { text: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}`, up: diff > 0 };
}

/** One fact from their own numbers: the day with the most Book taps. Only
 *  when there's enough to mean something (3+ taps) and one day clearly led. */
export function busiestBookTapLine(bars: readonly DayBar[], today: Date): string | null {
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  if (total < 3) return null;
  const max = Math.max(...bars.map(bar => bar.value));
  const leaders = bars.filter(bar => bar.value === max);
  if (leaders.length !== 1) return null;
  const leader = leaders[0]!;
  const [y, m, d] = leader.ymd.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const name = leader.ymd === dateToYMD(today) ? 'Today' : DAY_NAMES_FULL[date.getDay()];
  return `${name} brought you the most Book taps: ${max} of your ${total} this week.`;
}

export type ProfileStrengthKey =
  | 'logo' | 'about' | 'hours'
  | 'specialities' | 'instagram' | 'policies' | 'photos' | 'accessibility' | 'payments';

export interface ProfileStrengthItem {
  key: ProfileStrengthKey;
  label: string;
  hint: string;
  /** Short name for the ticked-off chip. */
  doneLabel: string;
  /** Lower-case name for the "2 more: …" line. */
  shortLabel: string;
  done: boolean;
}

/** Photos that fill the profile's grid. */
export const FULL_PORTFOLIO_COUNT = 9;

export interface ProfileStrengthInput {
  logoSet: boolean;
  aboutSet: boolean;
  hoursSet: boolean;
  portfolioCount: number;
  specialityCount: number;
  instagram: string | null;
  policiesSet: boolean;
  accessibilityNotes: string | null;
  paymentMethods: readonly string[] | null;
}

/** Everything that makes a link-only profile complete: the four go-live
 *  steps plus the optional extras clients use to choose. */
export function buildProfileStrength(input: ProfileStrengthInput): { items: ProfileStrengthItem[]; percent: number } {
  const photosToGo = Math.max(0, FULL_PORTFOLIO_COUNT - input.portfolioCount);
  const items: ProfileStrengthItem[] = [
    { key: 'logo', label: 'Add your logo', hint: 'It shows on your profile and in search', doneLabel: 'Logo', shortLabel: 'logo', done: input.logoSet },
    { key: 'about', label: 'Write your About', hint: 'A few lines about you and your work', doneLabel: 'About', shortLabel: 'About', done: input.aboutSet },
    { key: 'hours', label: 'Set your opening hours', hint: 'Shown to clients on your profile', doneLabel: 'Opening hours', shortLabel: 'opening hours', done: input.hoursSet },
    { key: 'specialities', label: 'Add your specialities', hint: 'Show up in more Search filters', doneLabel: 'Specialities', shortLabel: 'specialities', done: input.specialityCount > 0 },
    { key: 'instagram', label: 'Link your Instagram', hint: 'Clients can see more of your work', doneLabel: 'Instagram', shortLabel: 'Instagram', done: !!input.instagram?.trim() },
    { key: 'policies', label: 'Add your policies', hint: 'Cancellation and deposit rules', doneLabel: 'Policies', shortLabel: 'policies', done: input.policiesSet },
    {
      key: 'photos',
      label: photosToGo === 1 ? 'Add 1 more photo' : `Add ${photosToGo} more photos`,
      hint: `${input.portfolioCount} so far, ${FULL_PORTFOLIO_COUNT} fills your profile grid`,
      doneLabel: `${FULL_PORTFOLIO_COUNT}+ photos`,
      shortLabel: photosToGo === 1 ? '1 more photo' : `${photosToGo} more photos`,
      done: photosToGo === 0,
    },
    { key: 'accessibility', label: 'Add accessibility info', hint: 'Step-free access, parking and more', doneLabel: 'Accessibility', shortLabel: 'accessibility info', done: !!input.accessibilityNotes?.trim() },
    { key: 'payments', label: 'State preferred payment method', hint: 'How clients can pay you', doneLabel: 'Payment method', shortLabel: 'payment method', done: (input.paymentMethods?.length ?? 0) > 0 },
  ];
  const done = items.filter(item => item.done).length;
  return { items, percent: Math.round((done / items.length) * 100) };
}

/** "2 more: specialities, 3 more photos" for what's left after the next
 *  step, naming at most three. Null when nothing else is left. */
export function remainingStepsLine(rest: readonly ProfileStrengthItem[]): string | null {
  if (rest.length === 0) return null;
  const names = rest.slice(0, 3).map(item => item.shortLabel).join(', ');
  return `${rest.length} more: ${names}${rest.length > 3 ? '…' : ''}`;
}
