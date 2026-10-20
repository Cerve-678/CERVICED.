// French UI catalog: the per-area files spread together. See
// ../en/index.ts for the conventions. Machine-quality translations of
// app-authored copy; held keys (legal/health) are intentionally absent.
import type { Catalog } from '../../types';
import { common } from './common';
import { settings } from './settings';
import { beauty } from './beauty';
import { discover } from './discover';
import { clientBooking } from './clientBooking';
import { cart } from './cart';
import { clientAccount } from './clientAccount';
import { providerSetup } from './providerSetup';
import { providerProfile } from './providerProfile';
import { providerBookings } from './providerBookings';
import { providerBusiness } from './providerBusiness';
import { shared } from './shared';

export const fr_AREAS = {
  common,
  settings,
  beauty,
  discover,
  clientBooking,
  cart,
  clientAccount,
  providerSetup,
  providerProfile,
  providerBookings,
  providerBusiness,
  shared,
};

export const fr: Catalog = {
  ...common,
  ...settings,
  ...beauty,
  ...discover,
  ...clientBooking,
  ...cart,
  ...clientAccount,
  ...providerSetup,
  ...providerProfile,
  ...providerBookings,
  ...providerBusiness,
  ...shared,
};
