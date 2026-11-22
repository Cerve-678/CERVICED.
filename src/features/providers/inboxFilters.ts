/**
 * Filters for the provider Inbox list: read state, how recent the last
 * message is, and a name search. Pure, so the screen and its tests share one
 * definition of what each chip means.
 */

export type InboxReadFilter = 'unread' | 'read';
export type InboxDateFilter = 'today' | 'last7' | 'older';

export interface InboxFilters {
  read: InboxReadFilter | null;
  date: InboxDateFilter | null;
  search: string;
}

export const NO_INBOX_FILTERS: InboxFilters = { read: null, date: null, search: '' };

export const INBOX_READ_CHIPS: { key: InboxReadFilter; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
];

export const INBOX_DATE_CHIPS: { key: InboxDateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'older', label: 'Older' },
];

/** The fields a conversation needs for filtering. */
export interface FilterableConversation {
  unread_count_provider: number;
  last_message_at: string | null;
  created_at: string;
  client: { name: string } | null;
}

export function hasInboxFilters(filters: InboxFilters): boolean {
  return filters.read !== null || filters.date !== null || filters.search.trim() !== '';
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today" is the phone's calendar day. "Last 7 days" covers today and the six
 * days before it, so it includes everything in Today. "Older" is everything
 * before that. A conversation with no message yet is dated by when it was
 * opened.
 */
function matchesDate(conversation: FilterableConversation, filter: InboxDateFilter, now: Date): boolean {
  const at = new Date(conversation.last_message_at ?? conversation.created_at).getTime();
  if (Number.isNaN(at)) return false;
  const today = startOfDay(now);
  const sevenDaysStart = today - 6 * DAY_MS;
  switch (filter) {
    case 'today': return at >= today;
    case 'last7': return at >= sevenDaysStart;
    case 'older': return at < sevenDaysStart;
  }
}

export function filterInboxConversations<T extends FilterableConversation>(
  conversations: readonly T[],
  filters: InboxFilters,
  now: Date = new Date(),
): T[] {
  const search = filters.search.trim().toLocaleLowerCase('en-GB');
  return conversations.filter(c => {
    if (filters.read === 'unread' && c.unread_count_provider <= 0) return false;
    if (filters.read === 'read' && c.unread_count_provider > 0) return false;
    if (filters.date && !matchesDate(c, filters.date, now)) return false;
    if (search && !(c.client?.name ?? 'Client').toLocaleLowerCase('en-GB').includes(search)) return false;
    return true;
  });
}
