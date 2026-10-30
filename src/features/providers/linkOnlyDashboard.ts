/**
 * The link-only Dashboard's derived pieces — today's hours, this week vs
 * last week, Profile strength and the "Becca noticed" line. Pure, so each is testable without the phone calendar or the
 * database. Design: https://claude.ai/artifact/DrnMGFGGk5HJZW9ij1F9FN
 */
import type { DbProviderAvailability, DbProviderDailyStat } from '../../types/database';
import { dateToYMD, dayName, formatTime12Safe } from '../../utils/dateUtils';
import { tr, trp } from '../../i18n';
import { DASHBOARD_WEEK_DAYS, hoursFor, startOfDay } from './diaryDays';
import { sumLinkOnlyStats, type DayBar, type LinkOnlyTotals } from './linkOnlyAnalytics';

/** "Open today 9am–6pm", "Closed today", or null when there are no hours
 *  for today. */
export function todayHoursLabel(hours: readonly DbProviderAvailability[], today: Date): string | null {
  const row = hoursFor(hours, today);
  if (!row) return null;
  if (row.is_closed) return tr('providerProfile.dashboard.closedToday');
  const open = compactTime(row.open_time);
  const close = compactTime(row.close_time);
  return open && close ? tr('providerProfile.dashboard.openToday', { open, close }) : null;
}

/** "09:00:00" → "9am", "17:30:00" → "5:30pm". Takes a Date too. */
export function compactTime(value: string | Date): string | null {
  return formatTime12Safe(value)?.replace(':00', '').replace(/\s/g, '').replace(/^0/, '').toLowerCase() ?? null;
}

export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return tr('providerProfile.dashboard.goodMorning');
  if (hour < 18) return tr('providerProfile.dashboard.goodAfternoon');
  return tr('providerProfile.dashboard.goodEvening');
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
  const name = leader.ymd === dateToYMD(today) ? tr('providerProfile.dashboard.today') : dayName(date.getDay(), 'full');
  return tr('providerProfile.dashboard.busiestDay', { day: name, max, total });
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

/** The four lines each fixed profile-strength step shows, in the app language. */
function strengthCopy(key: Exclude<ProfileStrengthKey, 'photos'>): Pick<ProfileStrengthItem, 'label' | 'hint' | 'doneLabel' | 'shortLabel'> {
  return {
    label: tr(`providerProfile.dashboard.strength.${key}.label` as const),
    hint: tr(`providerProfile.dashboard.strength.${key}.hint` as const),
    doneLabel: tr(`providerProfile.dashboard.strength.${key}.done` as const),
    shortLabel: tr(`providerProfile.dashboard.strength.${key}.short` as const),
  };
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
    { key: 'logo', ...strengthCopy('logo'), done: input.logoSet },
    { key: 'about', ...strengthCopy('about'), done: input.aboutSet },
    { key: 'hours', ...strengthCopy('hours'), done: input.hoursSet },
    { key: 'specialities', ...strengthCopy('specialities'), done: input.specialityCount > 0 },
    { key: 'instagram', ...strengthCopy('instagram'), done: !!input.instagram?.trim() },
    { key: 'policies', ...strengthCopy('policies'), done: input.policiesSet },
    {
      key: 'photos',
      label: trp('providerProfile.dashboard.strength.photos.label', photosToGo),
      hint: tr('providerProfile.dashboard.strength.photos.hint', { count: input.portfolioCount, full: FULL_PORTFOLIO_COUNT }),
      doneLabel: tr('providerProfile.dashboard.strength.photos.done', { full: FULL_PORTFOLIO_COUNT }),
      shortLabel: trp('providerProfile.dashboard.strength.photos.short', photosToGo),
      done: photosToGo === 0,
    },
    { key: 'accessibility', ...strengthCopy('accessibility'), done: !!input.accessibilityNotes?.trim() },
    { key: 'payments', ...strengthCopy('payments'), done: (input.paymentMethods?.length ?? 0) > 0 },
  ];
  const done = items.filter(item => item.done).length;
  return { items, percent: Math.round((done / items.length) * 100) };
}

/** "2 more: specialities, 3 more photos" for what's left after the next
 *  step, naming at most three. Null when nothing else is left. */
export function remainingStepsLine(rest: readonly ProfileStrengthItem[]): string | null {
  if (rest.length === 0) return null;
  const names = rest.slice(0, 3).map(item => item.shortLabel).join(', ');
  return `${tr('providerProfile.dashboard.remaining', { count: rest.length, names })}${rest.length > 3 ? '…' : ''}`;
}
