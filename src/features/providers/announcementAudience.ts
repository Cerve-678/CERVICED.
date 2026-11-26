/**
 * "Interested" in Send Announcement: everyone who has booked with the provider,
 * plus everyone who saved them or has their bell on. Someone who is both is one
 * person and gets one announcement.
 */
export function interestedRecipientIds(clientIds: readonly string[], followerIds: readonly string[]): string[] {
  return Array.from(new Set([...clientIds, ...followerIds]));
}
