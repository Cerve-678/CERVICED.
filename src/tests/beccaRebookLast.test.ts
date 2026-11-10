import {
  getMyLatestCompletedBooking,
  getProviderIdByDisplayName,
  getRebookableService,
} from "../services/databaseService";
import { getCapability } from "../services/becca/registry";
import type { CapabilityContext } from "../services/becca/types";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

jest.mock("../services/databaseService", () => ({
  getMyLatestCompletedBooking: jest.fn(),
  getProviderIdByDisplayName: jest.fn(),
  getRebookableService: jest.fn(),
}));
jest.mock("../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

const live = {
  id: "s1",
  name: "Gel Manicure",
  price: 30,
  durationMinutes: 60,
  categoryName: "Nails",
  providerSlug: "lola-studio",
  providerDisplayName: "Lola Studio",
  addOns: [],
};

const completed = {
  id: "b1",
  providerId: "p1",
  providerName: "Lola Studio",
  serviceId: "11111111-1111-4111-8111-111111111111",
  serviceName: "Gel Mani",
  status: BookingStatus.COMPLETED,
  bookingDate: "2026-10-01",
  bookingTime: "10:00",
  price: 30,
  addOns: [],
} as unknown as ConfirmedBooking;

const ctx = (bookings: ConfirmedBooking[]): CapabilityContext => ({
  entities: {},
  hat: "client",
  rawMessage: "rebook my last appointment",
  verbatimMessage: "rebook my last appointment",
  bookings,
  now: new Date("2026-11-10T12:00:00Z"),
  addToCart: jest.fn(),
});

const rebook = () => getCapability("booking.rebook", "client")!;

beforeEach(() => jest.clearAllMocks());

describe("Becca's rebook my last appointment", () => {
  it("finds the service by the booking's service id, so a renamed service still rebooks", async () => {
    (getRebookableService as jest.Mock).mockResolvedValue(live);
    const result = await rebook().run(ctx([completed]));
    expect(getRebookableService).toHaveBeenCalledWith("p1", "Gel Mani", completed.serviceId);
    expect(result.pendingAction?.confirmLabel).toBe("Add to my cart");
  });

  it("looks further back than the cached 90 days before saying there's nothing", async () => {
    (getMyLatestCompletedBooking as jest.Mock).mockResolvedValue({
      id: "b-old",
      provider_id: "p1",
      provider_name_snapshot: "Lola Studio",
      service_id: completed.serviceId,
      service_name_snapshot: "Gel Mani",
      status: "completed",
      booking_date: "2026-03-01",
      booking_time: "10:00:00",
      base_price: 30,
    });
    (getRebookableService as jest.Mock).mockResolvedValue(live);
    const result = await rebook().run(ctx([]));
    expect(getMyLatestCompletedBooking).toHaveBeenCalled();
    expect(result.text).toContain("Gel Mani");
    expect(result.pendingAction).toBeDefined();
  });

  it("only says there's nothing to rebook when there really is no completed booking", async () => {
    (getMyLatestCompletedBooking as jest.Mock).mockResolvedValue(null);
    const result = await rebook().run(ctx([]));
    expect(result.text).toMatch(/nothing to rebook/);
  });

  it("says the lookup failed, not that the service is gone, when a query errors", async () => {
    (getRebookableService as jest.Mock).mockRejectedValue(new Error("timeout"));
    const result = await rebook().run(ctx([completed]));
    expect(result.text).toMatch(/couldn't look up/);
    expect(result.text).not.toMatch(/isn't available/);
    expect(getProviderIdByDisplayName).not.toHaveBeenCalled();
  });
});
