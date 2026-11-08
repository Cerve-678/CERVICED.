import type { ProviderRegistrationData } from '../services/providerRegistrationService';
import {
  fillProfileFromSignup,
  signupPricing,
  type SignupPrefill,
} from '../features/provider-registration/signupAnswers';

// Only the fields the mapper reads; the rest of the form is untouched.
const blankProfile = {
  providerName: '', phone: '', email: '', instagram: '', website: '', tiktok: '',
  externalBookingUrl: '', businessType: '', teamSize: '', yearsExperience: '',
  location: '', accessibilityNotes: '', languagesSpoken: [], priceBands: [],
  priceRange: '', preferredContactMethods: [], serviceLocations: [],
  preferredPaymentMethods: [],
} as unknown as ProviderRegistrationData;

const signup: SignupPrefill = {
  name: 'Ada Lovelace', phone: '07000000000',
  business_name: 'Ada Lashes', business_email: 'hello@ada.test', business_phone: null,
  business_type: 'home_based', instagram: 'adalashes', website: null, tiktok: null,
  location_text: 'Hackney, London', years_experience: 4, team_size: null,
  accessibility_notes: null, languages_spoken: ['English'],
  price_range: 'budget', price_bands: ['50_75', '75_100'],
  preferred_contact_methods: ['in_app', 'whatsapp'], preferred_payment_methods: ['card'],
  service_locations: ['London'], external_booking_url: null,
};

it('carries the price bands picked at sign-up onto the profile', () => {
  const filled = fillProfileFromSignup(blankProfile, signup);
  expect(filled.priceBands).toEqual(['50_75', '75_100']);
});

it('derives the tier from the bands, as Services & Pricing saves it, not from a stale staged tier', () => {
  // A stale 'budget' staged next to 50_75 must not reach providers.price_tier.
  expect(fillProfileFromSignup(blankProfile, signup).priceRange).toBe('mid');
});

it('keeps a tier-only answer from before price bands existed', () => {
  expect(signupPricing({ price_bands: [], price_range: 'premium' })).toEqual({ priceBands: [], priceRange: 'premium' });
  expect(signupPricing({ price_bands: null, price_range: 'bogus' })).toEqual({ priceBands: [], priceRange: '' });
});

it('drops band values the providers CHECK constraint would reject', () => {
  expect(signupPricing({ price_bands: ['25_50', 'cheap'], price_range: null }).priceBands).toEqual(['25_50']);
});

it('never overwrites pricing a claimed listing or the provider already has', () => {
  const priced = { ...blankProfile, priceBands: ['300_plus'], priceRange: 'luxury' } as ProviderRegistrationData;
  const filled = fillProfileFromSignup(priced, signup);
  expect(filled.priceBands).toEqual(['300_plus']);
  expect(filled.priceRange).toBe('luxury');
});

it('fills the rest of the sign-up answers into blanks only', () => {
  const listing = { ...blankProfile, providerName: 'Ada Lashes Studio', phone: '02000000000' } as ProviderRegistrationData;
  const filled = fillProfileFromSignup(listing, signup);
  expect(filled.providerName).toBe('Ada Lashes Studio');
  expect(filled.phone).toBe('02000000000');
  expect(filled.email).toBe('hello@ada.test');
  expect(filled.businessType).toBe('home_based');
  expect(filled.yearsExperience).toBe('4');
  expect(filled.location).toBe('Hackney, London');
  expect(filled.serviceLocations).toEqual(['London']);
  expect(filled.preferredPaymentMethods).toEqual(['card']);
  expect(filled.preferredContactMethods).toEqual(['in_app', 'whatsapp']);
});

it('leaves team size blank when sign-up never asked it, and carries an older staged one', () => {
  expect(fillProfileFromSignup(blankProfile, signup).teamSize).toBe('');
  expect(fillProfileFromSignup(blankProfile, { ...signup, team_size: 'solo' }).teamSize).toBe('solo');
});
