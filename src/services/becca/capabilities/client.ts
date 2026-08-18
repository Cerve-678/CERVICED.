// Client-hat capabilities.
//
// Each one answers from REAL app data and hands back tappable follow-ups.
// Becca reads and routes; she never writes booking mutations herself — the
// action chips deep-link into the screen that owns that write, with the
// booking already selected. See BECCA_CAPABILITIES.md §2.1.

import { BookingStatus, type ConfirmedBooking } from "../../../types/booking";
import {
  dateToYMD,
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
  getDiscoverServices,
  getMyEventPlans,
  getNotificationPreferences,
  getOlderBookings,
  getProviderConsultationService,
  getProviderContactByDisplayName,
  getProviderReschedulePolicyByDisplayName,
  getSavedPortfolioIds,
  validatePromoCode,
  hasReviewedBooking,
  isProviderBookmarked,
  joinWaitlist,
  getMyBookingActionItems,
  getInfoPacksByBooking,
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

/** Simple everyday question; must never inherit a previous booking/search topic. */
const currentTime: Capability = {
  id: "meta.current_time",
  hat: "client",
  describe: "What time it is right now",
  phrases: ["what time is it", "whats the time", "what's the time", "current time", "time right now"],
  async run({ now }): Promise<CapabilityResult> {
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const suffix = hours >= 12 ? "pm" : "am";
    const hour12 = hours % 12 || 12;
    return { text: `It’s **${hour12}:${minutes}${suffix}**.` };
  },
};

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
        askChip(
          "details",
          "Booking breakdown",
          bookingChoiceMessage(next, "details"),
          { bookingId: next.id },
        ),
        navChip("view", "View booking", "BookingDetail", { bookingId: next.id }),
        navChip("resched", "Reschedule", "Reschedule", { bookingId: next.id }),
        ...(upcoming.length > 1
          ? [askChip("all", "See all bookings", "Show all my bookings")]
          : []),
        askChip("location", "Where is it?", "Where is my next appointment?", { bookingId: next.id }),
        askChip("cost", "What am I paying?", "How much is it?", { bookingId: next.id }),
        askChip("prep", "How should I prep?", "How do I prepare for my appointment?", { bookingId: next.id }),
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
        // An appointment first gets a concise, chat-native briefing. From
        // there the client can still open the exact record without having to
        // hunt through the bookings screen.
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

/**
 * The chat-native booking briefing. This is deliberately separate from the
 * booking screen: a client can understand the appointment and its rules
 * before deciding whether they need the full record or an action.
 */
const bookingDetails: Capability = {
  id: "booking.details",
  hat: "client",
  describe: "Break down an appointment and its policies",
  phrases: [
    "tell me about my appointment", "tell me about my booking",
    "tell me more about my appointment", "tell me more about my booking",
    "more about my appointment", "more about my booking",
    "booking details", "appointment details", "details of my appointment",
    "break down my booking", "break down my appointment", "booking breakdown",
  ],
  needs: [{ kind: "booking", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const booking = entities.booking!.value;
    const [cancellationResult, rescheduleResult] = await Promise.allSettled([
      getProviderCancellationPolicy(booking.providerName),
      getProviderReschedulePolicyByDisplayName(booking.providerName),
    ]);

    // A zero cancellation notice can also mean the policy lookup was
    // unavailable, so never turn it into an unsafe "cancel any time" claim.
    const cancellationHours =
      cancellationResult.status === "fulfilled" ? cancellationResult.value : 0;
    const cancellation = cancellationHours > 0
      ? `${cancellationHours}h notice to cancel free of charge`
      : "Open the booking to check the latest cancellation terms";

    const reschedulePolicy =
      rescheduleResult.status === "fulfilled" ? rescheduleResult.value : undefined;
    const reschedule = reschedulePolicy
      ? `${reschedulePolicy.maxReschedules === null
          ? "Changes allowed as needed"
          : `Up to ${reschedulePolicy.maxReschedules} change${reschedulePolicy.maxReschedules === 1 ? "" : "s"}`}${
          reschedulePolicy.rescheduleNoticeHours > 0
            ? ` with ${reschedulePolicy.rescheduleNoticeHours}h notice`
            : ", including on the day"
        }`
      : "Open the booking to check the latest rescheduling terms";

    return {
      text:
        `## Your booking at a glance\n` +
        `- **Service:** ${booking.serviceName}\n` +
        `- **Provider:** ${booking.providerName}\n` +
        `- **When:** ${formatShortDate(booking.bookingDate)} at ${formatTime12(booking.bookingTime)}\n` +
        `- **Booking total:** ${money(booking.price)}\n` +
        `- **Cancellation:** ${cancellation}\n` +
        `- **Rescheduling:** ${reschedule}`,
      suggestions: [
        navChip("view", "View booking", "BookingDetail", { bookingId: booking.id }),
        navChip("reschedule", "Reschedule booking", "Reschedule", { bookingId: booking.id }),
        askChip("notes", "My prep & aftercare", `What did ${booking.providerName} send me for my appointment?`, { bookingId: booking.id }),
        askChip("prep", "What do I need to do?", "How do I prepare for my appointment?", { bookingId: booking.id }),
        askChip("location", "Where is it?", `Where is my appointment with ${booking.providerName}?`, { bookingId: booking.id }),
      ],
    };
  },
};

/** Provider notes attached to a specific booking: prep, aftercare and instructions. */
const bookingInfoPacks: Capability = {
  id: "booking.info_packs",
  hat: "client",
  describe: "Prep, aftercare and information packs attached to an appointment",
  phrases: [
    "what did they send me", "my prep notes", "my aftercare", "aftercare notes",
    "my information pack", "my info pack", "booking notes", "appointment notes",
    "instructions for my appointment", "what do i need to read",
  ],
  needs: [{ kind: "booking", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const booking = entities.booking!.value;
    const packs = await getInfoPacksByBooking(booking.id);

    if (packs.length === 0) {
      return {
        text:
          `## Prep & aftercare\n` +
          `**${booking.providerName}** hasn’t attached any notes to your **${booking.serviceName}** booking yet. ` +
          "The booking page will always show the latest details.",
        suggestions: [
          navChip("booking", "View booking", "BookingDetail", { bookingId: booking.id }),
          askChip("prep", "Anything else to do?", "Do I need to fill anything in?", { bookingId: booking.id }),
        ],
      };
    }

    // The chip says “show my notes”, so expose the provider's actual
    // instruction text instead of returning only titles.
    const lines = packs
      .map((pack) => `- **${pack.title}**${pack.viewedAt ? "" : " · New"}\n  ${pack.content.trim() || "No written instructions added."}`)
      .join("\n");
    return {
      text:
        `## Your prep & aftercare\n` +
        `For **${booking.serviceName}** with **${booking.providerName}**:\n\n${lines}\n\n` +
        "Your booking always has the latest appointment details.",
      suggestions: [
        navChip("booking", "View booking", "BookingDetail", { bookingId: booking.id }),
        askChip("prep", "Anything else to do?", "Do I need to fill anything in?", { bookingId: booking.id }),
      ],
    };
  },
};

/** A cross-booking view for the common "what have I got to pay?" question. */
const upcomingBookingSummary: Capability = {
  id: "booking.upcoming_total",
  hat: "client",
  describe: "Total cost and payment status across upcoming appointments",
  phrases: [
    "what am i spending", "what am i spending on bookings", "my upcoming total",
    "total upcoming cost", "total cost of my bookings", "how much are my bookings",
    "what have i got to pay", "what do i have to pay", "upcoming payments",
  ],
  async run({ bookings }): Promise<CapabilityResult> {
    const upcoming = sortUpcoming(bookings);
    if (upcoming.length === 0) {
      return {
        text: "You don't have any upcoming appointments to pay for.",
        suggestions: [askChip("find", "Find someone", "Find me a provider")],
      };
    }

    const total = upcoming.reduce((sum, booking) => sum + booking.price, 0);
    const paidInApp = upcoming.reduce((sum, booking) => sum + (booking.amountPaid ?? 0), 0);
    const remaining = upcoming.reduce((sum, booking) => sum + (booking.remainingBalance ?? 0), 0);

    return {
      text:
        `## Your upcoming booking costs\n` +
        `- **Appointments:** ${upcoming.length}\n` +
        `- **Total booked:** ${money(total)}\n` +
        `- **Paid in the app:** ${money(paidInApp)}\n` +
        `- **Remaining:** ${money(remaining)}\n\n` +
        (remaining > 0
          ? "Any remaining balance is settled directly with the relevant provider."
          : "There’s no remaining balance recorded for these appointments."),
      suggestions: [
        ...bookingChoices(upcoming, "Break down"),
        navChip("all", "Open all bookings", "Bookings"),
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
          suggestions: bookingChoices(upcoming, "Choose", "cost"),
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
        askChip("policy", "What's the reschedule policy?", "What's the reschedule policy?", { bookingId: target.id }),
        askChip("prep", "How should I prep?", "How do I prepare for my appointment?", { bookingId: target.id }),
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
      const choices = bookingChoices(sortUpcoming(bookings), "Choose", "cancel");
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
      const choices = bookingChoices(sortUpcoming(bookings), "Choose", "reschedule");
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
  async run({ bookings, entities }): Promise<CapabilityResult> {
    // A prep question immediately after an appointment card should answer for
    // THAT appointment, not flatten every form and note in the account into
    // a generic count. A directly selected/resolved booking wins; with one
    // upcoming appointment it is also safe to use that as the obvious target.
    const booking = entities.booking?.value ?? soleUpcoming(bookings);

    // These reads are independent. The info-pack query is included only when
    // there is a concrete booking, which lets Becca show the actual provider
    // instructions in chat instead of merely saying an info pack exists.
    const [formsRes, itemsRes, packsRes] = await Promise.allSettled([
      getPendingIntakeFormsForMe(),
      getMyBookingActionItems(),
      booking ? getInfoPacksByBooking(booking.id) : Promise.resolve([]),
    ]);

    const forms = formsRes.status === "fulfilled" ? formsRes.value : [];
    const items = itemsRes.status === "fulfilled" ? itemsRes.value : {};
    const outstanding = Object.values(items).reduce((a, b) => a + b, 0);
    const packs = packsRes.status === "fulfilled" ? packsRes.value : [];

    if (booking) {
      const bookingForms = forms.filter((form) => form.bookingId === booking.id);
      const unreadPacks = packs.filter((pack) => !pack.viewedAt);
      const instructionLines = packs.map((pack) => {
        const content = pack.content.trim();
        return `- **${pack.title}${pack.viewedAt ? "" : " · New"}:** ${content || "No written instructions added."}`;
      });

      const sections = [
        `## Getting ready for your appointment`,
        `**${booking.serviceName}** with **${booking.providerName}**\n` +
          `- **When:** ${formatShortDate(booking.bookingDate)} at ${formatTime12(booking.bookingTime)}`,
      ];

      if (bookingForms.length > 0) {
        sections.push(
          `**Before you go**\n` +
            bookingForms.map((form) => `- Complete **${form.title}**`).join("\n"),
        );
      }
      if (instructionLines.length > 0) {
        sections.push(`**Instructions from ${booking.providerName}**\n${instructionLines.join("\n")}`);
      }
      if (bookingForms.length === 0 && instructionLines.length === 0) {
        sections.push("No form, prep note or aftercare instruction has been added to this booking yet.");
      }

      return {
        text: sections.join("\n\n"),
        suggestions: [
          ...bookingForms.slice(0, 4).map((form) =>
            navChip(`form-${form.id}`, `Complete: ${form.title}`, "ClientIntakeForm", {
              formId: form.id,
              bookingId: form.bookingId,
              serviceName: form.title,
            }),
          ),
          ...(unreadPacks.length > 0
            ? [askChip("packs", "Show my prep notes", `What did ${booking.providerName} send me for my appointment?`, { bookingId: booking.id })]
            : []),
          navChip("booking", "View booking", "BookingDetail", { bookingId: booking.id }),
        ],
      };
    }

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
  phrases: [
    "book again", "rebook", "re-book", "same again", "book that again",
    "usual again", "last time", "book the same", "same as last time",
    // NOT a bare "my usual"/"the usual": entityResolver already reads those
    // as "my usual PROVIDER" (resolveProvider), and discover.saved and
    // discover.forme both claim them too. Only the phrasings that
    // unambiguously mean "book that same thing again" belong here.
    "book my usual", "repeat my last", "rebook my last",
    "book what i had last", "same thing again", "book that in again",
    "get that booked again", "have that again",
  ],
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

/** A factual look at the client's own completed-booking history, not a guess. */
const bookingRoutine: Capability = {
  id: "booking.routine",
  hat: "client",
  describe: "What I normally book and how often I book it",
  phrases: [
    "what do i normally get", "what do i usually get", "my usual appointment",
    "my booking routine", "how often do i book", "when did i last get",
    "when was my last appointment", "what did i get last time", "my usual",
  ],
  async run({ bookings }): Promise<CapabilityResult> {
    const completed = bookings
      .filter((booking) => booking.status === BookingStatus.COMPLETED)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
    const latest = completed[0];
    if (!latest) {
      return {
        text: "You haven’t completed an appointment through CERVICED yet, so I don’t have a routine to learn from.",
        suggestions: [askChip("browse", "Browse services", "Show me all services")],
      };
    }

    const matching = completed
      .filter((booking) => booking.serviceName === latest.serviceName)
      .map((booking) => booking.bookingDate);
    const intervals = matching.slice(0, -1).map((date, index) => {
      const newer = new Date(`${date}T12:00:00`);
      const older = new Date(`${matching[index + 1]}T12:00:00`);
      return Math.round((newer.getTime() - older.getTime()) / 86_400_000);
    });
    const averageDays = intervals.length > 0
      ? Math.round(intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length)
      : undefined;

    return {
      text:
        `## Your usual booking\n` +
        `- **Last appointment:** ${latest.serviceName} with **${latest.providerName}**\n` +
        `- **Last booked:** ${formatShortDate(latest.bookingDate)}\n` +
        `- **Completed through CERVICED:** ${matching.length} ${latest.serviceName} appointment${matching.length === 1 ? "" : "s"}` +
        (averageDays ? `\n- **Usual gap:** about every ${averageDays} days` : ""),
      suggestions: [
        askChip("rebook", "Book it again", "Rebook my last appointment"),
        askChip("bookings", "See my bookings", "Show my bookings"),
      ],
    };
  },
};

/**
 * Bookings older than the 90-day window BookingContext holds.
 *
 * Distinct from `booking.routine`, which reads the already-loaded `bookings`
 * array and so can only ever see the last 90 days (see getMyBookings' default
 * `sinceDaysAgo = 90`). "What did I book last year?" was genuinely
 * unanswerable — not because the data was missing, but because nothing
 * fetched past the window.
 */
const bookingHistory: Capability = {
  id: "booking.history",
  hat: "client",
  describe: "My older appointments, further back than the last few months",
  phrases: [
    "my history", "booking history", "my past appointments", "past bookings",
    "older bookings", "previous appointments", "appointments last year",
    "what did i book last year", "what have i booked before",
    "everything i've booked", "everything ive booked", "all time",
    "how many appointments have i had", "how much have i booked",
    "my old bookings", "further back", "before that",
  ],
  async run({ bookings, now }): Promise<CapabilityResult> {
    // Anchor at the oldest booking already in context, so this genuinely
    // continues the window rather than re-reporting what other capabilities
    // already cover.
    const loaded = [...bookings].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    const oldestLoaded = loaded[0]?.bookingDate ?? dateToYMD(now);

    const older = await getOlderBookings(oldestLoaded, 50);

    if (older.length === 0) {
      const completedRecent = bookings.filter(
        (b) => b.status === BookingStatus.COMPLETED,
      ).length;
      return {
        text: completedRecent > 0
          ? `Nothing further back than what I've already got — **${completedRecent}** completed appointment${completedRecent !== 1 ? "s" : ""} is your full history with CERVICED.`
          : "You haven't completed any appointments through CERVICED yet.",
        suggestions: [
          askChip("bookings", "Show my bookings", "Show all my bookings"),
          askChip("find", "Find someone", "Show me all services"),
        ],
      };
    }

    // Group by provider — "who have I actually been going to" is the question
    // behind almost every version of this ask.
    const byProvider = new Map<string, { count: number; last: string }>();
    for (const b of older) {
      const key = b.provider_name_snapshot;
      const existing = byProvider.get(key);
      if (!existing || b.booking_date > existing.last) {
        byProvider.set(key, { count: (existing?.count ?? 0) + 1, last: b.booking_date });
      } else {
        existing.count += 1;
      }
    }

    const ranked = [...byProvider.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(
        ([name, info]) =>
          `- **${name}** — ${info.count} visit${info.count !== 1 ? "s" : ""}, last ${formatShortDate(info.last)}`,
      )
      .join("\n");

    const completed = older.filter((b) => b.status === "completed").length;

    return {
      text:
        `## Further back\n` +
        `**${older.length}** appointment${older.length !== 1 ? "s" : ""} before ${formatShortDate(oldestLoaded)}` +
        (completed !== older.length ? `, **${completed}** of them completed` : "") +
        `:\n\n${ranked}` +
        (byProvider.size > 5 ? `\n\n…and ${byProvider.size - 5} more provider${byProvider.size - 5 !== 1 ? "s" : ""}.` : ""),
      suggestions: [
        askChip("routine", "What do I usually book?", "What do I normally get?"),
        askChip("rebook", "Book something again", "Rebook my last appointment"),
        navChip("all", "Open Bookings", "Bookings"),
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
  // "looking for" and "find" are neutral about WHAT is being sought — the
  // noun decides. "Looking for soft glam looks" is a request for images, but
  // this capability's required-service bonus (+0.3) made it score 0.82
  // against inspiration's 0.47, so it answered with a provider list instead.
  // When the message names looks/inspiration/photos outright, that is the
  // stated object of the search and inspiration owns it.
  // Style-name phrases ("soft glam", "bridal look") are included for the same
  // reason: they name a LOOK, not a person, so "looking for soft glam" is a
  // request for images even without the word "looks" in it.
  excludeWhen: /\b(?:looks?|inspo|inspiration|ideas?|photos?|pictures?|pics|gallery|portfolio|examples?|soft glam|full glam|glam look|makeup look|bridal look)\b/i,
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
        text: `I couldn't find any ${label} providers${priceSuffix}. Want to try a different angle?`,
        suggestions: [
          ...(priceFilter ? [askChip("nofilter", "Try without the budget", `Find ${label}`)] : []),
          askChip("browse", "Browse everything", "Show me all services"),
        ],
      };
    }

    return {
      text: `I found **${providers.length} ${label} provider${providers.length !== 1 ? "s" : ""}**${priceSuffix}.`,
      providers: providers.slice(0, 12),
      suggestions: [
        askChip("free", "Who's free soon?", `Which ${label} providers are free this week?`),
        askChip("top", "See top-rated", `Who are the best rated ${label} providers?`),
      ],
    };
  },
};

const pickFromList: Capability = {
  id: "discover.pick",
  hat: "client",
  describe: "Tell me about the one you just showed me",
  // A named provider or a result Becca just displayed. This always requires
  // a provider resolved from the live database (or carried shown-results
  // context), so a generic "looking for nails" cannot fire it cold.
  phrases: [
    "looking for", "searching for",
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
  // Every phrase here used to assume a pronoun ("how much are THEY"), so a
  // direct category question — "how much are nails", the most natural way to
  // ask this — matched nothing at all and fell to the generic fallback. The
  // bare "how much"/"cost of" forms are what catch it, since phrase matching
  // is contiguous and the service word sits mid-sentence.
  phrases: [
    "how much are they", "how much do they charge", "what do they charge",
    "how much is that", "what's the price", "whats the price", "price range",
    "how much roughly", "are they expensive", "how pricey",
    "how much", "how much is", "how much are", "how much does",
    "average price", "typical price", "going rate", "cost of",
    "what does it cost", "what do they usually cost", "rough price",
  ],
  // A pronoun means a specific provider is being asked about, and their real
  // price list beats a category average — discover.provider_services owns
  // that. Both capabilities score identically when a provider AND a service
  // are resolved ("how much do they charge for nails"), so registration order
  // alone decided it, and this one is registered first. An explicit veto is
  // the mechanism built for exactly this, rather than relying on file order.
  excludeWhen: /\b(they|them|their|theirs|she|her|hers|he|him|his)\b/i,
  needs: [{ kind: "service", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service!.value;
    const label = service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase();

    const dbProviders = await getProviders(service.category);
    if (dbProviders.length === 0) {
      return { text: `I couldn't find any ${label} providers to price up.` };
    }

    const ranges = await getProviderPriceRanges(dbProviders.map((p) => p.id));
    // Count only providers who actually contributed a price. `dbProviders` is
    // every provider in the category, including ones with nothing published —
    // quoting that as the range's basis overstates it ("£25 to £80 across 6
    // providers" when only one of the six has prices).
    const priced = [...ranges.values()].filter((r) => r.min > 0 && r.max > 0);

    if (priced.length === 0) {
      return {
        text: `None of the ${label} providers have published prices yet — you'd need to ask them directly.`,
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
  describe: "Find providers who are actually free this week or on a given day",
  phrases: [
    "free on", "available on", "who's free", "whos free", "who is free",
    "availability", "any openings", "got space", "fit me in", "free this",
  ],
  // Service is helpful but not required: “Who's free this week?” is a valid
  // availability search in its own right. Treating it as missing data sent
  // users into a generic fallback that offered their bookings instead.
  needs: [{ kind: "service", required: false }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service?.value;
    const label = service
      ? service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase()
      : "providers";
    const date = entities.date?.value;

    // No category means an all-service availability search. getProviders()
    // remains live-provider gated, so this never exposes unpublished profiles.
    const dbProviders = await getProviders(service?.category);
    if (dbProviders.length === 0) {
      return { text: `I couldn't find any ${label} providers at all.` };
    }

    // Availability is per-provider and genuinely expensive, so cap the fan-out
    // and run the checks concurrently rather than sequentially.
    const candidates = dbProviders.slice(0, 8);
    // Resolve an actual bookable slot rather than treating a calendar day as
    // availability. This honours the provider's booking window, notice,
    // buffers and already-taken appointments.
    const checks = await Promise.allSettled(
      candidates.map((p) => AvailabilityService.resolveNextAvailableSlot(p.id)),
    );

    const free = candidates
      .map((p, i) => {
        const res = checks[i];
        const slot = res?.status === "fulfilled" ? res.value : null;
        if (!slot) return null;
        if (date && (slot.date < date.ymd || slot.date > date.endYmd)) return null;
        return { provider: p, ...slot };
      })
      .filter((x): x is { provider: (typeof candidates)[number]; date: string; time: string } => x !== null);

    if (free.length === 0) {
      return {
        text: date
          ? `None of the ${label} I checked have a bookable slot ${date.label}.`
          : `I couldn't find a bookable slot with the providers I checked this week.`,
        suggestions: [
          askChip("all", service ? `Show all ${label}` : "Browse services", service ? `Find ${label}` : "Show me all services"),
          askChip("top", "See top-rated", service ? `Who are the best rated ${label} providers?` : "Who are the best rated providers?"),
        ],
      };
    }

    const lines = free
      .slice(0, 5)
      .map((f) => `- **${f.provider.display_name}** — **${formatShortDate(f.date)} at ${formatTime12(f.time)}**`)
      .join("\n");
    const resultLabel = service
      ? `${free.length} ${label} provider${free.length !== 1 ? "s" : ""}`
      : `${free.length} provider${free.length !== 1 ? "s" : ""}`;

    // Availability is checked against a capped sample (see `candidates`), not
    // the whole category. The empty-result branch above already says "of the
    // ones I checked"; saying a flat count here implied a complete scan and
    // undersold how many providers might actually be free.
    const moreUnchecked = dbProviders.length - candidates.length;
    const scopeNote =
      moreUnchecked > 0
        ? `\n\nThat's from the first ${candidates.length} I checked — there ${moreUnchecked !== 1 ? "are" : "is"} ${moreUnchecked} more to look through.`
        : "";

    return {
      text: `## Availability found\n**${resultLabel}** ${free.length !== 1 ? "have" : "has"} a bookable time${date ? ` **${date.label}**` : " this week"}.\n\n${lines}${scopeNote}`,
      providers: free.map((f) => providerFromDb(f.provider)),
      // Recommendations used to be a dead end — the cards appeared and the
      // conversation stopped. These keep it moving: the obvious next things
      // someone asks after seeing who's available.
      suggestions: [
        ...(service ? [askChip("prices", "Compare prices", `How much do ${label} providers charge?`)] : []),
        askChip("all", service ? `All ${label}` : "Browse services", service ? `Find ${label}` : "Show me all services"),
      ],
    };
  },
};

/**
 * Turns an open-ended "help me plan" request into visible booking criteria.
 * It intentionally does not claim a provider is available or affordable until
 * the dedicated availability and price-backed searches run.
 */
const appointmentPlan: Capability = {
  id: "discover.booking_plan",
  hat: "client",
  describe: "Plan a booking around a service, date and budget",
  phrases: [
    "plan my appointment", "plan a booking", "help me plan", "help me book",
    "plan my beauty appointment", "book me something", "help me find someone",
    "i need someone for", "i need a provider for", "make me a booking plan",
  ],
  needs: [{ kind: "service", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const service = entities.service!.value;
    const label = service.specific ?? CATEGORY_LABELS[service.category] ?? service.category.toLowerCase();
    const date = entities.date?.value;
    const budget = entities.money?.value;
    const budgetLabel = budget
      ? budget.max != null
        ? `up to **${money(budget.max)}**`
        : budget.min != null
          ? `from **${money(budget.min)}**`
          : "not set"
      : "not set yet";
    const availabilityQuestion = date
      ? `Which ${label} providers are free ${date.label}?`
      : `Which ${label} providers are free this week?`;
    const budgetQuestion = budget?.max != null
      ? `Find ${label} under ${budget.max}`
      : budget?.min != null
        ? `Find ${label} over ${budget.min}`
        : `Find ${label}`;

    return {
      text:
        `## Your ${label} booking plan\n` +
        `- **Service:** ${label}\n` +
        `- **Timing:** ${date ? date.label : "Flexible"}\n` +
        `- **Budget:** ${budgetLabel}\n\n` +
        "Choose what matters most and I’ll narrow the real options down for you.",
      suggestions: [
        askChip("available", "Check availability", availabilityQuestion),
        askChip("budget", "Match my budget", budgetQuestion),
        askChip("top", "See top-rated options", `Who are the best rated ${label} providers?`),
      ],
    };
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
      return { text: `I couldn't look ${provider.displayName} up properly.` };
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
  // Carries the provider-scoped PRICE phrasings as well as the service-list
  // ones. discover.followup_price owns the same vocabulary but requires a
  // service entity, so with a provider resolved and no service named it takes
  // a -0.35 penalty and lands at 0.25 — under the matcher's 0.3 medium
  // threshold, i.e. straight into the "didn't catch that" fallback. "What do
  // they charge?" about a named provider therefore answered nothing at all
  // until these were listed here.
  phrases: [
    "what do they offer", "what does she do", "what does he do",
    "their services", "what services", "what can i book with",
    "what do they do", "their prices", "how much do they charge",
    "what do they charge", "how much are they", "how much is it with",
    "what are their prices", "how much would it be", "are they expensive",
    "their rates", "what do they cost", "how much do they cost",
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
        text: `I couldn't pull up what ${provider.displayName} offers just now.`,
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

    // STAGING, not booking. `openServiceId` opens that exact service's
    // BookingSheet on the provider's profile — the user still picks their own
    // slot and confirms. Becca prepares the step; she never completes it.
    // Same route Explore's "Book Now" uses, so there's one booking entry
    // point rather than a second Becca-specific path.
    //
    // Only offered when the user named a specific service, or the provider
    // has few enough that a chip per service is a menu rather than a wall.
    const wantedService = entities.service?.value.specific?.toLowerCase();
    const named = wantedService
      ? sorted.filter((s) => s.name?.toLowerCase().includes(wantedService))
      : [];
    const stageable = named.length > 0 ? named : sorted.length <= 3 ? sorted : [];

    return {
      text: `${provider.displayName} offers **${services.length} service${services.length !== 1 ? "s" : ""}**:\n\n${lines}${more}`,
      suggestions: [
        ...stageable.slice(0, 3).map((s) =>
          navChip(`stage-${s.id}`, `Book ${s.name} — ${money(s.price ?? 0)}`, "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
            openServiceId: s.id,
          }),
        ),
        ...(stageable.length === 0
          ? [navChip("book", `Book with ${provider.displayName}`, "ProviderProfile", { providerId: provider.slug, source: "becca" })]
          : []),
        askChip("free", "When are they free?", `When is ${provider.displayName} free?`),
        askChip("reviews", "What do people say?", `Reviews for ${provider.displayName}`),
      ],
    };
  },
};

/**
 * Treatment-safety requirements a provider has stated on their own services.
 *
 * HEALTH-ADJACENT — read the framing before changing anything here.
 *
 * This capability REPORTS what a provider has recorded against a service
 * (patch test required, not recommended during pregnancy, minimum age,
 * contraindications). It does not assess, advise, reassure, or infer. Three
 * rules follow from that and must hold:
 *
 *  1. Wording mirrors ProviderProfileScreen's existing "Treatment Safety"
 *     block verbatim ("Patch test required before this treatment", "Not
 *     recommended during pregnancy") so Becca and the profile can never
 *     state the same fact differently.
 *  2. Silence is never reported as safety. A service with no flags set means
 *     the provider hasn't recorded anything — NOT that the treatment is safe
 *     for this person — so the empty case says exactly that and points at the
 *     provider, mirroring how `provider.consultation` handles the same gap.
 *  3. It never reads the user's own health profile (allergies, medical
 *     notes) to cross-reference against a treatment. Matching a stated
 *     allergy to a contraindication would be Becca forming a medical
 *     opinion, which engine.ts's MEDICAL_OR_DERMATOLOGY_RE guard exists to
 *     prevent her doing anywhere else.
 */
const treatmentSafety: Capability = {
  id: "provider.safety",
  hat: "client",
  describe: "Safety requirements for a provider's treatments",
  // Deliberately avoids words caught by MEDICAL_OR_DERMATOLOGY_RE (allergy,
  // skin condition, reaction, treatment-as-verb...) — those are intercepted
  // before routing and can never reach any capability.
  // NOTE: "treatment safety" is deliberately absent despite being the app's
  // own heading for this content — MEDICAL_OR_DERMATOLOGY_RE matches `treat`,
  // so the phrase is intercepted before routing and could never reach here.
  // Listing it would advertise coverage that doesn't exist.
  phrases: [
    "safety info", "safety requirements", "safety notes",
    "is it safe", "safe for pregnancy", "pregnancy safe", "pregnant",
    "expecting", "age limit", "minimum age", "how old do you have to be",
    "any restrictions", "restrictions", "contraindications",
    "anything i should know before", "who can't have",
    "who cant have", "am i able to have",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities, rawMessage }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // getProviderBySlug is has_gone_live + is_active gated.
    const full = provider.slug ? await getProviderBySlug(provider.slug) : null;
    if (!full) {
      return {
        text: `I couldn't pull up ${provider.displayName}'s services just now — their profile has the current details.`,
        suggestions: [
          navChip("profile", "View profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    const services = full.services ?? [];
    // Narrow to one service when the user named it, so "is the peel safe in
    // pregnancy" answers about the peel rather than listing everything.
    const wanted = entities.service?.value.specific?.toLowerCase();
    const scoped = wanted
      ? services.filter((s) => s.name?.toLowerCase().includes(wanted))
      : services;
    const pool = scoped.length > 0 ? scoped : services;

    // Did the user actually ask about pregnancy? Checked here as well as in
    // the notes builder, because it widens what counts as "has something to
    // say": a service the provider explicitly marked pregnancy-SAFE carries
    // no restriction, so it isn't "flagged" in the normal sense — but when
    // someone asks directly, that recorded answer is exactly what they want,
    // and dropping it to the generic empty state would bury it.
    const askedPregnancy = /\b(?:pregnan|expecting|breastfeed|nursing)/i.test(rawMessage);

    const flagged = pool.filter(
      (s) =>
        s.patch_test_required ||
        s.is_pregnancy_safe === false ||
        s.min_age != null ||
        (s.contraindications?.length ?? 0) > 0 ||
        (askedPregnancy && s.is_pregnancy_safe === true),
    );

    if (flagged.length === 0) {
      // NOT "it's safe" — an empty set means nothing was recorded. Saying
      // otherwise would turn missing data into a reassurance Becca has no
      // basis for.
      return {
        text:
          `${provider.displayName} hasn't recorded any safety requirements against ` +
          `${wanted ? `**${wanted}**` : "their services"}. ` +
          `That isn't the same as there being none — if you've got something specific in mind, ask them directly before booking.`,
        suggestions: [
          navChip("chat", `Ask ${provider.displayName}`, "ProviderChat", {
            providerId: provider.slug,
            ...(full.id ? { providerDbId: full.id } : {}),
            providerName: provider.displayName,
          }),
          navChip("profile", "View profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    // Wording below is copied from ProviderProfileScreen's Treatment Safety
    // block on purpose — see rule 1 above.
    const blocks = flagged
      .slice(0, 5)
      .map((s) => {
        const notes: string[] = [];
        if (s.patch_test_required) notes.push("Patch test required before this treatment");
        if (s.is_pregnancy_safe === false) notes.push("Not recommended during pregnancy");
        // PER-FIELD SILENCE (rule 2, one level down). `is_pregnancy_safe` is
        // an opt-in flag, so `undefined` means "never filled in" — NOT "safe".
        // Omitting it from an otherwise-populated, confident-looking block let
        // a user asking "is it safe when pregnant?" read the absence as a no.
        // That's reassurance-by-silence buried inside a positive answer, which
        // is worse than the all-empty case because no caveat attaches to it.
        // Only surfaced when they actually asked, so unrelated queries don't
        // get noise about a field nobody mentioned.
        else if (askedPregnancy && s.is_pregnancy_safe == null) {
          notes.push("Pregnancy suitability not recorded — check with them");
        }
        // Provider explicitly marked it suitable. Attributed to THEM, never
        // asserted by Becca — she has no basis to judge an individual case,
        // and a direct question deserves the recorded answer rather than a
        // silence the user would read as an implied "no".
        else if (askedPregnancy && s.is_pregnancy_safe === true) {
          notes.push(`${provider.displayName} has marked this suitable during pregnancy`);
        }
        if (s.min_age != null) notes.push(`Minimum age ${s.min_age}`);
        for (const c of (s.contraindications ?? []).slice(0, 3)) notes.push(c);
        return `- **${s.name}**\n${notes.map((n) => `  - ${n}`).join("\n")}`;
      })
      .join("\n");

    return {
      text:
        `## Treatment safety\n` +
        `${provider.displayName} has recorded requirements on ` +
        `**${flagged.length}** service${flagged.length !== 1 ? "s" : ""}:\n\n${blocks}` +
        (flagged.length > 5 ? `\n\n…and ${flagged.length - 5} more on their profile.` : "") +
        `\n\nThis is only what ${provider.displayName} has filled in — a blank isn't a "no". Anything health-related beyond it is a question for them or a professional.`,
      suggestions: [
        navChip("chat", `Ask ${provider.displayName}`, "ProviderChat", {
          providerId: provider.slug,
          ...(full.id ? { providerDbId: full.id } : {}),
          providerName: provider.displayName,
        }),
        askChip("consult", "Do I need a consultation?", `Do I need a consultation with ${provider.displayName}?`),
        navChip("profile", "View profile", "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        }),
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

    // Resolve to the real UUID first. getProviderSchedulingConstraints falls
    // back to 60 days / 0 hours when its lookup finds nothing, and a
    // display-name match is fragile (case, punctuation, a renamed business) —
    // so passing a name that misses returned those defaults, which Becca then
    // stated as this provider's actual policy. Same reasoning as
    // getProviderReschedulePolicyById being preferred over its name sibling.
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return {
        text:
          `I couldn't pull up ${provider.displayName}'s booking window — their profile has the current rules.`,
        suggestions: [
          navChip("profile", "View provider profile", "ProviderProfile", {
            providerId: provider.slug,
            source: "becca",
          }),
        ],
      };
    }

    const rules = await getProviderSchedulingConstraints(providerDbId);
    const notice = rules.minBookingNoticeHrs > 0
      ? `${rules.minBookingNoticeHrs} hours’ notice`
      : "no minimum notice";

    return {
      text:
        `## Booking timing with ${provider.displayName}\n` +
        `- **Book ahead:** up to **${rules.bookingWindowDays} days**\n` +
        `- **Minimum notice:** **${notice}**\n\n` +
        "Availability still depends on open slots at the time you book.",
      suggestions: [
        askChip("free", "When are they free?", `When is ${provider.displayName} free?`),
        askChip("deposit", "Do they take a deposit?", `Does ${provider.displayName} take a deposit?`),
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
        text: `I couldn’t look **${provider.displayName}** up properly.`,
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
        text: `I couldn’t find a bookable slot with **${provider.displayName}** in the next 60 days.`,
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
        text: `Nothing new — you're all caught up.`,
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
      return { text: `You haven't messaged any providers yet.` };
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
        `You've got ${unread.length} unread message${unread.length !== 1 ? "s" : ""}` +
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
    "soft glam", "glam look", "makeup look", "bridal look",
    "what does it look like", "see their work",
  ],
  // Optional, not required: "show me some inspiration" is a valid ask with no
  // service named. Declaring it at all is what matters — without it this
  // capability earns no entity score, and discover.find's required-service
  // bonus (+0.3) beats it outright whenever a service IS named, which is
  // exactly the case where inspiration is most likely what was meant.
  needs: [{ kind: "service", required: false }],
  async run({ entities, rawMessage }): Promise<CapabilityResult> {
    // A generic ask ("show me some inspiration") must NOT inherit the service
    // from an earlier turn. carryForward fills gaps from the previous
    // message, so tapping the generic "Show me some looks" chip after talking
    // about makeup silently searched for natural makeup and then reported
    // "I couldn't find any natural makeup work" — an answer to a question the
    // user never asked. When the message itself names nothing, search
    // everything.
    const namesService = !!rawMessage.match(
      /\b(?:nail|nails|hair|lash|lashes|brow|brows|makeup|mua|glam|facial|skin|wax|tan|massage|barber|beard|braid|balayage|manicure|pedicure|gel|acrylic|bridal|lamination|microblading)\w*\b/i,
    );
    const category = namesService ? entities.service?.value.category : undefined;
    const specific = namesService ? entities.service?.value.specific : undefined;
    // Style phrases are search terms, not service categories. Keep them intact
    // so "show me soft glam" searches for soft-glam work rather than falling
    // back to an unrelated all-category gallery.
    const styleQuery = rawMessage.match(/\b(?:soft glam|glam look|makeup look|bridal look)\b/i)?.[0];
    const term = styleQuery ?? specific;

    // TWO sources, because portfolio alone silently misses most of the app's
    // images. `portfolio_items` is provider-uploaded gallery work;
    // `service_images` are the photos attached to a bookable service, and
    // Explore's feed mixes both. Becca previously read portfolio only, so a
    // category whose photos live on services (makeup, for one) returned
    // "I couldn't find any work to show you" while Explore displayed plenty.
    //
    // searchPortfolio is also a literal caption/tag match, and captions are
    // frequently empty — so a text search alone can return nothing even when
    // matching images exist. Service NAMES are reliably populated, which is
    // what makes the service-image side able to match a style term at all.
    const [portfolioResult, serviceResult] = await Promise.allSettled([
      term ? searchPortfolio(term) : getPortfolioItems(category),
      getDiscoverServices(category),
    ]);

    const portfolioItems = portfolioResult.status === "fulfilled" ? portfolioResult.value : [];
    const discoverServices = serviceResult.status === "fulfilled" ? serviceResult.value : [];

    // When the user named a style, keep only services whose name/description
    // actually mentions it. Without this "soft glam" would return the whole
    // category feed and quietly pretend it had matched.
    const needle = term?.toLowerCase();
    const matchedServices = needle
      ? discoverServices.filter(
          (svc) =>
            svc.name?.toLowerCase().includes(needle) ||
            svc.description?.toLowerCase().includes(needle),
        )
      : discoverServices;

    // Flatten service images into the same shape as portfolio items so both
    // sources render through one path.
    type Shot = {
      id: string;
      imageUrl: string;
      caption?: string;
      /** Present for service images: the bookable service this photo is of. */
      serviceName?: string;
      servicePrice?: number;
      provider: { id: string; slug: string; display_name: string; service_category: string; logo_url: string | null };
    };
    const shots: Shot[] = [
      ...portfolioItems
        .filter((item) => !!item.image_url && !!item.provider)
        .map((item) => ({
          id: item.id,
          imageUrl: item.image_url,
          ...(item.caption ? { caption: item.caption } : {}),
          provider: item.provider!,
        })),
      ...matchedServices.flatMap((svc) => {
        const first = [...(svc.service_images ?? [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        )[0];
        if (!first?.url || !svc.provider) return [];
        return [{
          id: `svc-${svc.id}`,
          imageUrl: first.url,
          caption: svc.name,
          serviceName: svc.name,
          ...(typeof svc.price === "number" ? { servicePrice: svc.price } : {}),
          provider: svc.provider,
        }];
      }),
    ];

    const label = styleQuery ?? specific ?? (category ? CATEGORY_LABELS[category] : undefined);

    if (shots.length === 0) {
      // Only claim "nothing to show" when BOTH sources came back empty, and
      // say what was actually searched so it doesn't read as a flat no.
      return {
        text:
          `I couldn't find any ${label ?? ""} work to show you yet.`.replace(/\s+/g, " ") +
          (label ? ` Explore has the full gallery — it's worth a look for ${label}.` : ""),
        suggestions: [
          navChip("explore", "Browse Explore", "Explore"),
          ...(label ? [askChip("providers", `Find ${label} providers`, `Find ${label}`)] : []),
        ],
      };
    }

    // Keep `items` as the downstream name so the rest of this capability is
    // unchanged, and dedupe by image so a photo present in both sources
    // doesn't render twice.
    const items = [...new Map(shots.map((shot) => [shot.imageUrl, shot])).values()];

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

    const shown = Math.min(items.length, 8);
    const shownItems = items.slice(0, shown);

    // Name what's actually on screen rather than counting it. "1 look from 1
    // provider" is technically true and tells the user nothing — who made it,
    // what it is, and what it costs are the things they'd act on.
    const named = shownItems.filter((item) => !!item.serviceName);
    const detailLines = [
      ...new Map(
        named.map((item) => [
          `${item.provider.display_name}|${item.serviceName}`,
          `- **${item.serviceName}** — ${item.provider.display_name}` +
            (item.servicePrice != null ? ` · **${money(item.servicePrice)}**` : ""),
        ]),
      ).values(),
    ].slice(0, 5);

    const heading = label
      ? `${label[0]!.toUpperCase()}${label.slice(1)}`
      : "Inspiration";

    // One result deserves a sentence, not a tally.
    const lead =
      shown === 1 && shownItems[0]
        ? `**${shownItems[0].provider.display_name}** has ` +
          (shownItems[0].serviceName ? `**${shownItems[0].serviceName}**` : "work") +
          (shownItems[0].servicePrice != null ? ` at **${money(shownItems[0].servicePrice)}**` : "") +
          "."
        : `**${shown}** look${shown !== 1 ? "s" : ""} from **${unique.length}** provider${unique.length !== 1 ? "s" : ""}` +
          (items.length > shown ? `, out of ${items.length} I found` : "") +
          ".";

    return {
      text:
        `## ${heading}\n${lead}` +
        (detailLines.length > 0 && shown > 1 ? `\n\n${detailLines.join("\n")}` : "") +
        "\n\nTap a photo to see it full size.",
      providers: unique.slice(0, 12).map((p) => ({
        id: p.slug,
        name: p.display_name,
        service: p.service_category,
        logo: p.logo_url ? { uri: p.logo_url } : null,
      })),
      inspiration: shownItems.map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        ...(item.caption ? { caption: item.caption } : {}),
        providerName: item.provider.display_name,
        providerSlug: item.provider.slug,
        // Say what the photo IS when it's a real bookable service, rather
        // than the same generic moodboard line on every card.
        whyItFits: item.serviceName
          ? `${item.serviceName}${item.servicePrice != null ? ` · ${money(item.servicePrice)}` : ""}`
          : label
            ? `A ${label.toLowerCase()} reference`
            : "A fresh reference for your moodboard",
      })),
      suggestions: [
        // Book what they're looking at, when there's exactly one provider.
        ...(unique.length === 1 && unique[0]
          ? [navChip("book", `See ${unique[0].display_name}`, "ProviderProfile", {
              providerId: unique[0].slug,
              source: "becca",
            })]
          : []),
        ...(label
          ? [askChip("who", `Who does ${label}?`, `Find ${label}`)]
          : []),
        navChip("explore", "Open Explore", "Explore"),
      ],
    };
  },
};

/**
 * Live offers across the marketplace.
 *
 * Distinct from `discover.promocode`, which validates ONE code against ONE
 * provider and requires a resolved provider. This is the open-ended "is
 * anything on offer?" question, which had no capability at all — promotions
 * were completely invisible to Becca despite being a real, live feature.
 */
const offers: Capability = {
  id: "discover.offers",
  hat: "client",
  describe: "What offers or deals are on right now",
  // Note the bare "deals"/"offers"/"discounts" entries alongside the "any X"
  // forms: phrase matching is contiguous, so "any nail deals" does NOT match
  // "any deals" — the service word sits between them. The single-word entries
  // are what make a message with a category in the middle still resolve.
  phrases: [
    "any offers", "any deals", "any discounts", "any promotions",
    "offers", "deals", "discounts", "promotions", "promos",
    "what offers", "what deals", "offers on", "deals on",
    "whats on offer", "what's on offer", "anything on sale", "sales on",
    "special offers", "any bargains", "cheap deals", "money off",
    "anything discounted", "current offers", "discounted",
  ],
  // Optional: "any nail deals?" narrows by category, a bare "any offers?"
  // shows everything.
  needs: [{ kind: "service", required: false }],
  async run({ entities }): Promise<CapabilityResult> {
    const category = entities.service?.value.category;
    const label = category ? CATEGORY_LABELS[category] ?? category.toLowerCase() : undefined;

    // getActivePromotions gates on providers.has_gone_live AND is_active, and
    // filters to promotions that haven't expired — so this never surfaces an
    // unpublished provider or a dead offer.
    const rows = await getActivePromotions(category);

    if (rows.length === 0) {
      return {
        text: label
          ? `No ${label} offers running right now. They come and go, so it's worth checking back.`
          : "No offers running right now. They come and go, so it's worth checking back.",
        suggestions: [
          ...(label ? [askChip("all-offers", "Any other offers?", "Any offers on?")] : []),
          askChip("top", "Who's best rated?", "Who are the best rated providers?"),
          navChip("explore", "Browse Explore", "Explore"),
        ],
      };
    }

    const lines = rows
      .slice(0, 6)
      .map((promo) => {
        // discount_text is the provider's own wording and is the most
        // accurate thing to show. Fall back to the structured fields only
        // when they haven't written one.
        const value =
          promo.discount_text ??
          (promo.discount_percent != null
            ? `${promo.discount_percent}% off`
            : promo.discount_amount != null
              ? `${money(promo.discount_amount)} off`
              : undefined);
        const who = promo.providers?.display_name ?? "A provider";
        return (
          `- **${who}** — ${value ? `**${value}** · ` : ""}${promo.title}` +
          (promo.promo_code ? `\n  Code: **${promo.promo_code}**` : "")
        );
      })
      .join("\n");

    return {
      text:
        `## ${label ? `${label[0]!.toUpperCase()}${label.slice(1)} offers` : "Offers on now"}\n` +
        `**${rows.length}** offer${rows.length !== 1 ? "s" : ""} running` +
        (rows.length > 6 ? `, showing the first 6` : "") +
        `:\n\n${lines}`,
      // Provider cards so the offers are tappable through to a real profile,
      // deduped since one provider can run several promotions at once. Built
      // via providerFromDb so the card shape stays consistent with every
      // other capability rather than hand-rolling a fourth mapper.
      providers: [
        ...new Map(
          rows
            .filter((promo) => !!promo.providers?.slug)
            .map((promo) => [
              promo.providers!.slug!,
              providerFromDb({
                slug: promo.providers!.slug!,
                display_name: promo.providers!.display_name ?? "Provider",
                service_category: promo.service_category ?? "OTHER",
                logo_url: promo.providers!.logo_url,
              } as Parameters<typeof providerFromDb>[0]),
            ]),
        ).values(),
      ].slice(0, 12),
      suggestions: [
        navChip("explore", "Browse Explore", "Explore"),
        askChip("top", "Who's best rated?", "Who are the best rated providers?"),
      ],
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

    if (rows.length > 0) {
      return {
        text: wantsNew
          ? `**${rows.length}** provider${rows.length !== 1 ? "s" : ""} recently joined:`
          : `Here are the top-rated providers right now:`,
        providers: rows.map(providerFromDb),
        suggestions: [
          askChip("free", "Who's free this week?", "Who's free this week?"),
          askChip("offers", "Any offers on?", "Any offers on?"),
        ],
      };
    }

    // getTopRatedProviders requires 3+ reviews AND a 4.0+ rating — a sensible
    // bar for a mature marketplace, but on a young one it excludes everyone,
    // including a genuinely 5-star provider with a single review. Returning
    // "I couldn't find any to show right now" then reads as "there are no good
    // providers", which is both discouraging and false.
    //
    // Fall back to showing who IS here, and say plainly why ratings aren't
    // the sort — rather than dead-ending on an empty, chipless reply.
    if (!wantsNew) {
      const anyone = await getProviders();
      if (anyone.length > 0) {
        // Offer a way to narrow rather than dumping everyone. "Best rated" with
        // no category is a vague ask, and the useful reply is "in what?" —
        // built from the categories that actually have providers, so every
        // option leads somewhere real rather than to an empty result.
        const categories = [
          ...new Set(anyone.map((p) => p.service_category).filter(Boolean)),
        ].slice(0, 4);

        return {
          text:
            "No one's built up enough reviews yet for a top-rated list — it takes a few before that means anything.\n\n" +
            `There ${anyone.length !== 1 ? "are" : "is"} **${anyone.length}** provider${anyone.length !== 1 ? "s" : ""} on CERVICED. ` +
            (categories.length > 1
              ? "Narrow it down and I can be more useful:"
              : "Here's who's here:"),
          providers: anyone.slice(0, 12).map(providerFromDb),
          suggestions: [
            ...categories.map((cat) => {
              const catLabel = CATEGORY_LABELS[cat] ?? cat.toLowerCase();
              return askChip(`cat-${cat}`, catLabel[0]!.toUpperCase() + catLabel.slice(1), `Find ${catLabel}`);
            }),
            askChip("free", "Who's free this week?", "Who's free this week?"),
          ],
        };
      }
    }

    return {
      text: wantsNew
        ? "No one's joined recently — but there are still providers to browse."
        : "I couldn't find anyone to show right now.",
      suggestions: [
        askChip("browse", "Show me everything", "Show me all services"),
        navChip("explore", "Browse Explore", "Explore"),
      ],
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
        text: `You haven't got any reschedule requests waiting on a reply.`,
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
          text: `${target.providerName} has come back with times for ${header}. Pick one to lock it in.`,
          suggestions: [
            navChip("pick", "Choose a time", "Reschedule", { bookingId: target.id }),
          ],
        };
      case "confirmed":
        return {
          text:
            `Your reschedule is confirmed — ${header} is now ` +
            `${formatShortDate(target.bookingDate)} at ${formatTime12(target.bookingTime)}.`,
          suggestions: [navChip("view", "View booking", "BookingDetail", { bookingId: target.id })],
        };
      case "rejected":
        return {
          text: `${target.providerName} couldn't do a different time for ${header}. Your original slot still stands.`,
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

    // Only surface a channel the provider has actually opted into via
    // Communications — a stored phone/whatsapp_number/email can outlive the
    // provider disabling that channel, and every other contact-sheet reader
    // (BookingDetailScreen, BookingsScreen, ProviderProfileScreen) already
    // gates on preferred_contact_methods the same way.
    const enabled = contact.preferred_contact_methods ?? [];
    const lines: string[] = [];
    if (contact.phone && enabled.includes("phone")) lines.push(`- **Phone:** ${contact.phone}`);
    if (contact.whatsapp_number && enabled.includes("whatsapp")) lines.push(`- **WhatsApp:** ${contact.whatsapp_number}`);
    if (contact.email && enabled.includes("email")) lines.push(`- **Email:** ${contact.email}`);

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
  // Widened deliberately: this is the health-adjacent path (patch tests,
  // allergy testing, skin tests), so a near-miss that drops into the generic
  // "didn't catch that" fallback is the worst place to leave a user guessing.
  // Widened deliberately: this is the health-adjacent path (patch tests,
  // consultations), so a near-miss dropping into the generic "didn't catch
  // that" fallback is the worst place to leave a user guessing.
  //
  // Deliberately EXCLUDES "allergy test" and "skin test": engine.ts's
  // MEDICAL_OR_DERMATOLOGY_RE intercepts `allerg` and `skin (condition|
  // reaction|...)` before routing, so those phrases can never reach this
  // capability — listing them would look like coverage that doesn't exist.
  // "Patch test" is safe (no medical keyword) and is the term the app's own
  // provider settings use.
  phrases: [
    "consultation", "consult", "do i need a consult", "do i need a consultation",
    "patch test", "do i need a patch test", "patch tested", "patch testing",
    "sensitivity test", "do i need testing", "test first", "tested first",
    "before i book", "first appointment", "first time", "new client",
    "do they need to see me first", "do i need to see them first",
    "is a consultation required", "48 hours before", "anything before",
    "what do i need to do first", "any requirements",
  ],
  needs: [{ kind: "provider", required: true }],
  async run({ entities }): Promise<CapabilityResult> {
    const provider = entities.provider!.value;
    // May have come from a pronoun/ordinal reference, which carries no UUID.
    const providerDbId = await resolveProviderDbId(provider);
    if (!providerDbId) {
      return { text: `I couldn't look ${provider.displayName} up properly.` };
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
          // `providerDbId` (resolved above), NOT `provider.dbId` — a provider
          // reached by pronoun or ordinal ("are they any good?", "the first
          // one") carries slug + name but no UUID, and ProviderChatScreen
          // bails early on a missing providerDbId. The chip rendered fine and
          // silently did nothing when tapped — on the one path that tells the
          // user to go ask about a health-adjacent requirement.
          navChip("chat", `Ask ${provider.displayName}`, "ProviderChat", {
            providerId: provider.slug,
            providerDbId,
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
  // POLICY questions only. Deliberately excludes phrasings that mean "do it"
  // ("change the time", "push it back", "rearrange") — those belong to
  // booking.reschedule, which starts the actual reschedule, and someone
  // asking them wants the action, not a policy explainer. Every phrase here
  // reads as a question ABOUT the rules.
  phrases: [
    "how many times can i reschedule", "reschedule policy", "how much notice",
    "can i move it again", "notice to reschedule", "how late can i change",
    "how late can i reschedule", "how many reschedules", "reschedule rules",
    "rules for moving", "moving policy", "what's the reschedule policy",
    "whats the reschedule policy", "notice do i need to move",
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
    "promo code", "promotion code", "discount code", "voucher code",
    "is this code valid", "does this code work", "coupon", "coupon code",
    "any discount", "any offers", "any deals", "do they have offers",
    "is there a discount", "redeem a code", "apply a code", "referral code",
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
        text: `**${code}** isn't valid for ${provider.displayName} right now.`,
        suggestions: [navChip("profile", `View ${provider.displayName}`, "ProviderProfile", {
          providerId: provider.slug,
          source: "becca",
        })],
      };
    }
    return {
      text: `**${code}** is valid for ${provider.displayName} — ${promo.title ?? "discount applied at checkout"}.`,
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
        text: `You haven't set up any event plans yet.`,
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
        text: `You haven't saved any looks yet. Tap the bookmark on any photo in Explore to keep it.`,
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
          `Your beauty profile is empty. Filling it in helps providers ` +
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
  async run({ bookings }): Promise<CapabilityResult> {
    // MUST be getBookmarkedProviders(), not getMyBookmarkCount(). The latter
    // counts how many people have bookmarked YOU **as a provider** — it
    // resolves a providers row for the signed-in user and returns 0 when
    // there isn't one, so in the client hat it reported "you've saved 0
    // providers" for every client, always, however many they'd actually
    // saved. `discover.saved` was listing those same providers correctly at
    // the same time, so the two capabilities contradicted each other.
    // getMyFollowerCount() has the identical provider-row gate and is
    // likewise meaningless here.
    const [saved, savedLooks] = await Promise.all([
      getBookmarkedProviders(),
      getSavedPortfolioIds(),
    ]);

    const completed = bookings.filter((b) => b.status === BookingStatus.COMPLETED).length;
    const upcoming = bookings.filter((b) => b.status === BookingStatus.UPCOMING).length;

    const lines = [
      `- **${saved.length}** saved provider${saved.length !== 1 ? "s" : ""}`,
      `- **${savedLooks.length}** saved look${savedLooks.length !== 1 ? "s" : ""}`,
      `- **${completed}** appointment${completed !== 1 ? "s" : ""} completed`,
      ...(upcoming > 0
        ? [`- **${upcoming}** coming up`]
        : []),
    ].join("\n");

    return {
      text: `## Your activity\n${lines}`,
      suggestions: [
        ...(saved.length > 0
          ? [askChip("saved", "Show my saved providers", "Show my saved providers")]
          : [askChip("find", "Find someone to save", "Show me all services")]),
        ...(savedLooks.length > 0
          ? [askChip("looks", "My saved looks", "Show my saved looks")]
          : []),
        askChip("bookings", "What have I got booked?", "Show all my bookings"),
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
      return { text: `I couldn't look ${provider.displayName} up properly.` };
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
          return `${provider.displayName} is in your saved providers now.`;
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
      return { text: `I couldn't set that up just now.` };
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
          return `You're on ${provider.displayName}'s waitlist. I'll tell you the second a slot opens.`;
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
        text: `You haven't had a completed appointment to review yet.`,
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
          `I don't know your taste well enough yet. ` +
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
      return { text: `No ${label} providers available right now.` };
    }

    const styleNote =
      personal!.styleTags.length > 0
        ? ` You tend to go for ${personal!.styleTags.slice(0, 2).join(" and ")}.`
        : "";

    return {
      text: `You book ${label} most, so here's who's available.${styleNote}`,
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
        "- **Find a provider** — search by service, budget, availability, reviews, prices, or portfolio work\n" +
        "- **Plan a booking** — set the service, timing and budget, then narrow real options down\n" +
        "- **Provider details** — check services, prices, contact details, consultations, promo codes and reschedule policies\n" +
        "- **Your activity** — saved providers and looks, waitlists, messages, notifications, event plans and beauty profile\n" +
        "- **Personal picks** — recommendations based on what you usually book\n\n" +
        "Ask naturally, or choose an action below.",
      suggestions: [
        askChip("next", "When's my next appointment?", "When's my next appointment?"),
        askChip("bookings", "Break down my bookings", "Show my bookings"),
        askChip("find", "Find me someone", "Show me all services"),
        askChip("plan", "Plan a booking", "Help me plan a nail appointment"),
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
 * Appointment-specific chat actions. Keeping the date in the label matters
 * when the same service appears more than once: clients can choose the exact
 * appointment to discuss before deciding whether to open its full record.
 */
type BookingChoiceIntent = "details" | "cost" | "cancel" | "reschedule";

function bookingChoiceMessage(
  booking: ConfirmedBooking,
  intent: BookingChoiceIntent,
): string {
  const appointment = `my ${booking.serviceName} appointment with ${booking.providerName}`;
  switch (intent) {
    case "cost":
      return `How much is ${appointment}?`;
    case "cancel":
      return `Cancel ${appointment}`;
    case "reschedule":
      return `Reschedule ${appointment}`;
    default:
      return `Tell me about ${appointment}`;
  }
}

function bookingChoices(
  bookings: ConfirmedBooking[],
  verb = "Check",
  intent: BookingChoiceIntent = "details",
) {
  return bookings.slice(0, 6).map((booking) => {
    const date = relativeDayLabel(booking.bookingDate) ?? formatShortDate(booking.bookingDate);
    // Once the client has selected the exact appointment, cancellation and
    // rescheduling are screen-owned confirmation flows. Going through chat a
    // second time is both unnecessary and vulnerable to losing that choice.
    if (intent === "reschedule") {
      return navChip(
        `booking-${booking.id}`,
        `${verb}: ${booking.serviceName} · ${date}`,
        "Reschedule",
        { bookingId: booking.id },
      );
    }
    if (intent === "cancel") {
      return navChip(
        `booking-${booking.id}`,
        `${verb}: ${booking.serviceName} · ${date}`,
        "BookingDetail",
        { bookingId: booking.id },
      );
    }
    return askChip(
      `booking-${booking.id}`,
      `${verb}: ${booking.serviceName} · ${date}`,
      bookingChoiceMessage(booking, intent),
      { bookingId: booking.id },
    );
  });
}

export const CLIENT_CAPABILITIES: Capability[] = [
  currentTime,
  nextBooking,
  listBookings,
  bookingDetails,
  bookingInfoPacks,
  upcomingBookingSummary,
  bookingCost,
  cancelBooking,
  // Before `rescheduleBooking`: "has my reschedule been accepted?" is a
  // STATUS question — routing it to the reschedule flow would offer to start
  // another one on a booking that already has a request open.
  rescheduleStatus,
  rescheduleBooking,
  bookingPrep,
  bookingLocation,
  bookingRoutine,
  // After `bookingRoutine`: "what do I usually book" is answerable from the
  // already-loaded window, so it shouldn't pay for an extra query. This one
  // only earns its place when the user explicitly asks to go further back.
  bookingHistory,
  rebook,
  // Follow-ups first: both REQUIRE entities that usually arrive via carried
  // context, so they only score mid-conversation and can't win cold.
  // Pointing at a shown result beats a generic follow-up question.
  pickFromList,
  followUpDay,
  followUpPrice,
  appointmentPlan,
  findAvailable,
  // Before `findProviders`: "show me nail ideas" is a request for WORK, not
  // for a provider list — findProviders' generic "show me" would otherwise
  // win on an equal score by registration order alone.
  inspiration,
  // Before `findProviders` and `promoCode`: "any nail deals?" is a request to
  // BROWSE offers, not to find a provider or validate one specific code —
  // both of which would otherwise take it on a generic phrase match.
  offers,
  findProviders,
  // Before `reviews`: both need a provider, and "what do they do" should
  // resolve to their service list rather than falling through to feedback.
  // Before `providerServices`: "is the peel safe in pregnancy" is a safety
  // question, not a request for their price list, and both need a provider.
  treatmentSafety,
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
