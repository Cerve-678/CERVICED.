import type { BookingInfoPack } from '../../services/databaseService';

const INFO_PACK_POPUP_MAX_CHARS = 240;

/** Formats notice windows without exposing raw, unwieldy hour counts. */
export function formatNoticeWindow(hours: number): string {
  if (hours <= 0) return '';
  if (hours > 72 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Short info packs are readable in a popup; longer ones need full-screen reading. */
export function isLongBookingInfoPack(pack: BookingInfoPack): boolean {
  return (pack.title?.length ?? 0) + (pack.content?.length ?? 0) > INFO_PACK_POPUP_MAX_CHARS;
}
