// supabase/functions/_shared/extractProviderProfile.ts
// Core fetch + Claude extraction logic, shared by the single-URL
// extract-provider-profile function and the batch run-scrape-job pipeline —
// kept in one place so both call the same robots.txt / parsing / prompt
// behaviour instead of drifting apart.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

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
  categories?: Record<string, Array<{ name?: string; price?: number | string; duration?: string; description?: string }>>;
}

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

async function fetchPageText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw new Error(`Could not load that page (${response.status}).`);
  }
  const html = await response.text();

  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 8000);
}

function buildPrompt(pageText: string): string {
  return `You are extracting a beauty/wellness provider's business information from their public web page.

Page content:
---
${pageText}
---

Extract everything visible and return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "providerName": "Business or provider name",
  "location": "City or area if visible, empty string if not",
  "aboutText": "Bio or business description if visible, empty string if not",
  "slotsText": "Availability text like 'Mon-Fri 9am-6pm' if visible, empty string if not",
  "serviceCategory": "ONE of: HAIR, NAILS, LASHES, BROWS, MUA, AESTHETICS, OTHER",
  "phone": "Phone number if visible, empty string if not",
  "email": "Email address if visible, empty string if not",
  "instagram": "Instagram handle or URL if visible, empty string if not",
  "website": "Website URL if visible, empty string if not",
  "categories": {
    "Category Name": [
      {
        "name": "Service name",
        "price": 50,
        "duration": "1 hr",
        "description": "Service description if any, empty string if not"
      }
    ]
  }
}

Rules:
- price must be a plain number (no £ or $ symbols)
- duration must be a string like "30 mins", "1 hr", "1 hr 30 mins"
- Group services into their natural categories (e.g. "Gel Nails", "Acrylics", "Pedicure")
- serviceCategory reflects the primary service type offered
- Only include phone/email/instagram/website if they clearly belong to this business, not a third party
- If this page is not a beauty/wellness provider at all, return every field empty/blank instead of guessing
- Return ONLY the JSON object, nothing else`;
}

/** Throws on any failure (blocked by robots.txt, unreachable page, bad AI
 *  response) — callers (single-URL and batch) both treat a throw as "this
 *  one source failed," which is the right behaviour in both contexts. */
export async function extractProviderProfile(url: string): Promise<ExtractedProviderProfile> {
  const targetUrl = new URL(url);
  if (!(await isAllowedByRobots(targetUrl))) {
    throw new Error("This site's robots.txt disallows fetching this page.");
  }

  const pageText = await fetchPageText(url);

  const claudeRes = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(pageText) }],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    throw new Error(`AI extraction failed: ${errText}`);
  }

  const result = await claudeRes.json();
  const content = result.content?.[0]?.text ?? '';
  if (!content) throw new Error('No response from AI.');

  const jsonStr = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(jsonStr) as ExtractedProviderProfile;
  } catch {
    throw new Error('Could not read the extracted data.');
  }
}
