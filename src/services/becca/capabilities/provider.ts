// Provider-hat capabilities.
//
// Previously provider-Becca was pure navigation — ten regex branches that only
// said "that's over there", reading zero business data. These answer from the
// provider's actual bookings, clientele, waitlist and inbox.
//
// Two boundaries hold throughout:
//  - Money: only what the app's own processor handled. Becca never totals,
//    reports or attests to off-app payments (BECCA_CAPABILITIES.md §2.2).
//  - Client data: a provider sees their own clients only, via the provider-
//    scoped queries in databaseService. No cross-provider reads.

import {
  countProviderBookingsOnDate,
  countProviderServices,
  getMyFollowerCount,
  getMyNotifications,
  getMyPromotions,
  getMyProviderFullAddress,
  getMyProviderIntakeForms,
  getMyProviderReviews,
  getMyProviderServices,
  getProviderAvailability,
  getProviderBlockedDates,
  getProviderBookingCapSettings,
  getProviderBookingsByDate,
  getProviderBookingsByDateRange,
  getProviderClientele,
  getProviderConversations,
  getProviderWaitlist,
  getMyProviderProfile,
} from "../../databaseService";
import {
  DAY_NAMES_FULL,
  dateToYMD,
  formatShortDate,
  formatTime12,
} from "../../../utils/dateUtils";
import type { Capability, CapabilityResult } from "../types";
import { navChip, askChip, money } from "./shared";

const todaySchedule: Capability = {
  id: "pv.today",
  hat: "provider",
  describe: "What's on today / my schedule",
  phrases: [
    "today", "what's on", "whats on", "my day", "schedule", "agenda",
    "diary", "appointments", "bookings", "who's coming", "whos coming", "next client",
  ],
  async run({ now, entities }): Promise<CapabilityResult> {
    const ymd = entities.date?.value.ymd ?? dateToYMD(now);
    const label = entities.date?.value.label ?? "today";

    const profile = await getMyProviderProfile();
    if (!profile) {
      return { text: "I couldn't load your provider profile just now." };
    }

    const rows = await getProviderBookingsByDate(profile.id, ymd);
    if (rows.length === 0) {
      return {
        text: `Nothing booked ${label}.`,
        suggestions: [
          askChip("gaps", "Anyone on my waitlist?", "Who's on my waitlist?"),
          navChip("schedule", "My schedule", "schedule"),
        ],
      };
    }

    const lines = rows
      .slice(0, 8)
      .map((b) => `${formatTime12(b.booking_time)} — **${b.service_name_snapshot}** · ${b.customer_name ?? "Client"}`)
      .join("\n");

    // Deliberately counts bookings, not revenue: takings depend on how each
    // booking was actually paid, which isn't Becca's to assert.
    return {
      text: `You've got ${rows.length} booked ${label}:\n\n${lines}`,
      suggestions: [
        navChip("home", "Open today's bookings", "home"),
        askChip("forms", "Anyone missing a form?", "Who hasn't filled their form in?"),
      ],
    };
  },
};

const weekAhead: Capability = {
  id: "pv.week",
  hat: "provider",
  describe: "How busy am I this week",
  phrases: [
    "this week", "how busy", "week ahead", "rest of the week", "next few days",
    "how's my week", "hows my week", "busy week", "what's my week like",
    "whats my week like", "coming week", "next 7 days", "how many this week",
  ],
  async run({ now }): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    // One range query for the whole week, grouped client-side. Seven per-day
    // queries would be seven round trips for exactly the same rows.
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      return dateToYMD(d);
    });
    const rows = await getProviderBookingsByDateRange(
      profile.id,
      days[0]!,
      days[days.length - 1]!,
    );

    const byDate = new Map<string, number>();
    for (const r of rows) {
      byDate.set(r.booking_date, (byDate.get(r.booking_date) ?? 0) + 1);
    }
    const counts = days.map((ymd) => ({ ymd, count: byDate.get(ymd) ?? 0 }));
    const total = rows.length;

    if (total === 0) {
      return {
        text: "Nothing booked over the next 7 days.",
        suggestions: [askChip("waitlist", "Who's waiting?", "Who's on my waitlist?")],
      };
    }

    const busiest = [...counts].sort((a, b) => b.count - a.count)[0]!;
    const lines = counts
      .filter((c) => c.count > 0)
      .map((c) => `${formatShortDate(c.ymd)} — ${c.count} booking${c.count !== 1 ? "s" : ""}`)
      .join("\n");

    return {
      text: `${total} booking${total !== 1 ? "s" : ""} over the next 7 days. Busiest is ${formatShortDate(busiest.ymd)}.\n\n${lines}`,
      suggestions: [navChip("home", "Open bookings", "home")],
    };
  },
};

const waitlist: Capability = {
  id: "pv.waitlist",
  hat: "provider",
  describe: "Who's waiting on a cancellation",
  phrases: [
    "waitlist", "waiting list", "cancellation list", "who's waiting",
    "whos waiting", "fill a gap", "anyone waiting", "who wants a slot",
    "my waitlist", "people waiting", "queue", "anyone on the list",
  ],
  async run(): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const entries = await getProviderWaitlist(profile.id);
    const waiting = entries.filter((e) => e.status === "waiting");

    if (waiting.length === 0) {
      return {
        text: "Nobody's waiting on a cancellation right now.",
        suggestions: [askChip("today", "What's on today?", "What's on today?")],
      };
    }

    // Name who's waiting and for what — "3 people are waiting" isn't
    // actionable, but "Sarah for a gel manicure" tells you whether the gap
    // you have is worth offering to anyone.
    const lines = waiting
      .slice(0, 5)
      .map((e, i) => {
        const name = e.user_name_snapshot ?? "A client";
        return `${i + 1}. **${name}** — ${e.service_name_snapshot}`;
      })
      .join("\n");

    return {
      text:
        `${waiting.length} client${waiting.length !== 1 ? "s are" : " is"} waiting for a slot:\n\n${lines}` +
        `${waiting.length > 5 ? `\n\n…and ${waiting.length - 5} more.` : ""}` +
        // Inviting requires naming a specific date and time, which is a
        // picker job — Becca surfaces the opportunity and hands off rather
        // than trying to read a slot out of chat.
        `\n\nTo offer one of them a slot, open your booking history and pick a time.`,
      suggestions: [
        navChip("history", "Invite from waitlist", "history"),
        askChip("gaps", "Where are my gaps?", "How busy am I this week?"),
      ],
    };
  },
};

const clientele: Capability = {
  id: "pv.clients",
  hat: "provider",
  describe: "My clients / clientele",
  phrases: [
    "my clients", "clientele", "how many clients", "regulars", "client list",
    "customers", "my customers", "client base", "who are my clients",
    "how many customers", "my regulars", "client count",
  ],
  async run(): Promise<CapabilityResult> {
    const members = await getProviderClientele();
    if (members.length === 0) {
      return {
        text: "You haven't got any clients on record yet — they'll appear here after their first booking.",
      };
    }
    return {
      text: `You've got ${members.length} client${members.length !== 1 ? "s" : ""} on record.`,
      suggestions: [
        navChip("clients", "Open Clientele", "clients"),
        askChip("lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
      ],
    };
  },
};

const inbox: Capability = {
  id: "pv.inbox",
  hat: "provider",
  describe: "Any unread messages",
  phrases: [
    "messages", "inbox", "unread", "replies", "anyone messaged", "dm",
    "any messages", "unread messages", "has anyone messaged", "my inbox",
    "client messages", "anyone got in touch", "new messages",
  ],
  async run(): Promise<CapabilityResult> {
    const convos = await getProviderConversations();
    const unread = convos.filter((c) => (c.unread_count_provider ?? 0) > 0);
    if (unread.length === 0) {
      return {
        text: `No unread messages. You've got ${convos.length} conversation${convos.length !== 1 ? "s" : ""} in total.`,
        suggestions: [navChip("messages", "Open Inbox", "messages")],
      };
    }
    return {
      text: `You've got ${unread.length} unread conversation${unread.length !== 1 ? "s" : ""}.`,
      suggestions: [navChip("messages", "Open Inbox", "messages")],
    };
  },
};

const outstandingForms: Capability = {
  id: "pv.forms",
  hat: "provider",
  describe: "Which clients haven't filled their forms in",
  phrases: [
    "forms", "intake", "consultation form", "not filled", "outstanding forms",
    "consent", "who hasn't filled", "who hasnt filled", "missing forms",
    "pending forms", "incomplete forms", "waiting on forms",
  ],
  async run(): Promise<CapabilityResult> {
    const forms = await getMyProviderIntakeForms();
    const pending = forms.filter((f) => f.status === "pending");
    if (pending.length === 0) {
      return { text: "Every form you've sent has been filled in." };
    }
    return {
      text: `${pending.length} form${pending.length !== 1 ? "s haven't" : " hasn't"} been filled in yet.`,
      suggestions: [navChip("home", "Open bookings", "home")],
    };
  },
};

const promotions: Capability = {
  id: "pv.promos",
  hat: "provider",
  describe: "How are my promotions doing",
  phrases: [
    "my promos", "my promotions", "my offers", "discounts", "campaigns",
    "marketing", "my discounts", "my deals", "live offers", "running offers",
    "any promos on", "my campaigns",
  ],
  async run(): Promise<CapabilityResult> {
    const promos = await getMyPromotions();
    const active = promos.filter((p) => p.is_active);
    return {
      text:
        active.length === 0
          ? "You haven't got any live promotions right now."
          : `You've got ${active.length} live promotion${active.length !== 1 ? "s" : ""}.`,
      suggestions: [navChip("promotions", "Open Promotions", "promotions")],
    };
  },
};

const lapsedClients: Capability = {
  id: "pv.lapsed",
  hat: "provider",
  describe: "Which clients haven't been back in a while",
  phrases: [
    "hasn't been back", "havent been back", "lapsed", "haven't seen",
    "havent seen", "win back", "not returned", "stopped coming", "quiet clients",
  ],
  async run({ now }): Promise<CapabilityResult> {
    const members = await getProviderClientele();
    if (members.length === 0) {
      return { text: "You haven't got any clients on record yet." };
    }

    // 8 weeks with no booking — long enough to be meaningful across most
    // beauty service cycles without flagging someone mid-routine.
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 56);
    const cutoffYmd = dateToYMD(cutoff);

    const lapsed = members
      .filter((m) => m.last_booking_date && m.last_booking_date < cutoffYmd)
      .sort((a, b) => a.last_booking_date.localeCompare(b.last_booking_date));

    if (lapsed.length === 0) {
      return {
        text: "Nobody's drifted — every client on your books has been in within the last 8 weeks.",
        suggestions: [navChip("clients", "Open Clientele", "clients")],
      };
    }

    const lines = lapsed
      .slice(0, 6)
      .map((m) => `**${m.customer_name}** — last in ${formatShortDate(m.last_booking_date)}`)
      .join("\n");

    return {
      text:
        `${lapsed.length} client${lapsed.length !== 1 ? "s haven't" : " hasn't"} been back in over 8 weeks:\n\n${lines}` +
        `${lapsed.length > 6 ? `\n\n…and ${lapsed.length - 6} more.` : ""}`,
      suggestions: [navChip("clients", "Open Clientele", "clients")],
    };
  },
};

const myServices: Capability = {
  id: "pv.myservices",
  hat: "provider",
  describe: "What services and prices do I offer",
  // Read-only phrasings only. An "edit"/"add"/"change" intent belongs to
  // `services`, which opens the editor — answering it with a price list is
  // technically responsive and practically useless.
  phrases: [
    "my services", "my prices", "my price list", "what do i charge",
    "my menu", "what do i offer", "my treatments", "how much do i charge",
    "list my services", "what are my prices",
  ],
  excludeWhen: /\b(edit|add|change|update|remove|delete|new)\b/i,
  async run(): Promise<CapabilityResult> {
    const rows = await getMyProviderServices();
    const active = rows.filter((s) => s.is_active);

    if (active.length === 0) {
      return {
        text: "You haven't got any active services yet — add some so clients can book you.",
        suggestions: [navChip("services", "Add a service", "services")],
      };
    }

    const lines = active
      .slice(0, 8)
      .map((s) => {
        const price =
          s.price_max && s.price_max > s.price
            ? `${money(s.price)}–${money(s.price_max)}`
            : money(s.price);
        return `**${s.name}** — ${price} · ${s.duration_minutes} min`;
      })
      .join("\n");

    return {
      text:
        `You've got ${active.length} active service${active.length !== 1 ? "s" : ""}:\n\n${lines}` +
        `${active.length > 8 ? `\n\n…and ${active.length - 8} more.` : ""}`,
      suggestions: [navChip("services", "Edit My Services", "services")],
    };
  },
};

const providerNotifications: Capability = {
  id: "pv.notifications",
  hat: "provider",
  describe: "Any updates or notifications I've missed",
  phrases: [
    "notifications", "any updates", "have i missed", "anything new", "alerts",
    "what did i miss", "any news", "catch me up", "what's new", "whats new",
    "anything i should know", "any alerts",
  ],
  async run(): Promise<CapabilityResult> {
    const rows = await getMyNotifications("provider");
    const unread = rows.filter((n) => !n.is_read);
    if (unread.length === 0) {
      return {
        text: "Nothing new — you're all caught up.",
        suggestions: [askChip("today", "What's on today?", "What's on today?")],
      };
    }
    const lines = unread
      .slice(0, 5)
      .map((n) => `**${n.title}**\n${n.message}`)
      .join("\n\n");
    return {
      text: `${unread.length} unread update${unread.length !== 1 ? "s" : ""}:\n\n${lines}`,
      suggestions: [navChip("notifs", "Open Notifications", "Notifications")],
    };
  },
};

const timeOff: Capability = {
  id: "pv.timeoff",
  hat: "provider",
  describe: "Am I off / what days have I blocked out",
  phrases: [
    "day off", "days off", "time off", "am i off", "blocked out",
    "holiday", "annual leave", "closed on", "not working",
  ],
  async run({ now }): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const blocked = await getProviderBlockedDates(profile.id);
    const todayYmd = dateToYMD(now);
    const upcoming = blocked
      .filter((b) => b.blocked_date >= todayYmd)
      .sort((a, b) => a.blocked_date.localeCompare(b.blocked_date));

    if (upcoming.length === 0) {
      return {
        text: "You haven't blocked out any upcoming days.",
        suggestions: [navChip("schedule", "Block out a day", "schedule")],
      };
    }

    const lines = upcoming
      .slice(0, 6)
      .map((b) => `${formatShortDate(b.blocked_date)}${b.reason ? ` — ${b.reason}` : ""}`)
      .join("\n");

    return {
      text: `You've got ${upcoming.length} day${upcoming.length !== 1 ? "s" : ""} blocked out:\n\n${lines}`,
      suggestions: [navChip("schedule", "Open Schedule", "schedule")],
    };
  },
};

const myReviews: Capability = {
  id: "pv.reviews",
  hat: "provider",
  describe: "What are my clients saying / my rating",
  phrases: [
    "my reviews", "my rating", "what are clients saying", "my feedback",
    "how am i rated", "my stars", "any new reviews", "what do clients say",
  ],
  async run(): Promise<CapabilityResult> {
    const rows = await getMyProviderReviews();
    if (rows.length === 0) {
      return {
        text: "No reviews yet — they'll show up here once clients start leaving them.",
      };
    }
    const avg = rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rows.length;
    const recent = rows
      .slice(0, 3)
      .filter((r) => r.comment)
      .map((r) => `${"★".repeat(Math.round(r.rating ?? 0))} "${r.comment}"`)
      .join("\n\n");

    return {
      text:
        `You're rated **${avg.toFixed(1)}★** from ${rows.length} review${rows.length !== 1 ? "s" : ""}.` +
        (recent ? `\n\nMost recent:\n\n${recent}` : ""),
    };
  },
};

const myHours: Capability = {
  id: "pv.hours",
  hat: "provider",
  describe: "What are my working hours",
  phrases: [
    "my hours", "my working hours", "when am i open", "what time do i open",
    "what time do i close", "my opening hours", "my working days",
  ],
  excludeWhen: /\b(set|change|update|edit|add)\b/i,
  async run(): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const rows = await getProviderAvailability(profile.id);
    const open = rows.filter((r) => !r.is_closed);

    if (open.length === 0) {
      return {
        text: "You haven't set any working hours yet — clients can't book until you do.",
        suggestions: [navChip("schedule", "Set my hours", "schedule")],
      };
    }

    const lines = open
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((r) => `${DAY_NAMES_FULL[r.day_of_week]}: ${formatTime12(r.open_time)} – ${formatTime12(r.close_time)}`)
      .join("\n");

    return {
      text: `You're open ${open.length} day${open.length !== 1 ? "s" : ""} a week:\n\n${lines}`,
      suggestions: [navChip("schedule", "Change my hours", "schedule")],
    };
  },
};

const myCapacity: Capability = {
  id: "pv.capacity",
  hat: "provider",
  describe: "How many bookings can I take a day / am I full",
  phrases: [
    "how many bookings a day", "my daily limit", "am i full", "my capacity",
    "max bookings", "booking limit", "how many can i take",
  ],
  async run({ now }): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const [settings, todayCount] = await Promise.all([
      getProviderBookingCapSettings(profile.id),
      countProviderBookingsOnDate(profile.id, dateToYMD(now)),
    ]);

    const cap = settings.max_per_day;
    const acceptance = settings.auto_accept
      ? "Bookings are auto-accepted."
      : "You're approving bookings manually.";

    if (cap <= 0) {
      return {
        text: `You haven't set a daily limit — you'll take as many as fit your hours.\n\n${todayCount} booked today. ${acceptance}`,
        suggestions: [navChip("automations", "Set a limit", "automations")],
      };
    }

    const left = Math.max(0, cap - todayCount);
    return {
      text:
        `Your limit is **${cap} a day**. You've got ${todayCount} today — ` +
        (left === 0 ? "you're full." : `room for ${left} more.`) +
        `\n\n${acceptance}`,
      suggestions: [navChip("automations", "Change settings", "automations")],
    };
  },
};

const myReach: Capability = {
  id: "pv.reach",
  hat: "provider",
  describe: "How many followers do I have / how many services",
  phrases: [
    "my followers", "how many followers", "how many people follow me",
    "how many services do i have", "my reach", "my audience",
  ],
  async run(): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const [followers, serviceCount] = await Promise.all([
      getMyFollowerCount(),
      countProviderServices(profile.id),
    ]);

    return {
      text:
        `**${followers}** client${followers !== 1 ? "s" : ""} follow you, and you're offering ` +
        `**${serviceCount}** service${serviceCount !== 1 ? "s" : ""}.`,
      suggestions: [
        askChip("reviews", "What are they saying?", "What are my reviews?"),
        navChip("services", "My services", "services"),
      ],
    };
  },
};

const myAddress: Capability = {
  id: "pv.address",
  hat: "provider",
  describe: "What address are clients seeing",
  phrases: [
    "my address", "what address", "my location", "where do clients think",
    "my studio address", "do clients see my address",
  ],
  async run(): Promise<CapabilityResult> {
    const address = await getMyProviderFullAddress();
    if (!address) {
      return {
        text: "You haven't set a full address yet — clients only see your general area.",
        suggestions: [navChip("services", "Set my address", "services")],
      };
    }
    // A provider reading their OWN address is the documented exception to the
    // private-fields rule. Release to clients is policy-gated server-side
    // (client_bookings view), which is why this states the policy rather than
    // implying the address is simply public.
    return {
      text:
        `Your full address is on file:\n\n${address}\n\n` +
        `Clients only see it once your address-release policy allows it — not at booking time by default.`,
      suggestions: [navChip("services", "Change it", "services")],
    };
  },
};

// Navigation-only capabilities. These stay because they're genuinely the right
// answer — the work happens on a dedicated screen, and Becca's job is to get
// the provider there in one tap rather than re-implement it in chat.

const availability: Capability = {
  id: "pv.availability",
  hat: "provider",
  describe: "Set working hours, days off, availability",
  phrases: ["availability", "working hours", "day off", "time off", "holiday", "block out", "open hours", "close"],
  async run(): Promise<CapabilityResult> {
    return {
      text: "Set your working hours, days off and availability in your schedule.",
      suggestions: [navChip("schedule", "Open Schedule", "schedule")],
    };
  },
};

const services: Capability = {
  id: "pv.services",
  hat: "provider",
  describe: "Edit my services, prices, portfolio",
  phrases: ["my services", "my prices", "price list", "menu", "portfolio", "add a service", "edit profile"],
  async run(): Promise<CapabilityResult> {
    return {
      text: "Your services, prices, photos and profile are all under My Services.",
      suggestions: [navChip("services", "Edit My Services", "services")],
    };
  },
};

const analytics: Capability = {
  id: "pv.analytics",
  hat: "provider",
  describe: "Earnings and performance",
  phrases: ["earnings", "revenue", "income", "analytics", "stats", "performance", "insights", "how am i doing"],
  async run(): Promise<CapabilityResult> {
    // Deliberately routes rather than quoting figures in chat: earnings are
    // limited to what the app's processor handled, and Analytics is where that
    // distinction is presented properly.
    return {
      text: "Your earnings, booking trends and performance breakdowns are in Analytics.",
      suggestions: [
        navChip("analytics", "Open Analytics", "analytics"),
        navChip("history", "Booking History", "history"),
      ],
    };
  },
};

const automations: Capability = {
  id: "pv.automations",
  hat: "provider",
  describe: "Reminders, deposits, booking policies",
  phrases: ["automation", "reminders", "deposit", "policy", "policies", "auto message", "settings"],
  async run(): Promise<CapabilityResult> {
    return {
      text: "Reminders, auto-messages, deposits and booking policies are in Automations.",
      suggestions: [navChip("automations", "Open Automations", "automations")],
    };
  },
};

const infoPacks: Capability = {
  id: "pv.infopacks",
  hat: "provider",
  describe: "Info packs, aftercare, prep notes",
  phrases: [
    "info pack", "info packs", "aftercare", "prep notes", "instructions",
    "prep info", "care instructions", "what i send clients", "my packs",
  ],
  async run(): Promise<CapabilityResult> {
    return {
      text: "Manage the prep and aftercare packs you send clients from Info Packs.",
      suggestions: [navChip("infopacks", "Open Info Packs", "infopacks")],
    };
  },
};

const help: Capability = {
  id: "pv.help",
  hat: "provider",
  describe: "What can Becca do for my business",
  phrases: ["what can you do", "help", "how do you work", "what are you", "who are you"],
  async run(): Promise<CapabilityResult> {
    return {
      text:
        "I'm your business assistant. I can tell you:\n\n" +
        "**What's on today** and how your week looks\n" +
        "**Who's waiting** on a cancellation\n" +
        "**Unread messages** and outstanding client forms\n" +
        "**Your clients** and live promotions\n\n" +
        "Or take you straight to your schedule, services or analytics.",
      suggestions: [
        askChip("today", "What's on today?", "What's on today?"),
        askChip("week", "How's my week?", "How busy am I this week?"),
      ],
    };
  },
};

export const PROVIDER_CAPABILITIES: Capability[] = [
  todaySchedule,
  weekAhead,
  waitlist,
  // Before `clientele`: "who hasn't been back" is a specific question that
  // would otherwise fall through to the generic client-count answer.
  lapsedClients,
  clientele,
  inbox,
  providerNotifications,
  outstandingForms,
  promotions,
  // Before `availability`: "am I off Friday" is answerable from real blocked
  // dates, whereas `availability` only routes to the schedule screen.
  timeOff,
  // Before `availability`: "what are my hours?" is answerable from the real
  // schedule rows; `availability` only routes to the editor.
  myHours,
  availability,
  // Before `services`: "what do I charge?" is answerable from the real
  // service rows, whereas `services` only routes to the editor screen.
  myServices,
  services,
  myReviews,
  myCapacity,
  myReach,
  myAddress,
  analytics,
  automations,
  infoPacks,
  help,
];
