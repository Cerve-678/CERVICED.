import { getCapability } from "../services/becca/registry";
import { getBookingCancelNoticeHours, getProviderCancellationPolicyById, getProviderReschedulePolicyById, getProviderReschedulePolicyByDisplayName, getProviderBookingPoliciesById, getMyProviderProfile } from "../services/databaseService";
import { normalizeAsk } from "../services/becca/askNormaliser";
import { understand } from "../services/becca/matcher";
import type { CapabilityContext } from "../services/becca/types";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

jest.mock("../services/databaseService", () => ({
  getProviderReschedulePolicyById: jest.fn(),
  getProviderReschedulePolicyByDisplayName: jest.fn(),
  getProviderBookingPoliciesById: jest.fn(),
  getMyProviderProfile: jest.fn(),
  getBookingCancelNoticeHours: jest.fn(),
  getProviderCancellationPolicyById: jest.fn(),
}));

const booking = {
  id: "booking-1", providerId: "provider-1", providerName: "Lola Studio",
  serviceName: "Lash Lift", status: BookingStatus.UPCOMING,
  bookingDate: "2026-12-10", bookingTime: "10:00:00", price: 55,
  rescheduleRequest: { rescheduleCount: 1 },
} as ConfirmedBooking;

const clientContext: CapabilityContext = {
  hat: "client", rawMessage: "what is the reschedule policy", verbatimMessage: "what is the reschedule policy",
  entities: { booking: { kind: "booking", value: booking, confidence: 1, sourceText: "my booking", label: "Lash Lift" } },
  bookings: [booking], now: new Date("2026-11-25T12:00:00Z"),
};

describe("Becca reschedule policy answers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes an ordinary policy question to the policy answer", () => {
    expect(understand(normalizeAsk("what is the reschedule policy?"), {}, "client").capabilityId)
      .toBe("provider.reschedule_policy");
  });

  it("uses the booking's provider ID and includes every material rule", async () => {
    jest.mocked(getProviderReschedulePolicyById).mockResolvedValue({
      maxReschedules: 2, rescheduleNoticeHours: 48, sameMonthOnly: true,
    });
    const result = await getCapability("provider.reschedule_policy", "client")!.run(clientContext);
    expect(getProviderReschedulePolicyById).toHaveBeenCalledWith("provider-1");
    expect(getProviderReschedulePolicyByDisplayName).not.toHaveBeenCalled();
    expect(result.text).toContain("48h notice");
    expect(result.text).toContain("same calendar month");
    expect(result.text).toContain("1 of 2 moves have been used");
    expect(result.text).toContain("45 minutes");
    expect(result.text).toContain("original booking stays in place");
  });

  it("does not describe zero notice as permission after the appointment starts", async () => {
    jest.mocked(getProviderReschedulePolicyById).mockResolvedValue({
      maxReschedules: null, rescheduleNoticeHours: 0, sameMonthOnly: false,
    });
    const result = await getCapability("provider.reschedule_policy", "client")!.run(clientContext);
    expect(result.text).toContain("before the appointment starts");
    expect(result.text).not.toContain("right up to the day");
  });

  it("asks which provider when upcoming bookings have different policies", async () => {
    const result = await getCapability("provider.reschedule_policy", "client")!.run({
      ...clientContext, entities: {}, bookings: [booking, { ...booking, id: "booking-2", providerName: "Lash Lab", providerId: "provider-2" }],
    });
    expect(result.text).toContain("Which provider");
    expect(result.suggestions?.map((suggestion) => suggestion.text)).toEqual(["Lola Studio", "Lash Lab"]);
    expect(getProviderReschedulePolicyById).not.toHaveBeenCalled();
  });

  it("reads the provider's saved enum values correctly", async () => {
    jest.mocked(getMyProviderProfile).mockResolvedValue({ id: "provider-1" } as Awaited<ReturnType<typeof getMyProviderProfile>>);
    jest.mocked(getProviderBookingPoliciesById).mockResolvedValue({
      rescheduleNotice: "same_day", maxReschedules: "2", rescheduleWithin: "same_month",
    });
    const result = await getCapability("pv.automations", "provider")!.run({
      ...clientContext, hat: "provider", entities: {}, bookings: [],
    });
    const row = result.card?.rows?.find((item) => item.title === "Reschedules");
    expect(row).toMatchObject({ tag: "Same day" });
    expect(row?.detail).toContain("up to 2 per booking");
    expect(row?.detail).toContain("same month");
  });

  it("uses a booking's frozen cancellation notice in its breakdown", async () => {
    jest.mocked(getBookingCancelNoticeHours).mockResolvedValue(72);
    jest.mocked(getProviderCancellationPolicyById).mockResolvedValue(24);
    jest.mocked(getProviderReschedulePolicyById).mockResolvedValue({
      maxReschedules: 1, rescheduleNoticeHours: 48, sameMonthOnly: true,
    });
    const result = await getCapability("booking.details", "client")!.run(clientContext);
    const rows = result.card?.rows ?? [];
    expect(rows.find((row) => row.title === "Cancellation")?.detail).toContain("72h notice");
    expect(rows.find((row) => row.title === "Rescheduling")?.detail).toContain("same calendar month");
    expect(getProviderReschedulePolicyById).toHaveBeenCalledWith("provider-1");
  });
});
