// src/services/acuityTransferService.ts
// Fetches a provider's Acuity Scheduling page and uses Claude AI to extract
// their services, pricing, and business info into ProviderRegistrationData.

import { ProviderRegistrationData } from './providerRegistrationService';

const ANTHROPIC_API_KEY = process.env['EXPO_PUBLIC_ANTHROPIC_API_KEY'];
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

async function fetchAcuityPageText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load that Acuity page (${response.status}). Double-check the link and try again.`
    );
  }

  const html = await response.text();

  // Strip scripts, styles and tags — leave readable text only
  const text = html
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
    .trim();

  // Limit to 8 000 chars so we stay within token limits
  return text.substring(0, 8000);
}

export async function transferFromAcuity(url: string): Promise<ProviderRegistrationData> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'Anthropic API key not set. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env.local file.'
    );
  }

  const pageText = await fetchAcuityPageText(url);

  const prompt = `You are extracting a beauty/wellness provider's business information from their Acuity Scheduling page.

Page content:
---
${pageText}
---

Extract ALL services listed and return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "providerName": "Business or provider name",
  "location": "City or area if visible, empty string if not",
  "aboutText": "Bio or business description if visible, empty string if not",
  "slotsText": "Availability text like 'Mon-Fri 9am-6pm' if visible, empty string if not",
  "serviceCategory": "ONE of: HAIR, NAILS, LASHES, BROWS, MUA, AESTHETICS, OTHER",
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
- Return ONLY the JSON object, nothing else`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI extraction failed: ${errText}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text ?? '';

  if (!content) throw new Error('No response from AI. Please try again.');

  let extracted: any;
  try {
    // Strip markdown code fences if Claude wraps the JSON
    const jsonStr = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    extracted = JSON.parse(jsonStr);
  } catch {
    throw new Error('Could not read the extracted data. Please try again.');
  }

  // Build categories in the shape InfoRegScreen expects
  const categories: ProviderRegistrationData['categories'] = {};
  let serviceId = 1;

  for (const [catName, services] of Object.entries(extracted.categories ?? {})) {
    categories[catName] = (services as any[]).map((svc: any) => ({
      id: serviceId++,
      name: svc.name || 'Unnamed Service',
      price: Number(svc.price) || 0,
      duration: svc.duration || '1 hr',
      description: svc.description || '',
      images: [],
      addOns: [],
      tags: [],
      techniqueTags: [],
      outcomeTags: [],
      occasionTags: [],
      trendNames: [],
      isPregnancySafe: false,
      patchTestRequired: false,
      minAge: null,
      contraindications: [],
      aftercareNotes: '',
      serviceType: '' as const,
    }));
  }

  return {
    providerName: extracted.providerName || '',
    providerService: extracted.serviceCategory || 'OTHER',
    customServiceType:
      extracted.serviceCategory === 'OTHER' ? (extracted.providerName || '') : '',
    location: extracted.location || '',
    aboutText: extracted.aboutText || '',
    slotsText: extracted.slotsText || '',
    gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    accentColor: '#7B1FA2',
    logo: null,
    categories,
    phone: '',
    email: '',
    instagram: '',
    website: '',
    yearsExperience: '',
    businessType: '',
    fullAddress: '',
    addressReleasePolicy: 'on_confirmation',
  };
}
