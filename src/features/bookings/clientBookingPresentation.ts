import type { BookingInfoPack } from '../../services/databaseService';
import { getLanguage, translatePlural } from '../../i18n';

const INFO_PACK_POPUP_MAX_CHARS = 240;

/** Formats notice windows without exposing raw, unwieldy hour counts. Pass
 *  `lang: 'en'` when the window sits inside a sentence held in English
 *  (cancellation policy copy), so the sentence doesn't come out mixed. */
export function formatNoticeWindow(hours: number, lang: string = getLanguage()): string {
  if (hours <= 0) return '';
  if (hours > 72 && hours % 24 === 0) {
    return translatePlural(lang, 'clientBooking.notice.days', hours / 24);
  }
  return translatePlural(lang, 'clientBooking.notice.hours', hours);
}

/** Short info packs are readable in a popup; longer ones need full-screen reading. */
export function isLongBookingInfoPack(pack: BookingInfoPack): boolean {
  return (pack.title?.length ?? 0) + (pack.content?.length ?? 0) > INFO_PACK_POPUP_MAX_CHARS;
}
