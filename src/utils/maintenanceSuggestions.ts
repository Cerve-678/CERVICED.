// src/utils/maintenanceSuggestions.ts
//
// The rules engine behind "Your suggestions" in Maintenance setup. Pure: same
// inputs, same output, no I/O, no clock (today is passed in).
//
// What it may and may not do (legal-flagger mitigations, 2026-10-10):
//  - Beauty Profile answers only choose WHICH service types are offered.
//    Every suggested interval comes from MAINTENANCE_SERVICE_TYPES' single
//    neutral default — no answer makes an interval longer or shorter. (A
//    booking-made item can later learn from the client's own booking history;
//    that's server-side and never reads the profile.)
//  - Skin tone is never read. Skin CONCERNS and SENSITIVE AREAS are never
//    read either: several concerns are medical conditions (eczema, psoriasis,
//    rosacea), sensitive areas describe skin sensitivity, and offering a
//    treatment because of either is advice, not a reminder.
//  - Every suggestion carries the answer it came from, shown to the client as
//    "from your answer: …".
//  - Bookable services only. Patch tests are not suggested: the app has no
//    basis to say when one is due (see MaintenanceScreen's patch-test card).

import {
  getMaintenanceServiceType,
  maintenanceTypeLabel,
  type MaintenanceTypeKey,
} from '../constants/maintenanceServiceTypes';
import { beautyOptionLabel } from '../features/beauty-profile/options';
import { tr, trp, type PluralKey, type TranslationKey, type TranslationParams } from '../i18n';
import type { BeautyData } from '../types/beautyProfile';
import type {
  MaintenanceItem,
  MaintenanceItemKind,
  MaintenanceSetupAnswers,
  ProtectiveStyle,
} from '../types/maintenance';
import { dateToYMD, toLocalDate } from './dateUtils';

export interface MaintenanceSuggestion {
  /** Stable within one build of the list, for keys and switch state. */
  id: string;
  kind: MaintenanceItemKind;
  typeKey: MaintenanceTypeKey | null;
  title: string;
  /** Null for a one-off (take-down, event). */
  repeatWeeks: number | null;
  /** "YYYY-MM-DD" */
  dueOn: string;
  /** "YYYY-MM-DD", events only. */
  eventOn: string | null;
  /** The answer this came from, e.g. "Hair type: Coily". */
  answer: string;
}

/** Hair types whose usual salon routine includes the textured-hair services. */
const TEXTURED_HAIR_TYPES: ReadonlySet<string> = new Set(['Curly', 'Coily', '4A', '4B', '4C']);

/** Setup answers before the client has given any: what "Picked for you"
 *  uses after setup, when only the Beauty Profile is in play. */
export const EMPTY_SETUP_ANSWERS: MaintenanceSetupAnswers = {
  protectiveStyle: null,
  protectiveWearWeeks: 6,
  protectiveWeeksIn: null,
  events: [],
  lastPatchTestOn: null,
};

/** How long before an event its "book by" date falls. App-chosen, not health
 *  related: it only decides when the client is prompted to book. */
export const EVENT_BOOK_BY_WEEKS = 4;

export const PROTECTIVE_STYLE_LABELS: Record<ProtectiveStyle, TranslationKey> = {
  braids: 'clientAccount.suggest.style.braids',
  twists: 'clientAccount.suggest.style.twists',
  locs: 'clientAccount.suggest.style.locs',
  wigs_weaves: 'clientAccount.suggest.style.wigsWeaves',
};

/** Translators the suggestion copy is built with: the component's `t`/`tp`
 *  (so it rebuilds on a language change), or `tr`/`trp` outside React. */
export interface SuggestionTranslate {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  tp: (base: PluralKey, count: number, params?: TranslationParams) => string;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Build the suggestion list for the setup flow's review step.
 *
 * @param profile  the client's saved Beauty Profile
 * @param answers  the setup flow's optional answers
 * @param existing items the client already has; types already covered are
 *                 not suggested again (paused items count as covered — the
 *                 client chose to keep them quiet, not to have a second one)
 * @param today    the client's local today
 */
export function buildMaintenanceSuggestions(
  profile: BeautyData,
  answers: MaintenanceSetupAnswers,
  existing: readonly MaintenanceItem[],
  today: Date,
  { t, tp }: SuggestionTranslate = { t: tr, tp: trp },
): MaintenanceSuggestion[] {
  // Titles and answers are display copy in the client's language (a chosen
  // suggestion's title is saved as the reminder's name, like one they typed).
  // The profile values they quote are stored English answers, shown through
  // their labels; every rule below still matches on the stored values.
  const opt = (value: string) => beautyOptionLabel(value, t);
  const said = (key: TranslationKey, value: string) => t(key, { value: opt(value) });
  const covered = new Set(existing.map(i => i.typeKey).filter((k): k is MaintenanceTypeKey => k !== null));
  const hasTakedown = existing.some(i => i.kind === 'takedown');
  const out: MaintenanceSuggestion[] = [];
  const offered = new Set<MaintenanceTypeKey>();

  const offer = (key: MaintenanceTypeKey, answer: string) => {
    if (covered.has(key) || offered.has(key)) return;
    const type = getMaintenanceServiceType(key);
    if (!type) return;
    offered.add(key);
    out.push({
      id: `type:${key}`,
      kind: 'service',
      typeKey: key,
      title: maintenanceTypeLabel(type, t),
      repeatWeeks: type.defaultWeeks,
      dueOn: dateToYMD(addDays(today, type.defaultWeeks * 7)),
      eventOn: null,
      answer,
    });
  };

  // ── Hair ──────────────────────────────────────────────────────────────────
  const hairAnswer = profile.hairType ? said('clientAccount.suggest.answer.hairType', profile.hairType) : null;
  if (profile.hairType && TEXTURED_HAIR_TYPES.has(profile.hairType)) {
    offer('wash_and_go', hairAnswer!);
    offer('silk_press', hairAnswer!);
    offer('deep_conditioning', hairAnswer!);
  }
  if (profile.hairGoals.includes('Moisture')) offer('deep_conditioning', said('clientAccount.suggest.answer.hairGoal', 'Moisture'));
  if (profile.treatmentHistory.includes('Relaxed / permed')) {
    offer('relaxer_touch_up', said('clientAccount.suggest.answer.treatment', 'Relaxed / permed'));
  }
  const colourAnswer =
    profile.treatmentHistory.includes('Coloured') ? said('clientAccount.suggest.answer.treatment', 'Coloured')
    : profile.treatmentHistory.includes('Bleached / lightened') ? said('clientAccount.suggest.answer.treatment', 'Bleached / lightened')
    : profile.hairGoals.includes('Colour / highlights') ? said('clientAccount.suggest.answer.hairGoal', 'Colour / highlights')
    : null;
  if (colourAnswer) offer('root_colour', colourAnswer);
  if (hairAnswer) offer('trim', hairAnswer);

  // ── Protective style ──────────────────────────────────────────────────────
  const style = answers.protectiveStyle;
  if (style === 'locs') {
    offer('loc_retwist', t('clientAccount.suggest.answer.protectiveStyle', { value: t(PROTECTIVE_STYLE_LABELS.locs) }));
  } else if (style && answers.protectiveWeeksIn !== null && !hasTakedown) {
    const label = t(PROTECTIVE_STYLE_LABELS[style]);
    const weeksLeft = Math.max(0, answers.protectiveWearWeeks - answers.protectiveWeeksIn);
    out.push({
      id: 'takedown',
      kind: 'takedown',
      typeKey: null,
      title: t('clientAccount.suggest.takedownTitle', { style: label }),
      repeatWeeks: null,
      dueOn: dateToYMD(addDays(today, weeksLeft * 7)),
      eventOn: null,
      answer: tp('clientAccount.suggest.answer.keptIn', answers.protectiveWearWeeks, { style: label }),
    });
  }

  // ── Lashes, nails, brows, skin ────────────────────────────────────────────
  // A past "Lash extensions" treatment only counts while the client hasn't
  // told us they've stopped.
  if (profile.lashStatus === 'Currently have extensions') {
    offer('lash_infill', said('clientAccount.suggest.answer.lashes', 'Currently have extensions'));
  } else if (profile.lashStatus !== 'No extensions' && profile.treatmentHistory.includes('Lash extensions')) {
    offer('lash_infill', said('clientAccount.suggest.answer.treatment', 'Lash extensions'));
  } else if (profile.lashStatus === 'No extensions' && profile.lashStyle === 'Natural') {
    // Natural lashes, no extensions: a lift is the bookable lash service.
    offer('lash_lift', t('clientAccount.suggest.answer.lashesNatural'));
  }
  const nailAnswer = profile.nailShape ? said('clientAccount.suggest.answer.nails', profile.nailShape)
    : profile.nailLength ? said('clientAccount.suggest.answer.nails', profile.nailLength)
    : null;
  if (nailAnswer) {
    offer('nails_general', nailAnswer);
    offer('pedicure', nailAnswer);
  }
  if (profile.browStyle === 'Laminated') offer('brow_lamination', said('clientAccount.suggest.answer.brows', 'Laminated'));
  else if (profile.browStyle) offer('brows_general', said('clientAccount.suggest.answer.brows', profile.browStyle));
  else if (profile.browCondition) offer('brows_general', said('clientAccount.suggest.answer.brows', profile.browCondition));
  // Waxing is never suggested: the only related answer, "Sensitive areas", is
  // about skin sensitivity, and a treatment offered because of it is advice.
  // Clients add waxing themselves from "Add your own".
  if (profile.skinType) offer('facial', said('clientAccount.suggest.answer.skinType', profile.skinType));

  // ── Events ────────────────────────────────────────────────────────────────
  const todayYMD = dateToYMD(today);
  answers.events.forEach((event, index) => {
    const name = event.name.trim();
    if (!name || !event.date || event.date < todayYMD) return;
    const bookBy = addDays(toLocalDate(event.date), -EVENT_BOOK_BY_WEEKS * 7);
    out.push({
      id: `event:${index}`,
      kind: 'event',
      typeKey: null,
      title: name,
      repeatWeeks: null,
      dueOn: dateToYMD(bookBy) < todayYMD ? todayYMD : dateToYMD(bookBy),
      eventOn: event.date,
      answer: t('clientAccount.suggest.answer.event', { value: name }),
    });
  });

  return out;
}

/** How a reminder the client adds themselves is timed. */
export type ReminderTiming =
  /** Every N weeks, counted from the last visit (or from today if unknown). */
  | { mode: 'repeats'; weeks: number; lastDoneOn: string | null }
  /** Getting ready for a date: due on its book-by date, never in the past. */
  | { mode: 'event'; eventOn: string }
  /** Once, on a date. */
  | { mode: 'once'; date: string };

export interface ScheduledReminder {
  kind: MaintenanceItemKind;
  repeatWeeks: number | null;
  lastDoneOn: string | null;
  /** "YYYY-MM-DD". May be in the past for a repeat whose last visit was long
   *  ago: that's honestly overdue, not something to hide. */
  dueOn: string;
  eventOn: string | null;
}

/** The dates a new client-made reminder is saved with. Pure; today is passed in. */
export function scheduleNewReminder(timing: ReminderTiming, today: Date): ScheduledReminder {
  const todayYMD = dateToYMD(today);
  switch (timing.mode) {
    case 'repeats': {
      const from = timing.lastDoneOn ? toLocalDate(timing.lastDoneOn) : today;
      return {
        kind: 'service',
        repeatWeeks: timing.weeks,
        lastDoneOn: timing.lastDoneOn,
        dueOn: dateToYMD(addDays(from, timing.weeks * 7)),
        eventOn: null,
      };
    }
    case 'event': {
      const bookBy = dateToYMD(addDays(toLocalDate(timing.eventOn), -EVENT_BOOK_BY_WEEKS * 7));
      return {
        kind: 'event',
        repeatWeeks: null,
        lastDoneOn: null,
        dueOn: bookBy < todayYMD ? todayYMD : bookBy,
        eventOn: timing.eventOn,
      };
    }
    case 'once':
      return { kind: 'service', repeatWeeks: null, lastDoneOn: null, dueOn: timing.date, eventOn: null };
  }
}
