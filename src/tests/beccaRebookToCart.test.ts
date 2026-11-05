import { converse, isConfirmToken } from "../services/becca/engine";
import { buildRebookCartItem } from "../features/bookings/rebook";
import type { AddToCartParams } from "../contexts/CartContext";
import type { RebookableService } from "../services/databaseService";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

/**
 * "Rebook my last appointment" puts the last completed booking in the cart,
 * at today's price, after one tap — and asks about add-ons only when the
 * booking had some the provider still offers.
 */

const mockLive: { service: RebookableService | null } = { service: null };

jest.mock("../services/databaseService", () => ({
  getProviderIdByDisplayName: jest.fn(async () => "p1"),
  getRebookableService: jest.fn(async () => mockLive.service),
}));

const live: RebookableService = {
  id: "s1",
  name: "Gel Manicure",
  price: 40,
  durationMinutes: 75,
  categoryName: "NAILS",
  providerSlug: "lola-studio",
  providerDisplayName: "Lola Studio",
  addOns: [
    { id: "a1", name: "Nail Art", price: 8 },
    { id: "a2", name: "Chrome", price: 5 },
  ],
};

const last = {
  id: "b0",
  providerId: "p1",
  providerName: "Lola Studio",
  providerService: "Lola Studio Nails",
  providerImage: "https://example.com/logo.png",
  serviceName: "Gel Manicure",
  status: BookingStatus.COMPLETED,
  bookingDate: "2026-10-01",
  bookingTime: "10:00:00",
  price: 35,
  duration: "1h",
  addOns: [{ id: "old-a1", name: "Nail Art", price: 6 }],
} as unknown as ConfirmedBooking;

const ask = (addToCart: (item: AddToCartParams) => void, bookings: ConfirmedBooking[] = [last]) =>
  converse({
    message: "Rebook my last appointment",
    hat: "client",
    bookings,
    addToCart,
    userId: "u1",
    now: new Date("2026-11-03T12:00:00Z"),
  });

const tap = (message: string, addToCart: (item: AddToCartParams) => void) =>
  converse({ message, hat: "client", bookings: [last], addToCart, userId: "u1" });

beforeEach(() => {
  mockLive.service = live;
});

describe("buildRebookCartItem", () => {
  it("uses today's price, duration and add-ons, and says what changed", () => {
    const withRemoved = { ...last, addOns: [...last.addOns!, { id: "x", name: "Gems", price: 3 }] };
    const { item, notes } = buildRebookCartItem(withRemoved, live, "p1", true);

    expect(item.service).toMatchObject({ id: "s1", price: 40, duration: "1h 15m" });
    expect(item.service.addOns).toEqual([{ id: "a1", name: "Nail Art", price: 8 }]);
    expect(item.providerImage).toEqual({ uri: "https://example.com/logo.png" });
    expect(item.forceNewInstance).toBe(true);
    expect(notes).toEqual([
      "The price is now £40.00 (was £35.00).",
      "Gems is no longer offered and was not added.",
    ]);
  });

  it("leaves add-ons out when asked to", () => {
    expect(buildRebookCartItem(last, live, "p1", false).item.service.addOns).toEqual([]);
  });
});

describe("Becca: rebook my last appointment", () => {
  it("asks about add-ons, and puts the chosen version in the cart on one tap", async () => {
    const addToCart = jest.fn();
    const offer = await ask(addToCart);

    expect(addToCart).not.toHaveBeenCalled();
    expect(offer.message.content).toContain("with Nail Art");
    expect(offer.message.content).toContain("It’s £40 now (it was £35).");
    const labels = offer.message.suggestions!.map((s) => s.text);
    expect(labels).toEqual(["Add with Nail Art (+£8)", "Add without add-ons", "Not now"]);

    const withAddOns = offer.message.suggestions![0]!.data!.message!;
    const without = offer.message.suggestions![1]!.data!.message!;
    const done = await tap(withAddOns, addToCart);

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart.mock.calls[0][0].service.addOns).toEqual([{ id: "a1", name: "Nail Art", price: 8 }]);
    expect(done.message.content).toContain("It’s in your cart, ready to book.");
    expect(done.message.suggestions![0]).toMatchObject({ text: "Go to cart", data: { screen: "CartMain" } });

    // The other button is retired once one has run.
    const second = await tap(without, addToCart);
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(second.message.content).toContain("no longer waiting");
  });

  it("marks the cart buttons as confirm taps, so the chat shows their label, not the code", async () => {
    const offer = await ask(jest.fn(), [{ ...last, addOns: [] }]);
    const [add, notNow] = offer.message.suggestions!;

    // BeccaScreen shows the chip's own words as the client's bubble for these,
    // rather than the internal token it sends.
    expect(isConfirmToken(add!.data!.message!)).toBe(true);
    expect(add!.text).toBe("Add to my cart");
    expect(isConfirmToken(notNow!.data!.message!)).toBe(false);
  });

  it("offers a single Add to my cart when the booking had no add-ons", async () => {
    const addToCart = jest.fn();
    const offer = await ask(addToCart, [{ ...last, addOns: [] }]);

    expect(offer.message.suggestions!.map((s) => s.text)).toEqual(["Add to my cart", "Not now"]);
    await tap(offer.message.suggestions![0]!.data!.message!, addToCart);
    expect(addToCart.mock.calls[0][0].service.addOns).toEqual([]);
  });

  it("says when an old add-on isn't offered any more instead of asking about it", async () => {
    mockLive.service = { ...live, addOns: [] };
    const offer = await ask(jest.fn());

    expect(offer.message.content).toContain("Nail Art isn’t offered any more");
    expect(offer.message.suggestions!.map((s) => s.text)).toEqual(["Add to my cart", "Not now"]);
  });

  it("doesn't offer the cart when the service can't be booked any more", async () => {
    mockLive.service = null;
    const offer = await ask(jest.fn());

    expect(offer.message.content).toContain("isn't available to book right now");
    expect(offer.message.suggestions!.some((s) => s.text.startsWith("Add"))).toBe(false);
  });
});
