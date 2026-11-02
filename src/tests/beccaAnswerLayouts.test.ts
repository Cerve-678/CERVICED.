import {
  getProviderDepositPoliciesByDisplayNames,
  getProviderReschedulePolicyByDisplayName,
} from "../services/databaseService";
import { chooseLayout } from "../services/becca/engine";
import { getCapability } from "../services/becca/registry";
import type { CapabilityContext, EntityBag } from "../services/becca/types";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

jest.mock("../services/databaseService", () => ({
  getProviderReschedulePolicyByDisplayName: jest.fn(),
  getProviderDepositPoliciesByDisplayNames: jest.fn(),
}));

const lola: EntityBag = {
  provider: {
    kind: "provider",
    value: { slug: "lola-studio", dbId: "p1", displayName: "Lola Studio" },
    confidence: 1,
    sourceText: "lola studio",
    label: "Lola Studio",
  },
};
const booking = {
  id: "b1",
  providerId: "p1",
  providerName: "Lola Studio",
  serviceName: "Volume Lashes Full Set",
  status: BookingStatus.UPCOMING,
  bookingDate: "2026-11-10",
  bookingTime: "10:00:00",
  price: 55,
} as unknown as ConfirmedBooking;

const ctx = (entities: EntityBag, bookings: ConfirmedBooking[] = []): CapabilityContext => ({
  entities,
  hat: "client",
  rawMessage: "",
  verbatimMessage: "",
  bookings,
  now: new Date("2026-11-02T12:00:00Z"),
});

describe("Becca picks a reply's shape from what the answer is", () => {
  it("leads with one big fact when there is one", () => {
    expect(chooseLayout({ text: "", headline: { value: "Yes", label: "£15 deposit" } })).toBe("headline");
  });

  it("shows the steps first when the answer took a real search", () => {
    expect(chooseLayout({ text: "", card: { title: "X" }, work: ["Searched 14", "Checked menus: 3 do"] })).toBe("stepsThenCard");
  });

  it("puts the card first for a quick look-up", () => {
    expect(chooseLayout({ text: "", card: { title: "X" }, work: ["Checked your 1 upcoming booking"] })).toBe("cardFirst");
  });

  it("leaves a plain answer as text", () => {
    expect(chooseLayout({ text: "Hi" })).toBeNull();
  });
});

describe("The answers that now have a shape", () => {
  it("states a reschedule rule as a headline, from the provider's real policy", async () => {
    (getProviderReschedulePolicyByDisplayName as jest.Mock).mockResolvedValue({ maxReschedules: 2, rescheduleNoticeHours: 48 });
    const result = await getCapability("provider.reschedule_policy", "client")!.run(ctx(lola));
    expect(result.headline).toEqual({ value: "2 moves", label: "per booking, with 48h notice" });
    expect(result.work).toEqual(["Opened Lola Studio’s policies", "Read the rescheduling rules"]);
  });

  it("answers a deposit question with a yes or no up top", async () => {
    (getProviderDepositPoliciesByDisplayNames as jest.Mock).mockResolvedValue({
      "Lola Studio": { depositAvailable: true, depositType: "fixed", depositAmount: 15, depositOnly: false },
    });
    const yes = await getCapability("provider.deposit", "client")!.run(ctx(lola));
    expect(yes.headline).toEqual({ value: "Yes", label: "£15 deposit" });

    (getProviderDepositPoliciesByDisplayNames as jest.Mock).mockResolvedValue({});
    const no = await getCapability("provider.deposit", "client")!.run(ctx(lola));
    expect(no.headline?.value).toBe("No");
  });

  it("shows the next appointment as a card, with what it checked", async () => {
    const result = await getCapability("booking.next", "client")!.run(ctx({}, [booking]));
    // A ticket: the appointment's own date block, not a generic band.
    // 10 Nov 2026 is a Tuesday.
    expect(result.card?.stamp).toEqual({ top: "TUE", big: "10", bottom: "NOV" });
    expect(result.card?.meta).toBe("NEXT APPOINTMENT");
    expect(result.card?.rows?.[0]).toMatchObject({ title: "Volume Lashes Full Set", tag: "£55" });
    expect(result.card?.rows?.[0]?.detail).toMatch(/^Lola Studio · /);
    expect(result.work).toEqual(["Checked your 1 upcoming booking"]);
    expect(chooseLayout(result)).toBe("cardFirst");
  });
});
