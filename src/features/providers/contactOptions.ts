import type { Ionicons } from '@expo/vector-icons';

import { normalizeExternalBookingUrl } from './externalBookingLink';
import type { ProviderProfileData } from './profileTypes';

export interface ProviderContactOption {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  url: string;
}

/**
 * The ways a provider can be reached that they publish on their page, in the
 * order the Contact card lists them. Shared by the app's own-profile sheet and
 * the website's Get In Touch, so both offer the same methods.
 *
 * PUBLIC contact, deliberately NOT gated on preferred_contact_methods. There
 * are two audiences with two different sources of truth:
 *   • the profile / Get In Touch — general enquiries from anyone browsing,
 *     driven by the contact details set in Business Profile → InfoReg step 03
 *     ("What clients see on your public profile"). Filling a field in there
 *     is what publishes it.
 *   • Booking Details → Contact — clients who already hold a confirmed
 *     appointment, driven by the Contact Preferences toggles
 *     (providers.preferred_contact_methods) and the booked-client details
 *     beside them (get_booked_client_contact, see ProviderCommunicationsScreen).
 * Those toggles used to gate this card too, which collapsed both audiences
 * onto one setting and contradicted what both screens' own copy promised.
 */
export function providerContactOptions(
  provider: Pick<ProviderProfileData, 'phone' | 'whatsapp' | 'email' | 'instagram' | 'website' | 'tiktok'>,
): ProviderContactOption[] {
  const options: ProviderContactOption[] = [];
  if (provider.phone) {
    options.push({
      key: 'phone',
      icon: 'chatbubble-outline',
      label: 'Text message',
      detail: provider.phone,
      url: `sms:${provider.phone.replace(/\s/g, '')}`,
    });
  }
  if (provider.whatsapp) {
    options.push({
      key: 'whatsapp',
      icon: 'logo-whatsapp',
      label: 'WhatsApp',
      detail: provider.whatsapp,
      url: `https://wa.me/${provider.whatsapp.replace(/[^0-9+]/g, '')}`,
    });
  }
  if (provider.email) {
    options.push({
      key: 'email',
      icon: 'mail-outline',
      label: 'Email',
      detail: provider.email,
      url: `mailto:${provider.email}`,
    });
  }
  if (provider.instagram) {
    options.push({
      key: 'instagram',
      icon: 'logo-instagram',
      label: 'Instagram',
      detail: `@${provider.instagram}`,
      url: `https://instagram.com/${provider.instagram}`,
    });
  }
  // Providers type their website themselves, often without https://; a
  // link that can't be a web page isn't offered.
  const website = normalizeExternalBookingUrl(provider.website);
  if (website) {
    options.push({
      key: 'website',
      icon: 'globe-outline',
      label: 'Website',
      detail: provider.website.trim(),
      url: website,
    });
  }
  if (provider.tiktok) {
    options.push({
      key: 'tiktok',
      icon: 'logo-tiktok',
      label: 'TikTok',
      detail: `@${provider.tiktok}`,
      url: `https://tiktok.com/@${provider.tiktok}`,
    });
  }
  return options;
}
