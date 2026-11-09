// supabase/functions/_shared/extractProviderProfile.ts
// Reads a beauty/wellness business's details, services, add-ons and policies
// out of a web page, a PDF, or photos/screenshots of a price list, using
// Claude. Shared by the single-request extract-provider-profile function (the
// Info Reg "Import" box) and the batch run-scrape-job pipeline, so both read
// with the same prompt and return the same shape.
//
// Needs the ANTHROPIC_API_KEY secret on the Supabase project. Without it every
// read fails with a clear error rather than a silent empty result.
import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';

const MODEL = 'claude-opus-5-5';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY || 'missing' });

/** How much of a web page's text is read. A long menu page is still well
 *  under this; a page past it is flagged in `unclear`, not cut silently. */
const MAX_PAGE_CHARS = 120_000;
/** A page with less text than this almost always draws its prices with
 *  JavaScript (Fresha, Booksy), so a plain fetch sees nothing to read. */
const MIN_PAGE_CHARS = 200;
/** Largest PDF or image fetched from a link. */
const MAX_LINKED_FILE_BYTES = 20 * 1024 * 1024;

export const PRIMARY_TYPES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'] as const;

export interface ExtractedService {
  name?: string;
  price?: number | string;
  /** "1 hr 30 mins" style, the shape run-scrape-job and the app both parse. */
  duration?: string;
  description?: string;
}

export interface ExtractedAddOn {
  name: string;
  price: number | null;
  extraMinutes: number | null;
  description: string;
  /** Service categories (as named in `categories`) it's offered on; [] = all. */
  categories: string[];
}

export interface ExtractedPolicies {
  cancelNoticeHours: number | null;
  cancellationNote: string;
  rescheduleNoticeHours: number | null;
  maxReschedules: number | null;
  rescheduleNote: string;
  lateGraceMinutes: number | null;
  noShowNote: string;
  refundNote: string;
  travelNote: string;
  bookingInstructions: string[];
  /** Every fee or deposit the source mentions, in its own words. Never turned
   *  into a charge automatically: the app lists these for a person to set. */
  feesAndDeposits: string[];
}

export interface ExtractedProviderProfile {
  providerName?: string;
  location?: string;
  aboutText?: string;
  slotsText?: string;
  serviceCategory?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  tiktok?: string;
  categories?: Record<string, ExtractedService[]>;
  addOns?: ExtractedAddOn[];
  policies?: ExtractedPolicies;
  /** Anything that couldn't be read cleanly, for the person checking it. */
  unclear?: string;
}

export const UPLOAD_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export interface UploadedFile {
  mediaType: typeof UPLOAD_MEDIA_TYPES[number];
  /** base64, no data: prefix */
  data: string;
}

/** A failure whose message is safe and useful to show the person importing. */
export class ExtractionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ── What Claude returns ─────────────────────────────────────────────────────
// Structured outputs need every object closed and every key required, so
// "not shown" is an empty string, an empty list, or null.

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] };

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['business', 'services', 'add_ons', 'policies', 'unclear'],
  properties: {
    business: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'about', 'location', 'opening_hours', 'primary_type', 'phone', 'email', 'instagram', 'tiktok', 'website'],
      properties: {
        name: { type: 'string' },
        about: { type: 'string' },
        location: { type: 'string' },
        opening_hours: { type: 'string' },
        primary_type: { type: 'string', enum: [...PRIMARY_TYPES] },
        phone: { type: 'string' },
        email: { type: 'string' },
        instagram: { type: 'string' },
        tiktok: { type: 'string' },
        website: { type: 'string' },
      },
    },
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'name', 'price', 'price_is_from', 'duration_minutes', 'description'],
        properties: {
          category: { type: 'string' },
          name: { type: 'string' },
          price: nullableNumber,
          price_is_from: { type: 'boolean' },
          duration_minutes: nullableInteger,
          description: { type: 'string' },
        },
      },
    },
    add_ons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'price', 'extra_minutes', 'description', 'categories'],
        properties: {
          name: { type: 'string' },
          price: nullableNumber,
          extra_minutes: nullableInteger,
          description: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    policies: {
      type: 'object',
      additionalProperties: false,
      required: [
        'cancel_notice_hours', 'cancellation_note', 'reschedule_notice_hours', 'max_reschedules',
        'reschedule_note', 'late_grace_minutes', 'no_show_note', 'refund_note', 'travel_note',
        'booking_instructions', 'fees_and_deposits',
      ],
      properties: {
        cancel_notice_hours: nullableInteger,
        cancellation_note: { type: 'string' },
        reschedule_notice_hours: nullableInteger,
        max_reschedules: nullableInteger,
        reschedule_note: { type: 'string' },
        late_grace_minutes: nullableInteger,
        no_show_note: { type: 'string' },
        refund_note: { type: 'string' },
        travel_note: { type: 'string' },
        booking_instructions: { type: 'array', items: { type: 'string' } },
        fees_and_deposits: { type: 'array', items: { type: 'string' } },
      },
    },
    unclear: { type: 'string' },
  },
};

interface RawOutput {
  business: {
    name: string; about: string; location: string; opening_hours: string; primary_type: string;
    phone: string; email: string; instagram: string; tiktok: string; website: string;
  };
  services: Array<{
    category: string; name: string; price: number | null; price_is_from: boolean;
    duration_minutes: number | null; description: string;
  }>;
  add_ons: Array<{
    name: string; price: number | null; extra_minutes: number | null; description: string; categories: string[];
  }>;
  policies: {
    cancel_notice_hours: number | null; cancellation_note: string; reschedule_notice_hours: number | null;
    max_reschedules: number | null; reschedule_note: string; late_grace_minutes: number | null;
    no_show_note: string; refund_note: string; travel_note: string;
    booking_instructions: string[]; fees_and_deposits: string[];
  };
  unclear: string;
}

const INSTRUCTIONS = `You are reading a UK beauty or wellness business's own material (a price list, a menu, a booking page, a policy sheet) so it can be set up on CERVICED, a booking app. Copy what it says. Never invent or estimate anything that isn't shown.

- business: the business's own details. primary_type is the main kind of service. Only include contact details that clearly belong to this business. opening_hours is their hours as written, or "".
- services: every bookable service, with its menu heading as category (e.g. "Gel Nails", "Knotless Braids"). price is in pounds as a plain number; if it says "from £40", price is 40 and price_is_from is true; if no price is shown, null. duration_minutes is the length in minutes if shown, otherwise null. Keep the business's own service names and descriptions.
- add_ons: extras added on top of a service (e.g. "French tips +£5", "Extra length +£20, +30 mins"), not standalone services. categories lists which service categories (as you named them in services) it is offered on, or [] if it's offered on everything.
- policies: notice periods in hours (e.g. "48 hours' notice" = 48, "1 week" = 168); max_reschedules is a number if a limit is stated; late_grace_minutes is how late a client may be before the appointment is cancelled or counts as a no-show. The notes are the business's own policy wording, lightly tidied. booking_instructions are things a client is asked to do (e.g. "Come with hair washed and detangled"). travel_note is for mobile businesses' travel charges or areas. fees_and_deposits lists EVERY fee or deposit mentioned (late fee, no-show fee, cancellation charge, deposit amount and rules), each as one short line in the business's wording.
- unclear: anything you could not read with certainty (a blurred price, a cut-off line, a page that wasn't a price list), or "".
If the material isn't from a beauty or wellness business at all, return empty strings, empty lists and nulls.`;

/** Turns 90 into "1 hr 30 mins", the shape the app and scrape job parse. */
function formatDuration(minutes: number | null): string | undefined {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins} mins`;
  const hourText = `${hours} hr${hours === 1 ? '' : 's'}`;
  return mins ? `${hourText} ${mins} mins` : hourText;
}

function toProfile(raw: RawOutput): ExtractedProviderProfile {
  const categories: Record<string, ExtractedService[]> = {};
  for (const svc of raw.services) {
    const name = svc.name.trim();
    if (!name) continue;
    const category = svc.category.trim() || 'Services';
    const fromNote = svc.price_is_from && svc.price !== null ? `From £${svc.price}.` : '';
    (categories[category] ??= []).push({
      name,
      price: svc.price ?? 0,
      duration: formatDuration(svc.duration_minutes),
      description: [fromNote, svc.description.trim()].filter(Boolean).join(' '),
    });
  }
  const b = raw.business;
  const p = raw.policies;
  return {
    providerName: b.name.trim(),
    location: b.location.trim(),
    aboutText: b.about.trim(),
    slotsText: b.opening_hours.trim(),
    serviceCategory: (PRIMARY_TYPES as readonly string[]).includes(b.primary_type) ? b.primary_type : 'OTHER',
    phone: b.phone.trim(),
    email: b.email.trim(),
    instagram: b.instagram.trim(),
    tiktok: b.tiktok.trim(),
    website: b.website.trim(),
    categories,
    addOns: raw.add_ons
      .filter(a => a.name.trim())
      .map(a => ({
        name: a.name.trim(),
        price: a.price,
        extraMinutes: a.extra_minutes,
        description: a.description.trim(),
        categories: a.categories.map(c => c.trim()).filter(Boolean),
      })),
    policies: {
      cancelNoticeHours: p.cancel_notice_hours,
      cancellationNote: p.cancellation_note.trim(),
      rescheduleNoticeHours: p.reschedule_notice_hours,
      maxReschedules: p.max_reschedules,
      rescheduleNote: p.reschedule_note.trim(),
      lateGraceMinutes: p.late_grace_minutes,
      noShowNote: p.no_show_note.trim(),
      refundNote: p.refund_note.trim(),
      travelNote: p.travel_note.trim(),
      bookingInstructions: p.booking_instructions.map(s => s.trim()).filter(Boolean),
      feesAndDeposits: p.fees_and_deposits.map(s => s.trim()).filter(Boolean),
    },
    unclear: raw.unclear.trim(),
  };
}

type SourceBlock = Anthropic.Beta.BetaContentBlockParam;

async function readWithClaude(source: SourceBlock[], extraNote = ''): Promise<ExtractedProviderProfile> {
  if (!ANTHROPIC_API_KEY) {
    throw new ExtractionError('Reading price lists isn\'t switched on yet (no ANTHROPIC_API_KEY on the server).', 503);
  }

  const message = await anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Copying a menu needs care more than reasoning, and a big menu at higher
    // effort risks the edge function's time limit.
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    system: INSTRUCTIONS,
    messages: [{
      role: 'user',
      content: [...source, { type: 'text', text: `Read everything above.${extraNote}` }],
    }],
  } as unknown as Anthropic.Beta.MessageCreateParamsStreaming).finalMessage();

  if (message.stop_reason === 'refusal') throw new ExtractionError('That couldn\'t be read. Try a different photo or link.', 422);
  if (message.stop_reason === 'max_tokens') throw new ExtractionError('That menu is too long to read in one go. Try fewer pages at a time.', 422);

  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
  try {
    return toProfile(JSON.parse(text) as RawOutput);
  } catch (error) {
    console.error('[extractProviderProfile] could not parse the model output:', error, text.slice(0, 500));
    throw new ExtractionError('Something went wrong reading that. Please try again.', 502);
  }
}

// ── Links ───────────────────────────────────────────────────────────────────

// Best-effort: only blocks on an explicit Disallow covering the path for our
// user-agent or "*". Fails open if robots.txt is missing/unreachable.
export async function isAllowedByRobots(targetUrl: URL): Promise<boolean> {
  try {
    const robotsUrl = `${targetUrl.protocol}//${targetUrl.host}/robots.txt`;
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': 'CervicedBot/1.0' } });
    if (!res.ok) return true;
    const text = await res.text();

    let appliesToUs = false;
    const disallowRules: string[] = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.split('#')[0]!.trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey!.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') {
        appliesToUs = value === '*' || value.toLowerCase() === 'cervicedbot';
      } else if (key === 'disallow' && appliesToUs && value) {
        disallowRules.push(value);
      }
    }
    return !disallowRules.some((rule) => targetUrl.pathname.startsWith(rule));
  } catch {
    return true;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&pound;/g, '£')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const LINKED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type LinkedImageType = typeof LINKED_IMAGE_TYPES[number];

/** Throws on any failure (blocked by robots.txt, unreachable page, nothing to
 *  read, bad AI response). The batch pipeline treats a throw as "this source
 *  failed"; the Import box shows ExtractionError messages as they are. */
export async function extractProviderProfile(url: string): Promise<ExtractedProviderProfile> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    throw new ExtractionError('That doesn\'t look like a link. Paste the whole address, starting with https://');
  }
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
    throw new ExtractionError('Paste a web link starting with https://');
  }
  const host = targetUrl.hostname.toLowerCase();
  if (/(^|\.)(instagram\.com|tiktok\.com|facebook\.com)$/.test(host)) {
    throw new ExtractionError('Instagram, TikTok and Facebook don\'t let apps read their pages. Take screenshots of the price list and choose Photos instead.');
  }
  if (!(await isAllowedByRobots(targetUrl))) {
    throw new ExtractionError('That website asks apps not to read this page. Take screenshots and choose Photos instead.');
  }

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/pdf,image/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new ExtractionError(`That page didn't open (error ${response.status}). Check the link, or use screenshots instead.`);
  }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();

  if (contentType === 'application/pdf' || (LINKED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_LINKED_FILE_BYTES) {
      throw new ExtractionError('That file is over 20 MB. Try a smaller copy, or screenshots of the pages with prices.');
    }
    const data = toBase64(bytes);
    const block: SourceBlock = contentType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: contentType as LinkedImageType, data } };
    return readWithClaude([block]);
  }

  const pageText = htmlToText(await response.text());
  if (pageText.length < MIN_PAGE_CHARS) {
    throw new ExtractionError('That page only shows its prices inside a browser, so it can\'t be read from the link. Take screenshots and choose Photos instead.');
  }
  const cut = pageText.length > MAX_PAGE_CHARS;
  return readWithClaude(
    [{ type: 'text', text: `Web page ${targetUrl.href}:\n---\n${pageText.slice(0, MAX_PAGE_CHARS)}\n---` }],
    cut ? ' The page was longer than could be read; say in unclear that the end of the page was not read.' : '',
  );
}

/** Photos, screenshots and PDFs uploaded from the app. */
export async function extractProviderProfileFromFiles(files: UploadedFile[]): Promise<ExtractedProviderProfile> {
  const blocks: SourceBlock[] = files.flatMap((file, index): SourceBlock[] => [
    { type: 'text', text: `Upload ${index + 1} of ${files.length}:` },
    file.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } },
  ]);
  return readWithClaude(
    blocks,
    files.length > 1
      ? ' Several uploads may be slices of one long screenshot that overlap slightly; list each service once.'
      : '',
  );
}
