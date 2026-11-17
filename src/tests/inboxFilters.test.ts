import {
  filterInboxConversations,
  hasInboxFilters,
  NO_INBOX_FILTERS,
  type FilterableConversation,
} from '../features/providers/inboxFilters';

// Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0);
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

const make = (name: string, unread: number, lastAt: string | null, createdAt = at(2026, 9, 1)): FilterableConversation & { name: string } => ({
  name,
  unread_count_provider: unread,
  last_message_at: lastAt,
  created_at: createdAt,
  client: { name },
});

const list = [
  make('Amara Okafor', 2, at(2026, 10, 17, 8)),   // today, unread
  make('Bea Lewis', 0, at(2026, 10, 16)),         // yesterday, read
  make('Chloe Grant', 0, at(2026, 10, 11)),       // 6 days ago, still last 7 days
  make('Dani Shaw', 1, at(2026, 10, 10, 23)),     // 7 days ago, older
  make('Erin Bell', 0, null, at(2026, 10, 17, 7)), // no messages yet, opened today
];
const names = (rows: { name: string }[]) => rows.map(r => r.name);

it('leaves the list alone with no filters set', () => {
  expect(hasInboxFilters(NO_INBOX_FILTERS)).toBe(false);
  expect(filterInboxConversations(list, NO_INBOX_FILTERS, NOW)).toHaveLength(5);
});

it('splits unread from read', () => {
  expect(names(filterInboxConversations(list, { ...NO_INBOX_FILTERS, read: 'unread' }, NOW)))
    .toEqual(['Amara Okafor', 'Dani Shaw']);
  expect(names(filterInboxConversations(list, { ...NO_INBOX_FILTERS, read: 'read' }, NOW)))
    .toEqual(['Bea Lewis', 'Chloe Grant', 'Erin Bell']);
});

it('dates by the last message, or by when the chat was opened if nothing was sent', () => {
  expect(names(filterInboxConversations(list, { ...NO_INBOX_FILTERS, date: 'today' }, NOW)))
    .toEqual(['Amara Okafor', 'Erin Bell']);
  expect(names(filterInboxConversations(list, { ...NO_INBOX_FILTERS, date: 'last7' }, NOW)))
    .toEqual(['Amara Okafor', 'Bea Lewis', 'Chloe Grant', 'Erin Bell']);
  expect(names(filterInboxConversations(list, { ...NO_INBOX_FILTERS, date: 'older' }, NOW)))
    .toEqual(['Dani Shaw']);
});

it('searches names, ignoring case and extra spaces', () => {
  const filters = { ...NO_INBOX_FILTERS, search: '  LEWIS ' };
  expect(hasInboxFilters(filters)).toBe(true);
  expect(names(filterInboxConversations(list, filters, NOW))).toEqual(['Bea Lewis']);
});

it('combines filters', () => {
  expect(names(filterInboxConversations(list, { read: 'read', date: 'today', search: 'e' }, NOW)))
    .toEqual(['Erin Bell']);
});
