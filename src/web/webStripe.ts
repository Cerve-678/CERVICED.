/**
 * Stripe.js for the website, loaded once and only when a checkout reaches the
 * payment step. Card details are typed into Stripe's own form (an iframe from
 * js.stripe.com), so they never pass through this page's code.
 *
 * The publishable key is the app's own (eas.json production, copied in by
 * scripts/build-site.mjs), so the website and the app are always in the same
 * Stripe mode as the server; createCheckoutPaymentIntent refuses a mismatch.
 */
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getWebStripe(): Promise<Stripe | null> {
  const key = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
  if (!key) return Promise.reject(new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set'));
  stripePromise ??= loadStripe(key);
  return stripePromise;
}
