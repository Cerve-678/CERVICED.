// Client-hat capabilities.
//
// Each one answers from REAL app data and hands back tappable follow-ups.
// Becca reads and routes; she never writes booking mutations herself — the
// action chips deep-link into the screen that owns that write, with the
// booking already selected. See BECCA_CAPABILITIES.md §2.1.

import { BookingStatus, type ConfirmedBooking } from "../../../types/booking";
import {
  formatShortDate,
  formatTime12,
  relativeDayLabel,
} from "../../../utils/dateUtils";
import {
  addBookmark,
  getActivePromotions,
  getActiveRescheduleRequest,
  getBookmarkedProviders,
  getClientBeautyProfile,
  getMyBookmarkCount,
  getMyEventPlans,
  getMyFollowerCount,
  getNotificationPreferences,
  getProviderConsultationService,
  getProviderContactByDisplayName,
  getProviderReschedulePolicyByDisplayName,
  getSavedPortfolioIds,
  validatePromoCode,
  hasReviewedBooking,
  isProviderBookmarked,
  joinWaitlist,
  getMyBookingActionItems,
  getMyNotifications,
  getNewProviders,
  getPendingIntakeFormsForMe,
  getPortfolioItems,
  getTopRatedProviders,
  getUserConversations,
  searchPortfolio,
  getProviderBySlug,
  getProviderCancellationPolicy,
  getProviderIdByDisplayName,
  getProviderLocationsByDisplayNames,
  getMobileProviderDisplayNames,
  getProviderDepositPoliciesByDisplayNames,
  getProviderPriceRanges,
  getProviderSchedulingConstraints,
  getProviders,
  getProviderReviews,
  getRebookableService,
  getUserWaitlistEntries,
} from "../../databaseService";
import { AvailabilityService } from "../../AvailabilityService";
import { hasUsefulHistory, type Capability, type CapabilityResult } from "../types";
import { CATEGORY_LABELS } from "../serviceCatalogue";
import {
  chip,
  navChip,
  askChip,
  money,
  providerFromDb,
  goodNews,
  softMiss,
  resolveProviderDbId,
} from "./shared";

/** Human labels for NotificationPreferences' keys. */
const PREF_LABELS: Record<string, string> = {
  bookingConfirm: "booking confirmations",
  bookingReminder: "appointment reminders",
  bookingUpdates: "booking updates",
  promotions: "offers",
  newProviders: "new providers",
  weeklySummary: "weekly summary",
};

// ==================== BOOKINGS ====================

const nextBooking: Capability = {
  id: "booking.next",
  hat: "client",
  describe: "When is my next appointment",
  phrases: [
    "next appointment", "next booking", "when is my", "when's my", "whens my",
    "what's next", "whats next", "upcoming appointment", "upcoming booking",
    "my next", "when am i next", "when do i next", "am i booked in",
    "what have i got coming up", "what's coming up", "whats coming up",
    "when's my appointment", "when am i seeing", "next one",
    "how long until my", "when do i see",
  ],
  async run({ bookings }): Promise<CapabilityResult> {
    const upcoming = sortUpcoming(bookings);
    const next = upcoming[0];
    if (!next) {
      return {
        text: "You've got nothing booked in at the moment.",
        suggestions: [
          askChip("find", "Find someone", "Find me a provider"),
          askChip("rebook", "Rebook my last one", "Rebook my last appointment"),
          askChip("saved", "My saved providers", "Show my saved providers"),
        ],
      };
    }

    const rel = relativeDayLabel(next.bookingDate);
    const when = rel ?? formatShortDate(next.bookingDate);
    return {
      text:
        `## Your next appointment\n` +
        `**${next.serviceName}** with **${next.providerName}**\n` +
        `- **When:** ${when} at ${formatTime12(next.bookingTime)}\n` +
        `- **Cost:** ${money(next.price)}` +
        (upcoming.length > 1
          ? `\n\n**Also booked:** ${upcoming.length - 1} more appointment${upcoming.length > 2 ? "s" : ""}.`
          : ""),
      suggestions: [
        navChip("view", "View booking", "BookingDetail", { bookingId: next.id }),
        navChip("resched", "Reschedule", "Reschedule", { bookingId: next.id }),
        ...(upcoming.length > 1
          ? [askChip("all", "See all bookings", "Show all my bookings")]
          : []),
        askChip("location", "Where is it?", "Where is my next appointment?"),
        askChip("cost", "What am I paying?", "How much is it?"),
        askChip("prep", "How should I prep?", "How do I prepare for my appointment?"),
      ],
    };
  },
};

const listBookings: Capability = {
  id: "booking.list",
  hat: "client",
  describe: "What have I got booked",
  phrases: [
    "my bookings", "all my bookings", "my appointments", "show my bookings",
    "what have i got", "what do i have", "my schedule", "booked in",
  ],
  async run({ bookings, entities }): Promise<CapabilityResult> {
    let upcoming = sortUpcoming(bookings);

    const date = entities.date?.value;
    if (date) {
      upcoming = upcoming.filter(
        (b) => b.bookingDate >= date.ymd && b.bookingDate <= date.endYmd,
      );
    }

    if (upcoming.length === 0) {
      return {
        text: date
          ? `Nothing booked ${date.label}.`
          : "You've got nothing booked in at the moment.",
        suggestions: [
          askChip("find", "Find someone", "Find me a provider"),
          askChip("rebook", "Rebook my last one", "Rebook my last appointment"),
          askChip("saved", "My saved providers", "Show my saved providers"),
        ],
      };
    }

    const lines = upcoming
      .slice(0, 6)
      .map((b) => {
        const rel = relativeDayLabel(b.bookingDate) ?? formatShortDate(b.bookingDate);
        return `- **${b.serviceName}** with **${b.providerName}**\n  ${rel} at ${formatTime12(b.bookingTime)} · **${money(b.price)}**`;
      })
      .join("\n\n");

    const header = date
      ? `You've got ${upcoming.length} booked ${date.label}:`
      : `You've got ${upcoming.length} coming up:`;

    return {
      text: `## ${header}\n\n${lines}${upcoming.length > 6 ? `\n\n**Plus ${upcoming.length - 6} more.**` : ""}`,
      suggestions: [
        // Every item Becca has just summarised is actionable. A generic
        // "Open Bookings" link forces the user to find the same appointment
        // again; these links land on the exact record they tapped.
        ...bookingChoices(upcoming),
        ...(upcoming.length > 6
          ? [navChip("all", "Open all bookings", "Bookings")]
          : []),
        askChip("next", "Just the next one", "When is my next appointment?"),
        askChip("cost", "What am I paying?", "How much is it?"),
      ],
    };
  },
};

const bookingCost: Capability = {
  id: "booking.cost",
  hat: "client",
  describe: "How much is my appointment costing",
  phrases: [
    "how much do i owe", "how much is it", "what am i paying", "what do i owe",
    "cost of my booking", "how much have i paid", "how much did i pay",
    "what's the total", "whats the total", "how much will it be",
    "have i paid", "is it paid", "what's left to pay", "outstanding balance",
  ],
  async run({ bookings, entities }): Promise<CapabilityResult> {
    const upcoming = sortUpcoming(bookings);
    const target = entities.booking?.value ?? (upcoming.length === 1 ? upcoming[0] : undefined);
    if (!target) {
      if (upcoming.length > 1) {
        const lines = upcoming.slice(0, 6).map((booking) =>
          `- **${booking.serviceName}** with **${booking.providerName}**\n` +
          `  ${formatShortDate(booking.bookingDate)} · **${money(booking.price)}**`,
        );
        return {
          text: `## Your upcoming booking costs\nChoose a booking for its payment details:\n\n${lines.join("\n\n")}`,
          suggestions: bookingChoices(upcoming),
        };
      }
      return {
        text: "You've got nothing booked in, so nothing to pay.",
        suggestions: [
          askChip("find", "Find someone", "Find me a provider"),
          askChip("rebook", "Rebook my last one", "Rebook my last appointment"),
        ],
      };
    }
    const outstanding = target.remainingBalance ?? 0;
    return {
      text:
        `**${target.serviceName}** with ${target.providerName}\n` +
        `${formatShortDate(target.bookingDate)} at ${formatTime12(target.bookingTime)}\n\n` +
        `Total ${money(target.price)} · paid ${money(target.amountPaid ?? 0)}` +
        // Only ever describes what the APP processed. Anything settled
        // directly with the provider is deliberately outside what Becca
        // tracks or attests to — see BECCA_CAPABILITIES.md §2.2.
        (outstanding > 0
          ? `\n\n${money(outstanding)} is settled directly with ${target.providerName}.`
          : ""),
      suggestions: [
        navChip("view", "View booking", "BookingDetail", { bookingId: target.id }),
        askChip("policy", "What's the reschedule policy?", "What's the reschedule policy?"),
        askChip("prep", "How should I prep?", "How do I prepare for my appointment?"),
      ],
    };
  },
};

const cancelBooking: Capability = {
  id: "booking.cancel",
  hat: "client",
  describe: "Cancel a booking",
  phrases: [
    "cancel my", "cancel booking", "cancel appointment", "cancel it",
    "call off", "can't make it", "cant make it", "can't come", "cant come",
    "need to cancel", "want to cancel", "have to cancel", "drop my booking",
    "won't make it", "wont make it", "something's come up", "somethings come up",
  ],
  needs: [{ kind: "booking", required: false }],
  async run({ bookings, entities }): Promise<CapabilityResult> {
    const target = entities.booking?.value ?? soleUpcoming(bookings);
    if (!target) {
      const choices = bookingChoices(sortUpcoming(bookings), "Choose");
      if (choices.length === 0) {
        return {
          text: "You don’t have an upcoming booking to cancel.",
          suggestions: [askChip("find", "Find someone", "Find me a provider")],
        };
      }
      return {
        text: "## Choose a booking to cancel\nI’ll take you straight to the right booking, where you can review the policy and confirm.",
        suggestions: [...choices, navChip("all", "Open all bookings", "Bookings")],
      };
    }

    // Real policy from the provider's own settings, not a generic line.
    // Looked up by DISPLAY NAME: ConfirmedBooking carries the provider's name
    // snapshot, not their UUID, so the by-id variant would be given a booking
    // id and silently return the default.
    //
    // Only ever states a policy POSITIVELY (">0 hours"). getProviderCancellation-
    // Policy swallows its query error and returns 0 on failure, so 0 means
    // either "no notice needed" or "couldn't check" — indistinguishable here.
    // Asserting "you can cancel anytime" off that would be Becca confidently
    // telling a client something that might be false, so a 0 says nothing and
    // the booking screen remains the source of truth.
    let policyNote = "";
    try {
      const hours = await getProviderCancellationPolicy(target.providerName);
      if (hours > 0) policyNote = `\n\n${target.providerName} asks for ${hours}h notice to cancel free of charge.`;
    } catch {
      // Policy is a nicety here — never block the route to the screen that
      // actually performs the cancellation just because we couldn't read it.
    }

    return {
      text:
        `To cancel **${target.serviceName}** with ${target.providerName} ` +
        `(${formatShortDate(target.bookingDate)} at ${formatTime12(target.bookingTime)}), ` +
        `open the booking and confirm there.${policyNote}`,
      suggestions: [navChip("view", "Open booking", "BookingDetail", { bookingId: target.id })],
    };
  },
};

const rescheduleBooking: Capability = {
  id: "booking.reschedule",
  hat: "client",
  describe: "Reschedule or move a booking",
  phrases: [
    "reschedule", "move my", "move it", "change my booking", "change the time",
    "change the date", "different day", "another day", "different time",
    "another time", "push it back", "bring it forward", "shift my",
    "rearrange", "swap my appointment", "can i come a different",
  ],
  needs: [{ kind: "booking", required: false }],
  async run({ bookings, entities }): Promise<CapabilityResult> {
    const target = entities.booking?.value ?? soleUpcoming(bookings);
    if (!target) {
      const choices = bookingChoices(sortUpcoming(bookings), "Choose");
      if (choices.length === 0) {
        return {
          text: "You don’t have an upcoming booking to reschedule.",
          suggestions: [askChip("find", "Find someone", "Find me a provider")],
        };
      }
      return {
        text: "## Choose a booking to reschedule\nPick the appointment you want to move and I’ll open its available times.",
        suggestions: [...choices, navChip("all", "Open all bookings", "Bookings")],
      };
    }
    return {
      text:
        `Let's move **${target.serviceName}** with ${target.providerName}, ` +
        `currently ${formatShortDate(target.bookingDate)} at ${formatTime12(target.bookingTime)}.`,
      suggestions: [
        navChip("resched", "Pick a new time", "Reschedule", { bookingId: target.id }),
        navChip("view", "View booking", "BookingDetail", { bookingId: target.id }),
      ],
    };
  },
};

const bookingPrep: Capability = {
  id: "booking.prep",
  hat: "client",
  describe: "Do I need to do anything before my appointment",
  phrases: [
    "do i need to", "anything to fill", "forms", "intake form", "patch test",
    "before my appointment", "anything i need", "prepare", "aftercare",
  ],
  async run(): Promise<CapabilityResult> {
    // Both reads are independent — run them together rather than in sequence.
    const [formsRes, itemsRes] = await Promise.allSettled([
      getPendingIntakeFormsForMe(),
      getMyBookingActionItems(),
    ]);

    const forms = formsRes.status === "fulfilled" ? formsRes.value : [];
    const items = itemsRes.status === "fulfilled" ? itemsRes.value : {};
    const outstanding = Object.values(items).reduce((a, b) => a + b, 0);

    if (forms.length === 0 && outstanding === 0) {
      return {
        text: "Nothing outstanding — you're all set for your appointments.",
        suggestions: [askChip("next", "When's my next one?", "When's my next appointment?")],
      };
    }

    const parts: string[] = [];
    if (forms.length > 0) {
      parts.push(
        `- **Forms:** ${forms.length} to fill in before your appointment${forms.length > 1 ? "s" : ""}.`,
      );
    }
    if (outstanding > 0) {
      parts.push(
        `- **Booking tasks:** ${outstanding} item${outstanding > 1 ? "s" : ""} need${outstanding === 1 ? "s" : ""} your attention.`,
      );
    }

    return {
      text: `Here’s what needs your attention:\n\n${parts.join("\n")}`,
      suggestions: [
        ...forms.slice(0, 4).map((form) =>
          navChip(`form-${form.id}`, `Open: ${form.title}`, "ClientIntakeForm", {
            formId: form.id,
            bookingId: form.bookingId,
            serviceName: form.title,
          }),
        ),
        navChip("all", "Open Bookings", "Bookings"),
      ],
    };
  },
};

const rebook: Capability = {
  id: "booking.rebook",
  hat: "client",
  describe: "Book the same thing again",
  phrases: ["book again", "rebook", "same again", "book that again", "usual again", "last time"],
  async run({ bookings }): Promise<CapabilityResult> {
    const past = bookings
      .filter((b) => b.status === BookingStatus.COMPLETED)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
    const last = past[0];
    if (!last) {
      return {
        text: "You haven't had an appointment through the app yet, so there's nothing to rebook.",
        suggestions: [askChip("find", "Find someone", "Find me a provider")],
      };
    }
    // Resolve the actual service before offering it. getRebookableService
    // re-checks is_active + has_gone_live, so a provider who has since taken
    // their profile down is never offered as rebookable — and it returns the
    // real slug, which navigation needs (a display name would 404 the profile).
    let rebookable = null;
    try {
      const providerId = await getProviderIdByDisplayName(last.providerName);
      if (providerId) {
        rebookable = await getRebookableService(providerId, last.serviceName);
      }
    } catch {
      // Fall through to the no-longer-available message below.
    }

    if (!rebookable) {
      return {
        text:
          `Last time you had **${last.serviceName}** with ${last.providerName}, ` +
          `but that isn't available to book right now.`,
        suggestions: [askChip("find", "Find someone else", "Show me all services")],
      };
    }

    return {
      text:
        `Last time you had **${last.serviceName}** with ${last.providerName} ` +
        `on ${formatShortDate(last.bookingDate)}. Want the same again?`,
      suggestions: [
        navChip("profile", `Book with ${last.providerName}`, "ProviderProfile", {
          providerId: rebookable.providerSlug,
          source: "becca",
          openServiceId: rebookable.id,
        }),
      ],
    };
  },
};

// ==================== DISCOVERY ====================

const findProviders: Capability = {
  id: "discover.find",
  hat: "client",
  describe: "Find a provider for a service, optionally by price",
  // Deliberately NOT a bare "show me": that phrase says nothing about whether
  // the user wants a provider list or examples of work, and as a generic
  // catch-all here it swallowed "show me some nail ideas" (see
  // discover.inspiration). Phrases here all imply wanting a PERSON.
  phrases: [
    "find", "find me", "looking for", "need a", "want a", "recommend",
    "who does", "anyone who", "search for", "book a", "show me providers",
    "show me someone", "find someone", "i need my", "need my", "get my",
    "want my", "sort my", "book me in", "who can do",
  ],
  needs: [{ kind: "service", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service!.value;
    const label = service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase();
    const priceFilter = entities.money?.value;

    const dbProviders = await getProviders(service.category);
    let providers = dbProviders.map(providerFromDb);

    if (priceFilter && dbProviders.length > 0) {
      // getProviderPriceRanges is keyed by the real provider UUID, NOT the
      // slug that Provider.id carries — map slug→UUID rather than looking the
      // slug up in a UUID-keyed map (which would silently always miss).
      const ranges = await getProviderPriceRanges(dbProviders.map((p) => p.id));
      const slugToId = new Map(dbProviders.map((p) => [p.slug, p.id]));
      providers = providers
        .map((p) => {
          const range = slugToId.get(p.id) ? ranges.get(slugToId.get(p.id)!) : undefined;
          return range ? { ...p, minPrice: range.min, maxPrice: range.max } : p;
        })
        // A provider with no price data is excluded rather than assumed to
        // pass — "does £X–Y overlap the request" is unanswerable without it.
        .filter((p) => {
          if (p.minPrice == null || p.maxPrice == null) return false;
          if (priceFilter.max != null && p.minPrice > priceFilter.max) return false;
          if (priceFilter.min != null && p.maxPrice < priceFilter.min) return false;
          return true;
        });
    }

    const priceSuffix = priceFilter ? ` ${entities.money!.label}` : "";

    if (providers.length === 0) {
      return {
        text: `${softMiss()} I couldn't find any ${label} providers${priceSuffix}. Want to try a different angle?`,
        suggestions: [
          ...(priceFilter ? [askChip("nofilter", "Try without the budget", `Find ${label}`)] : []),
          askChip("browse", "Browse everything", "Show me all services"),
        ],
      };
    }

    return {
      text: `${goodNews()} I found **${providers.length} ${label} provider${providers.length !== 1 ? "s" : ""}**${priceSuffix}.`,
      providers: providers.slice(0, 12),
      suggestions: [
        askChip("free", "Who's free soon?", `Which ${label} providers are free this week?`),
        askChip("deals", "Any deals?", `Any ${label} offers on?`),
      ],
    };
  },
};

const pickFromList: Capability = {
  id: "discover.pick",
  hat: "client",
  describe: "Tell me about the one you just showed me",
  // Pointing at a result Becca just displayed. Requires a resolved provider,
  // which for these phrasings only ever comes from the engine's ordinal/
  // pronoun resolution against the last shown list — so it can't fire cold.
  phrases: [
    "the first one", "the second one", "the third one", "the last one",
    "that one", "this one", "first one", "second one", "number one",
    "tell me about", "more about", "what about them", "who are they",
    "book the first", "book that one", "go with", "i'll take", "ill take",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const dbId = await resolveProviderDbId(provider);

    // Price and reviews are independent reads — fetch together.
    const [rangeRes, reviewRes] = await Promise.allSettled([
      dbId ? getProviderPriceRanges([dbId]) : Promise.resolve(new Map()),
      dbId ? getProviderReviews(dbId) : Promise.resolve([]),
    ]);

    const range =
      rangeRes.status === "fulfilled" && dbId ? rangeRes.value.get(dbId) : undefined;
    const reviews = reviewRes.status === "fulfilled" ? reviewRes.value : [];

    const bits: string[] = [];
    if (range) bits.push(`${money(range.min)}\u2013${money(range.max)}`);
    if (reviews.length > 0) {
      const avg = reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length;
      bits.push(`${avg.toFixed(1)}\u2605 from ${reviews.length} review${reviews.length !== 1 ? "s" : ""}`);
    }

    return {
      text: `**${provider.displayName}**` + (bits.length > 0 ? `\n\n${bits.join(" \u00b7 ")}` : ""),
      suggestions: [
        navChip("profile", "View profile", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
        askChip("free", "When are they free?", `When is ${provider.displayName} next free?`),
      ],
    };
  },
};

const followUpDay: Capability = {
  id: "discover.followup_day",
  hat: "client",
  describe: "What about a different day",
  // Pure follow-ups: these mean nothing alone, and only score at all once a
  // date resolves AND a service has been carried in from the last turn — so
  // "what about Saturday?" works mid-conversation and matches nothing cold.
  phrases: [
    "what about", "how about", "and on", "any good for", "what if",
    "could i do", "can i do", "does that work", "instead",
  ],
  needs: [
    { kind: "date", required: true },
    { kind: "service", required: true },
  ],
  async run(ctx): Promise<CapabilityResult> {
    // Same answer as an availability search — the only difference is that the
    // service came from context rather than from this message.
    return findAvailable.run(ctx);
  },
};

const followUpPrice: Capability = {
  id: "discover.followup_price",
  hat: "client",
  describe: "How much are they / what do they charge",
  phrases: [
    "how much are they", "how much do they charge", "what do they charge",
    "how much is that", "what's the price", "whats the price", "price range",
    "how much roughly", "are they expensive", "how pricey",
  ],
  needs: [{ kind: "service", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service!.value;
    const label = service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase();

    const dbProviders = await getProviders(service.category);
    if (dbProviders.length === 0) {
      return { text: `${softMiss()} I couldn't find any ${label} providers to price up.` };
    }

    const ranges = await getProviderPriceRanges(dbProviders.map((p) => p.id));
    // Count only providers who actually contributed a price. `dbProviders` is
    // every provider in the category, including ones with nothing published —
    // quoting that as the range's basis overstates it ("£25 to £80 across 6
    // providers" when only one of the six has prices).
    const priced = [...ranges.values()].filter((r) => r.min > 0 && r.max > 0);

    if (priced.length === 0) {
      return {
        text: `${softMiss()} none of the ${label} providers have published prices yet — you'd need to ask them directly.`,
      };
    }

    const low = Math.min(...priced.map((r) => r.min));
    const high = Math.max(...priced.map((r) => r.max));
    return {
      text:
        `${label.charAt(0).toUpperCase()}${label.slice(1)} runs from about ` +
        `**${money(low)}** to **${money(high)}** across ${priced.length} provider${priced.length !== 1 ? "s" : ""}.`,
      suggestions: [
        askChip("cheap", "Show me the cheaper end", `Find ${label} under ${Math.round(low + (high - low) * 0.4)}`),
        askChip("free", "Who's free soon?", `Which ${label} providers are free this week?`),
      ],
    };
  },
};

const findAvailable: Capability = {
  id: "discover.available",
  hat: "client",
  describe: "Find providers who are actually free on a given day",
  phrases: [
    "free on", "available on", "who's free", "whos free", "who is free",
    "availability", "any openings", "got space", "fit me in", "free this",
  ],
  needs: [{ kind: "service", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service!.value;
    const label = service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase();
    const date = entities.date?.value;

    const dbProviders = await getProviders(service.category);
    if (dbProviders.length === 0) {
      return { text: `I couldn't find any ${label} providers at all.` };
    }

    // Availability is per-provider and genuinely expensive, so cap the fan-out
    // and run the checks concurrently rather than sequentially.
    const candidates = dbProviders.slice(0, 8);
    // Pass the real UUID, not the display name: findNextAvailableDate would
    // otherwise run an extra ilike() lookup per provider to resolve the name
    // back to the id we already have here.
    const checks = await Promise.allSettled(
      candidates.map((p) => AvailabilityService.findNextAvailableDate(p.id)),
    );

    const free = candidates
      .map((p, i) => {
        const res = checks[i];
        const nextDate = res?.status === "fulfilled" ? res.value : null;
        if (!nextDate) return null;
        // findNextAvailableDate searches forward from today, so when the user
        // named a day we filter to it here rather than passing it in — its
        // second parameter is a service duration, not a start date.
        if (date && (nextDate < date.ymd || nextDate > date.endYmd)) return null;
        return { provider: p, nextDate };
      })
      .filter((x): x is { provider: (typeof candidates)[number]; nextDate: string } => x !== null);

    if (free.length === 0) {
      return {
        text: date
          ? `${softMiss()} none of the ${label} providers I checked have space ${date.label} — but there may be more further out.`
          : `${softMiss()} I couldn't find open slots with the ${label} providers I checked.`,
        suggestions: [askChip("all", `Show all ${label}`, `Find ${label}`)],
      };
    }

    const lines = free
      .slice(0, 5)
      .map((f) => `- **${f.provider.display_name}** — next free **${formatShortDate(f.nextDate)}**`)
      .join("\n");

    return {
      text: `## ${goodNews()} availability found\n**${free.length} ${label} provider${free.length !== 1 ? "s" : ""}** ${free.length !== 1 ? "have" : "has"} space${date ? ` around **${date.label}**` : ""}.\n\n${lines}`,
      providers: free.map((f) => providerFromDb(f.provider)),
      // Recommendations used to be a dead end — the cards appeared and the
      // conversation stopped. These keep it moving: the obvious next things
      // someone asks after seeing who's available.
      suggestions: [
        askChip("deals", "Any deals?", `Any ${label} offers on?`),
        askChip("all", `All ${label}`, `Find ${label}`),
        askChip("bookings", "My bookings", "Show my bookings"),
      ],
    };
  },
};

const deals: Capability = {
  id: "discover.deals",
  hat: "client",
  describe: "Any offers or deals on",
  phrases: [
    "deals", "offers", "discount", "discounts", "promotion", "promotions",
    "promo", "sale", "anything cheap", "any offers", "special offers",
    "anything on offer", "bargains", "cheap", "money off", "savings",
  ],
  async run({ entities }): Promise<CapabilityResult> {
    const category = entities.service?.value.category;
    const promos = await getActivePromotions(category);
    if (promos.length === 0) {
      return {
        text: category
          ? `No ${CATEGORY_LABELS[category] ?? category.toLowerCase()} offers running right now.`
          : "No offers running at the moment.",
      };
    }
    const lines = promos
      .slice(0, 5)
      .map((p) => `- **${p.title ?? "Offer"}** — ${p.providers?.display_name ?? "a provider"}`)
      .join("\n");
    return { text: `${goodNews()} ${promos.length} offer${promos.length !== 1 ? "s" : ""} running right now:\n\n${lines}` };
  },
};

const reviews: Capability = {
  id: "discover.reviews",
  hat: "client",
  describe: "What do people say about a provider",
  phrases: [
    "reviews", "what do people say", "are they any good", "rating", "ratings",
    "feedback", "recommended", "are they good", "what are they like",
    "any good", "how are they rated", "what's their rating", "testimonials",
    "is she good", "is he good", "do people like",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // May have come from a pronoun/ordinal reference, which carries no UUID.
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return { text: `${softMiss()} I couldn't look ${provider.displayName} up properly.` };
    }
    const rows = await getProviderReviews(providerDbId);
    if (rows.length === 0) {
      return {
        text: `${provider.displayName} hasn't got any reviews yet.`,
        suggestions: [navChip("profile", "View profile", "ProviderProfile", { providerId: provider.slug, source: "becca" })],
      };
    }
    const avg = rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rows.length;
    return {
      text: `${provider.displayName} — ${avg.toFixed(1)}★ from ${rows.length} review${rows.length !== 1 ? "s" : ""}.`,
      suggestions: [navChip("profile", "Read reviews", "ProviderProfile", { providerId: provider.slug, source: "becca" })],
    };
  },
};

const providerServices: Capability = {
  id: "discover.provider_services",
  hat: "client",
  describe: "What a specific provider offers, and what it costs",
  phrases: [
    "what do they offer", "what does she do", "what does he do",
    "their services", "what services", "what can i book with",
    "what do they do", "their prices", "how much do they charge",
    "price list", "menu",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // getProviderBySlug already filters has_gone_live + is_active, so a
    // provider who isn't live can never be described to a client here.
    const full = provider.slug ? await getProviderBySlug(provider.slug) : null;
    if (!full) {
      return {
        text: `${softMiss()} I couldn't pull up what ${provider.displayName} offers just now.`,
      };
    }

    const services = full.services ?? [];
    if (services.length === 0) {
      return {
        text: `${provider.displayName} hasn't listed any services yet.`,
        suggestions: [
          navChip("profile", "View profile", "ProviderProfile", { providerId: provider.slug, source: "becca" }),
          askChip("similar", "Find someone similar", "Show me all services"),
        ],
      };
    }

    // Cheapest first: the entry price is what someone weighing up a new
    // provider actually wants to see, and it reads as a menu rather than an
    // arbitrary ordering.
    const sorted = [...services].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    const lines = sorted
      .slice(0, 6)
      .map((s) => {
        const mins = s.duration_minutes ? ` · ${s.duration_minutes} min` : "";
        return `- **${s.name}** — **${money(s.price ?? 0)}**${mins}`;
      })
      .join("\n");
    const more = sorted.length > 6 ? `\n\n…and ${sorted.length - 6} more on their profile.` : "";

    return {
      text: `${provider.displayName} offers **${services.length} service${services.length !== 1 ? "s" : ""}**:\n\n${lines}${more}`,
      suggestions: [
        navChip("book", `Book with ${provider.displayName}`, "ProviderProfile", { providerId: provider.slug, source: "becca" }),
        askChip("free", "When are they free?", `When is ${provider.displayName} free?`),
        askChip("reviews", "What do people say?", `Reviews for ${provider.displayName}`),
      ],
    };
  },
};

const providerLocation: Capability = {
  id: "provider.location",
  hat: "client",
  describe: "Where a provider is based or whether they travel",
  phrases: [
    "where are they", "where is the provider", "where is their salon", "their location",
    "their address", "where are you based", "where are they based", "do they travel",
    "mobile provider", "home visit", "home visits", "come to me",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const [mobileProviders, locations] = await Promise.all([
      getMobileProviderDisplayNames([provider.displayName]),
      getProviderLocationsByDisplayNames([provider.displayName]),
    ]);

    if (mobileProviders.has(provider.displayName)) {
      return {
        text:
          `**${provider.displayName}** offers mobile appointments. ` +
          "Open their profile to check the services and booking details for your area.",
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    const location = locations[provider.displayName];
    if (!location) {
      return {
        text:
          `I couldn’t confirm **${provider.displayName}**’s listed area just now. ` +
          "Their profile has the most up-to-date location and contact details.",
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    return {
      text:
        `**${provider.displayName}** is listed in **${location.address}**. ` +
        "Your confirmed booking will show the location details available for that appointment.",
      suggestions: [
        navChip("profile", "View provider profile", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
      ],
    };
  },
};

/**
 * Booking-specific location answer. This only reports the provider's public
 * listed area; the booking detail screen remains the authority for any exact
 * address that has been released under that appointment's privacy policy.
 */
const bookingLocation: Capability = {
  id: "booking.location",
  hat: "client",
  describe: "Where an upcoming appointment is",
  phrases: [
    "where is my appointment", "where's my appointment", "where is my booking",
    "where's my booking", "where am i going", "how do i get there", "directions",
    "where is it", "where's it",
  ],
  needs: [{ kind: "booking", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const booking = entities.booking!.value;
    const location = (await getProviderLocationsByDisplayNames([booking.providerName]))[
      booking.providerName
    ];

    if (!location) {
      return {
        text:
          `I couldn’t confirm the listed area for **${booking.serviceName}** with **${booking.providerName}**. ` +
          "Open the booking for the latest appointment details.",
        suggestions: [navChip("booking", "View booking", "BookingDetail", { bookingId: booking.id })],
      };
    }

    return {
      text:
        `## Your appointment location\n` +
        `- **Service:** ${booking.serviceName}\n` +
        `- **Provider:** ${booking.providerName}\n` +
        `- **Listed area:** ${location.address}\n\n` +
        "Open your booking to see the location details available for this appointment.",
      suggestions: [navChip("booking", "View booking details", "BookingDetail", { bookingId: booking.id })],
    };
  },
};

const providerDeposit: Capability = {
  id: "provider.deposit",
  hat: "client",
  describe: "Whether a provider takes a deposit",
  phrases: [
    "deposit", "do they take a deposit", "deposit required", "pay a deposit",
    "how much is the deposit", "booking deposit", "pay upfront", "pay up front",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const policy = (await getProviderDepositPoliciesByDisplayNames([provider.displayName]))[
      provider.displayName
    ];

    if (!policy || !policy.depositAvailable) {
      return {
        text: `**${provider.displayName}** doesn’t offer a deposit option in checkout.`,
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    const amount = policy.depositType === "fixed"
      ? money(policy.depositAmount)
      : `${policy.depositAmount}%`;
    return {
      text:
        `**${provider.displayName}** offers a **${amount} deposit** at checkout.` +
        (policy.depositOnly
          ? " This deposit is required to secure the booking."
          : " You’ll see the available payment options before you confirm."),
      suggestions: [
        navChip("profile", "View provider profile", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
        askChip("services", "What services do they offer?", `What services does ${provider.displayName} offer?`),
      ],
    };
  },
};

const providerBookingTiming: Capability = {
  id: "provider.booking_timing",
  hat: "client",
  describe: "How far ahead or how late a provider accepts bookings",
  phrases: [
    "how late can i book", "how far ahead can i book", "booking window",
    "minimum notice", "last minute booking", "same day booking", "book ahead",
    "when can i book", "how soon can i book",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const rules = await getProviderSchedulingConstraints(provider.dbId ?? provider.displayName);
    const notice = rules.minBookingNoticeHrs > 0
      ? `${rules.minBookingNoticeHrs} hours’ notice`
      : "no minimum notice";

    return {
      text:
        `## Booking timing with ${provider.displayName}\n` +
        `- **Book ahead:** up to ${rules.bookingWindowDays} days\n` +
        `- **Minimum notice:** ${notice}\n\n` +
        "Availability still depends on open slots at the time you book.",
      suggestions: [
        askChip("free", "When are they free?", `When is ${provider.displayName} free?`),
        navChip("profile", "View provider profile", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
      ],
    };
  },
};

const providerAvailability: Capability = {
  id: "provider.next_available",
  hat: "client",
  describe: "When a specific provider is next available",
  phrases: [
    "when are they free", "when is she free", "when is he free", "when are you free",
    "when is the next slot", "their next slot", "next available", "when can i see them",
    "when can i book them", "when is this provider free",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return {
        text: `${softMiss()} I couldn’t look **${provider.displayName}** up properly.`,
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    const slot = await AvailabilityService.resolveNextAvailableSlot(providerDbId);
    if (!slot) {
      return {
        text: `${softMiss()} I couldn’t find a bookable slot with **${provider.displayName}** in the next 60 days.`,
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
          askChip("similar", "Find someone similar", "Show me all services"),
        ],
      };
    }

    return {
      text:
        `## Next availability\n` +
        `**${provider.displayName}** is next available on **${formatShortDate(slot.date)}** at **${formatTime12(slot.time)}**.`,
      suggestions: [
        navChip("profile", `Book with ${provider.displayName}`, "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
        askChip("services", "View their services", `What services does ${provider.displayName} offer?`),
      ],
    };
  },
};

const myProviders: Capability = {
  id: "discover.saved",
  hat: "client",
  describe: "Who are my saved providers",
  phrases: ["my providers", "saved providers", "bookmarked", "my usual", "my regulars", "favourites", "favorites"],
  async run(): Promise<CapabilityResult> {
    const rows = await getBookmarkedProviders();
    if (rows.length === 0) {
      return {
        text: "You haven't saved any providers yet. Tap the bookmark on a profile to keep them here.",
        suggestions: [
          askChip("find", "Find someone", "Find me a provider"),
          askChip("browse", "What can I book?", "Browse all services"),
          askChip("top", "Who's top rated?", "Show me top rated providers"),
        ],
      };
    }
    return {
      text: `You've saved **${rows.length} provider${rows.length !== 1 ? "s" : ""}**.`,
      providers: rows.map(providerFromDb),
      suggestions: [
        askChip("free", "Who's free soon?", "Who's free this week?"),
        askChip("rebook", "Rebook my last one", "Rebook my last appointment"),
      ],
    };
  },
};

const waitlist: Capability = {
  id: "discover.waitlist",
  hat: "client",
  describe: "Am I on any waitlists",
  // Phrased as a QUESTION about existing entries, never a bare "waitlist" —
  // that generic form also matches "put me on the waitlist", which is a
  // request to act (see action.waitlist) rather than a status check.
  phrases: [
    "my waitlists", "any waitlists", "am i on any waitlist", "am i on a waitlist",
    "am i waitlisted", "on the waiting list", "what waitlists", "on the list",
    "cancellation list", "waitlists",
  ],
  async run({ userId }): Promise<CapabilityResult> {
    if (!userId) return { text: "I couldn't check your waitlists — try signing in again." };
    const entries = await getUserWaitlistEntries(userId);
    if (entries.length === 0) {
      return {
        text: "You're not on any waitlists right now.",
        suggestions: [
          askChip("free", "Who's free soon?", "Who's free this week?"),
          askChip("find", "Find someone", "Find me a provider"),
        ],
      };
    }
    return {
      text: `You're on **${entries.length} waitlist${entries.length !== 1 ? "s" : ""}**. I'll let you know if a slot frees up.`,
      suggestions: [
        navChip("bookings", "Open Bookings", "Bookings"),
        askChip("free", "Anyone free sooner?", "Who's free this week?"),
      ],
    };
  },
};

const browse: Capability = {
  id: "discover.browse",
  hat: "client",
  describe: "What services are available",
  phrases: [
    "all services", "what services", "browse", "explore", "what can i book",
    "what do you offer", "show me all services", "everything", "categories",
    "what's available", "whats available", "what treatments", "options",
  ],
  async run(): Promise<CapabilityResult> {
    return {
      text: "Here's what you can book:",
      suggestions: [
        chip("nails", "Nails", "Find nails"),
        chip("hair", "Hair", "Find hair"),
        chip("lashes", "Lashes", "Find lashes"),
        chip("brows", "Brows", "Find brows"),
        chip("mua", "Makeup", "Find makeup"),
        chip("aesthetics", "Aesthetics", "Find aesthetics"),
      ],
    };
  },
};

// ==================== NOTIFICATIONS & MESSAGES ====================

const notifications: Capability = {
  id: "inbox.notifications",
  hat: "client",
  describe: "Have I missed anything / any updates",
  phrases: [
    "notifications", "any updates", "have i missed", "anything new",
    "what's happened", "whats happened", "alerts", "what did i miss",
    "anything i should know", "any news", "catch me up", "what's new",
    "whats new", "unread", "any alerts",
  ],
  async run(): Promise<CapabilityResult> {
    const rows = await getMyNotifications("client");
    const unread = rows.filter((n) => !n.is_read);
    if (unread.length === 0) {
      return {
        text: `${softMiss()} nothing new — you're all caught up.`,
        suggestions: [askChip("next", "What's my next appointment?", "When's my next appointment?")],
      };
    }
    const lines = unread
      .slice(0, 5)
      .map((n) => `- **${n.title}**\n  ${n.message}`)
      .join("\n\n");
    return {
      text: `You've got ${unread.length} unread update${unread.length !== 1 ? "s" : ""}:\n\n${lines}`,
      suggestions: [
        ...unread
          .filter((notification) => !!notification.booking_id)
          .slice(0, 4)
          .map((notification) =>
            navChip(
              `booking-${notification.id}`,
              `View booking: ${notification.title}`,
              "BookingDetail",
              { bookingId: notification.booking_id! },
            ),
          ),
        navChip("notifs", "Open all notifications", "Notifications"),
      ],
    };
  },
};

const messages: Capability = {
  id: "inbox.messages",
  hat: "client",
  describe: "Any messages from my providers",
  phrases: [
    "my messages", "messages", "any replies", "has anyone replied", "my inbox",
    "any messages", "unread messages", "did they reply", "have they replied",
    "heard back", "any word from", "check my messages", "dm", "chats",
  ],
  async run(): Promise<CapabilityResult> {
    const convos = await getUserConversations();
    const unread = convos.filter((c) => (c.unread_count_user ?? 0) > 0);
    if (convos.length === 0) {
      return { text: `${softMiss()} you haven't messaged any providers yet.` };
    }
    if (unread.length === 0) {
      return {
        text: `No unread messages — you've got ${convos.length} conversation${convos.length !== 1 ? "s" : ""} on the go.`,
      };
    }
    const names = unread
      .map((c) => c.provider?.display_name)
      .filter((n): n is string => !!n);
    return {
      text:
        `${goodNews()} you've got ${unread.length} unread message${unread.length !== 1 ? "s" : ""}` +
        (names.length > 0 ? ` — from ${names.slice(0, 3).join(", ")}.` : "."),
      suggestions: unread
        .slice(0, 5)
        .flatMap((conversation) => {
          const provider = conversation.provider;
          if (!provider) return [];
          return [
            navChip(`chat-${conversation.id}`, `Reply to ${provider.display_name}`, "ProviderChat", {
              providerId: provider.slug,
              providerDbId: provider.id,
              providerName: provider.display_name,
            }),
          ];
        }),
    };
  },
};

// ==================== INSPIRATION / DISCOVERY ====================

const inspiration: Capability = {
  id: "discover.inspiration",
  hat: "client",
  describe: "Show me looks / inspiration / examples of work",
  // Longer, more specific phrases than discover.find's generic "show me" —
  // the matcher scores by matched-phrase length, so "show me nail ideas"
  // has to be beatable only by an equally specific inspiration phrase.
  phrases: [
    "inspiration", "inspo", "show me looks", "show me some looks",
    "examples", "ideas", "show me ideas", "some ideas", "design ideas",
    "portfolio", "their work", "photos", "pictures", "gallery",
    "what does it look like", "see their work",
  ],
  // Optional, not required: "show me some inspiration" is a valid ask with no
  // service named. Declaring it at all is what matters — without it this
  // capability earns no entity score, and discover.find's required-service
  // bonus (+0.3) beats it outright whenever a service IS named, which is
  // exactly the case where inspiration is most likely what was meant.
  needs: [{ kind: "service", required: false }],
  async run({ entities }): Promise<CapabilityResult> {
    const category = entities.service?.value.category;
    const specific = entities.service?.value.specific;

    // A specific service ("balayage") is a better search term than its
    // category; fall back to the category feed when there isn't one.
    const items = specific
      ? await searchPortfolio(specific)
      : await getPortfolioItems(category);

    const label = specific ?? (category ? CATEGORY_LABELS[category] : undefined);

    if (items.length === 0) {
      return {
        text: `${softMiss()} I couldn't find any ${label ?? ""} work to show you yet.`.replace(/\s+/g, " "),
        suggestions: [navChip("explore", "Browse Explore", "Explore")],
      };
    }

    // De-duplicate: one provider often has several portfolio items, and the
    // cards should show distinct people rather than the same name repeated.
    const unique = [
      ...new Map(
        items
          .map((i) => i.provider)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => [p.id, p]),
      ).values(),
    ];

    return {
      text:
        `${goodNews()} found ${items.length} ${label ?? "portfolio"} photo${items.length !== 1 ? "s" : ""} ` +
        `from ${unique.length} provider${unique.length !== 1 ? "s" : ""}. The full gallery is in Explore.`,
      providers: unique.slice(0, 12).map((p) => ({
        id: p.slug,
        name: p.display_name,
        service: p.service_category,
        logo: p.logo_url ? { uri: p.logo_url } : null,
      })),
      suggestions: [navChip("explore", "Open Explore", "Explore")],
    };
  },
};

const topRated: Capability = {
  id: "discover.top",
  hat: "client",
  describe: "Who's best rated, newest or trending",
  phrases: [
    "best rated", "top rated", "highest rated", "best providers", "who's the best",
    "whos the best", "new providers", "newest", "trending", "popular",
  ],
  async run({ rawMessage }): Promise<CapabilityResult> {
    const wantsNew = /\b(new|newest|just joined|recently joined)\b/i.test(rawMessage);
    const rows = wantsNew ? await getNewProviders(12) : await getTopRatedProviders(12);
    if (rows.length === 0) {
      return { text: `${softMiss()} I couldn't find any to show right now.` };
    }
    return {
      text: wantsNew
        ? `${goodNews()} ${rows.length} provider${rows.length !== 1 ? "s" : ""} recently joined:`
        : `${goodNews()} here are the top-rated providers right now:`,
      providers: rows.map(providerFromDb),
    };
  },
};

const rescheduleStatus: Capability = {
  id: "booking.reschedule_status",
  hat: "client",
  describe: "Has my reschedule been accepted",
  phrases: [
    "has my reschedule", "reschedule accepted", "reschedule approved",
    "heard back about", "any word on my reschedule", "reschedule status",
    "did they accept", "have they replied about",
  ],
  async run({ bookings, entities }): Promise<CapabilityResult> {
    // Only bookings actually awaiting a reschedule decision are relevant —
    // checking every upcoming booking would be a query per row for nothing.
    const pending = bookings.filter(
      (b) => b.status === BookingStatus.UPCOMING && b.isPendingReschedule,
    );
    const target = entities.booking?.value ?? pending[0];

    if (!target) {
      return {
        text: `${softMiss()} you haven't got any reschedule requests waiting on a reply.`,
        suggestions: [askChip("next", "What's my next appointment?", "When's my next appointment?")],
      };
    }

    const request = await getActiveRescheduleRequest(target.id);
    if (!request) {
      return {
        text: `There's no open reschedule request on **${target.serviceName}** with ${target.providerName}.`,
        suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
      };
    }

    const header = `**${target.serviceName}** with ${target.providerName}`;
    switch (request.status) {
      case "pending":
        return {
          text: `${header}\n\nStill waiting on ${target.providerName} to respond to your reschedule request.`,
          suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
        };
      case "provider_responded":
        return {
          text: `${goodNews()} ${target.providerName} has come back with times for ${header}. Pick one to lock it in.`,
          suggestions: [
            navChip("pick", "Choose a time", "Reschedule", { bookingId: target.id }),
          ],
        };
      case "confirmed":
        return {
          text:
            `${goodNews()} your reschedule is confirmed — ${header} is now ` +
            `${formatShortDate(target.bookingDate)} at ${formatTime12(target.bookingTime)}.`,
          suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
        };
      case "rejected":
        return {
          text: `${softMiss()} ${target.providerName} couldn't do a different time for ${header}. Your original slot still stands.`,
          suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
        };
      default:
        // New backend statuses should not make the assistant silently fail.
        // Keep the booking accessible while the client catches up with the API.
        return {
          text: `Your reschedule request for ${header} is currently ${request.status}.`,
          suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
        };
    }
  },
};

// ==================== PROVIDER DETAIL QUESTIONS ====================

const providerContact: Capability = {
  id: "provider.contact",
  hat: "client",
  describe: "How do I contact a provider",
  phrases: [
    "how do i contact", "contact them", "their number", "phone number",
    "their email", "get in touch", "how do i reach", "whatsapp",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    const [contact, providerDbId] = await Promise.all([
      getProviderContactByDisplayName(provider.displayName),
      // An ordinal/pronoun reference contains slug + name but not always the
      // UUID required by ProviderChat. Resolve it before offering a message
      // action rather than navigating with an empty id that cannot load.
      resolveProviderDbId(provider),
    ]);

    // Messaging in-app is always available and keeps the thread attached to
    // the booking, so it's offered whenever we can resolve its real id. If
    // resolution fails, the public profile is a safe, useful fallback.
    const chips = providerDbId
      ? [
          navChip("chat", `Message ${provider.displayName}`, "ProviderChat", {
            providerId: provider.slug,
            providerDbId,
            providerName: provider.displayName,
          }),
        ]
      : [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ];

    if (!contact) {
      return {
        text: `${provider.displayName} hasn't published contact details — message them in the app.`,
        suggestions: chips,
      };
    }

    const lines: string[] = [];
    if (contact.phone) lines.push(`- **Phone:** ${contact.phone}`);
    if (contact.whatsapp_number) lines.push(`- **WhatsApp:** ${contact.whatsapp_number}`);
    if (contact.email) lines.push(`- **Email:** ${contact.email}`);

    return {
      text:
        lines.length > 0
          ? `**${provider.displayName}**\n\n${lines.join("\n")}`
          : `${provider.displayName} prefers to be contacted in the app.`,
      suggestions: chips,
    };
  },
};

const consultationCheck: Capability = {
  id: "provider.consultation",
  hat: "client",
  describe: "Do I need a consultation first",
  phrases: [
    "consultation", "do i need a consult", "patch test", "do i need a patch test",
    "before i book", "first appointment", "do they need to see me first",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // May have come from a pronoun/ordinal reference, which carries no UUID.
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return { text: `${softMiss()} I couldn't look ${provider.displayName} up properly.` };
    }

    const consult = await getProviderConsultationService(providerDbId);
    if (!consult) {
      return {
        text:
          `${provider.displayName} doesn't list a consultation service. ` +
          // Deliberately does not say "no patch test needed": patch-test and
          // contraindication requirements are health-adjacent, and the
          // absence of a bookable consultation is not evidence of their
          // absence. Point at the provider, don't infer safety.
          `If you're unsure whether they need to see you first, ask them directly.`,
        suggestions: [
          navChip("chat", `Ask ${provider.displayName}`, "ProviderChat", {
            providerId: provider.slug,
            providerDbId: provider.dbId,
            providerName: provider.displayName,
          }),
        ],
      };
    }

    return {
      text:
        `${provider.displayName} offers **${consult.name}** — ${money(consult.price)}, ` +
        `${consult.durationMinutes} min.` +
        (consult.description ? `\n\n${consult.description}` : ""),
      suggestions: [
        navChip("profile", "Book a consultation", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
          openServiceId: consult.id,
        }),
      ],
    };
  },
};

const reschedulePolicy: Capability = {
  id: "provider.reschedule_policy",
  hat: "client",
  describe: "How many times can I move a booking, and how much notice",
  phrases: [
    "how many times can i reschedule", "reschedule policy", "how much notice",
    "can i move it again", "notice to reschedule", "how late can i change",
  ],
  needs: [{ kind: "provider", required: false }],
  async run({ entities, bookings }): Promise<CapabilityResult> {
    const name =
      entities.provider?.value.displayName ??
      entities.booking?.value.providerName ??
      sortUpcoming(bookings)[0]?.providerName;

    if (!name) {
      return {
        text: "Which provider did you mean?",
        suggestions: [askChip("saved", "My saved providers", "Show my saved providers")],
      };
    }

    const policy = await getProviderReschedulePolicyByDisplayName(name);
    const times =
      policy.maxReschedules === null
        ? "as many times as you need"
        : `${policy.maxReschedules} time${policy.maxReschedules !== 1 ? "s" : ""}`;
    const notice =
      policy.rescheduleNoticeHours > 0
        ? `, with at least ${policy.rescheduleNoticeHours}h notice`
        : ", right up to the day";

    return {
      text: `With **${name}** you can move a booking ${times}${notice}.`,
      suggestions: [askChip("resched", "Move a booking", "Reschedule my booking")],
    };
  },
};

const promoCode: Capability = {
  id: "discover.promocode",
  hat: "client",
  describe: "Is this promo code valid",
  phrases: [
    "promo code", "discount code", "voucher code", "is this code valid",
    "does this code work", "coupon",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities, rawMessage }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // Codes are conventionally uppercase/alphanumeric and stand out from
    // ordinary words; take the longest such token as the candidate.
    const candidates = rawMessage.match(/\b[A-Z0-9]{4,}\b/g) ?? [];
    const code = candidates.sort((a, b) => b.length - a.length)[0];

    if (!code) {
      return { text: "What's the code? Send it to me and I'll check it." };
    }

    const promo = await validatePromoCode(provider.displayName, code);
    if (!promo) {
      return {
        text: `${softMiss()} **${code}** isn't valid for ${provider.displayName} right now.`,
        suggestions: [askChip("deals", "What offers are on?", "Any deals on?")],
      };
    }
    return {
      text: `${goodNews()} **${code}** is valid for ${provider.displayName} — ${promo.title ?? "discount applied at checkout"}.`,
      suggestions: [
        navChip("profile", `Book with ${provider.displayName}`, "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
      ],
    };
  },
};

// ==================== MY ACCOUNT ====================

const eventPlans: Capability = {
  id: "account.events",
  hat: "client",
  describe: "My event plans / group bookings",
  phrases: [
    "my event", "event plan", "my wedding", "group booking",
    "my party", "event bookings", "my big day",
  ],
  async run(): Promise<CapabilityResult> {
    const plans = await getMyEventPlans();
    if (plans.length === 0) {
      return {
        text: `${softMiss()} you haven't set up any event plans yet.`,
        suggestions: [askChip("browse", "Browse services", "Show me all services")],
      };
    }
    const lines = plans
      .slice(0, 5)
      .map((p) => `- **${p.name}**${p.event_date ? ` — ${formatShortDate(p.event_date)}` : ""}`)
      .join("\n");
    return {
      text: `You've got ${plans.length} event plan${plans.length !== 1 ? "s" : ""}:\n\n${lines}`,
    };
  },
};

const savedLooks: Capability = {
  id: "account.saved_looks",
  hat: "client",
  describe: "My saved photos and looks",
  phrases: [
    "my saved photos", "saved looks", "my saved looks", "my inspiration",
    "photos i saved", "my collection", "saved images", "my saves",
  ],
  async run(): Promise<CapabilityResult> {
    const ids = await getSavedPortfolioIds();
    if (ids.length === 0) {
      return {
        text: `${softMiss()} you haven't saved any looks yet. Tap the bookmark on any photo in Explore to keep it.`,
        suggestions: [navChip("explore", "Open Explore", "Explore")],
      };
    }
    return {
      text: `You've saved ${ids.length} look${ids.length !== 1 ? "s" : ""}. They're all in your profile.`,
      suggestions: [
        navChip("profile", "Open my saved looks", "Profile", { profileScreen: "ProfileMain" }),
        navChip("explore", "Find more", "Explore"),
      ],
    };
  },
};

const notificationSettings: Capability = {
  id: "account.notif_prefs",
  hat: "client",
  describe: "What notifications am I getting",
  phrases: [
    "notification settings", "my notification preferences", "turn off notifications",
    "stop notifications", "what notifications", "email preferences", "reminders on",
  ],
  async run(): Promise<CapabilityResult> {
    const prefs = await getNotificationPreferences();
    const on = Object.entries(prefs)
      .filter(([, v]) => v)
      .map(([k]) => PREF_LABELS[k] ?? k);
    const off = Object.entries(prefs)
      .filter(([, v]) => !v)
      .map(([k]) => PREF_LABELS[k] ?? k);

    return {
      text:
        (on.length > 0 ? `**On:** ${on.join(", ")}` : "Everything's switched off.") +
        (off.length > 0 ? `\n\n**Off:** ${off.join(", ")}` : "") +
        `\n\nYou can change these in your profile settings.`,
      suggestions: [
        navChip("settings", "Open notification settings", "Profile", {
          profileScreen: "NotificationsSettings",
        }),
      ],
    };
  },
};

const beautyProfile: Capability = {
  id: "account.beauty_profile",
  hat: "client",
  describe: "What's on my beauty profile",
  phrases: [
    "my beauty profile", "my profile", "my hair type", "my skin type",
    "what do you know about me", "my preferences", "my details",
  ],
  async run({ userId }): Promise<CapabilityResult> {
    if (!userId) return { text: "I couldn't load your profile — try signing in again." };
    const profile = await getClientBeautyProfile(userId);

    // Preference/style fields ONLY. `allergies` and `medicalNotes` live on
    // this same object — they are for the provider treating you, and Becca
    // neither recites nor interprets them (see BECCA_CAPABILITIES.md §2.1).
    const bits: string[] = [];
    if (profile.hairType) bits.push(`- **Hair type:** ${profile.hairType}`);
    if (profile.skinType) bits.push(`- **Skin type:** ${profile.skinType}`);
    if (profile.nailShape) bits.push(`- **Nail shape:** ${profile.nailShape}`);
    if (profile.lashStyle) bits.push(`- **Lash style:** ${profile.lashStyle}`);
    if (profile.browStyle) bits.push(`- **Brow style:** ${profile.browStyle}`);
    if (profile.styleVibe) bits.push(`- **Style:** ${profile.styleVibe}`);

    if (bits.length === 0) {
      return {
        text:
          `${softMiss()} your beauty profile is empty. Filling it in helps providers ` +
          `prepare properly for your appointments.`,
        suggestions: [
          navChip("profile", "Set up my beauty profile", "Profile", {
            profileScreen: "BeautyProfile",
          }),
        ],
      };
    }
    // Deliberately surfaces only preference/style fields. Allergies, medical
    // notes and other health-adjacent entries live on the same profile but
    // are for the provider treating you — Becca doesn't recite them back or
    // interpret them.
    return {
      text: `Here's what's on your beauty profile:\n\n${bits.join("\n")}`,
      suggestions: [
        navChip("profile", "Edit beauty profile", "Profile", {
          profileScreen: "BeautyProfile",
        }),
        askChip("forme", "What suits me?", "What do you suggest?"),
        askChip("saved", "My saved providers", "Show my saved providers"),
      ],
    };
  },
};

const myStats: Capability = {
  id: "account.stats",
  hat: "client",
  describe: "How many providers have I saved / am I following",
  phrases: [
    "how many providers have i saved", "how many do i follow",
    "how many bookmarks", "my stats", "how many providers",
  ],
  async run(): Promise<CapabilityResult> {
    const [bookmarks, following] = await Promise.all([
      getMyBookmarkCount(),
      getMyFollowerCount(),
    ]);
    return {
      text:
        `You've saved **${bookmarks}** provider${bookmarks !== 1 ? "s" : ""}` +
        (following > 0 ? ` and you're following **${following}**.` : "."),
      suggestions: [
        askChip("saved", "Show them", "Show my saved providers"),
        askChip("bookings", "What have I got booked?", "Show all my bookings"),
        askChip("looks", "My saved looks", "Show my saved looks"),
      ],
    };
  },
};

// ==================== WRITE ACTIONS ====================
// Becca performs these herself, but never as a side effect of understanding a
// message: each returns a `pendingAction` that only runs once the user taps
// to confirm. A misread intent then costs a tap, not a real mutation.

const saveProvider: Capability = {
  id: "action.bookmark",
  hat: "client",
  describe: "Save or bookmark a provider",
  // Includes a bare "save"/"bookmark": on their own these are ambiguous, but
  // this capability REQUIRES a resolved provider, so "save Lola's Studio"
  // matches while a bare "save" with no provider can never run (the engine
  // asks which provider instead).
  phrases: [
    "save", "save this provider", "save them", "save provider",
    "bookmark", "bookmark them", "add to my providers",
    "add to my saved", "remember them", "keep them", "follow them",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // May have come from a pronoun/ordinal reference, which carries no UUID.
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return { text: `${softMiss()} I couldn't look ${provider.displayName} up properly.` };
    }

    // Check first: "save them" when they're already saved should say so
    // rather than offer a confirm that does nothing visible.
    const already = await isProviderBookmarked(providerDbId);
    if (already) {
      return {
        text: `${provider.displayName} is already in your saved providers.`,
        suggestions: [askChip("saved", "See my saved providers", "Show my saved providers")],
      };
    }

    const dbId = providerDbId;
    return {
      text: `Save **${provider.displayName}** to your providers?`,
      pendingAction: {
        id: `bookmark-${dbId}`,
        describe: `Save ${provider.displayName}`,
        confirmLabel: "Save them",
        run: async () => {
          await addBookmark(dbId);
          return `${goodNews()} ${provider.displayName} is in your saved providers now.`;
        },
      },
    };
  },
};

const joinWaitlistAction: Capability = {
  id: "action.waitlist",
  hat: "client",
  describe: "Join a provider's waitlist for a cancellation",
  // Action phrasings only. Deliberately longer/more specific than
  // discover.waitlist's status-check phrasings, since the matcher scores by
  // matched-phrase length and both share the word "waitlist".
  phrases: [
    "join the waitlist", "join their waitlist", "join waitlist",
    "put me on the waitlist", "put me on their waitlist", "put me on",
    "add me to the waitlist", "add me to their waitlist",
    "waiting list for", "let me know if something opens",
    "tell me if there's a cancellation", "notify me if",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities, userId }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // May have come from a pronoun/ordinal reference, which carries no UUID.
    const providerDbId = await resolveProviderDbId(provider);
    if (!userId || !providerDbId) {
      return { text: `${softMiss()} I couldn't set that up just now.` };
    }

    const service = entities.service?.value;
    const serviceLabel =
      service?.specific ??
      (service ? CATEGORY_LABELS[service.category] : undefined) ??
      "any service";

    const dbId = providerDbId;
    const uid = userId;
    return {
      text:
        `Join **${provider.displayName}**'s waitlist for ${serviceLabel}? ` +
        `I'll let you know the moment something frees up.`,
      pendingAction: {
        id: `waitlist-${dbId}`,
        describe: `Join ${provider.displayName}'s waitlist`,
        confirmLabel: "Join waitlist",
        run: async () => {
          await joinWaitlist({
            providerId: dbId,
            userId: uid,
            // No specific service row is resolved from chat — the snapshot
            // carries what the user actually asked for, and the provider
            // sees that text when deciding who to invite.
            serviceId: null,
            serviceNameSnapshot: serviceLabel,
            providerNameSnapshot: provider.displayName,
          });
          return `${goodNews()} you're on ${provider.displayName}'s waitlist. I'll tell you the second a slot opens.`;
        },
      },
    };
  },
};

const leaveReview: Capability = {
  id: "action.review",
  hat: "client",
  describe: "Leave a review for a past appointment",
  phrases: [
    "leave a review", "write a review", "review my", "rate my",
    "give feedback", "rate them", "leave feedback",
  ],
  async run({ bookings }): Promise<CapabilityResult> {
    const past = bookings
      .filter((b) => b.status === BookingStatus.COMPLETED)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
    const last = past[0];

    if (!last) {
      return {
        text: `${softMiss()} you haven't had a completed appointment to review yet.`,
      };
    }

    const done = await hasReviewedBooking(last.id);
    if (done) {
      return {
        text: `You've already reviewed **${last.serviceName}** with ${last.providerName}.`,
        suggestions: [navChip("all", "Open Bookings", "Bookings")],
      };
    }

    // Deliberately routes rather than writing: a review needs a star rating
    // and free text, neither of which can be read reliably out of one chat
    // message. Becca's job here is to find the right booking and open it.
    return {
      text:
        `Your most recent was **${last.serviceName}** with ${last.providerName} ` +
        `on ${formatShortDate(last.bookingDate)}. Open it to leave your rating and comments.`,
      suggestions: [
        navChip("review", "Leave a review", "BookingDetail", { bookingId: last.id }),
      ],
    };
  },
};

// ==================== PERSONALISATION ====================

const forMe: Capability = {
  id: "discover.forme",
  hat: "client",
  describe: "Recommend something based on what I like",
  phrases: [
    "recommend something", "what should i book", "something for me",
    "surprise me", "what do you suggest", "suggest something",
    "based on what i like", "my usual", "the usual", "what do i usually",
  ],
  async run({ personal }): Promise<CapabilityResult> {
    // Without real history, say so rather than dressing a generic list up as
    // a personal recommendation — a fake "just for you" is worse than none.
    if (!hasUsefulHistory(personal)) {
      return {
        text:
          `${softMiss()} I don't know your taste well enough yet. ` +
          `Book a few things or browse around and I'll start spotting what you go for.`,
        suggestions: [
          askChip("browse", "Browse everything", "Show me all services"),
          askChip("top", "What's popular?", "Who's the best rated?"),
        ],
      };
    }

    const category = personal!.topCategory;
    if (!category) {
      return {
        text: "I'm still working out what you go for. What are you in the mood for?",
        suggestions: [askChip("browse", "Browse everything", "Show me all services")],
      };
    }

    const rows = await getProviders(category);
    const label = CATEGORY_LABELS[category] ?? category.toLowerCase();
    if (rows.length === 0) {
      return { text: `${softMiss()} no ${label} providers available right now.` };
    }

    const styleNote =
      personal!.styleTags.length > 0
        ? ` You tend to go for ${personal!.styleTags.slice(0, 2).join(" and ")}.`
        : "";

    return {
      text: `${goodNews()} you book ${label} most, so here's who's available.${styleNote}`,
      providers: rows.slice(0, 12).map(providerFromDb),
      suggestions: [
        askChip("free", `Who's free soon?`, `Which ${label} providers are free this week?`),
      ],
    };
  },
};

const help: Capability = {
  id: "meta.help",
  hat: "client",
  describe: "What can Becca do",
  phrases: [
    "what can you do", "help", "how do you work", "what are you", "who are you",
    "what can you help with", "how can you help", "what do you do",
    "hi", "hello", "hey", "what now", "options", "menu",
  ],
  async run(): Promise<CapabilityResult> {
    return {
      text:
        "## What I can do for you\n" +
        "- **Bookings** — see what’s next, costs, forms, payment details, or open the exact booking to reschedule or cancel\n" +
        "- **Find a provider** — search by service, budget, availability, reviews, offers, or portfolio work\n" +
        "- **Provider details** — check services, prices, contact details, consultations, promo codes and reschedule policies\n" +
        "- **Your activity** — saved providers and looks, waitlists, messages, notifications, event plans and beauty profile\n" +
        "- **Personal picks** — recommendations based on what you usually book\n\n" +
        "Ask naturally, or choose an action below.",
      suggestions: [
        askChip("next", "When's my next appointment?", "When's my next appointment?"),
        askChip("bookings", "Break down my bookings", "Show my bookings"),
        askChip("find", "Find me someone", "Show me all services"),
        askChip("free", "Who's free soon?", "Who is free this week?"),
        askChip("forms", "Anything I need to do?", "Do I need to fill anything in?"),
        askChip("messages", "Any messages?", "Do I have any messages?"),
      ],
    };
  },
};

/**
 * Becca is also the plain-English index for account areas. These answers do
 * not need a database read; the useful outcome is taking the client to the
 * exact settings screen they asked for, rather than telling them to hunt
 * through Profile themselves.
 */
const appNavigation: Capability = {
  id: "meta.app_navigation",
  hat: "client",
  describe: "Open an account, support, or settings area",
  phrases: [
    "change password", "change my password", "reset password", "my password",
    "notification settings", "turn off notifications", "manage notifications",
    "payment methods", "payment method", "my card", "my cards", "add a card",
    "my cart", "my basket", "open cart", "open basket", "checkout", "check out",
    "edit my profile", "edit profile", "my account", "account details", "profile details",
    "my subscription", "manage subscription", "my points", "loyalty points",
    "help centre", "help center", "report a problem", "report problem",
    "terms and conditions", "terms", "about the app", "about cerviced",
  ],
  async run({ rawMessage }): Promise<CapabilityResult> {
    const message = rawMessage.toLowerCase();
    if (/\b(?:cart|basket|checkout|check out)\b/.test(message)) {
      return {
        text: "## Your cart\nI’ll open your cart so you can review your services and checkout.",
        suggestions: [navChip("cart", "Open cart", "CartMain")],
      };
    }
    const target = message.includes("password")
      ? { screen: "ChangePassword", title: "Change password", text: "I’ll open password settings for you." }
      : message.includes("profile") || message.includes("account")
        ? { screen: "ProfileInfo", title: "Account details", text: "I’ll open your account details." }
      : message.includes("notification")
        ? { screen: "NotificationsSettings", title: "Notification settings", text: "I’ll open your notification settings." }
        : message.includes("payment") || message.includes("card")
          ? { screen: "PaymentMethods", title: "Payment methods", text: "I’ll open your saved payment methods." }
          : message.includes("subscription")
            ? { screen: "Subscription", title: "Subscription", text: "I’ll open your subscription settings." }
            : message.includes("point")
              ? { screen: "Points", title: "My points", text: "I’ll open your points." }
              : message.includes("report")
                ? { screen: "ReportProblem", title: "Report a problem", text: "I’ll open the problem report form." }
                : message.includes("term")
                  ? { screen: "Terms", title: "Terms & conditions", text: "I’ll open the terms and conditions." }
                  : message.includes("about")
                    ? { screen: "About", title: "About CERVICED", text: "I’ll open information about CERVICED." }
                    : { screen: "HelpCentre", title: "Help centre", text: "I’ll open the help centre." };

    return {
      text: `## ${target.title}\n${target.text}`,
      suggestions: [
        navChip("open", `Open ${target.title}`, "Profile", { profileScreen: target.screen }),
        askChip("help", "What else can you do?", "What can you help with?"),
      ],
    };
  },
};

// ==================== SHARED HELPERS ====================

function sortUpcoming(bookings: ConfirmedBooking[]): ConfirmedBooking[] {
  return bookings
    .filter((b) => b.status === BookingStatus.UPCOMING)
    .sort((a, b) =>
      a.bookingDate === b.bookingDate
        ? a.bookingTime.localeCompare(b.bookingTime)
        : a.bookingDate.localeCompare(b.bookingDate),
    );
}

/** Only auto-target a booking when there's exactly one — never guess between several. */
function soleUpcoming(bookings: ConfirmedBooking[]): ConfirmedBooking | undefined {
  const up = sortUpcoming(bookings);
  return up.length === 1 ? up[0] : undefined;
}

/**
 * Direct, appointment-specific routes for a chat answer. Keeping the date in
 * the label matters when the same service appears more than once: users can
 * choose confidently without having to open the general bookings screen and
 * hunt for the record again.
 */
function bookingChoices(
  bookings: ConfirmedBooking[],
  verb = "View",
) {
  return bookings.slice(0, 6).map((booking) => {
    const date = relativeDayLabel(booking.bookingDate) ?? formatShortDate(booking.bookingDate);
    return navChip(
      `booking-${booking.id}`,
      `${verb}: ${booking.serviceName} · ${date}`,
      "BookingDetail",
      { bookingId: booking.id },
    );
  });
}

export const CLIENT_CAPABILITIES: Capability[] = [
  nextBooking,
  listBookings,
  bookingCost,
  cancelBooking,
  // Before `rescheduleBooking`: "has my reschedule been accepted?" is a
  // STATUS question — routing it to the reschedule flow would offer to start
  // another one on a booking that already has a request open.
  rescheduleStatus,
  rescheduleBooking,
  bookingPrep,
  bookingLocation,
  rebook,
  // Follow-ups first: both REQUIRE entities that usually arrive via carried
  // context, so they only score mid-conversation and can't win cold.
  // Pointing at a shown result beats a generic follow-up question.
  pickFromList,
  followUpDay,
  followUpPrice,
  findAvailable,
  // Before `findProviders`: "show me nail ideas" is a request for WORK, not
  // for a provider list — findProviders' generic "show me" would otherwise
  // win on an equal score by registration order alone.
  inspiration,
  findProviders,
  deals,
  // Before `reviews`: both need a provider, and "what do they do" should
  // resolve to their service list rather than falling through to feedback.
  providerServices,
  providerLocation,
  providerDeposit,
  providerBookingTiming,
  providerAvailability,
  reviews,
  // Provider-detail questions: all require a resolved provider, so they only
  // ever win when one is actually named.
  providerContact,
  consultationCheck,
  reschedulePolicy,
  promoCode,
  // Before `myProviders`: "add Lola to my providers" contains "my providers"
  // but is a request to SAVE, not to list. saveProvider requires a resolved
  // provider, so it only wins when one is actually named.
  saveProvider,
  myProviders,
  // Account questions. `myStats` before `myProviders` would be wrong — "my
  // providers" should list them, not count them — so it sits after.
  myStats,
  savedLooks,
  eventPlans,
  notificationSettings,
  beautyProfile,
  // Write action BEFORE the read-only `waitlist`: "put me on the waitlist" is
  // a request to ACT, and would otherwise be answered by `waitlist`'s
  // "here's what you're already on" report.
  joinWaitlistAction,
  waitlist,
  leaveReview,
  notifications,
  messages,
  // Before `topRated`: "recommend something" is a request for a PERSONAL
  // suggestion, not a popularity ranking.
  forMe,
  topRated,
  browse,
  appNavigation,
  help,
];
