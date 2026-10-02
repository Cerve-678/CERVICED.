// Pure shaping for the provider's day-summary popup (DailySchedulePopup).
// Kept free of React/Supabase so the counting rules can be tested directly.

/** The booking fields the summary reads — a structural subset of
 *  BookingWithAddOns, so tests don't have to build whole rows. */
export interface DaySummaryBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  status: string;
  customer_name: string | null;
  service_name_snapshot: string;
}

export interface DaySummaryRescheduleRequest {
  booking_id: string;
  status: string;
}

/** Statuses that are a real appointment on the day. Pending + confirmed is
 *  what the 07:00 recap counts (process_provider_daily_recap); in_progress and
 *  completed are those same appointments later in the day, so tapping the
 *  recap at 4pm still lists the morning's clients. Cancelled, declined,
 *  no-shows and unclaimed waitlist holds are not on the day. */
const ON_THE_DAY = new Set(['pending', 'confirmed', 'in_progress', 'completed']);

export interface DaySummaryTodo {
  /** Booking requests still awaiting the provider's accept/decline. */
  bookingRequests: number;
  /** Client reschedule requests awaiting the provider (status 'pending' —
   *  'provider_responded' is waiting on the client, not on them). */
  rescheduleRequests: number;
  unreadMessages: number;
  /** Clients still waiting on the waitlist. */
  waitlist: number;
}

export interface DaySummary<B extends DaySummaryBooking> {
  appointments: B[];
  todo: DaySummaryTodo;
  todoTotal: number;
}

/**
 * The "To do" counts match ProviderBookingHistoryScreen's To Do tab exactly
 * (pending bookings + pending reschedule requests + unread messages + waiting
 * waitlist), since that tab is where every row here leads — the popup must
 * never promise a number the destination doesn't show.
 */
export function buildDaySummary<B extends DaySummaryBooking>(input: {
  date: string;
  bookings: B[];
  rescheduleRequests: DaySummaryRescheduleRequest[];
  unreadMessages: number;
  waitingOnWaitlist: number;
}): DaySummary<B> {
  const appointments = input.bookings
    .filter(b => b.booking_date === input.date && ON_THE_DAY.has(b.status))
    .sort((a, b) => a.booking_time.localeCompare(b.booking_time));

  const todo: DaySummaryTodo = {
    bookingRequests: input.bookings.filter(b => b.status === 'pending').length,
    rescheduleRequests: input.rescheduleRequests.filter(r => r.status === 'pending').length,
    unreadMessages: input.unreadMessages,
    waitlist: input.waitingOnWaitlist,
  };

  return {
    appointments,
    todo,
    todoTotal: todo.bookingRequests + todo.rescheduleRequests + todo.unreadMessages + todo.waitlist,
  };
}

/** "Good morning" before noon, "Good afternoon" before 5pm, else evening. */
export function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
