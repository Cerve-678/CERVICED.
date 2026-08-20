import { BookingStatus, type ConfirmedBooking } from "../types/booking";
import { resolveBooking } from "../services/becca/entityResolver";

function booking(id: string, bookingDate: string): ConfirmedBooking {
  return {
    id,
    bookingDate,
    bookingTime: "10:00",
    status: BookingStatus.UPCOMING,
    serviceName: "Gel manicure",
    providerName: "Lola's Studio",
  } as ConfirmedBooking;
}

describe("Becca booking resolution", () => {
  it("resolves next appointment to the earliest upcoming booking without a chooser", () => {
    const result = resolveBooking(
      "When is my next appointment?",
      [booking("later", "2026-09-12"), booking("next", "2026-08-20")],
      new Date("2026-08-18T12:00:00"),
      {},
    );

    expect(result.ambiguous).toBeUndefined();
    expect(result.resolved?.value.id).toBe("next");
  });
});
