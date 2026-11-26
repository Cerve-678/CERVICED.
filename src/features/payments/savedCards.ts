import { tr } from '../../i18n';


/**
 * A client's saved card as the Payment Methods screen shows it. Read live from
 * Stripe by the client-saved-cards function — CERVICED stores none of it.
 */
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** 'apple_pay' / 'google_pay' when the card came from a wallet, else null. */
  wallet: string | null;
}

export type SavedCardExpiry = 'ok' | 'soon' | 'expired';

const BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

const BRAND_BADGES: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
};

export function savedCardBrandName(brand: string): string {
  return BRAND_NAMES[brand] ?? 'Card';
}

export function savedCardBadge(brand: string): string {
  return BRAND_BADGES[brand] ?? 'CARD';
}

/** "08/28" */
export function formatSavedCardExpiry(card: Pick<SavedCard, 'expMonth' | 'expYear'>): string {
  return `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear % 100).padStart(2, '0')}`;
}

/**
 * A card is valid through the last day of its expiry month. "soon" means it
 * runs out this month or next, while there's still time to replace it.
 */
export function savedCardExpiryState(
  card: Pick<SavedCard, 'expMonth' | 'expYear'>,
  now: Date = new Date(),
): SavedCardExpiry {
  const monthsLeft = (card.expYear - now.getFullYear()) * 12 + (card.expMonth - (now.getMonth() + 1));
  if (monthsLeft < 0) return 'expired';
  if (monthsLeft <= 1) return 'soon';
  return 'ok';
}

export function savedCardExpiryLabel(
  card: Pick<SavedCard, 'expMonth' | 'expYear'>,
  now: Date = new Date(),
): string {
  const state = savedCardExpiryState(card, now);
  if (state === 'expired') return tr('cart.card.expired', { date: formatSavedCardExpiry(card) });
  if (state === 'soon') {
    const thisMonth = card.expYear === now.getFullYear() && card.expMonth === now.getMonth() + 1;
    return thisMonth ? tr('cart.card.expiresThisMonth') : tr('cart.card.expiresNextMonth');
  }
  return tr('cart.card.expires', { date: formatSavedCardExpiry(card) });
}
