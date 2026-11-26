import { normalizeAsk } from "../services/becca/askNormaliser";
import { understand } from "../services/becca/matcher";

/**
 * Everyday ways a provider asks Becca about their own business. Each of these
 * got "I didn't catch that" or a different answer: the phrase lists covered
 * one wording per question ("my hours", "when am i open") and missed the
 * next most natural one ("when do i open", "what time do i start").
 */
const route = (message: string) => understand(normalizeAsk(message), {}, "provider").capabilityId;

describe("Becca answers a provider's everyday asks", () => {
  it.each([
    ["what time is my first client", "pv.today"],
    ["anyone booked in tomorrow", "pv.today"],
    ["what's my week looking like", "pv.week"],
    ["how many bookings this week", "pv.week"],
    ["any gaps this week", "pv.gaps"],
    ["any free slots", "pv.gaps"],
    ["who are my best clients", "pv.clients"],
    ["any new enquiries", "pv.inbox"],
    ["what services do i offer", "pv.myservices"],
    ["what days have i blocked", "pv.timeoff"],
    ["what time do i start on monday", "pv.hours"],
    ["when do i open", "pv.hours"],
    ["how many bookings can i take a day", "pv.capacity"],
    ["how many people saved me", "pv.reach"],
    ["how much did i make this month", "pv.analytics"],
    ["what forms do i send", "pv.infopacks"],
  ])("%p → %s", (message, capabilityId) => {
    expect(route(message)).toBe(capabilityId);
  });

  it.each([
    ["my payouts", "pv.app_navigation"],
    ["when do i get paid", "pv.app_navigation"],
    ["create a promo code", "pv.app_navigation"],
  ])("takes them to the setting for %p", (message, capabilityId) => {
    expect(route(message)).toBe(capabilityId);
  });
});

describe("the words they share with other provider questions stay put", () => {
  it.each([
    ["what's on today", "pv.today"],
    ["how busy am i this week", "pv.week"],
    ["how many bookings last month", "pv.analytics"],
    ["outstanding forms", "pv.forms"],
    ["my info packs", "pv.infopacks"],
    ["what are my hours", "pv.hours"],
    ["change my hours", "pv.app_navigation"],
    ["am i fully booked", "pv.capacity"],
    ["any messages", "pv.inbox"],
  ])("%p → %s", (message, capabilityId) => {
    expect(route(message)).toBe(capabilityId);
  });
});
