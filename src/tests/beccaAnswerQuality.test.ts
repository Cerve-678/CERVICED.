import * as fs from "fs";
import { chooseLayout } from "../services/becca/engine";
import { getCapability } from "../services/becca/registry";
import { resolveService } from "../services/becca/entityResolver";
import type { BeccaHat, CapabilityContext, CapabilityResult, EntityBag } from "../services/becca/types";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

/**
 * Every capability a follow-up card leads to, run for real against a full
 * diary and an empty one. A card that sends a question is only as good as
 * the answer it gets back, so each answer has to be real words: no
 * `undefined`, `NaN` or `null` leaking into what the user reads, no empty
 * card rows, and a shape whenever the answer has one.
 */

// Shared with the mock factories below (jest allows `mock`-prefixed names).
const mockData = { full: true };

const mockLola = {
  id: "p1", slug: "lola-studio", display_name: "Lola Studio", service_category: "LASHES", logo_url: null,
  location_text: "Shoreditch, London", rating: 4.8, review_count: 112,
};
const mockLab = {
  id: "p2", slug: "lash-lab", display_name: "Lash Lab", service_category: "LASHES", logo_url: null,
  location_text: null, rating: 0, review_count: 0,
};

jest.mock("../services/databaseService", () => {
  // Plain values only: the factory runs before the fixtures above exist, so
  // anything built from mockLola/mockLab reads them lazily instead.
  const on = <T, E>(full: T, empty: E) => jest.fn(async () => (mockData.full ? full : empty));
  const ranges = () => new Map([["p1", { min: 55, max: 55 }], ["p2", { min: 65, max: 80 }]]);
  return {
    // client
    getProviders: jest.fn(async () => (mockData.full ? [mockLola, mockLab] : [])),
    getProviderServiceFacets: jest.fn(async () => ({
      priceRanges: mockData.full ? ranges() : new Map(),
      services: new Map(),
      specialityText: new Map(mockData.full ? [["p1", new Set(["Volume Lashes Full Set"])], ["p2", new Set(["Classic Set"])]] : []),
      specialityLabels: new Map(),
    })),
    getProviderPriceRanges: jest.fn(async () => (mockData.full ? ranges() : new Map())),
    getProviderBySlug: jest.fn(async () => (mockData.full
      ? { ...mockLola, services: [
        { id: "s1", name: "Volume Lashes Full Set", price: 55, duration_minutes: 120 },
        { id: "s2", name: "Lash Lift", price: 40, duration_minutes: 60 },
      ] }
      : null)),
    getProviderReviews: on(
      [{ rating: 5, comment: "Amazing set", created_at: "2026-10-20T10:00:00Z" }, { rating: 4, comment: null, created_at: "2026-10-01T10:00:00Z" }],
      [],
    ),
    getProviderIdByDisplayName: jest.fn(async () => "p1"),
    getRebookableService: on({ id: "s1", providerSlug: "lola-studio" }, null),
    getProviderCancellationPolicy: on(24, 0),
    getProviderReschedulePolicyByDisplayName: on({ maxReschedules: 2, rescheduleNoticeHours: 48 }, { maxReschedules: null, rescheduleNoticeHours: 0 }),
    getInfoPacksByBooking: on([{ id: "i1", title: "Aftercare", content: "Keep them dry for 24 hours.", viewedAt: null }], []),
    getPendingIntakeFormsForMe: on([{ id: "f1", bookingId: "b1", title: "Lash consultation form" }], []),
    getMyBookingActionItems: on({ b1: 1 }, {}),
    getProviderLocationsByDisplayNames: on({ "Lola Studio": { address: "Shoreditch, London" } }, {}),
    getProviderDepositPoliciesByDisplayNames: on(
      { "Lola Studio": { depositAvailable: true, depositType: "fixed", depositAmount: 15, depositOnly: false } },
      {},
    ),
    getProviderConsultationService: on({ id: "c1", name: "Patch test & consult", price: 10, durationMinutes: 15, description: null }, null),
    getActivePromotions: on([{
      title: "Autumn offer", discount_percent: 20, discount_text: null, discount_amount: null, promo_code: "AUTUMN20",
      service_category: "LASHES", providers: { slug: "lola-studio", display_name: "Lola Studio", logo_url: null },
    }], []),
    getTopRatedProviders: jest.fn(async () => (mockData.full ? [mockLola] : [])),
    getNewProviders: jest.fn(async () => (mockData.full ? [mockLab] : [])),
    getBookmarkedProviders: jest.fn(async () => (mockData.full ? [mockLola] : [])),
    getMyNotifications: on([{ id: "n1", title: "Booking confirmed", message: "Your lashes are booked in.", is_read: false, booking_id: "b1" }], []),
    getUserConversations: on([{ id: "c1", unread_count_user: 2, provider: { id: "p1", slug: "lola-studio", display_name: "Lola Studio" } }], []),
    getSavedPortfolioIds: on(["x", "y"], []),
    getClientBeautyProfile: on({ lashStyle: "Wispy", styleVibe: "Natural" }, {}),
    getProviderSchedulingConstraints: jest.fn(async () => ({ minBookingNoticeHrs: 24, bookingWindowDays: 60, scheduleReleaseDay: null })),
    // provider
    getMyProviderProfile: jest.fn(async () => ({ id: "me" })),
    getProviderBookingsByDate: on([{ id: "b9", booking_time: "10:00:00", service_name_snapshot: "Volume Lashes", customer_name: "Sarah" }], []),
    getProviderBookingsByDateRange: on([
      { booking_date: "2026-11-03" }, { booking_date: "2026-11-03" }, { booking_date: "2026-11-05" },
    ], []),
    getProviderWaitlist: on([{ status: "waiting", user_name_snapshot: "Amira", service_name_snapshot: "Lash Lift" }], []),
    getProviderClientele: on([
      { customer_name: "Sarah", last_booking_date: "2026-08-01" }, { customer_name: "Jo", last_booking_date: "2026-10-25" },
    ], []),
    getProviderConversations: on([{ id: "c1", unread_count_provider: 1, client: { id: "u1", name: "Sarah" } }], []),
    getMyProviderIntakeForms: on([{ status: "pending" }, { status: "completed" }], []),
    getMyProviderServices: on([{ name: "Volume Lashes", price: 55, price_max: null, duration_minutes: 120, is_active: true }], []),
    getProviderBlockedDates: on([{ blocked_date: "2026-12-24", reason: "Christmas Eve" }], []),
    getMyProviderReviews: on([{ rating: 5, comment: "Lovely, so gentle." }], []),
    getProviderAvailability: on([{ day_of_week: 1, open_time: "09:00:00", close_time: "17:00:00", is_closed: false }], []),
    getProviderBookingCapSettings: on({ max_per_day: 6, auto_accept: true }, { max_per_day: 0, auto_accept: false }),
    countProviderBookingsOnDate: on(2, 0),
    getMyFollowerCount: on(31, 0),
    countProviderServices: on(3, 0),
    getProviderPortfolio: on({ work: [{ id: "w1" }], venue: [] }, { work: [], venue: [] }),
    getProviderSpecialties: on(["Volume lashes"], []),
    getProviderBookings: on([{ booking_date: "2026-10-20", status: "completed", user_id: "u1" }], []),
    getProviderBookingPoliciesById: on({ depositRequired: true, depositAmount: 15, depositType: "fixed", cancelNotice: 24 }, null),
  };
});
jest.mock("../services/AvailabilityService", () => ({
  AvailabilityService: {
    resolveNextAvailableSlot: jest.fn(async () => (mockData.full ? { date: "2026-11-06", time: "14:00:00" } : null)),
  },
}));
jest.mock("../services/clientLocationService", () => ({ resolveClientLocation: jest.fn(async () => null) }));

const upcoming = {
  id: "b1", providerId: "p1", providerName: "Lola Studio", serviceName: "Volume Lashes Full Set",
  status: BookingStatus.UPCOMING, bookingDate: "2026-11-10", bookingTime: "10:00:00", price: 55, amountPaid: 55, remainingBalance: 0,
} as unknown as ConfirmedBooking;
const past = {
  ...upcoming, id: "b0", status: BookingStatus.COMPLETED, bookingDate: "2026-10-01",
} as unknown as ConfirmedBooking;

const entities: EntityBag = {
  provider: { kind: "provider", value: { slug: "lola-studio", dbId: "p1", displayName: "Lola Studio" }, confidence: 1, sourceText: "lola", label: "Lola Studio" },
  booking: { kind: "booking", value: upcoming, confidence: 1, sourceText: "my booking", label: "Volume Lashes with Lola Studio" },
};

/** Every capability a follow-up card leads to (from the card audit). */
const CLIENT = [
  "discover.find", "discover.browse", "discover.available", "discover.followup_price", "discover.top", "meta.help",
  "booking.next", "discover.saved", "booking.list", "booking.prep", "booking.rebook", "discover.followup_day",
  "booking.reschedule", "discover.offers", "inbox.messages", "provider.next_available", "account.saved_looks",
  "booking.cancel", "booking.cost", "booking.details", "booking.info_packs", "discover.provider_services",
  "inbox.notifications", "account.beauty_profile", "booking.location", "booking.routine", "discover.booking_plan",
  "discover.forme", "discover.pick", "discover.reviews", "provider.consultation", "provider.deposit",
  "provider.reschedule_policy",
];
const PROVIDER = [
  "pv.today", "pv.week", "pv.waitlist", "pv.help", "pv.reach", "pv.hours", "pv.inbox", "pv.reviews", "pv.capacity",
  "pv.lapsed", "pv.forms", "pv.clients", "pv.gaps", "pv.notifications", "pv.myservices", "pv.timeoff",
  "pv.automations", "pv.services", "pv.analytics",
];

/** Answers that only open a screen or offer choices; they stay plain text by design. */
const PLAIN_BY_DESIGN = new Set(["discover.browse", "meta.help", "pv.help", "booking.info_packs", "discover.inspiration"]);

function strings(result: CapabilityResult): string[] {
  const out = [result.text, ...(result.work ?? [])];
  if (result.headline) out.push(result.headline.value, result.headline.label);
  const card = result.card;
  if (card) {
    out.push(card.title, card.meta ?? "", card.footer ?? "");
    for (const row of card.rows ?? []) out.push(row.title, row.detail ?? "", row.tag ?? "");
    for (const stat of card.stats ?? []) out.push(stat.value, stat.label);
  }
  return out;
}

async function run(id: string, hat: BeccaHat): Promise<CapabilityResult> {
  const capability = getCapability(id, hat)!;
  const ctx: CapabilityContext = {
    entities: { ...entities, service: resolveService("volume lashes")! },
    hat,
    rawMessage: "volume lashes",
    verbatimMessage: "volume lashes",
    bookings: mockData.full ? [upcoming, past] : [],
    now: new Date("2026-11-02T12:00:00Z"),
    userId: "u1",
    personal: { topCategory: "LASHES", favouriteServices: [], styleTags: ["wispy"], interactionCount: 6 },
  };
  return capability.run(ctx);
}

const report: string[] = [];
afterAll(() => {
  const out = process.env["BECCA_ANSWER_REPORT"];
  if (out) fs.writeFileSync(out, report.join("\n"));
});

describe.each([
  ["a full diary", true],
  ["an empty one", false],
])("Every follow-up card gets a real answer, with %s", (_label, full) => {
  beforeAll(() => { mockData.full = full; });

  it.each([...CLIENT.map((id) => [id, "client"]), ...PROVIDER.map((id) => [id, "provider"])] as [string, BeccaHat][])(
    "%s (%s)",
    async (id, hat) => {
      const result = await run(id, hat);
      const layout = chooseLayout(result);
      report.push(
        `\n### ${id} · ${full ? "full" : "empty"} · ${layout ?? "text"}`,
        result.headline ? `HEADLINE ${result.headline.value} | ${result.headline.label}` : "",
        result.card ? `CARD ${result.card.title}${result.card.meta ? ` | ${result.card.meta}` : ""}${result.card.stamp ? " | ticket" : ""}` : "",
        ...(result.card?.rows ?? []).map((r) => `  - ${r.title}${r.detail ? ` | ${r.detail}` : ""}${r.tag ? ` | ${r.tag}` : ""}${r.range ? " | bar" : ""}`),
        ...(result.card?.stats ?? []).map((s) => `  # ${s.value} ${s.label}`),
        ...(result.work ?? []).map((w) => `  ✓ ${w}`),
        `TEXT ${result.text.replace(/\n+/g, " ⏎ ")}`,
      );

      expect(result.text.trim().length).toBeGreaterThan(0);
      for (const s of strings(result)) {
        expect(s).not.toMatch(/undefined|NaN|\[object Object\]|\bnull\b/);
      }
      for (const row of result.card?.rows ?? []) expect(row.title.trim().length).toBeGreaterThan(0);
      if (result.headline) expect(result.headline.value.trim().length).toBeGreaterThan(0);
      // With data to show, every answer that has a shape uses it.
      if (full && !PLAIN_BY_DESIGN.has(id)) expect(layout).not.toBeNull();
    },
  );
});
