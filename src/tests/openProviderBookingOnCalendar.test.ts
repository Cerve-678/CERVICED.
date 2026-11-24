import { openProviderBookingOnCalendar } from "../navigation/rootNavigate";
import { navigationRef } from "../navigation/navigationRef";

jest.mock("../navigation/navigationRef", () => ({
  navigationRef: { isReady: jest.fn(), navigate: jest.fn() },
}));

const ready = navigationRef.isReady as jest.Mock;
const navigate = navigationRef.navigate as jest.Mock;

describe("openProviderBookingOnCalendar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ready.mockReturnValue(true);
  });

  it("puts the calendar on the booking's day under the booking, with the reschedule sheet asked for", () => {
    openProviderBookingOnCalendar("booking-1", "2026-11-20", true);

    // A reset of the Home stack, so it works whether or not that tab has
    // mounted, and never stacks a second calendar over the first.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("ProviderHome", {
      state: {
        index: 1,
        routes: [
          { name: "ProviderHomeMain", params: { jumpToDate: "2026-11-20" } },
          { name: "BookingDetail", params: { bookingId: "booking-1", openReschedule: true } },
        ],
      },
    });
  });

  it("opens the booking without the reschedule sheet for Cancel", () => {
    openProviderBookingOnCalendar("booking-2", "2026-11-21", false);
    const { state } = navigate.mock.calls[0][1];
    expect(state.routes[1]).toEqual({ name: "BookingDetail", params: { bookingId: "booking-2" } });
  });

  it("does nothing before navigation is ready", () => {
    ready.mockReturnValue(false);
    openProviderBookingOnCalendar("booking-1", "2026-11-20", true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
