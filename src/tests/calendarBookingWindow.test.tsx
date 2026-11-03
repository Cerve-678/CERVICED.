import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { ModernBeautyCalendar } from "../components/ModernBeautyCalendar";

// The picker has to stop at the provider's booking window itself. Nothing
// passed it the window since July, so the month view offered every working
// day of the next month; only the slot lookup and the booking trigger caught
// it. The slot resolver below offers times on every day, so the only thing
// that can grey a day out here is the calendar's own reading of the window.
jest.mock("../services/AvailabilityService", () => ({
  AvailabilityService: {
    resolveProvider: jest.fn(async () => "provider-1"),
    getAvailabilitySummary: jest.fn(async () => ({ state: "open" })),
    getBookingHorizon: jest.fn(async () => ({ booking_window_days: 1 })),
    getEmergencyRequestPolicy: jest.fn(),
    findNextAvailableDate: jest.fn(async () => null),
    getAvailableSlots: jest.fn(async () => []),
  },
}));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));

const everyDayOpen = async () => ["10:00 AM", "11:00 AM"];

function renderCalendar(selectedDate: string) {
  return render(
    <ModernBeautyCalendar
      selectedDate={selectedDate}
      onDateSelect={jest.fn()}
      onTimeSelect={jest.fn()}
      providerName="provider-1"
      providerLabel="Nails Studio"
      serviceDuration="1 hour"
      slotResolver={everyDayOpen}
      accentColor="#AF9197"
      textColor="#1C1C1E"
      subColor="#6B6460"
      surfaceColor="#FFFFFF"
    />,
  );
}

describe("ModernBeautyCalendar booking window", () => {
  beforeEach(() => {
    // Tuesday 3 Nov 2026, so the week strip runs past a one-day window.
    jest.useFakeTimers({ now: new Date(2026, 10, 3, 12, 0), advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it("says when a day past the window opens instead of offering its times", async () => {
    renderCalendar("2026-11-06");
    // One-day window: Fri 6 Nov opens on Thu 5 Nov.
    await waitFor(() => expect(screen.getByText(/^Bookings for this day open on Thu,? 5 Nov\.$/)).toBeTruthy());
    expect(screen.queryByText("10:00 AM")).toBeNull();
  });

  it("still offers times on a day inside the window", async () => {
    renderCalendar("2026-11-04");
    await waitFor(() => expect(screen.getByText("10:00 AM")).toBeTruthy());
    expect(screen.queryByText(/Bookings for this day open on/)).toBeNull();
  });
});
