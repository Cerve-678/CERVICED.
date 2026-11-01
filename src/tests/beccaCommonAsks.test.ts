import { normalizeAsk } from "../services/becca/askNormaliser";
import { understand } from "../services/becca/matcher";
import type { BeccaHat, EntityBag } from "../services/becca/types";

const withService = (category: string): EntityBag => ({
  service: {
    kind: "service",
    value: { category },
    confidence: 1,
    sourceText: category.toLowerCase(),
    label: category.toLowerCase(),
  },
});

function route(message: string, hat: BeccaHat, entities: EntityBag = {}) {
  return understand(normalizeAsk(message), entities, hat).capabilityId;
}

/**
 * Everyday ways people phrase the same asks. This is intentionally a routing
 * contract, rather than a snapshot of copy: it protects conversational
 * coverage as capability phrases evolve.
 */
describe("Becca's common everyday asks", () => {
  describe("clients", () => {
    it.each([
      ["When's my next appointment?", "booking.next"],
      ["What have I got coming up?", "booking.next"],
      ["Show all my bookings", "booking.list"],
      ["I need to cancel my appointment", "booking.cancel"],
      ["Can I move my booking?", "booking.reschedule"],
      ["Do I need to prepare for my appointment?", "booking.prep"],
      ["Book my usual again", "booking.rebook"],
      ["What do I normally get?", "booking.routine"],
      ["Where is my appointment?", "booking.location"],
      ["Have I got any messages?", "inbox.messages"],
      ["Anything I've missed?", "inbox.notifications"],
      ["Show my saved providers", "discover.saved"],
      ["Am I on a waitlist?", "discover.waitlist"],
      ["What services can I book?", "discover.browse"],
      ["Show me nail ideas", "discover.inspiration"],
    ])("routes %p to %s", (message, capabilityId) => {
      expect(route(message, "client")).toBe(capabilityId);
    });

    it.each([
      ["I'm looking for a nail tech"],
      ["I am looking for nails"],
      ["Can you find me someone for lashes?"],
      ["I need a hair appointment"],
      ["Where can I get brows done?"],
      ["Who does facials near me?"],
      ["I want to book a manicure"],
      ["Any lash techs nearby?"],
      ["Help me find a makeup artist"],
      ["I'm after a massage"],
    ])("treats a service search as finding a provider: %p", (message) => {
      expect(route(message, "client", withService("NAILS"))).toBe("discover.find");
    });

    it.each([
      ["Who's free this week?", "discover.available"],
      ["Any openings for nails?", "discover.available"],
      ["How much do nails cost?", "discover.followup_price"],
      ["What's the average price for lashes?", "discover.followup_price"],
      ["Plan my nail appointment", "discover.booking_plan"],
      ["Find nails under 40", "discover.find"],
    ])("routes a service-led ask: %p", (message, capabilityId) => {
      expect(route(message, "client", withService("NAILS"))).toBe(capabilityId);
    });
  });

  describe("providers", () => {
    it.each([
      ["What's on today?", "pv.today"],
      ["Who's coming in tomorrow?", "pv.today"],
      ["How busy am I this week?", "pv.week"],
      ["Where are my gaps?", "pv.gaps"],
      ["Anyone waiting for a cancellation?", "pv.waitlist"],
      ["How many clients do I have?", "pv.clients"],
      ["Any unread messages?", "pv.inbox"],
      ["Who hasn't filled their form in?", "pv.forms"],
      ["Who hasn't been back in a while?", "pv.lapsed"],
      ["What do I charge?", "pv.myservices"],
      ["Anything new?", "pv.notifications"],
      ["When am I off?", "pv.timeoff"],
      ["What are clients saying?", "pv.reviews"],
      ["What are my working hours?", "pv.hours"],
      ["Am I fully booked?", "pv.capacity"],
      ["How many followers have I got?", "pv.reach"],
      ["What address do clients see?", "pv.address"],
      ["Open my analytics", "pv.analytics"],
      ["What is my deposit policy?", "pv.automations"],
      ["What prep notes do I send clients?", "pv.infopacks"],
    ])("routes %p to %s", (message, capabilityId) => {
      expect(route(message, "provider")).toBe(capabilityId);
    });
  });
});
