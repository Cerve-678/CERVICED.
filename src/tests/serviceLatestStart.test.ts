// A service's latest start (services.latest_start_time): a 3-hour colour set
// to "start by 2pm" is never offered at 3pm, even though the provider works
// until 7. The server (enforce_booking_bookability) is the real gate; these
// check the app mirrors it so the picker never offers a time the hold refuses.
jest.mock('../services/databaseService', () => ({
  __esModule: true,
  getBookableServiceIds: jest.fn(),
  getMyUpcomingBookedSpans: jest.fn(),
  getAvailabilityDateBundle: jest.fn(),
  getAvailabilityEmergencyPolicyRow: jest.fn(),
  getAvailabilityDateExceptions: jest.fn(),
  getAvailabilityNoticeSettings: jest.fn(),
  getAvailabilityProviderCore: jest.fn(),
  getAvailabilityServiceBufferRows: jest.fn(),
  getAvailabilityWeeklyScheduleRows: jest.fn(),
  getProviderBusySpans: jest.fn(),
  getProviderBookingHorizon: jest.fn(),
  getServicesOpenWithin: jest.fn(),
  resolveActiveProviderIdByDisplayName: jest.fn(),
}));

import {
  formatLatestStart,
  latestStartMinutes,
  latestStartToEditor,
  startsTooLate,
} from '../utils/latestStart';
import { EMPTY_SERVICE_VALUE, toEditorValue } from '../features/providers/ServiceEditorSheet';

const PROVIDER = '11111111-1111-4111-8111-111111111111';
const COLOUR = '22222222-2222-4222-8222-222222222222';
const TRIM = '33333333-3333-4333-8333-333333333333';

function futureDate(daysAhead = 5): { date: string; dow: number } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, dow: new Date(`${date}T12:00:00`).getDay() };
}

const row = (id: string, latest: string | null) => ({
  id, buffer_before_mins: null, buffer_after_mins: null, latest_start_time: latest,
});

function load(latest: string | null) {
  const db = require('../services/databaseService');
  const { date, dow } = futureDate();
  const settings = {
    slot_interval_mins: 60, buffer_mins: 0, min_booking_notice_hrs: 0, booking_window_days: 0,
  };
  const windowRows = [{ day_of_week: dow, start_time: '09:00:00', end_time: '19:00:00' }];
  db.getAvailabilityDateBundle.mockResolvedValue({
    settings, windowRows, legacyRows: [], isBlocked: false, overrides: [],
    serviceBuffer: row(COLOUR, latest),
  });
  db.getAvailabilityNoticeSettings.mockResolvedValue({ min_booking_notice_hrs: 0, display_name: 'Glow' });
  db.getProviderBusySpans.mockResolvedValue([]);
  db.getAvailabilityServiceBufferRows.mockImplementation(async (ids: string[]) =>
    ids.map(id => row(id, id === COLOUR ? latest : null)),
  );
  db.getAvailabilityProviderCore.mockResolvedValue({ settings, windowRows, legacyRows: [] });
  db.getAvailabilityDateExceptions.mockResolvedValue({ blockedDates: [], overrides: [] });
  const { AvailabilityService } = require('../services/AvailabilityService');
  return { AvailabilityService, date };
}

describe('latest start helpers', () => {
  it('reads Postgres times and editor times alike', () => {
    expect(latestStartMinutes('14:00:00')).toBe(14 * 60);
    expect(latestStartMinutes('09:30')).toBe(9 * 60 + 30);
    expect(latestStartMinutes(null)).toBeNull();
    expect(latestStartMinutes('')).toBeNull();
    expect(latestStartMinutes('nonsense')).toBeNull();
  });

  it('allows a start exactly at the latest start', () => {
    expect(startsTooLate(14 * 60, 14 * 60)).toBe(false);
    expect(startsTooLate(14 * 60 + 1, 14 * 60)).toBe(true);
    expect(startsTooLate(23 * 60, null)).toBe(false);
  });

  it('says the time the way clients read it', () => {
    expect(formatLatestStart('15:00:00')).toBe('3pm');
    expect(formatLatestStart('15:30')).toBe('3:30pm');
    expect(formatLatestStart('12:00')).toBe('12pm');
    expect(formatLatestStart('09:00')).toBe('9am');
    expect(formatLatestStart(null)).toBe('');
  });

  it('round-trips through the editor', () => {
    expect(latestStartToEditor('15:00:00')).toBe('15:00');
    expect(latestStartToEditor(null)).toBe('');
    expect(EMPTY_SERVICE_VALUE.latestStart).toBe('');
    expect(toEditorValue({
      name: 'Colour', price: 90, duration_minutes: 180, description: null,
      is_active: true, latest_start_time: '14:00:00',
    }).latestStart).toBe('14:00');
  });
});

describe('slots respect a service’s latest start', () => {
  beforeEach(() => jest.resetModules());

  it('offers nothing after the latest start, even inside working hours', async () => {
    const { AvailabilityService, date } = load('14:00:00');
    const slots = await AvailabilityService.getAvailableSlots(PROVIDER, date, '1h', COLOUR);
    const times = slots.map((s: { time: string }) => s.time);
    expect(times).toContain('2:00pm');
    expect(times).not.toContain('3:00pm');
    expect(times).not.toContain('6:00pm');
  });

  it('changes nothing for a service with no latest start', async () => {
    const { AvailabilityService, date } = load(null);
    const slots = await AvailabilityService.getAvailableSlots(PROVIDER, date, '1h', COLOUR);
    expect(slots.map((s: { time: string }) => s.time)).toContain('6:00pm');
  });

  it('refuses a later time at checkout, in words the client understands', async () => {
    const { AvailabilityService, date } = load('14:00:00');
    const late = await AvailabilityService.isSlotAvailable(PROVIDER, date, '3:00 PM', '1h', COLOUR);
    expect(late).toEqual({ hasConflict: true, message: 'This service has to start by 2pm.' });
    const onTime = await AvailabilityService.isSlotAvailable(PROVIDER, date, '2:00 PM', '1h', COLOUR);
    expect(onTime.hasConflict).toBe(false);
  });

  it('holds each service in a back-to-back chain to its own latest start', async () => {
    const { AvailabilityService, date } = load('14:00:00');
    // Trim first, then the colour straight after: the colour must still
    // start by 2pm, so the chain can't start later than 1pm.
    const chains = await AvailabilityService.findAllBackToBackSlots(
      PROVIDER,
      [{ serviceId: TRIM, duration: '1h' }, { serviceId: COLOUR, duration: '1h' }],
      date,
    );
    const colourStarts = (chains ?? []).map((chain: { serviceId: string; time: string }[]) =>
      chain.find(s => s.serviceId === COLOUR)!.time);
    expect(colourStarts).toContain('2:00pm');
    expect(colourStarts).not.toContain('3:00pm');
    expect((chains ?? []).map((chain: { time: string }[]) => chain[0]!.time)).not.toContain('2:00pm');
  });
});
