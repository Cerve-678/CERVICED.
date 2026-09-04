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
  getMyProviderFullAddress,
  getMyProviderIntakeForms,
  getMyProviderMessageTemplates,
  getMyProviderReviews,
  getMyProviderServices,
  getProviderAvailability,
  getProviderBlockedDates,
  getProviderBookingCapSettings,
  getProviderBookingPoliciesById,
  getProviderBookings,
  getProviderBookingsByDate,
  getProviderBookingsByDateRange,
  getProviderClientele,
  getProviderConversations,
  getProviderFormLibrary,
  getProviderPortfolio,
  getProviderSpecialties,
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
      .map((b) => `- **${formatTime12(b.booking_time)}** · **${b.service_name_snapshot}**\n  ${b.customer_name ?? "Client"}`)
      .join("\n");

    // Deliberately counts bookings, not revenue: takings depend on how each
    // booking was actually paid, which isn't Becca's to assert.
    return {
      text: `## ${rows.length} booking${rows.length !== 1 ? "s" : ""} ${label}\nHere’s your schedule:\n\n${lines}`,
      suggestions: [
        // Mirror the client experience: each schedule line Becca shows can
        // be opened directly, rather than making a provider hunt through the
        // whole day after choosing it in chat.
        ...rows.slice(0, 6).map((booking) =>
          navChip(
            `booking-${booking.id}`,
            `View: ${booking.service_name_snapshot} · ${formatTime12(booking.booking_time)}`,
            "BookingDetail",
            { bookingId: booking.id },
          ),
        ),
        ...(rows.length > 6 ? [navChip("home", "Open all today’s bookings", "home")] : []),
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
        suggestions: [
          askChip("waitlist", "Who's waiting?", "Who's on my waitlist?"),
          askChip("lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
          askChip("reach", "How's my reach?", "How many followers have I got?"),
        ],
      };
    }

    const busiest = [...counts].sort((a, b) => b.count - a.count)[0]!;
    const lines = counts
      .filter((c) => c.count > 0)
      .map((c) => `- **${formatShortDate(c.ymd)}** · ${c.count} booking${c.count !== 1 ? "s" : ""}`)
      .join("\n");

    return {
      text: `## Your next 7 days\n**${total} booking${total !== 1 ? "s" : ""}** in total · busiest on **${formatShortDate(busiest.ymd)}**.\n\n${lines}`,
      suggestions: [
        navChip("home", "Open bookings", "home"),
        askChip("today", "Just today?", "What's on today?"),
        askChip("capacity", "Am I near my cap?", "Am I full today?"),
        askChip("waitlist", "Who's waiting?", "Who's on my waitlist?"),
      ],
    };
  },
};

/** A practical schedule insight: identifies quieter days, never imaginary slots. */
const scheduleGaps: Capability = {
  id: "pv.gaps",
  hat: "provider",
  describe: "Which upcoming days are quiet or have booking gaps",
  phrases: [
    "where are my gaps", "where are the gaps", "my gaps", "quiet days",
    "quiet day", "empty days", "free days", "slow days", "days with space",
    "when am i quiet", "where can i fit someone in", "fill my diary",
  ],
  async run({ now }): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) return { text: "I couldn't load your provider profile just now." };

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(day.getDate() + index);
      return dateToYMD(day);
    });
    const rows = await getProviderBookingsByDateRange(profile.id, days[0]!, days[days.length - 1]!);
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.booking_date, (counts.get(row.booking_date) ?? 0) + 1);

    // A booking count is a dependable signal. We deliberately avoid calling a
    // day "free" at a particular time because hours, blocks and service
    // duration still decide that on the schedule screen.
    const quiet = days
      .map((ymd) => ({ ymd, count: counts.get(ymd) ?? 0 }))
      .filter((day) => day.count <= 1);

    if (quiet.length === 0) {
      return {
        text: "## Your next 7 days\nEvery day already has at least 2 bookings — your diary is looking healthy.",
        suggestions: [
          askChip("capacity", "Am I near my cap?", "Am I full today?"),
          navChip("schedule", "Open schedule", "schedule"),
        ],
      };
    }

    const lines = quiet
      .map((day) => `- **${formatShortDate(day.ymd)}** — ${day.count === 0 ? "no bookings yet" : "1 booking"}`)
      .join("\n");
    return {
      text:
        `## Quieter days ahead\nThese days have the most room in your next 7 days:\n\n${lines}\n\n` +
        "Open your schedule to confirm the actual slots before offering one.",
      suggestions: [
        navChip("schedule", "Open schedule", "schedule"),
        askChip("waitlist", "Who’s on my waitlist?", "Who's on my waitlist?"),
        askChip("lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
      ],
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
      .map((e) => {
        const name = e.user_name_snapshot ?? "A client";
        return `- **${name}** — ${e.service_name_snapshot}`;
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
        suggestions: [
          askChip("reach", "How's my reach?", "How many followers have I got?"),
          askChip("reach", "How's my reach?", "How many followers have I got?"),
          navChip("services", "Check my services", "services"),
        ],
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
        suggestions: [
          navChip("messages", "Open Inbox", "messages"),
          askChip("today", "What's on today?", "What's on today?"),
          askChip("forms", "Anyone missing a form?", "Who hasn't filled their form in?"),
        ],
      };
    }
    return {
      text: `You've got ${unread.length} unread conversation${unread.length !== 1 ? "s" : ""}.`,
      suggestions: [
        ...unread.slice(0, 5).flatMap((conversation) => {
          const client = conversation.client;
          if (!client) return [];
          return [
            navChip(`conversation-${conversation.id}`, `Reply to ${client.name}`, "conversation", {
              conversationId: conversation.id,
              clientUserId: client.id,
              clientName: client.name,
            }),
          ];
        }),
        navChip("messages", "Open Inbox", "messages"),
        askChip("waitlist", "Anyone on my waitlist?", "Who's on my waitlist?"),
        askChip("today", "What's on today?", "What's on today?"),
      ],
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
      return {
        text: "Every form you've sent has been filled in.",
        suggestions: [
          askChip("today", "What's on today?", "What's on today?"),
          navChip("infopacks", "Manage Info Packs", "infopacks"),
        ],
      };
    }
    return {
      text: `${pending.length} form${pending.length !== 1 ? "s haven't" : " hasn't"} been filled in yet.`,
      suggestions: [
        navChip("home", "Open bookings", "home"),
        askChip("inbox", "Any unread messages?", "Any unread messages?"),
        navChip("infopacks", "Manage Info Packs", "infopacks"),
      ],
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
      return {
        text: "You haven't got any clients on record yet.",
        suggestions: [
          askChip("reach", "How's my reach?", "How many followers have I got?"),
          navChip("services", "Check my services", "services"),
        ],
      };
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
        suggestions: [
          navChip("clients", "Open Clientele", "clients"),
          askChip("week", "How's my week?", "How busy am I this week?"),
        ],
      };
    }

    const lines = lapsed
      .slice(0, 6)
      .map((m) => `- **${m.customer_name}** — last in **${formatShortDate(m.last_booking_date)}**`)
      .join("\n");

    return {
      text:
        `${lapsed.length} client${lapsed.length !== 1 ? "s haven't" : " hasn't"} been back in over 8 weeks:\n\n${lines}` +
        `${lapsed.length > 6 ? `\n\n…and ${lapsed.length - 6} more.` : ""}`,
      suggestions: [
        navChip("clients", "Open Clientele", "clients"),
        askChip("reach", "How's my reach?", "How many followers have I got?"),
        navChip("messages", "Open Inbox", "messages"),
      ],
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
        suggestions: [
          navChip("services", "Add a service", "services"),
          navChip("schedule", "Set my hours", "schedule"),
        ],
      };
    }

    const lines = active
      .slice(0, 8)
      .map((s) => {
        const price =
          s.price_max && s.price_max > s.price
            ? `${money(s.price)}–${money(s.price_max)}`
            : money(s.price);
        return `- **${s.name}** — **${price}** · ${s.duration_minutes} min`;
      })
      .join("\n");

    return {
      text:
        `You've got ${active.length} active service${active.length !== 1 ? "s" : ""}:\n\n${lines}` +
        `${active.length > 8 ? `\n\n…and ${active.length - 8} more.` : ""}`,
      suggestions: [
        navChip("services", "Edit My Services", "services"),
        askChip("reviews", "How are my reviews?", "How are my reviews?"),
        askChip("capacity", "How's my capacity?", "Am I full today?"),
      ],
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
        suggestions: [
          askChip("today", "What's on today?", "What's on today?"),
          askChip("inbox", "Any unread messages?", "Any unread messages?"),
          askChip("week", "How's my week?", "How busy am I this week?"),
        ],
      };
    }
    const lines = unread
      .slice(0, 5)
      .map((n) => `- **${n.title}**\n  ${n.message}`)
      .join("\n\n");
    return {
      text: `${unread.length} unread update${unread.length !== 1 ? "s" : ""}:\n\n${lines}`,
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
        navChip("notifs", "Open Notifications", "Notifications"),
        askChip("inbox", "Any unread messages?", "Any unread messages?"),
        askChip("today", "What's on today?", "What's on today?"),
      ],
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
        suggestions: [
          navChip("schedule", "Block out a day", "schedule"),
          askChip("hours", "What are my hours?", "What are my working hours?"),
          askChip("week", "How's my week?", "How busy am I this week?"),
        ],
      };
    }

    const lines = upcoming
      .slice(0, 6)
      .map((b) => `- **${formatShortDate(b.blocked_date)}**${b.reason ? ` — ${b.reason}` : ""}`)
      .join("\n");

    return {
      text: `You've got ${upcoming.length} day${upcoming.length !== 1 ? "s" : ""} blocked out:\n\n${lines}`,
      suggestions: [
        navChip("schedule", "Open Schedule", "schedule"),
        askChip("hours", "What are my hours?", "What are my working hours?"),
        askChip("week", "How's my week?", "How busy am I this week?"),
      ],
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
        suggestions: [
          askChip("clients", "How many clients have I got?", "How many clients have I got?"),
          navChip("services", "Check my services", "services"),
        ],
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
      suggestions: [
        navChip("analytics", "Open Analytics", "analytics"),
        askChip("clients", "How many clients?", "How many clients have I got?"),
        askChip("reach", "How's my reach?", "How many followers have I got?"),
      ],
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
        suggestions: [
          navChip("schedule", "Set my hours", "schedule"),
          navChip("services", "Check my services", "services"),
        ],
      };
    }

    const lines = open
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((r) => `- **${DAY_NAMES_FULL[r.day_of_week]}:** ${formatTime12(r.open_time)} – ${formatTime12(r.close_time)}`)
      .join("\n");

    return {
      text: `You're open ${open.length} day${open.length !== 1 ? "s" : ""} a week:\n\n${lines}`,
      suggestions: [
        navChip("schedule", "Change my hours", "schedule"),
        askChip("timeoff", "When am I off?", "What days off have I got?"),
        askChip("capacity", "What's my daily limit?", "Am I full today?"),
      ],
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
        suggestions: [
          // The cap is enforced in Scheduling → Booking Rules, not
          // Automations. Sending providers there made this otherwise useful
          // action look broken because no daily-limit control exists there.
          navChip("booking-rules", "Set a daily limit", "bookingRules"),
          askChip("hours", "What are my hours?", "What are my working hours?"),
          askChip("week", "How's my week?", "How busy am I this week?"),
        ],
      };
    }

    const left = Math.max(0, cap - todayCount);
    return {
      text:
        `Your limit is **${cap} a day**. You've got ${todayCount} today — ` +
        (left === 0 ? "you're full." : `room for ${left} more.`) +
        `\n\n${acceptance}`,
      suggestions: [
        navChip("booking-rules", "Change daily limit", "bookingRules"),
        askChip("today", "What's on today?", "What's on today?"),
        askChip("waitlist", "Anyone waiting?", "Who's on my waitlist?"),
      ],
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
    "who follows me", "my following", "how visible am i",
    "how many people see me", "my profile reach", "am i getting seen",
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
        suggestions: [
          navChip("services", "Set my address", "services"),
          navChip("automations", "Address-release policy", "automations"),
        ],
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
      suggestions: [
        navChip("services", "Change it", "services"),
        navChip("automations", "Address-release policy", "automations"),
      ],
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
      suggestions: [
        navChip("schedule", "Open Schedule", "schedule"),
        askChip("hours", "What are my hours?", "What are my working hours?"),
        askChip("timeoff", "When am I off?", "What days off have I got?"),
      ],
    };
  },
};

const services: Capability = {
  id: "pv.services",
  hat: "provider",
  describe: "Edit my services, prices, portfolio",
  phrases: [
    "my services", "my prices", "price list", "menu", "portfolio",
    "add a service", "edit profile", "my profile", "my listing",
    "my photos", "my portfolio", "my specialties", "my specialisms",
    "edit my services", "change my prices", "update my profile",
    "how does my profile look", "what do clients see",
  ],
  // Reads the shape of the provider's own listing before routing, so "edit my
  // services" answers with what there IS to edit rather than only where the
  // button lives. Everything here is the caller's own record.
  async run(): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) {
      return {
        text: "I couldn't load your provider profile just now.",
        suggestions: [navChip("services", "Open My Services", "services")],
      };
    }

    // Independent reads — run together rather than in sequence.
    // Venue/workspace shots aren't work a client browses — they sit in
    // Additional Information on the profile and never reach Explore — so
    // counting them here would both inflate the number and silence the "no
    // portfolio photos" gap for a provider whose gallery is genuinely empty.
    // getProviderPortfolio leaves them out of `work` in SQL.
    const [rows, { work: portfolio }, specialties] = await Promise.all([
      getMyProviderServices(),
      getProviderPortfolio(profile.id),
      getProviderSpecialties(profile.id),
    ]);
    const active = rows.filter((s) => s.is_active);
    const inactive = rows.length - active.length;

    const lines = [
      `- **${active.length}** active service${active.length !== 1 ? "s" : ""}` +
        (inactive > 0 ? ` (**${inactive}** hidden)` : ""),
      `- **${portfolio.length}** portfolio photo${portfolio.length !== 1 ? "s" : ""}`,
      ...(specialties.length > 0
        ? [`- **${specialties.length}** specialit${specialties.length !== 1 ? "ies" : "y"} — ${specialties.slice(0, 4).join(", ")}`]
        : []),
    ].join("\n");

    // The gaps are what a provider actually wants flagged: an empty portfolio
    // or no services is why a listing underperforms, and neither is obvious
    // from inside the editor.
    const gaps: string[] = [];
    if (active.length === 0) gaps.push("You've got no active services, so clients can't book you yet.");
    if (portfolio.length === 0) gaps.push("You haven't added any portfolio photos — listings with work shown get browsed far more.");
    if (specialties.length === 0) gaps.push("No specialities set, so you won't surface in those searches.");

    return {
      text:
        `## Your listing\n${lines}` +
        (gaps.length > 0 ? `\n\n${gaps.map((g) => `- ${g}`).join("\n")}` : ""),
      suggestions: [
        navChip("services", "Edit My Services", "services"),
        ...(active.length > 0
          ? [askChip("prices", "What do I charge?", "What do I charge?")]
          : []),
        askChip("reviews", "How are my reviews?", "How are my reviews?"),
        askChip("reach", "What's my reach?", "How many followers have I got?"),
      ],
    };
  },
};

const analytics: Capability = {
  id: "pv.analytics",
  hat: "provider",
  describe: "How my business is doing — booking volume and patterns",
  phrases: [
    "earnings", "revenue", "income", "analytics", "stats", "performance",
    "insights", "how am i doing", "how's business", "hows business",
    "how many bookings", "booking trends", "busiest day", "my numbers",
    "how was last month", "how many clients this month", "am i growing",
    "my busiest", "how many appointments",
  ],
  async run({ now }): Promise<CapabilityResult> {
    // MONEY BOUNDARY: this answers booking VOLUME and patterns only, and
    // never totals prices into an earnings figure. The app can only see what
    // its own processor handled — anything settled directly with the provider
    // is invisible here — so a "you've earned £X" answer would be wrong in a
    // way the provider couldn't detect. Analytics presents that distinction
    // properly, so anything about money routes there instead.
    // See BECCA_CAPABILITIES.md §2.2 and CLAUDE.md's payment rules.
    const rows = await getProviderBookings(90);

    if (rows.length === 0) {
      return {
        text:
          "You've had no bookings in the last 90 days, so there's no pattern to read yet. " +
          "Analytics has the full picture as it builds up.",
        suggestions: [
          navChip("analytics", "Open Analytics", "analytics"),
          askChip("services", "How's my listing?", "How does my profile look?"),
        ],
      };
    }

    const ymd = dateToYMD(now);
    const dayMs = 86_400_000;
    const cutoff = (days: number) => dateToYMD(new Date(now.getTime() - days * dayMs));
    const last30 = cutoff(30);
    const prev30 = cutoff(60);

    const inRange = (from: string, to: string) =>
      rows.filter((b) => b.booking_date >= from && b.booking_date < to).length;

    const recent = inRange(last30, ymd);
    const previous = inRange(prev30, last30);
    const completed = rows.filter((b) => b.status === "completed").length;
    const cancelled = rows.filter((b) => b.status === "cancelled").length;
    const noShows = rows.filter((b) => b.status === "no_show").length;

    // Distinct clients, not bookings — a repeat client shouldn't inflate this.
    const distinctClients = new Set(rows.map((b) => b.user_id).filter(Boolean)).size;

    // Busiest weekday across the whole window.
    const byDay = new Map<number, number>();
    for (const b of rows) {
      const day = new Date(`${b.booking_date}T00:00:00`).getDay();
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

    const trend =
      previous === 0
        ? undefined
        : recent > previous
          ? `up from **${previous}** the month before`
          : recent < previous
            ? `down from **${previous}** the month before`
            : `level with the month before`;

    const lines = [
      `- **${recent}** booking${recent !== 1 ? "s" : ""} in the last 30 days` +
        (trend ? ` — ${trend}` : ""),
      `- **${rows.length}** in the last 90 days, from **${distinctClients}** client${distinctClients !== 1 ? "s" : ""}`,
      `- **${completed}** completed` +
        (cancelled > 0 ? `, **${cancelled}** cancelled` : "") +
        (noShows > 0 ? `, **${noShows}** no-show${noShows !== 1 ? "s" : ""}` : ""),
      ...(busiest
        ? [`- Busiest day: **${DAY_NAMES_FULL[busiest[0]]}** (**${busiest[1]}** bookings)`]
        : []),
    ].join("\n");

    return {
      text:
        `## Your last 90 days\n${lines}\n\n` +
        "Earnings and payment breakdowns are in Analytics — I only count bookings here.",
      suggestions: [
        navChip("analytics", "Open Analytics", "analytics"),
        navChip("history", "Booking History", "history"),
        askChip("week", "How's my week?", "How busy am I this week?"),
        askChip("lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
      ],
    };
  },
};

const automations: Capability = {
  id: "pv.automations",
  hat: "provider",
  describe: "My deposit, cancellation and reschedule policies",
  phrases: [
    "automation", "automations", "reminders", "deposit", "my deposit",
    "policy", "policies", "my policies", "auto message", "settings",
    "cancellation policy", "my cancellation policy", "reschedule policy",
    "do i take a deposit", "how much notice do i need", "notice period",
    "what's my policy", "whats my policy", "no show policy", "my terms",
  ],
  async run(): Promise<CapabilityResult> {
    const profile = await getMyProviderProfile();
    if (!profile) {
      return {
        text: "I couldn't load your provider profile just now.",
        suggestions: [navChip("automations", "Open Automations", "automations")],
      };
    }

    const policies = await getProviderBookingPoliciesById(profile.id);

    if (!policies) {
      return {
        text:
          "You haven't set any booking policies yet — no deposit, and no notice period for cancellations or reschedules. " +
          "Setting these protects you against late drop-outs.",
        suggestions: [
          navChip("automations", "Set my policies", "automations"),
          navChip("infopacks", "Info Packs", "infopacks"),
        ],
      };
    }

    // booking_policies is an untyped JSON blob, so every read is narrowed
    // rather than cast. A malformed/absent value must read as "not set"
    // instead of rendering "undefined" at a provider.
    const num = (key: string): number | undefined => {
      const raw = policies[key];
      const parsed = typeof raw === "string" ? parseInt(raw, 10) : raw;
      return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
        ? parsed
        : undefined;
    };
    const str = (key: string): string | undefined => {
      const raw = policies[key];
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };

    const depositRequired = policies["depositRequired"] === true;
    const depositAmount = num("depositAmount");
    const depositType = str("depositType");
    const cancelNotice = num("cancelNotice");
    const rescheduleNotice = num("rescheduleNotice");
    const maxReschedules = num("maxReschedules");
    const noShowGrace = num("noShowGraceMinutes");

    const lines: string[] = [];
    if (depositRequired && depositAmount != null) {
      // depositType distinguishes a flat fee from a percentage of the service
      // price — quoting "£20" when it's actually 20% would misstate the
      // provider's own terms back at them.
      const shown = depositType === "percentage" ? `${depositAmount}%` : money(depositAmount);
      lines.push(`- **Deposit** — **${shown}** to book`);
    } else {
      lines.push("- **Deposit** — not required");
    }
    lines.push(
      cancelNotice != null
        ? `- **Cancellations** — **${cancelNotice}h** notice`
        : "- **Cancellations** — no notice period set",
    );
    lines.push(
      rescheduleNotice != null
        ? `- **Reschedules** — **${rescheduleNotice}h** notice` +
            (maxReschedules != null ? `, up to **${maxReschedules}** per booking` : "")
        : "- **Reschedules** — no notice period set",
    );
    if (noShowGrace != null) {
      lines.push(`- **No-shows** — marked after **${noShowGrace} min**`);
    }

    const note = str("depositNote") ?? str("cancelNote");

    return {
      text:
        `## Your booking policies\n${lines.join("\n")}` +
        (note ? `\n\nYou tell clients: "${note}"` : ""),
      suggestions: [
        navChip("automations", "Edit my policies", "automations"),
        navChip("infopacks", "Info Packs", "infopacks"),
        askChip("capacity", "What's my booking cap?", "Am I full today?"),
      ],
    };
  },
};

const infoPacks: Capability = {
  id: "pv.infopacks",
  hat: "provider",
  describe: "Info packs, forms and message templates I send clients",
  phrases: [
    "info pack", "info packs", "aftercare", "prep notes", "instructions",
    "prep info", "care instructions", "what i send clients", "my packs",
    "my forms", "my form library", "intake forms", "consent forms",
    "message templates", "my templates", "canned replies", "quick replies",
    "saved replies", "what forms do i have",
  ],
  async run(): Promise<CapabilityResult> {
    // Both are self-scoped (own provider id resolved inside), and independent.
    const [forms, templates] = await Promise.all([
      getProviderFormLibrary(),
      getMyProviderMessageTemplates(),
    ]);

    if (forms.length === 0 && templates.length === 0) {
      return {
        text:
          "You haven't set up any forms or message templates yet. " +
          "Templates save you retyping the same replies, and forms collect what you need before a client arrives.",
        suggestions: [
          navChip("infopacks", "Open Info Packs", "infopacks"),
          navChip("automations", "Automations", "automations"),
        ],
      };
    }

    const lines: string[] = [];
    if (forms.length > 0) {
      // autoSend is the detail worth surfacing: a form that isn't auto-sent
      // only goes out if the provider remembers to send it manually.
      const auto = forms.filter((f) => f.autoSend).length;
      lines.push(
        `- **${forms.length}** form${forms.length !== 1 ? "s" : ""} in your library` +
          (auto > 0 ? ` (**${auto}** sent automatically)` : " — none sent automatically"),
      );
      lines.push(...forms.slice(0, 4).map((f) => `  - ${f.title}`));
    }
    if (templates.length > 0) {
      lines.push(`- **${templates.length}** message template${templates.length !== 1 ? "s" : ""}`);
      lines.push(...templates.slice(0, 4).map((t) => `  - ${t.label}`));
    }

    return {
      text: `## What you send clients\n${lines.join("\n")}`,
      suggestions: [
        navChip("infopacks", "Open Info Packs", "infopacks"),
        askChip("forms", "Anyone missing a form?", "Who hasn't filled their form in?"),
        navChip("automations", "Automations", "automations"),
      ],
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
        "## Your business assistant\n" +
        "- **Diary & capacity** — today’s bookings, quieter days, working hours, days off and daily limits\n" +
        "- **Clients** — client list, lapsed clients, waitlist and outstanding forms\n" +
        "- **Communication** — unread messages and notifications\n" +
        "- **Business setup** — services, prices, address, reviews, automations and info packs\n" +
        "- **Performance** — reach and a direct route to analytics\n\n" +
        "Ask a question, or choose a shortcut below.",
      suggestions: [
        askChip("today", "What's on today?", "What's on today?"),
        askChip("week", "How's my week?", "How busy am I this week?"),
        askChip("gaps", "Where are my gaps?", "Where are my gaps this week?"),
        askChip("waitlist", "Who's on my waitlist?", "Who's on my waitlist?"),
        askChip("lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
        askChip("reviews", "How are my reviews?", "How are my reviews?"),
        navChip("analytics", "Open Analytics", "analytics"),
      ],
    };
  },
};

export const PROVIDER_CAPABILITIES: Capability[] = [
  todaySchedule,
  weekAhead,
  scheduleGaps,
  waitlist,
  // Before `clientele`: "who hasn't been back" is a specific question that
  // would otherwise fall through to the generic client-count answer.
  lapsedClients,
  clientele,
  inbox,
  providerNotifications,
  outstandingForms,
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
