// Provider settings index shared by deterministic routing and the answer.
// Keep destinations tied to controls that actually exist in the app.

export interface ProviderDestination {
  title: string;
  path: string;
  screen: string;
  detail: string;
  fullBookingOnly?: boolean;
}

const destinations: { topic: RegExp; destination: ProviderDestination }[] = [
  {
    topic: /\bwalk[ -]?ins?\b/i,
    destination: { title: "Walk-ins welcome", path: "Business Details → Scheduling & Availability → Availability", screen: "bookingRules", detail: "Switch on Walk-ins welcome, then save your changes.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:working hours|opening hours|business hours|hours|schedule|diary|calendar|blocked dates?|days? off|time off|holidays?|breaks?)\b/i,
    destination: { title: "Working hours & blocked dates", path: "Schedule", screen: "schedule", detail: "Set your weekly hours, breaks or blocked dates there." },
  },
  {
    topic: /\b(?:booking rules?|booking notice|minimum notice|buffer time|daily (?:booking )?(?:cap|limit)|appointment intervals?|accept(?:ing)? new clients|group bookings?|availability windows?)\b/i,
    destination: { title: "Scheduling & Availability", path: "Business Details → Scheduling & Availability", screen: "bookingRules", detail: "Change your booking rules and availability options, then save.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:services?|prices?|price list|menu|portfolio|photos?|specialit(?:y|ies))\b/i,
    destination: { title: "My Services", path: "My Services", screen: "services", detail: "Edit your services, prices and portfolio there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:deposit|cancellation policy|reschedul(?:e|ing) policy|automations?)\b/i,
    destination: { title: "Automations", path: "Business Details → Automations", screen: "automations", detail: "Update your deposit, cancellation and rescheduling settings there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:promotions?|offers?|discounts?|promo codes?)\b/i,
    destination: { title: "Promotions", path: "Promotions", screen: "promotions", detail: "Create or change your promotions there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:info packs?|intake forms?|message templates?)\b/i,
    destination: { title: "Info Packs", path: "Info Packs", screen: "infopacks", detail: "Manage client information and forms there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:payment settings?|payouts?|bank details?)\b/i,
    destination: { title: "Payments", path: "Business Details → Payments", screen: "payments", detail: "Review or update your payment details there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:clients?|clientele)\b/i,
    destination: { title: "Clientele", path: "Clientele", screen: "clients", detail: "Open your client list there.", fullBookingOnly: true },
  },
  {
    topic: /\b(?:messages?|inbox|conversations?)\b/i,
    destination: { title: "Messages", path: "Inbox", screen: "messages", detail: "Open your client conversations there." },
  },
  {
    topic: /\b(?:analytics|insights|performance)\b/i,
    destination: { title: "Analytics", path: "Analytics", screen: "analytics", detail: "View your business activity there.", fullBookingOnly: true },
  },
];

export function providerDestination(message: string): ProviderDestination | undefined {
  return destinations.find(({ topic }) => topic.test(message))?.destination;
}

export function isProviderNavigationAsk(message: string): boolean {
  if (!providerDestination(message)) return false;
  // This direct command is an existing Becca action with its own confirmation.
  if (/^set\s+(?:my\s+)?daily\s+(?:booking\s+)?(?:cap|limit)\b/i.test(message)) return false;
  // The analytics capability already opens Analytics while adding a useful
  // business summary; keep that established route for this exact command.
  if (/^open\s+(?:my\s+)?analytics\b/i.test(message)) return false;
  return /\b(?:where (?:do|can|is)|how (?:do|can)|show me where|take me to|open|find|go to|navigate|set|change|edit|update|switch|turn (?:on|off)|enable|disable|manage|add|remove|block out)\b/i.test(message);
}
