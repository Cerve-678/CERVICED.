import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  StatusBar,
  FlatList,
  Dimensions,
  useWindowDimensions,
  Alert,
  TextInput,
  Modal,
  Platform,
  Keyboard,
  ActivityIndicator,
  Switch,
  Animated,
  PanResponder,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import ReAnimated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StackScreenProps } from '@react-navigation/stack';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
// Icon imports
import { BellIcon } from '../../components/IconLibrary';
import CategoryTabPill from '../../components/CategoryTabPill';
import AddressPicker from '../../components/AddressPicker';
import TermsScreen from '../shared/TermsScreen';
import { Ionicons } from '@expo/vector-icons';

// Theme imports — this screen always renders in light mode (see
// useScreenStyles/useChrome below, and makeStyles/lightStyles further down),
// so useTheme() is never called here. darkTheme stays imported because
// makeStyles(isDark) still takes the flag generically; it's just never
// invoked with `true` in this file anymore.
import { lightTheme, darkTheme } from '../../constants/theme';
import { HAIR_TYPES } from '../../constants/hairTypes';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';

// Auth
import { useAuth } from '../../contexts/AuthContext';

// Supabase registration service
import { saveProviderToSupabase, loadProviderFromSupabase, saveProviderPolicies, loadProviderPolicies, uploadToStorage } from '../../services/providerRegistrationService';
import type { ProviderRegistrationData, ServiceImageDraft } from '../../services/providerRegistrationService';
import { transferFromAcuity } from '../../services/acuityTransferService';
import { getPendingClaim, claimProviderProfile, clearPendingClaim } from '../../services/providerClaimService';
import { getProviderPortfolio, addPortfolioItem, deletePortfolioItem, getProviderIdForUserId, getUserSignupPrefillInfo, getUserBusinessInfo, removePortfolioStorageObject, hasMyProviderTermsForm } from '../../services/databaseService';
import { splitPortfolioByKind, VENUE_PORTFOLIO_CATEGORY } from '../../features/providers/venuePhotos';
import type { DbPortfolioItem } from '../../types/database';

import {
  resolveProviderTheme,
  withAlpha,
  isDarkColor,
  blend,
} from '../../constants/providerThemes';

// Navigation types
import { ProfileStackParamList } from '../../navigation/types';
import { logger } from '../../utils/logger';
import { ordinalSuffix, formatLongDate } from '../../utils/dateUtils';
import { ReleaseDayPicker } from '../../features/provider-registration/ReleaseDayPicker';
import { ServiceImageCarousel } from '../../features/provider-registration/ServiceImageCarousel';
import { ServiceImageCropper } from '../../features/provider-registration/ServiceImageCropper';
import { useVerticalDragReorder } from '../../features/provider-registration/useVerticalDragReorder';
import { DurationPicker } from '../../features/provider-registration/DurationPicker';
import { BufferPicker, bufferOptionLabel } from '../../features/provider-registration/BufferPicker';
import { SERVICE_BUFFER_BEFORE_OPTS, SERVICE_BUFFER_AFTER_OPTS } from '../../features/business-details/options';
import { BOTTOM_SAFE_GAP } from '../../utils/bottomSafeGap';
import { ChipSelect } from '../../features/provider-registration/ChipSelect';
import AreaPicker from '../../components/AreaPicker';
import { RequiredLabel } from '../../features/provider-registration/RequiredLabel';
import { createServiceDraft } from '../../features/provider-registration/serviceDraft';
import { toUserMessage } from '../../utils/userFacingError';

import {
  ADDRESS_RELEASE_OPTS,
  BUSINESS_TYPE_OPTS,
  businessTypeLabel,
  isAddressReleaseAllowed,
  reconcileAddressReleasePolicy,
  type AddressReleasePolicy,
  type BusinessType,
} from '../../features/business-details/options';

type InfoRegScreenProps = StackScreenProps<ProfileStackParamList, 'ProfileMain'>;




/**
 * Tap feedback. This screen is the longest form in the app and had haptics on
 * only 8 of its ~50 controls, so a chip tap felt dead while the section "Next"
 * button beside it didn't — inconsistent feedback reads as an unresponsive
 * control, not as restraint. One helper per intent, so each control's feedback
 * is a decision rather than whatever the nearest line happened to use:
 *   tapSelect — picking or toggling something (chips, pills, tabs, suggestions)
 *   tapLight  — navigational chrome (close, cancel, back, skip)
 *   tapMedium — a committing action (save, submit, add, publish)
 *   tapWarn   — removing something
 * All .catch()ed: haptics reject on simulators and unsupported hardware, and a
 * failed buzz must never take the form action down with it.
 */
const tapSelect = () => { Haptics.selectionAsync().catch(() => {}); };
const tapLight  = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
const tapMedium = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
const tapWarn   = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); };

// Hero → content transition, copied from ProviderProfileScreen: the logo/name/
// rating/slots float directly over the hero photo/gradient, then the content
// sheet rises over it with a rounded lip. Keep this in sync with that screen.
const PREVIEW_SHEET_LIP_RADIUS = 36;

// Service categories (removed BARBER and SKINCARE)
const SERVICE_CATEGORIES = [
  'HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'
];

// businessTypeLabel() from the canonical table replaces what used to be a
// fourth copy of these four strings in this file.

/** The editor is one continuous document, not a hub-and-editor split and not a
 *  wizard: all five sections render sequentially in a single scroll, separated
 *  by oversized numerals and typographic breaks rather than bordered cards.
 *  This list is the scrollspy rail's data source — the rail indicates reading
 *  position ONLY. It is deliberately not a stepper and not a navigation gate:
 *  there is no prescribed order, no Next/Finish, and nothing here can prevent
 *  a provider from reaching any part of the form. Scrolling is the progression.
 *  The old "review" step isn't in this list because the document *is* the
 *  review — required-field warnings surface inline at the offending field plus
 *  as a summary next to Publish. */
const EDITOR_SECTIONS = [
  { key: 'identity' as const, num: '01', title: 'Identity',          sub: 'Business identity · how clients first find you' },
  { key: 'about' as const,    num: '02', title: 'About & Portfolio', sub: 'Your introduction and the work clients see' },
  { key: 'contact' as const,  num: '03', title: 'Contact',           sub: 'Public details — anyone browsing can use these' },
  { key: 'services' as const, num: '04', title: 'Services',          sub: 'What you offer, and what it costs' },
  { key: 'policies' as const, num: '05', title: 'Address Confirmation', sub: 'Business setup, address release' },
];

type EditorSectionKey = (typeof EDITOR_SECTIONS)[number]['key'];

/** The section the scrollspy falls back to before/above any measurement — the
 *  top of the document. Named rather than read as EDITOR_SECTIONS[0] so it's
 *  statically known to exist under noUncheckedIndexedAccess. */
const FIRST_EDITOR_SECTION: EditorSectionKey = 'identity';

/** The app's semantic warn colour — same amber used for pending/attention
 *  states elsewhere (e.g. ProviderBookingDetailScreen's STATUS_COLORS).
 *  Deliberately NOT the provider's accent: an accent-coloured warning would
 *  read as branding on some profiles and as an error on others. */
const REVIEW_WARN_COLOR = '#FF9500';

// Provider data interface for registration
// ProviderRegistrationData now comes from providerRegistrationService — kept
// as a single source of truth so fields (like profileTheme) never drift out
// of sync between the two.

// ─── Policy types ────────────────────────────────────────────────────────────
type CancelNotice     = 'none' | '24h' | '48h' | '72h';
type CancelPenalty    = 'none' | 'deposit' | 'full';
type RescheduleNotice = 'same_day' | '24h' | '48h' | '72h';
type MaxReschedules   = '1' | '2' | 'unlimited';
type NoShowAction     = 'none' | 'warn' | 'charge_deposit' | 'charge_full';
type WaitlistSelectionMethod = 'fifo' | 'manual';

interface ProviderPolicies {
  cancelNotice:     CancelNotice;
  cancelPenalty:    CancelPenalty;
  cancelNote:       string;
  rescheduleNotice: RescheduleNotice;
  maxReschedules:   MaxReschedules;
  rescheduleNote:   string;
  noShowAction:     NoShowAction;
  noShowNote:       string;
  /** Free-text disclosure only — the provider describes their refund policy
   *  in their own words. Deliberately NOT a percentage/amount field: this
   *  app has no refund-processing infra and never calculates or enforces a
   *  refund automatically (see CLAUDE.md's payment liability-boundary
   *  rules), so a numeric field here would misleadingly imply automated
   *  enforcement that doesn't exist. Same free-text-only pattern as
   *  cancelNote/depositNote/noShowNote above. */
  refundPolicyNote: string;
  /** Minutes past the booked start time before "No Show" can be marked
   *  (server-enforced in provider_update_booking_status()). '0' = no grace,
   *  matches the app's historical instant-eligible behavior. String field
   *  like the other numeric policy inputs (e.g. depositAmount) — parsed at
   *  the read site. */
  noShowGraceMinutes: string;
  /** Optional instructions stamped onto every new booking (e.g. "please
   *  arrive 10 minutes early") — shown to clients in their booking details */
  bookingInstructions: string;
  /** Optional photo of a fuller policy document (e.g. a house-rules sheet,
   *  a scanned consent form) — shown to clients via a pop-up on their
   *  profile view, on top of the structured fields above. */
  policyImageUrl: string;
  /** Waitlist candidate-selection strategy for invite_next_waitlist_entry().
   *  'manual' is a reserved value for a future feature — the RPC still runs
   *  plain FIFO for it today (see fix_waitlist_selection_method_hook.sql).
   *  No UI control yet: InfoRegScreen has no existing waitlist-settings
   *  section (waitlistEnabled/autoAcceptWaitlist live in a different JSONB
   *  column, automation_settings, edited on ProviderAutomationsScreen) — this
   *  field exists so the schema isn't a dead end for a later manual-
   *  selection UI, not because it's editable here today. */
  waitlistSelectionMethod: WaitlistSelectionMethod;
}

const DEFAULT_POLICIES: ProviderPolicies = {
  cancelNotice:     '24h',
  cancelPenalty:    'none',
  cancelNote:       '',
  rescheduleNotice: '24h',
  maxReschedules:   '1',
  rescheduleNote:   '',
  noShowAction:     'none',
  noShowNote:       '',
  refundPolicyNote: '',
  noShowGraceMinutes: '0',
  bookingInstructions: '',
  policyImageUrl:   '',
  waitlistSelectionMethod: 'fifo',
};

// Add-on interface
interface AddOnData {
  id: number;
  // The real service_add_ons.id, when this add-on already exists in the DB —
  // null for one created in this editing session. Threaded through to the
  // save payload so replace_provider_services can update the row in place
  // instead of deleting and recreating it under a new id, which used to
  // silently break any cart or booking that had selected this exact add-on
  // (service_add_ons.id has no stable identity across a save otherwise).
  dbId: string | null;
  name: string;
  price: number;
}

interface ServiceData {
  id: number;
  // The real services.id, when this service already exists in the DB — null
  // for one created in this editing session. See AddOnData.dbId for why: a
  // provider re-saving ANY service used to regenerate every service's id,
  // which orphaned every client cart item and booking pointing at the old
  // one (bookings.service_id is ON DELETE SET NULL — 96% of live bookings
  // had already lost this link before this field existed).
  dbId: string | null;
  name: string;
  price: number;
  duration: string;
  // Blank = no override. before defaults to 0; after inherits the provider's global buffer.
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: ServiceImageDraft[];
  addOns: AddOnData[];
  // Discoverability tags
  tags: string[];
  techniqueTags: string[];
  outcomeTags: string[];
  occasionTags: string[];
  trendNames: string[];
  // Safety
  isPregnancySafe: boolean;
  patchTestRequired: boolean;
  minAge: number | null;
  contraindications: string[];
  aftercareNotes: string;
  serviceType: 'treatment' | 'enhancement' | 'maintenance' | 'restorative' | 'consultation' | '';
  // Hair types this service suits (HAIR_TYPES vocabulary). Empty = suits all.
  hairTypesSuitable: string[];
  // Who this specific service is for. '' = not stated, read as "everyone" —
  // mirrors the live services_audience_check constraint.
  audience: 'women' | 'men' | 'kids' | 'everyone' | '';
}

// ─── Category kinds ──────────────────────────────────────────────────────────
// Every category a provider adds is tied to one of these "kinds". The kind is
// what drives the smart suggestions below (templates, tags, trend names), so a
// category named "Braids" or "Injectables" still gets HAIR / AESTHETICS help.
type CategoryKind = 'HAIR' | 'NAILS' | 'LASHES' | 'BROWS' | 'MUA' | 'AESTHETICS' | 'OTHER';

// Categories where a patch test is standard professional practice before the
// treatment itself (chemical colour/lightener, lash/brow tint and adhesive,
// chemical peels and similar) — defaulted on for a brand-new service so the
// provider has to actively opt out rather than remember to opt in. NAILS and
// MUA aren't defaulted on: patch testing isn't standard practice for most
// services in those categories. This only affects the default shown when
// adding a new service — never overrides a value the provider already set.
const PATCH_TEST_DEFAULT_CATEGORIES: ReadonlySet<CategoryKind> = new Set(['HAIR', 'LASHES', 'BROWS', 'AESTHETICS']);


const CATEGORY_KINDS: CategoryKind[] = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];

// icon = an Ionicons glyph name (no emoji — rendered via <Ionicons name={...} />)
// blurb = short label shown on the picker card itself; description = the
// fuller, client-facing text pre-filled into the category's description box
// when this kind is chosen (still editable before saving).
const CATEGORY_META: Record<CategoryKind, { icon: string; label: string; blurb: string; description: string }> = {
  HAIR:       { icon: 'cut-outline',            label: 'Hair',       blurb: 'Cuts, colour, braids, extensions', description: 'Cuts, colour, treatments and styling — from a fresh trim to a full colour transformation, tailored to your hair type and the look you\'re after.' },
  NAILS:      { icon: 'color-palette-outline',  label: 'Nails',      blurb: 'Gel, acrylic, BIAB, nail art', description: 'Manicures, pedicures and nail enhancements — gel, acrylic, BIAB and nail art, finished to last and look salon-fresh for weeks.' },
  LASHES:     { icon: 'eye-outline',            label: 'Lashes',     blurb: 'Classic, volume, lifts', description: 'Lash extensions, lifts and tints — classic to volume sets, for fuller, longer-looking lashes without daily mascara.' },
  BROWS:      { icon: 'contrast-outline',       label: 'Brows',      blurb: 'Lamination, microblading, tint', description: 'Brow shaping, tinting and semi-permanent makeup — defined, symmetrical brows that frame your face and hold their shape.' },
  MUA:        { icon: 'brush-outline',          label: 'Makeup',     blurb: 'Glam, bridal, editorial', description: 'Makeup for every occasion — bridal, glam and editorial looks, camera-ready and built to last.' },
  AESTHETICS: { icon: 'sparkles-outline',       label: 'Aesthetics', blurb: 'Facials, peels, injectables', description: 'Skin and injectable treatments — facials, peels and anti-ageing treatments to refresh, firm and even out your skin.' },
  OTHER:      { icon: 'apps-outline',           label: 'Other',      blurb: 'Anything else you offer', description: '' },
};

// Subcategory suggestions shown when a provider adds a category — scoped to
// their OWN declared business type (providerData.providerService) instead of
// the generic Hair/Nails/etc list, so an aesthetics provider sees "Lip
// Fillers", "Botox", "Chemical Peels"… not "Hair", "Nails". Tapping one adds
// it directly as a named category (same as typing it manually).
interface SubcategorySuggestion {
  name: string;
  /** Pre-filled into the category's description box when tapped — still
   *  editable before saving. */
  description: string;
}
const SUBCATEGORY_SUGGESTIONS_BY_CATEGORY: Record<CategoryKind, SubcategorySuggestion[]> = {
  HAIR: [
    { name: 'Cuts & Styling',        description: 'Precision cuts and styling finished to suit your face shape and lifestyle.' },
    { name: 'Colour',                description: 'Full colour, root touch-ups and toning for vibrant, long-lasting results.' },
    { name: 'Balayage & Highlights', description: 'Hand-painted or foiled highlights for natural, sun-kissed dimension.' },
    { name: 'Braids & Locs',         description: 'Protective braiding and loc styles, neat at the root and built to last.' },
    { name: 'Extensions & Wigs',     description: 'Length and volume with extensions or a seamless, natural-looking wig install.' },
    { name: 'Treatments',            description: 'Deep conditioning and repair treatments to restore shine and strength.' },
    { name: 'Blow Dry Bar',          description: 'Wash and blow dry services for a salon-fresh finish, no cut required.' },
    { name: "Men's Hair",            description: "Cuts, fades and beard grooming tailored to men's hair and styles." },
  ],
  NAILS: [
    { name: 'Manicure',   description: 'Shape, cuticle care and polish for clean, healthy-looking hands.' },
    { name: 'Pedicure',   description: 'Soak, shape and polish for smooth, well-groomed feet.' },
    { name: 'Gel',        description: 'Chip-resistant gel polish that stays glossy for weeks.' },
    { name: 'Acrylic',    description: 'Durable acrylic extensions shaped and finished to your chosen length.' },
    { name: 'BIAB',       description: 'Builder gel overlay that strengthens natural nails while they grow.' },
    { name: 'Nail Art',   description: 'Hand-painted designs and embellishments to personalise your set.' },
    { name: 'Extensions', description: 'Added length and shape using gel, acrylic or tips.' },
  ],
  LASHES: [
    { name: 'Classic Lashes', description: 'One extension per natural lash for a subtle, everyday enhancement.' },
    { name: 'Hybrid Lashes',  description: 'A mix of classic and volume fans for texture with added fullness.' },
    { name: 'Volume Lashes',  description: 'Lightweight fans for a fuller, more dramatic lash look.' },
    { name: 'Lash Lifts',     description: 'Curls and lifts your natural lashes without extensions.' },
    { name: 'Lash Tinting',   description: 'Darkens natural lashes for definition with no extensions needed.' },
  ],
  BROWS: [
    { name: 'Brow Shaping',    description: 'Waxing or threading to define and clean up your natural brow shape.' },
    { name: 'Brow Tinting',    description: 'Semi-permanent tint to darken and define sparse or fair brows.' },
    { name: 'Brow Lamination', description: 'Brushed-up, fluffy brows that hold their shape for weeks.' },
    { name: 'Microblading',    description: 'Semi-permanent hair-stroke tattoo for naturally fuller-looking brows.' },
    { name: 'Ombré Brows',     description: 'Soft, powdered semi-permanent makeup for defined, filled-in brows.' },
    { name: 'Threading',       description: 'Precise thread shaping for clean, natural brow lines.' },
  ],
  MUA: [
    { name: 'Bridal Makeup',   description: 'Long-wear makeup designed to look flawless all day and in photos.' },
    { name: 'Special Occasion', description: 'Glam looks for parties, nights out and celebrations.' },
    { name: 'Editorial',       description: 'Bold, camera-ready looks for photography and creative shoots.' },
    { name: 'Makeup Lessons',  description: 'One-to-one lessons to learn techniques tailored to your face.' },
  ],
  AESTHETICS: [
    { name: 'Lip Fillers',        description: 'Subtle to fuller lip enhancement for natural-looking volume.' },
    { name: 'Anti-Wrinkle',       description: 'Targeted injections to soften fine lines and prevent new ones forming.' },
    { name: 'Dermal Fillers',     description: 'Contours and lifts the face for a naturally sculpted look.' },
    { name: 'Chemical Peels',     description: 'Resurfacing treatment to brighten tone and refine texture.' },
    { name: 'Microneedling',      description: 'Collagen-boosting treatment to improve texture and firmness.' },
    { name: 'Skin Boosters',      description: 'Hydrating micro-injections for deep, long-lasting skin quality.' },
    { name: 'HydraFacial',        description: 'Deep cleanse, exfoliation and hydration for an instant glow.' },
    { name: 'Dermaplaning',       description: 'Gentle exfoliation that removes peach fuzz for smoother skin.' },
    { name: 'Thread Lifts',       description: 'Dissolvable threads to lift and tighten skin without surgery.' },
    { name: 'Fat Dissolving',     description: 'Targeted injections to break down small pockets of stubborn fat.' },
    { name: 'LED Light Therapy',  description: 'Light-based treatment to calm skin, reduce acne or boost collagen.' },
    { name: 'Radiofrequency',     description: 'Heat energy treatment to firm and tighten loose skin.' },
    { name: 'Cryotherapy',        description: 'Cooling treatment to de-puff, tighten pores or reduce fat.' },
    { name: 'Lymphatic Drainage', description: 'Gentle massage technique to reduce puffiness and support circulation.' },
  ],
  OTHER: [],
};

// Placeholder example for the "name your own" category field — matches the
// provider's own business type instead of a fixed hair-specific example.
const CATEGORY_NAME_EXAMPLE_BY_CATEGORY: Record<CategoryKind, string> = {
  HAIR:       'e.g., Knotless Braids',
  NAILS:      'e.g., Ombré Nails',
  LASHES:     'e.g., Wet-Look Lashes',
  BROWS:      'e.g., Ombré Brows',
  MUA:        'e.g., Editorial Makeup',
  AESTHETICS: 'e.g., Lip Fillers',
  OTHER:      'e.g., Bridal Package',
};

// Keyword hints so free-text / imported category names still resolve to a kind.
const CATEGORY_KEYWORDS: Record<CategoryKind, string[]> = {
  HAIR:       ['hair', 'braid', 'loc', 'weave', 'wig', 'silk press', 'blow', 'cut', 'colour', 'color', 'balayage', 'extension', 'twist', 'cornrow'],
  NAILS:      ['nail', 'mani', 'pedi', 'acrylic', 'gel', 'biab', 'polish'],
  LASHES:     ['lash', 'extension set', 'lift'],
  BROWS:      ['brow', 'microblad', 'lamination', 'threading'],
  MUA:        ['makeup', 'make up', 'mua', 'glam', 'bridal face'],
  AESTHETICS: ['aesthetic', 'facial', 'skin', 'peel', 'filler', 'botox', 'injectable', 'needling', 'wax', 'laser', 'hifu', 'derma'],
  OTHER:      [],
};

/** Resolve a category name to a kind — exact match → keyword match → fallback. */
const inferCategoryKind = (name: string, fallback: string = 'OTHER'): CategoryKind => {
  const upper = (name || '').trim().toUpperCase();
  if ((CATEGORY_KINDS as string[]).includes(upper)) return upper as CategoryKind;
  const lower = (name || '').toLowerCase();
  for (const kind of CATEGORY_KINDS) {
    if (kind === 'OTHER') continue;
    if (CATEGORY_KEYWORDS[kind].some(kw => lower.includes(kw))) return kind;
  }
  const fb = (fallback || '').trim().toUpperCase();
  return (CATEGORY_KINDS as string[]).includes(fb) ? (fb as CategoryKind) : 'OTHER';
};

// ─── Tag presets per context ─────────────────────────────────────────────────

// "Style / Vibe" — a shared core plus a few flavours that fit each kind.
const STYLE_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['natural', 'glam', 'sleek', 'lived-in', 'boho', 'edgy', 'classic', 'bold', 'romantic', 'textured', 'polished', 'undone', 'vintage'],
  NAILS:      ['natural', 'glam', 'minimalist', 'y2k', 'baddie', 'soft-girl', 'editorial', 'bold', 'chrome', 'french-inspired', 'grunge', 'coquette', 'clean-girl'],
  LASHES:     ['natural', 'glam', 'wispy', 'doll', 'baddie', 'dramatic', 'classic', 'bold', 'fluffy', 'cat-eye', 'anime', 'soft-glam'],
  BROWS:      ['natural', 'fluffy', 'defined', 'soft-girl', 'bold', 'editorial', 'classic', 'feathered', 'sculpted', 'arched', 'minimal'],
  MUA:        ['natural', 'glam', 'editorial', 'soft-girl', 'clean-girl', 'bridal', 'bold', 'dewy', 'matte', 'sun-kissed', 'vintage-glam', 'monochrome'],
  AESTHETICS: ['natural', 'glow-up', 'subtle', 'preventative', 'rejuvenating', 'clinical', 'natural-enhancement', 'restorative', 'youthful', 'refined'],
  OTHER:      ['natural', 'glam', 'editorial', 'classic', 'minimalist', 'bold', 'modern', 'timeless'],
};

// "Best for (occasion)" — universal set, with a tailored list for aesthetics.
const OCCASION_TAGS_DEFAULT = ['bridal', 'everyday', 'date-night', 'prom', 'photoshoot', 'festival', 'birthday', 'event', 'party', 'graduation', 'holiday', 'girls-night', 'anniversary', 'vacation'];
const OCCASION_TAGS_BY_CATEGORY: Partial<Record<CategoryKind, string[]>> = {
  AESTHETICS: ['pre-wedding', 'event-prep', 'maintenance', 'glow-up', 'confidence-boost', 'anti-ageing', 'everyday', 'special-occasion', 'seasonal-refresh', 'first-treatment'],
};

const TECHNIQUE_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['balayage', 'highlights', 'ombre', 'keratin', 'relaxer', 'braids', 'locs', 'twists', 'extensions', 'colour', 'foilyage', 'colour-correction', 'perm', 'silk-press', 'weave', 'toner'],
  NAILS:      ['gel', 'acrylic', 'biab', 'nail-art', 'french', 'ombre', 'chrome', 'dip-powder', 'gel-x', 'polygel', 'encapsulated', 'hand-painted', '3d-art', 'cat-eye-gel'],
  LASHES:     ['classic', 'hybrid', 'volume', 'mega-volume', 'lash-lift', 'lash-tint', 'russian', 'wispy', 'mink', 'faux-mink', 'colored-lashes', 'bottom-lashes'],
  BROWS:      ['microblading', 'powder-brow', 'combo-brow', 'lamination', 'tinting', 'hd-brows', 'threading', 'waxing', 'nano-brows', 'brow-mapping', 'henna-brows', 'wax-and-thread'],
  MUA:        ['airbrush', 'full-glam', 'editorial', 'natural', 'bridal', 'sfx', 'cut-crease', 'dewy', 'contour-and-highlight', 'strobing', 'baking', 'graphic-liner'],
  AESTHETICS: ['microneedling', 'chemical-peel', 'dermaplaning', 'hifu', 'filler', 'botox', 'laser', 'hydrafacial', 'mesotherapy', 'prp', 'led-therapy', 'radiofrequency', 'cryotherapy', 'lymphatic-drainage'],
  OTHER:      [],
};

const OUTCOME_TAGS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['volume', 'length', 'shine', 'grey-coverage', 'protection', 'growth', 'smoothness', 'definition', 'texture', 'colour-vibrancy', 'repair', 'bounce'],
  NAILS:      ['length', 'art', 'colour', 'strength', 'natural-look', 'durability', 'shine', 'flexibility', 'precision'],
  LASHES:     ['volume', 'length', 'definition', 'lift', 'curl', 'dramatic', 'natural-look', 'symmetry', 'longevity'],
  BROWS:      ['definition', 'shape', 'fullness', 'natural', 'bold', 'arched', 'symmetry', 'longevity', 'precision'],
  MUA:        ['glow', 'coverage', 'definition', 'lifted', 'natural-look', 'dramatic', 'longevity', 'radiance', 'flawless-finish', 'camera-ready'],
  AESTHETICS: ['glow', 'firmness', 'smoothness', 'rejuvenation', 'definition', 'hydration', 'reduction', 'lifting', 'even-tone', 'collagen-boost', 'pore-refinement', 'radiance'],
  OTHER:      ['results', 'enhancement', 'maintenance', 'confidence', 'refresh'],
};

// Viral / trend names clients actually search for — now per kind so a lash artist
// never sees "soap-brows" and a nail tech never sees "butterfly-lashes".
const TREND_NAMES_BY_CATEGORY: Record<CategoryKind, string[]> = {
  HAIR:       ['butterfly-cut', 'money-piece', 'expensive-brunette', 'old-money', 'mob-wife', 'cherry-cola', 'copper', 'lived-in', 'curtain-bangs', 'jellyfish-cut', 'clean-girl-bun', 'wolf-cut', 'chocolate-cherry', 'buttery-blonde'],
  NAILS:      ['glazed-donut', 'blueberry-milk', 'cherry-cola', 'chrome', 'aura-nails', 'milky-white', 'strawberry-girl', 'velvet', 'lip-gloss', 'jelly-nails', 'cat-eye', 'french-tip-revival', 'mob-wife-nails'],
  LASHES:     ['butterfly-lashes', 'manga-lashes', 'anime-lashes', 'wet-look', 'fox-eye', 'natural-classic', 'kim-k', 'angel-lashes', 'clean-girl-lashes', 'doll-eye', 'colored-tips'],
  BROWS:      ['soap-brows', 'brow-lamination', 'fluffy-brows', 'fox-brows', 'feathered', 'snatched-arch', 'nano-brows', 'skinny-brow-revival', 'laminated-and-tinted'],
  MUA:        ['clean-girl', 'latte-makeup', 'strawberry-girl', 'sunburn-blush', 'cold-girl', 'douyin', 'siren-eyes', 'glazed', 'tomato-girl', 'mob-wife-glam', 'espresso-makeup'],
  AESTHETICS: ['glass-skin', 'baby-botox', 'russian-lips', 'lip-flip', 'skinboosters', 'glazed-donut-skin', 'snatched', 'fox-eye-lift', 'preventative-botox', 'liquid-facelift', 'tear-trough-filler'],
  OTHER:      ['clean-girl', 'old-money', 'that-girl', 'quiet-luxury', 'coastal-grandma', 'mob-wife'],
};

// Starter contraindications — common, well-established conditions
// practitioners routinely screen for, tailored to the kind of treatment the
// service belongs to (the same catKey used for style/technique/outcome tags
// above) rather than one generic aesthetics-flavoured list shown to every
// provider type. Capped at 6 per kind to keep the chip row scannable — tap to
// add instantly; providers can still type their own for anything
// treatment-specific.
// TODO: revisit with a proper pass on current per-treatment guidance — see the
// research prompt in the PR/commit notes for sourcing more specific ones.
const COMMON_CONTRAINDICATIONS_BY_CATEGORY: Record<CategoryKind, string[]> = {
  AESTHETICS: [
    'Pregnant or breastfeeding',
    'Blood thinning medication',
    'Autoimmune condition',
    'Keloid scarring history',
    'Allergy to local anaesthetic',
    'Uncontrolled diabetes',
  ],
  HAIR: [
    'Scalp psoriasis / eczema',
    'Recent chemical treatment',
    'Allergy to hair dye / PPD',
    'Open scalp sores or cuts',
    'Pregnant or breastfeeding',
    'Under 18 without guardian consent',
  ],
  NAILS: [
    'Nail fungus or infection',
    'Allergy to acrylic / gel products',
    'Broken skin around the nail',
    'Diabetes with poor circulation',
    'Recent nail surgery',
    'Under 18 without guardian consent',
  ],
  LASHES: [
    'Allergy to lash adhesive / latex',
    'Active eye infection',
    'Recent eye surgery',
    'Sensitive or watery eyes',
    'Pregnant or breastfeeding',
    'Under 18 without guardian consent',
  ],
  BROWS: [
    'Allergy to tint / henna',
    'Active skin infection in area',
    'Recent Botox in the brow area',
    'Keloid scarring history',
    'Pregnant or breastfeeding',
    'Under 18 without guardian consent',
  ],
  MUA: [
    'Active cold sore / skin infection',
    'Allergy to makeup products',
    'Active acne in treatment area',
    'Recent facial treatment / peel',
    'Sensitive skin / rosacea',
    'Under 18 without guardian consent',
  ],
  OTHER: [
    'Pregnant or breastfeeding',
    'Active skin infection in area',
    'Known allergy to products used',
    'Recent surgery in treatment area',
    'Uncontrolled diabetes',
    'Under 18 without guardian consent',
  ],
};

// Pre-built service starting points offered the moment a provider taps "Add
// Service" — pre-fills name + duration so most services are two taps to save.
interface ServiceTemplate {
  name: string;
  duration: string;
  serviceType?: ServiceData['serviceType'];
  description?: string;
  styleTags?: string[];
  techniqueTags?: string[];
  outcomeTags?: string[];
  occasionTags?: string[];
  trendNames?: string[];
  /** Always offered as a starting point, regardless of which specific
   *  subcategory is selected — e.g. a consultation. Not filtered out even
   *  when a subcategory's template list is otherwise narrowed. */
  generic?: boolean;
}
const SERVICE_TEMPLATES_BY_CATEGORY: Record<CategoryKind, ServiceTemplate[]> = {
  HAIR: [
    { name: 'Consultation',          duration: '20 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Cut & Blow Dry',        duration: '1 hr',      description: 'A fresh cut finished with a smooth, salon-quality blow dry.', styleTags: ['sleek'], techniqueTags: [], outcomeTags: ['shine', 'definition'] },
    { name: 'Blow Dry',              duration: '45 min',    description: 'Wash and blow dry for a bouncy, salon-fresh finish.', styleTags: ['sleek', 'glam'], outcomeTags: ['volume', 'shine'] },
    { name: 'Full Head Highlights',  duration: '3 hr',       description: 'Dimensional highlights all over for a lighter, sun-kissed look.', techniqueTags: ['highlights', 'colour'], outcomeTags: ['shine', 'definition'], trendNames: ['expensive-brunette', 'money-piece'] },
    { name: 'Balayage',              duration: '3 hr',       description: 'Hand-painted, low-maintenance colour that grows out beautifully.', techniqueTags: ['balayage', 'colour'], outcomeTags: ['shine', 'definition'], trendNames: ['lived-in', 'money-piece', 'expensive-brunette'] },
    { name: 'Root Tint',             duration: '1 hr 30',    description: 'Root touch-up to keep your colour looking fresh between full appointments.', techniqueTags: ['colour'], outcomeTags: ['grey-coverage', 'shine'] },
    { name: 'Toner / Gloss',         duration: '30 min',     description: 'A quick gloss to refresh tone and add mirror-like shine.', techniqueTags: ['colour'], outcomeTags: ['shine'] },
    { name: 'Keratin Treatment',     duration: '2 hr 30',    description: 'Smoothing treatment that cuts frizz and adds long-lasting shine.', techniqueTags: ['keratin'], outcomeTags: ['smoothness', 'shine', 'protection'] },
    { name: 'Knotless Braids',       duration: '4 hr',       description: 'Tension-free knotless braids, neat at the root and lightweight to wear.', techniqueTags: ['braids'], outcomeTags: ['protection', 'length'], trendNames: [] },
    { name: 'Silk Press',            duration: '1 hr 30',    description: 'Silky, salon-smooth press that shows off your natural length and shine.', outcomeTags: ['shine', 'smoothness'] },
    { name: 'Wig Install',           duration: '2 hr',       description: 'Melted, natural-looking wig install customised to your hairline.', techniqueTags: ['extensions'], outcomeTags: ['definition', 'volume'] },
    { name: 'Dry Cut',               duration: '30 min',     description: 'A precision cut with no wash or blow dry — quick shape-up between appointments.', outcomeTags: ['definition'] },
    { name: 'Half Head Highlights',  duration: '2 hr',       description: 'Highlights around the face and crown for a lighter look without going full head.', techniqueTags: ['highlights', 'colour'], outcomeTags: ['shine', 'definition'] },
    { name: 'Cornrows',              duration: '2 hr 30',    description: 'Neat, close-to-the-scalp cornrows — straight back or in a custom pattern.', techniqueTags: ['braids'], outcomeTags: ['protection', 'length'] },
    { name: 'Deep Conditioning Treatment', duration: '45 min', description: 'Intensive moisture treatment to restore softness and strength to dry or damaged hair.', outcomeTags: ['smoothness', 'shine', 'growth'] },
    { name: "Men's Haircut",         duration: '30 min',     description: "A tailored men's cut, clippers or scissor work to your preferred style.", outcomeTags: ['definition'] },
    { name: 'Beard Trim',            duration: '20 min',     description: 'Shape and tidy for a sharp, well-defined beard line.', outcomeTags: ['definition'] },
    { name: 'Foilyage',              duration: '2 hr 30',    description: 'Foil-placed balayage for brighter, more blended dimension.', techniqueTags: ['foilyage', 'highlights'], outcomeTags: ['shine', 'colour-vibrancy'], trendNames: ['money-piece'] },
    { name: 'Colour Correction',     duration: '4 hr',       serviceType: 'restorative', description: 'Corrective colour work to fix tone, banding or previous colour gone wrong.', techniqueTags: ['colour-correction'], outcomeTags: ['colour-vibrancy', 'repair'] },
    { name: 'Perm',                  duration: '2 hr',       description: 'Chemical wave treatment for lasting curl or texture.', techniqueTags: ['perm'], outcomeTags: ['texture', 'bounce'] },
    { name: 'Weave Install',         duration: '3 hr',       description: 'Sewn-in weave for extra length and volume with a seamless blend.', techniqueTags: ['weave', 'extensions'], outcomeTags: ['length', 'volume'] },
    { name: 'Fringe / Bangs Trim',   duration: '15 min',     description: 'Quick shape-up to keep your fringe fresh between full cuts.', outcomeTags: ['definition'] },
  ],
  NAILS: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Gel Manicure',          duration: '45 min',    description: 'Chip-resistant gel polish with shaping and cuticle care.', techniqueTags: ['gel'], outcomeTags: ['colour', 'durability'] },
    { name: 'BIAB Overlay',          duration: '1 hr',       description: 'Strengthening builder gel overlay for stronger, healthier natural nails.', techniqueTags: ['biab'], outcomeTags: ['strength', 'durability'] },
    { name: 'Acrylic Full Set',      duration: '1 hr 30',    description: 'Full set of acrylic extensions, shaped and finished to your choice of length.', techniqueTags: ['acrylic'], outcomeTags: ['length', 'durability'] },
    { name: 'Gel-X Extensions',      duration: '1 hr 30',    description: 'Lightweight, flexible gel-x tips for a natural-feeling extension.', techniqueTags: ['gel-x'], outcomeTags: ['length', 'natural-look'], trendNames: ['milky-white'] },
    { name: 'Infill',                duration: '1 hr',       description: 'Infill to keep your extensions neat as your natural nail grows through.', techniqueTags: ['acrylic', 'gel'], outcomeTags: ['durability'] },
    { name: 'Soak Off & Removal',    duration: '30 min',     description: 'Gentle removal of gel or acrylic with nail and cuticle care after.', outcomeTags: ['natural-look'] },
    { name: 'Gel Pedicure',          duration: '45 min',     description: 'Full pedicure with long-lasting gel polish and a relaxing soak.', techniqueTags: ['gel'], outcomeTags: ['colour', 'durability'] },
    { name: 'Nail Art (per nail)',   duration: '15 min',     description: 'Custom nail art add-on, priced per nail — hand-painted or with embellishments.', techniqueTags: ['nail-art'], outcomeTags: ['art', 'colour'], trendNames: ['chrome', 'aura-nails'] },
    { name: 'Classic Manicure',      duration: '30 min',     description: 'Shape, cuticle care and regular polish for a clean, natural finish.', outcomeTags: ['natural-look'] },
    { name: 'Classic Pedicure',      duration: '30 min',     description: 'Soak, shape and regular polish with a relaxing foot massage.', outcomeTags: ['natural-look'] },
    { name: 'French Tips',           duration: '45 min',     description: 'The timeless French manicure — clean white tips over a natural base.', techniqueTags: ['french'], outcomeTags: ['art', 'colour'] },
    { name: 'Dip Powder Set',        duration: '1 hr',       description: 'Durable dip powder colour, built up in layers for strength and shine.', techniqueTags: ['dip-powder'], outcomeTags: ['colour', 'durability'] },
    { name: 'Polygel Full Set',      duration: '1 hr 30',    description: 'Lightweight, flexible polygel extensions built up on tips or forms.', techniqueTags: ['polygel'], outcomeTags: ['length', 'flexibility'] },
    { name: 'Cat Eye Gel Manicure',  duration: '1 hr',       description: 'Magnetic cat-eye gel polish for a shimmering, dimensional finish.', techniqueTags: ['cat-eye-gel', 'gel'], outcomeTags: ['colour', 'shine'], trendNames: ['cat-eye'] },
    { name: '3D Nail Art (per nail)', duration: '20 min',    description: 'Sculpted 3D embellishments and charms, priced per nail.', techniqueTags: ['3d-art'], outcomeTags: ['art', 'precision'] },
    { name: 'Encapsulated Nail Art', duration: '1 hr 15',    description: 'Delicate design or foil sealed under a clear gel layer for lasting shine.', techniqueTags: ['encapsulated', 'nail-art'], outcomeTags: ['art', 'durability'] },
    { name: 'Nail Repair (per nail)', duration: '10 min',    description: 'Fixes a broken or lifted nail without a full new set.', outcomeTags: ['strength', 'durability'] },
  ],
  LASHES: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Classic Full Set',      duration: '1 hr 30',    description: 'One extension per natural lash for a subtle, everyday enhancement.', techniqueTags: ['classic'], outcomeTags: ['length', 'definition'], trendNames: ['natural-classic'] },
    { name: 'Hybrid Full Set',       duration: '2 hr',       description: 'A mix of classic and volume fans for texture with added fullness.', techniqueTags: ['hybrid'], outcomeTags: ['volume', 'definition'] },
    { name: 'Volume Full Set',       duration: '2 hr 30',    description: 'Lightweight fans of fine lashes for a fuller, fluffier look.', techniqueTags: ['volume'], outcomeTags: ['volume', 'dramatic'], trendNames: ['wet-look'] },
    { name: 'Mega Volume',           duration: '2 hr 30',    description: 'Maximum density fans for a bold, glam lash look.', techniqueTags: ['mega-volume'], outcomeTags: ['volume', 'dramatic'], trendNames: ['kim-k'] },
    { name: 'Infill (2–3 weeks)',    duration: '1 hr',       description: 'Top-up on natural lash growth to keep your set full.', outcomeTags: ['volume'] },
    { name: 'Lash Lift & Tint',      duration: '1 hr',       description: 'Curls and tints your natural lashes for an extension-free lift.', techniqueTags: ['lash-lift', 'lash-tint'], outcomeTags: ['curl', 'definition'], trendNames: ['natural-classic'] },
    { name: 'Lash Removal',          duration: '30 min',     description: 'Safe, gentle removal of extensions without damaging natural lashes.' },
    { name: 'Wispy Lash Set',        duration: '2 hr',       description: 'Textured, spiky fans mixed through the set for a fluttery, wispy finish.', techniqueTags: ['wispy'], outcomeTags: ['definition', 'volume'] },
    { name: 'Russian Volume Set',    duration: '2 hr 30',    description: 'Handmade Russian fans for ultra-fluffy, full volume lashes.', techniqueTags: ['russian'], outcomeTags: ['volume', 'dramatic'] },
    { name: 'Lash Tint Only',        duration: '20 min',     description: 'Tints natural lashes darker — no extensions, just definition.', techniqueTags: ['lash-tint'], outcomeTags: ['definition'] },
    { name: 'Mink Full Set',         duration: '2 hr',       description: 'Ultra-soft mink lashes for a naturally glamorous, long-lasting set.', techniqueTags: ['mink'], outcomeTags: ['volume', 'longevity'] },
    { name: 'Faux Mink Full Set',    duration: '2 hr',       description: 'Cruelty-free faux mink lashes with a soft, natural-looking finish.', techniqueTags: ['faux-mink'], outcomeTags: ['volume', 'natural-look'] },
    { name: 'Colored Lash Set',      duration: '2 hr',       description: 'Coloured lash extensions mixed through the set for a fun pop of colour.', techniqueTags: ['colored-lashes'], outcomeTags: ['dramatic', 'definition'], trendNames: ['colored-tips'] },
    { name: 'Bottom Lash Set',       duration: '45 min',     description: 'Fine extensions on the lower lash line to frame the eyes.', techniqueTags: ['bottom-lashes'], outcomeTags: ['definition', 'symmetry'] },
  ],
  BROWS: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Brow Wax & Tint',       duration: '30 min',    description: 'Shaping wax with tint to define and fill your natural brow.', techniqueTags: ['waxing', 'tinting'], outcomeTags: ['definition', 'shape'] },
    { name: 'Brow Lamination',       duration: '45 min',     description: 'Brushed-up, fluffy brows that hold their shape for weeks.', techniqueTags: ['lamination'], outcomeTags: ['fullness', 'shape'], trendNames: ['soap-brows', 'fluffy-brows'] },
    { name: 'HD Brows',              duration: '45 min',     description: 'Tailored shape using tint, wax and precision trimming for a defined finish.', techniqueTags: ['hd-brows'], outcomeTags: ['definition', 'arched'] },
    { name: 'Microblading',          duration: '2 hr',       serviceType: 'treatment', description: 'Semi-permanent hair-stroke tattoo for naturally fuller-looking brows.', techniqueTags: ['microblading'], outcomeTags: ['fullness', 'natural'] },
    { name: 'Powder / Ombré Brows',  duration: '2 hr',       serviceType: 'treatment', description: 'Soft, powdered semi-permanent makeup finish for defined, filled-in brows.', techniqueTags: ['powder-brow', 'combo-brow'], outcomeTags: ['definition', 'bold'], trendNames: ['snatched-arch'] },
    { name: 'Threading',             duration: '15 min',     description: 'Precise thread shaping for clean, natural brow lines.', techniqueTags: ['threading'], outcomeTags: ['shape', 'natural'] },
    { name: 'Brow Henna',            duration: '30 min',     description: 'Natural henna tint that stains both the hairs and the skin beneath for extra fullness.', techniqueTags: ['tinting'], outcomeTags: ['fullness', 'natural'] },
    { name: 'Combo Brows',           duration: '2 hr',       serviceType: 'treatment', description: 'Microblading strokes with shaded powder underneath for a soft, defined finish.', techniqueTags: ['combo-brow'], outcomeTags: ['definition', 'fullness'] },
    { name: 'Brow Mapping Consultation', duration: '20 min', serviceType: 'consultation', description: 'Measuring and mapping your ideal brow shape before a semi-permanent treatment.' },
    { name: 'Nano Brows',            duration: '2 hr',       serviceType: 'treatment', description: 'Ultra-fine hair-stroke semi-permanent brows for a crisp, natural finish.', techniqueTags: ['nano-brows'], outcomeTags: ['precision', 'fullness'], trendNames: ['nano-brows'] },
    { name: 'Wax & Thread Combo',    duration: '25 min',     description: 'Wax for the bulk of the shape, thread for precision around the brow line.', techniqueTags: ['wax-and-thread'], outcomeTags: ['shape', 'precision'] },
    { name: 'Brow Lamination & Tint', duration: '1 hr',      description: 'Lamination for hold plus a tint for fuller, longer-lasting definition.', techniqueTags: ['lamination', 'tinting'], outcomeTags: ['fullness', 'longevity'], trendNames: ['laminated-and-tinted'] },
  ],
  MUA: [
    { name: 'Consultation',          duration: '15 min', serviceType: 'consultation', description: 'A quick chat about what you want before booking in for the full service.', generic: true },
    { name: 'Full Glam',             duration: '1 hr',       description: 'Full-coverage glam makeup built for photos and a big night out.', styleTags: ['glam'], techniqueTags: ['full-glam'], outcomeTags: ['glow', 'coverage', 'dramatic'] },
    { name: 'Soft Glam',             duration: '1 hr',       description: 'Everyday-wearable glam with soft definition and a lit-from-within glow.', styleTags: ['soft-girl', 'glam'], outcomeTags: ['glow', 'natural-look'], trendNames: ['clean-girl', 'latte-makeup'] },
    { name: 'Bridal Makeup',         duration: '1 hr 30',    description: 'Long-wear bridal makeup designed to look flawless all day and in photos.', styleTags: ['bridal'], techniqueTags: ['bridal'], outcomeTags: ['longevity', 'glow'], occasionTags: ['bridal'] },
    { name: 'Bridal Trial',          duration: '1 hr 30',    description: 'Full trial run of your bridal look ahead of the big day.', styleTags: ['bridal'], techniqueTags: ['bridal'], occasionTags: ['bridal'] },
    { name: 'Natural / Everyday',    duration: '45 min',     description: 'Fresh, skin-like makeup that enhances your features without heavy coverage.', styleTags: ['natural', 'clean-girl'], techniqueTags: ['natural'], outcomeTags: ['natural-look', 'glow'], trendNames: ['clean-girl'] },
    { name: 'Makeup Lesson',         duration: '2 hr',       description: 'One-to-one lesson to learn techniques tailored to your face and routine.', outcomeTags: ['definition'] },
    { name: 'Airbrush Makeup',       duration: '1 hr 15',    description: 'Lightweight, buildable airbrush foundation for flawless, long-wear coverage.', techniqueTags: ['airbrush'], outcomeTags: ['coverage', 'longevity'] },
    { name: 'Editorial / Photoshoot Makeup', duration: '1 hr 30', description: 'Bold, camera-ready looks designed for photography and editorial shoots.', techniqueTags: ['editorial'], outcomeTags: ['dramatic', 'definition'], occasionTags: ['photoshoot'] },
    { name: 'SFX Makeup',            duration: '2 hr',       description: 'Special-effects makeup for creative, theatrical or costume looks.', techniqueTags: ['sfx'], outcomeTags: ['dramatic'] },
    { name: 'Contour & Highlight Session', duration: '45 min', description: 'Sculpted contour and highlight for a defined, camera-ready glow.', techniqueTags: ['contour-and-highlight'], outcomeTags: ['definition', 'radiance'] },
    { name: 'Strobing Glow Makeup',  duration: '1 hr',       description: 'Dewy, light-reflecting strobing technique for a lit-from-within glow.', techniqueTags: ['strobing'], outcomeTags: ['glow', 'radiance'] },
    { name: 'Graphic Liner Look',    duration: '45 min',     description: 'Bold graphic eyeliner styling for a striking, editorial-ready eye.', techniqueTags: ['graphic-liner'], outcomeTags: ['dramatic', 'definition'] },
    { name: 'Baking & Setting Makeup', duration: '1 hr',     description: 'Baked, set-in-place base makeup built to last all day and photograph flawlessly.', techniqueTags: ['baking'], outcomeTags: ['flawless-finish', 'longevity'] },
  ],
  AESTHETICS: [
    { name: 'Skin Consultation',        duration: '30 min', serviceType: 'consultation', description: 'In-depth skin assessment and a personalised treatment plan.', generic: true },
    { name: 'Anti-Wrinkle (1 area)',    duration: '30 min', serviceType: 'treatment',    description: 'Targeted anti-wrinkle treatment for one area to soften fine lines.', techniqueTags: ['botox'], outcomeTags: ['smoothness'], trendNames: ['baby-botox'] },
    { name: 'Anti-Wrinkle (3 areas)',   duration: '45 min', serviceType: 'treatment',    description: 'Full upper-face anti-wrinkle treatment across three areas.', techniqueTags: ['botox'], outcomeTags: ['smoothness', 'rejuvenation'] },
    { name: 'Lip Filler (0.5ml)',       duration: '45 min', serviceType: 'enhancement',  description: 'Subtle lip enhancement for natural volume and hydration.', techniqueTags: ['filler'], outcomeTags: ['hydration', 'definition'], trendNames: ['lip-flip'] },
    { name: 'Lip Filler (1ml)',         duration: '1 hr',   serviceType: 'enhancement',  description: 'Fuller lip enhancement with balanced, natural-looking volume.', techniqueTags: ['filler'], outcomeTags: ['hydration', 'definition'], trendNames: ['russian-lips'] },
    { name: 'Cheek Filler',             duration: '45 min', serviceType: 'enhancement',  description: 'Contours and lifts the mid-face for a naturally sculpted look.', techniqueTags: ['filler'], outcomeTags: ['lifting', 'definition'], trendNames: ['snatched'] },
    { name: 'Chemical Peel',            duration: '45 min', serviceType: 'treatment',    description: 'Resurfacing peel to brighten tone and refine texture.', techniqueTags: ['chemical-peel'], outcomeTags: ['glow', 'smoothness'], trendNames: ['glass-skin'] },
    { name: 'Microneedling',            duration: '1 hr',   serviceType: 'treatment',    description: 'Collagen-boosting microneedling to improve texture and firmness.', techniqueTags: ['microneedling'], outcomeTags: ['firmness', 'rejuvenation'] },
    { name: 'HydraFacial',              duration: '1 hr',   serviceType: 'treatment',    description: 'Deep cleanse, exfoliation and hydration for an instant glow.', techniqueTags: ['hydrafacial'], outcomeTags: ['glow', 'hydration'], trendNames: ['glass-skin', 'glazed-donut-skin'] },
    { name: 'Dermaplaning',             duration: '45 min', serviceType: 'treatment',    description: 'Gentle exfoliation that removes peach fuzz for smoother, brighter skin.', techniqueTags: ['dermaplaning'], outcomeTags: ['smoothness', 'glow'] },
    { name: 'Skin Booster Treatment',   duration: '45 min', serviceType: 'treatment',    description: 'Micro-injections of hyaluronic acid to deeply hydrate and improve skin quality over a course of sessions.', techniqueTags: ['mesotherapy'], outcomeTags: ['hydration', 'glow'] },
    { name: 'Fat Dissolving Injections', duration: '30 min', serviceType: 'treatment',   description: 'Targeted injections to break down small pockets of stubborn fat.', techniqueTags: ['mesotherapy'], outcomeTags: ['reduction'] },
    { name: 'Thread Lift',              duration: '1 hr',   serviceType: 'treatment',    description: 'Dissolvable threads inserted to lift and tighten sagging skin without surgery.', outcomeTags: ['lifting', 'firmness'] },
    { name: 'HIFU Facial',              duration: '1 hr',   serviceType: 'treatment',    description: 'Ultrasound energy to lift and tighten deeper skin layers, non-invasively.', techniqueTags: ['hifu'], outcomeTags: ['lifting', 'firmness'] },
    { name: 'Laser Skin Treatment',     duration: '30 min', serviceType: 'treatment',    description: 'Laser resurfacing to even tone, reduce pigmentation and refine texture.', techniqueTags: ['laser'], outcomeTags: ['smoothness', 'rejuvenation'] },
    // LED Light Therapy, Radiofrequency, Cryotherapy and Lymphatic Drainage
    // each live under their own subcategory (see SUBCATEGORY_SUGGESTIONS_BY_CATEGORY
    // + SUBCATEGORY_SCOPE below) instead of a single flat entry here, so picking
    // that subcategory shows every type of that treatment, not just one option.
    { name: 'Red Light Therapy (Anti-Ageing)', duration: '30 min', serviceType: 'treatment', description: 'Red/near-infrared light to boost collagen and calm ageing skin.', techniqueTags: ['led-therapy'], outcomeTags: ['radiance', 'collagen-boost'] },
    { name: 'Blue Light Therapy (Acne)', duration: '30 min', serviceType: 'treatment', description: 'Blue light wavelengths to target acne-causing bacteria and even tone.', techniqueTags: ['led-therapy'], outcomeTags: ['even-tone', 'pore-refinement'] },
    { name: 'Combination LED Therapy',  duration: '45 min', serviceType: 'treatment',    description: 'Multi-wavelength LED protocol combining red and blue light for an all-round glow.', techniqueTags: ['led-therapy'], outcomeTags: ['radiance', 'even-tone'] },
    { name: 'Radiofrequency Face Tightening', duration: '45 min', serviceType: 'treatment', description: 'Heat energy to stimulate collagen and firm sagging facial skin.', techniqueTags: ['radiofrequency'], outcomeTags: ['firmness', 'collagen-boost'] },
    { name: 'Radiofrequency Body Contouring', duration: '1 hr', serviceType: 'treatment', description: 'Radiofrequency energy to tighten and contour looser body skin.', techniqueTags: ['radiofrequency'], outcomeTags: ['firmness', 'reduction'] },
    { name: 'Cryotherapy Facial',       duration: '30 min', serviceType: 'treatment',    description: 'Cooling facial treatment to de-puff, tighten pores and boost radiance.', techniqueTags: ['cryotherapy'], outcomeTags: ['radiance', 'pore-refinement'] },
    { name: 'Localised Cryotherapy (Fat Freezing)', duration: '45 min', serviceType: 'treatment', description: 'Targeted cooling to reduce stubborn fat pockets and firm the area.', techniqueTags: ['cryotherapy'], outcomeTags: ['reduction', 'firmness'] },
    { name: 'Facial Lymphatic Drainage Massage', duration: '45 min', serviceType: 'treatment', description: 'Gentle facial massage technique to reduce puffiness and support circulation.', techniqueTags: ['lymphatic-drainage'], outcomeTags: ['reduction', 'glow'] },
    { name: 'Full Body Lymphatic Drainage Massage', duration: '1 hr', serviceType: 'treatment', description: 'Full-body massage technique to ease fluid retention and support circulation.', techniqueTags: ['lymphatic-drainage'], outcomeTags: ['reduction', 'firmness'] },
  ],
  OTHER: [
    { name: 'Consultation',          duration: '30 min', serviceType: 'consultation', description: 'A chance to talk through what you are looking for before booking in.', generic: true },
    { name: 'Standard Appointment',  duration: '1 hr',    description: 'Standard appointment slot — details confirmed with your provider.' },
    { name: 'Group Session',         duration: '2 hr',    description: 'A session booked for a group — details confirmed with your provider.' },
    { name: 'Follow-up Appointment', duration: '30 min',  description: 'A shorter check-in or top-up following a previous appointment.' },
    { name: 'Trial / Sample Session', duration: '30 min', description: 'A low-commitment taster session before booking the full service.', outcomeTags: ['confidence'] },
    { name: 'Refresh / Top-up',      duration: '20 min',  description: 'A quick refresh between full appointments.', outcomeTags: ['refresh'] },
  ],
};

// Narrows templates + technique/outcome tags to the SPECIFIC subcategory a
// provider picked (e.g. "Microneedling"), instead of the whole parent kind's
// generic list (which would show every Aesthetics technique — botox, filler,
// laser — under a Microneedling category). Keyed by exact subcategory name
// from SUBCATEGORY_SUGGESTIONS_BY_CATEGORY; every string reused here must
// already exist in the relevant TECHNIQUE/OUTCOME pool or template list —
// no new tag values are invented here, only narrowed subsets.
interface SubcategoryVariantGroup {
  /** e.g. "Volume", "Areas" — shown above the option chips. */
  label: string;
  /** e.g. ["0.5ml", "1ml", "1.5ml", "2ml"] for Lip Fillers, ["1 area", "2 areas", ...] for Anti-Wrinkle. */
  options: string[];
  duration?: string;
  serviceType?: ServiceData['serviceType'];
}
interface SubcategoryScope {
  templates?: string[];
  techniques?: string[];
  outcomes?: string[];
  /** Treatment-specific option rows (e.g. ml size, area count) offered as
   *  chips in the template picker, instead of every subcategory sharing the
   *  same flat template list — a lip filler and an anti-wrinkle treatment
   *  have genuinely different variant shapes. */
  variantGroups?: SubcategoryVariantGroup[];
}
// Builds a one-off ServiceTemplate for a tapped variant chip (e.g. "0.5ml"
// under Lip Fillers) — keeps variant naming/tags consistent without needing
// a hand-written template entry for every possible size/area combination.
const buildVariantTemplate = (
  categoryName: string,
  group: SubcategoryVariantGroup,
  option: string,
  scope?: SubcategoryScope,
): ServiceTemplate => ({
  name: `${categoryName} (${option})`,
  duration: group.duration ?? '30 min',
  serviceType: group.serviceType ?? 'treatment',
  description: `${categoryName} — ${option}.`,
  ...(scope?.techniques ? { techniqueTags: scope.techniques } : {}),
  ...(scope?.outcomes ? { outcomeTags: scope.outcomes } : {}),
});
const SUBCATEGORY_SCOPE: Record<string, SubcategoryScope> = {
  // HAIR
  'Cuts & Styling':        { templates: ['Cut & Blow Dry', 'Dry Cut'] },
  'Colour':                { templates: ['Root Tint', 'Toner / Gloss', 'Half Head Highlights'], techniques: ['colour', 'ombre'] },
  'Balayage & Highlights':  { templates: ['Full Head Highlights', 'Balayage', 'Half Head Highlights'], techniques: ['balayage', 'highlights'] },
  'Braids & Locs':          { templates: ['Knotless Braids', 'Cornrows'], techniques: ['braids', 'locs', 'twists'] },
  'Extensions & Wigs':      { templates: ['Wig Install'], techniques: ['extensions'] },
  'Treatments':             { templates: ['Keratin Treatment', 'Silk Press', 'Deep Conditioning Treatment'], techniques: ['keratin', 'relaxer'] },
  'Blow Dry Bar':           { templates: ['Blow Dry'] },
  "Men's Hair":             { templates: ['Cut & Blow Dry', "Men's Haircut", 'Beard Trim'] },
  // NAILS
  'Manicure':               { templates: ['Gel Manicure', 'Soak Off & Removal', 'Classic Manicure'], techniques: ['gel'] },
  'Pedicure':               { templates: ['Gel Pedicure', 'Classic Pedicure'], techniques: ['gel'] },
  'Gel':                    { templates: ['Gel Manicure', 'Gel-X Extensions', 'Gel Pedicure', 'Dip Powder Set'], techniques: ['gel', 'gel-x', 'dip-powder'] },
  'Acrylic':                { templates: ['Acrylic Full Set', 'Infill'], techniques: ['acrylic'] },
  'BIAB':                   { templates: ['BIAB Overlay'], techniques: ['biab'] },
  'Nail Art':               { templates: ['Nail Art (per nail)', 'French Tips'], techniques: ['nail-art', 'chrome', 'french'] },
  // NAILS "Extensions" collides in name with HAIR's "Extensions & Wigs" — fine,
  // they're different exact strings so both resolve independently.
  'Extensions':             { templates: ['Acrylic Full Set', 'Gel-X Extensions', 'Infill'], techniques: ['acrylic', 'gel-x'] },
  // LASHES
  'Classic Lashes':         { templates: ['Classic Full Set', 'Infill (2–3 weeks)'], techniques: ['classic'] },
  'Hybrid Lashes':          { templates: ['Hybrid Full Set', 'Infill (2–3 weeks)'], techniques: ['hybrid'] },
  'Volume Lashes':          { templates: ['Volume Full Set', 'Mega Volume', 'Infill (2–3 weeks)', 'Wispy Lash Set', 'Russian Volume Set'], techniques: ['volume', 'mega-volume', 'russian', 'wispy'] },
  'Lash Lifts':             { templates: ['Lash Lift & Tint'], techniques: ['lash-lift'] },
  'Lash Tinting':           { templates: ['Lash Lift & Tint', 'Lash Tint Only'], techniques: ['lash-tint'] },
  // BROWS
  'Brow Shaping':           { templates: ['Brow Wax & Tint', 'HD Brows'], techniques: ['waxing', 'hd-brows'] },
  'Brow Tinting':           { templates: ['Brow Wax & Tint', 'Brow Henna'], techniques: ['tinting'] },
  'Brow Lamination':        { templates: ['Brow Lamination'], techniques: ['lamination'] },
  'Microblading':           { templates: ['Microblading', 'Brow Mapping Consultation'], techniques: ['microblading'] },
  'Ombré Brows':            { templates: ['Powder / Ombré Brows', 'Combo Brows'], techniques: ['powder-brow', 'combo-brow'] },
  'Threading':              { templates: ['Threading'], techniques: ['threading'] },
  // MUA
  'Bridal Makeup':          { templates: ['Bridal Makeup', 'Bridal Trial'], techniques: ['bridal'] },
  'Special Occasion':       { templates: ['Full Glam', 'Soft Glam', 'Airbrush Makeup'], techniques: ['full-glam', 'airbrush'] },
  'Editorial':              { templates: ['Full Glam', 'Editorial / Photoshoot Makeup', 'SFX Makeup'], techniques: ['editorial', 'sfx', 'cut-crease'] },
  'Makeup Lessons':         { templates: ['Makeup Lesson'] },
  // AESTHETICS
  'Lip Fillers':            { templates: ['Skin Consultation'], techniques: ['filler'], outcomes: ['hydration', 'definition'],
                              variantGroups: [{ label: 'Volume', options: ['0.5ml', '1ml', '1.5ml', '2ml'], duration: '45 min', serviceType: 'enhancement' }] },
  'Anti-Wrinkle':           { templates: ['Skin Consultation'], techniques: ['botox'], outcomes: ['smoothness', 'rejuvenation'],
                              variantGroups: [{ label: 'Areas', options: ['1 area', '2 areas', '3 areas', 'Full Face'], duration: '30 min', serviceType: 'treatment' }] },
  'Dermal Fillers':         { templates: ['Skin Consultation'], techniques: ['filler'], outcomes: ['lifting', 'definition', 'firmness'],
                              variantGroups: [{ label: 'Area', options: ['Cheeks', 'Jawline', 'Chin', 'Tear Trough'], duration: '45 min', serviceType: 'enhancement' }] },
  'Chemical Peels':         { templates: ['Chemical Peel', 'Skin Consultation'], techniques: ['chemical-peel'], outcomes: ['glow', 'smoothness'],
                              variantGroups: [{ label: 'Depth', options: ['Light', 'Medium', 'Deep'], duration: '30 min', serviceType: 'treatment' }] },
  'Microneedling':          { templates: ['Microneedling', 'Skin Consultation'], techniques: ['microneedling', 'prp'], outcomes: ['firmness', 'rejuvenation', 'smoothness'] },
  'Skin Boosters':          { templates: ['Skin Booster Treatment', 'Skin Consultation'], techniques: ['mesotherapy', 'filler'], outcomes: ['hydration', 'glow'] },
  'HydraFacial':            { templates: ['HydraFacial', 'Skin Consultation'], techniques: ['hydrafacial'], outcomes: ['glow', 'hydration'],
                              variantGroups: [{ label: 'Tier', options: ['Signature', 'Deluxe', 'Platinum'], duration: '1 hr', serviceType: 'treatment' }] },
  'Dermaplaning':           { templates: ['Dermaplaning', 'Skin Consultation'], techniques: ['dermaplaning'], outcomes: ['smoothness', 'glow'] },
  'Thread Lifts':           { templates: ['Thread Lift', 'Skin Consultation'], techniques: ['filler'], outcomes: ['lifting', 'firmness'] },
  'Fat Dissolving':         { templates: ['Skin Consultation'], techniques: ['mesotherapy'], outcomes: ['reduction'],
                              variantGroups: [{ label: 'Areas', options: ['1 area', '2 areas', '3+ areas'], duration: '30 min', serviceType: 'treatment' }] },
  'LED Light Therapy':      { templates: ['Red Light Therapy (Anti-Ageing)', 'Blue Light Therapy (Acne)', 'Combination LED Therapy', 'Skin Consultation'], techniques: ['led-therapy'], outcomes: ['radiance', 'even-tone', 'collagen-boost', 'pore-refinement'] },
  'Radiofrequency':         { templates: ['Radiofrequency Face Tightening', 'Radiofrequency Body Contouring', 'Skin Consultation'], techniques: ['radiofrequency'], outcomes: ['firmness', 'collagen-boost', 'reduction'] },
  'Cryotherapy':            { templates: ['Cryotherapy Facial', 'Localised Cryotherapy (Fat Freezing)', 'Skin Consultation'], techniques: ['cryotherapy'], outcomes: ['radiance', 'pore-refinement', 'reduction', 'firmness'] },
  'Lymphatic Drainage':     { templates: ['Facial Lymphatic Drainage Massage', 'Full Body Lymphatic Drainage Massage', 'Skin Consultation'], techniques: ['lymphatic-drainage'], outcomes: ['reduction', 'glow', 'firmness'] },
};

// ─── Reusable chip-select row, with a trailing "Other" chip ───────────────────
// Wraps ChipSelect with one more chip at the end. Tapping it reveals a text
// box (rather than adding "Other" itself as a tag) — typing a value and
// hitting + / return adds THAT value to the same selected array, exactly like
// the Trend Names section's always-visible text box already works. Keeps
// every preset-tag section (style/occasion/technique/outcome) able to accept
// a value that isn't in the curated per-category list, without changing what
// gets stored (still just a plain string in that section's tags array).
interface TagSelectWithOtherProps {
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onAddOther: (tag: string) => void;
  accentColor?: string;
  styles: any;
}
const TagSelectWithOther: React.FC<TagSelectWithOtherProps> = ({ options, selected, onToggle, onAddOther, accentColor = '#9C27B0', styles }) => {
  const chrome = useChrome();
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherValue, setOtherValue] = useState('');

  const submitOther = () => {
    const trimmed = otherValue.trim();
    if (trimmed) onAddOther(trimmed);
    setOtherValue('');
  };

  return (
    <View>
      <View style={styles.chipGrid}>
        {options.map(option => {
          const active = selected.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, active && { backgroundColor: `${accentColor}2E`, borderColor: accentColor }]}
              onPress={() => { tapSelect(); onToggle(option); }}
            >
              <Text style={[styles.chipText, active && { color: accentColor }]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, showOtherInput && { backgroundColor: `${accentColor}2E`, borderColor: accentColor }]}
          onPress={() => { tapSelect(); setShowOtherInput(v => !v); }}
        >
          <Text style={[styles.chipText, showOtherInput && { color: accentColor }]}>Other</Text>
        </TouchableOpacity>
      </View>
      {showOtherInput && (
        <View style={[styles.addAddOnRow, { marginTop: 8 }]}>
          <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, { flex: 1 }]}>
            <TextInput
              style={styles.textInput}
              value={otherValue}
              onChangeText={setOtherValue}
              placeholder="Type your own..."
              placeholderTextColor={chrome.fg(0.4)}
              onSubmitEditing={submitOther}
              returnKeyType="done"
              autoFocus
            />
          </BlurView>
          <TouchableOpacity style={styles.addAddOnButton} onPress={() => { tapMedium(); submitOther(); }}>
            <Text style={styles.addAddOnButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Service template picker ──────────────────────────────────────────────────
// Shown the moment a provider taps "Add Service" — pre-built options for the
// category's kind, so most services are a single tap to pre-fill.
interface ServiceTemplatePickerProps {
  visible: boolean;
  categoryName: string;
  fallbackKind?: string;
  accentColor: string;
  onPick: (template: ServiceTemplate | null) => void;
  onClose: () => void;
}
const ServiceTemplatePicker: React.FC<ServiceTemplatePickerProps> = ({
  visible, categoryName, fallbackKind, accentColor, onPick, onClose,
}) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  const kind = inferCategoryKind(categoryName, fallbackKind);
  const allTemplates = SERVICE_TEMPLATES_BY_CATEGORY[kind] ?? SERVICE_TEMPLATES_BY_CATEGORY.OTHER;
  const meta = CATEGORY_META[kind];
  // If the category is a specific subcategory (e.g. "Microneedling"), narrow
  // the suggestions to just that treatment instead of every Aesthetics
  // template. Falls back to the full kind list for generic/free-typed names.
  // Generic templates (e.g. "Consultation") always show either way, so
  // there's always a safe starting point regardless of subcategory.
  const scope = SUBCATEGORY_SCOPE[categoryName.trim()];
  const templates = scope?.templates
    ? allTemplates.filter(t => t.generic || scope.templates!.includes(t.name))
    : allTemplates;
  const groupLabel = scope?.templates ? categoryName.trim().toLowerCase() : meta.label.toLowerCase();
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint={chrome.blurTint} style={styles.templateSheet}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add a {categoryName || meta.label} Service</Text>
                <Text style={styles.templateSheetSub}>Pick a starting point or build your own</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => { tapLight(); onClose(); }}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <TouchableOpacity style={[styles.templateScratchCard, { borderColor: accentColor }]} onPress={() => { tapSelect(); onPick(null); }} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={20} color={accentColor} style={styles.templateScratchIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateScratchTitle}>Start from scratch</Text>
                  <Text style={styles.templateScratchSub}>Blank service — fill in your own details</Text>
                </View>
              </TouchableOpacity>

              {templates.length > 0 && (
                <Text style={styles.templateGroupLabel}>Popular {groupLabel} services</Text>
              )}
              {templates.map((t, i) => (
                <TouchableOpacity key={`${t.name}-${i}`} style={styles.templateCard} onPress={() => { tapSelect(); onPick(t); }} activeOpacity={0.85}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color={chrome.fg(0.5)} />
                      <Text style={styles.templateDuration}>{t.duration}</Text>
                    </View>
                  </View>
                  <Text style={[styles.templateAdd, { color: accentColor }]}>Use →</Text>
                </TouchableOpacity>
              ))}

              {/* Size / area variants — shown as the same long template-card
                  row as the popular services above, underneath them. */}
              {scope?.variantGroups?.map(group => (
                <View key={group.label}>
                  <Text style={styles.templateGroupLabel}>{categoryName.trim()} — {group.label}</Text>
                  {group.options.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={styles.templateCard}
                      onPress={() => { tapSelect(); onPick(buildVariantTemplate(categoryName.trim(), group, opt, scope)); }}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateName}>{categoryName.trim()} ({opt})</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={12} color={chrome.fg(0.5)} />
                          <Text style={styles.templateDuration}>{group.duration ?? '30 min'}</Text>
                        </View>
                      </View>
                      <Text style={[styles.templateAdd, { color: accentColor }]}>Use →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </BlurView>
      </View>
    </Modal>
  );
};

// buffer_before_mins NULL and 0 both resolve to no padding before a booking
// (see bufferFromRow in AvailabilityService), so a 0 written by the old typed
// field maps onto the picker's single "None" chip rather than showing up as a
// stray "0 min" custom value.
const bufferBeforeToPicker = (mins: number | null | undefined): string =>
  mins == null || mins === 0 ? '' : String(mins);

// Add/Edit Service Modal
/**
 * The FULL service editor: photos, name, price, duration, buffers,
 * description, service type, tags, hair types, safety flags, aftercare and
 * add-ons. Reached from this screen's category sections.
 *
 * There is a second, deliberately narrower editor —
 * features/providers/ServiceEditorSheet — opened from the My Services
 * dashboard for the day-to-day set (name, price, duration, description). That
 * split is intentional, not a duplicate left behind: changing a price should
 * not mean scrolling a form this long. Both write the same row; this one owns
 * every field the other doesn't touch, so a field added here needs no
 * counterpart there unless it's something providers change weekly.
 */
interface ServiceModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (service: ServiceData) => void;
  service?: ServiceData | null;
  categoryName: string;
  /** True when editing an existing service (vs adding / template pre-fill). */
  isEditing?: boolean;
  /** Business-level service type, used when a category name can't be resolved. */
  fallbackKind?: string;
  accentColor?: string;
}

const ServiceModal: React.FC<ServiceModalProps> = ({
  visible,
  onClose,
  onSave,
  service,
  categoryName,
  isEditing = false,
  fallbackKind,
  accentColor = '#AF9197',
}) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  // Text boxes and modal background stay tinted with the provider's own
  // accent colour (matching their chosen brand aesthetic) instead of a
  // generic white/grey — just blended much closer to white so they stay
  // bright and legible rather than being noticeably tinted.
  const inputTint = blend(accentColor, '#FFFFFF', 0.96);
  // The sheet's fields are a plain tinted box with an accent-derived hairline
  // edge, matching the quick editor on the My Services dashboard — the blur +
  // drop shadow the rest of registration uses made every field read as a
  // second raised surface stacked on the sheet.
  const fieldBox = { backgroundColor: inputTint, borderColor: blend(accentColor, '#FFFFFF', 0.7) };
  const modalTintTop = blend(accentColor, '#FFFFFF', 0.93);
  const modalTintBottom = blend(accentColor, '#FFFFFF', 0.82);
  const catKey = inferCategoryKind(categoryName, fallbackKind);
  const isAesthetics = catKey === 'AESTHETICS';
  const isHair = catKey === 'HAIR';
  // If the category is a specific subcategory (e.g. "Microneedling"), narrow
  // technique/outcome options to just what's relevant to it — otherwise a
  // Microneedling service would offer botox/filler/laser tags too, since
  // those all technically belong to the wider Aesthetics kind.
  const subScope = SUBCATEGORY_SCOPE[categoryName.trim()];
  const techniquOptions: string[] = subScope?.techniques ?? TECHNIQUE_TAGS_BY_CATEGORY[catKey] ?? TECHNIQUE_TAGS_BY_CATEGORY.OTHER;
  const outcomeOptions: string[] = subScope?.outcomes ?? OUTCOME_TAGS_BY_CATEGORY[catKey] ?? OUTCOME_TAGS_BY_CATEGORY.OTHER;
  const styleOptions: string[] = STYLE_TAGS_BY_CATEGORY[catKey] ?? STYLE_TAGS_BY_CATEGORY.OTHER;
  const occasionOptions: string[] = OCCASION_TAGS_BY_CATEGORY[catKey] ?? OCCASION_TAGS_DEFAULT;
  const trendOptions: string[] = TREND_NAMES_BY_CATEGORY[catKey] ?? TREND_NAMES_BY_CATEGORY.OTHER;
  const contraindicationOptions: string[] = COMMON_CONTRAINDICATIONS_BY_CATEGORY[catKey] ?? COMMON_CONTRAINDICATIONS_BY_CATEGORY.OTHER;

  const [name, setName] = useState(service?.name || '');
  const [price, setPrice] = useState(service?.price ? String(service.price) : '');
  const [duration, setDuration] = useState(service?.duration || '');
  const [bufferBefore, setBufferBefore] = useState(bufferBeforeToPicker(service?.bufferBeforeMins));
  const [bufferAfter, setBufferAfter] = useState(service?.bufferAfterMins?.toString() || '');
  const [description, setDescription] = useState(service?.description || '');
  const [images, setImages] = useState<ServiceImageDraft[]>(service?.images || []);
  // Freshly-picked URIs waiting to be framed. They are deliberately NOT added
  // to `images` yet — a provider who backs out of the cropper should end up
  // with the set they started with, not a half-added batch.
  const [pendingCropUris, setPendingCropUris] = useState<string[]>([]);
  const [addOns, setAddOns] = useState<AddOnData[]>(service?.addOns || []);
  const [newAddOnName, setNewAddOnName] = useState('');
  const [newAddOnPrice, setNewAddOnPrice] = useState('');
  // Tag state
  const [selectedTags, setSelectedTags] = useState<string[]>(service?.tags || []);
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>(service?.techniqueTags || []);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>(service?.outcomeTags || []);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>(service?.occasionTags || []);
  const [trendNames, setTrendNames] = useState<string[]>(service?.trendNames || []);
  const [trendInput, setTrendInput] = useState('');
  const [serviceType, setServiceType] = useState<ServiceData['serviceType']>(service?.serviceType || '');
  const [audience, setAudience] = useState<ServiceData['audience']>(service?.audience || '');
  // Safety state
  const [isPregnancySafe, setIsPregnancySafe] = useState(service?.isPregnancySafe ?? false);
  const [patchTestRequired, setPatchTestRequired] = useState(
    service?.patchTestRequired ?? (!service && PATCH_TEST_DEFAULT_CATEGORIES.has(catKey))
  );
  const [minAge, setMinAge] = useState(service?.minAge?.toString() || '');
  const [contraindications, setContraindications] = useState<string[]>(service?.contraindications || []);
  const [contraindicationInput, setContraindicationInput] = useState('');
  const [aftercareNotes, setAftercareNotes] = useState(service?.aftercareNotes || '');
  const [hairTypesSuitable, setHairTypesSuitable] = useState<string[]>(service?.hairTypesSuitable || []);
  // Shown inline above the save button instead of an Alert, so the reason a
  // save was refused stays beside the button that refused it.
  const [error, setError] = useState<string | null>(null);
  // The duration and buffer presets live behind collapsed fields so each pair
  // can share a row; expanded, the chips span the full sheet width. Only one
  // buffer picker is open at a time — two half-width chip columns side by side
  // would each wrap to a different height and leave the row ragged.
  const [durationOpen, setDurationOpen] = useState(false);
  const [openBuffer, setOpenBuffer] = useState<'before' | 'after' | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  // Measured Y position of each input group, captured via onLayout — lets
  // focus scroll precisely to just above the field instead of always
  // jumping to the very bottom of the form.
  const serviceInputPositions = useRef<Record<string, number>>({});
  // Real viewport height (measured, not guessed) and real keyboard height
  // (from native events) — together these tell us exactly how much visible
  // space is left ABOVE the keyboard, so a focused field can be scrolled to
  // sit just above it instead of landing behind it.
  const scrollViewHeight = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  React.useEffect(() => {
    setName(service?.name || '');
    setPrice(service?.price ? String(service.price) : '');
    setDuration(service?.duration || '');
    setBufferBefore(bufferBeforeToPicker(service?.bufferBeforeMins));
    setBufferAfter(service?.bufferAfterMins?.toString() || '');
    setDescription(service?.description || '');
    setImages(service?.images || []);
    setAddOns(service?.addOns || []);
    setSelectedTags(service?.tags || []);
    setSelectedTechniques(service?.techniqueTags || []);
    setSelectedOutcomes(service?.outcomeTags || []);
    setSelectedOccasions(service?.occasionTags || []);
    setTrendNames(service?.trendNames || []);
    setTrendInput('');
    setServiceType(service?.serviceType || '');
    setAudience(service?.audience || '');
    setIsPregnancySafe(service?.isPregnancySafe ?? false);
    setPatchTestRequired(service?.patchTestRequired ?? (!service && PATCH_TEST_DEFAULT_CATEGORIES.has(catKey)));
    setMinAge(service?.minAge?.toString() || '');
    setContraindications(service?.contraindications || []);
    setContraindicationInput('');
    setAftercareNotes(service?.aftercareNotes || '');
    setHairTypesSuitable(service?.hairTypesSuitable || []);
    setError(null);
    setDurationOpen(false);
    setOpenBuffer(null);
  }, [service, catKey]);

  const toggleTag = (arr: string[], setArr: (v: string[]) => void) => (tag: string) =>
    setArr(arr.includes(tag) ? arr.filter(t => t !== tag) : [...arr, tag]);

  const handleAddImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,   // pick several photos at once
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      // Straight into the cropper rather than into the set: every photo is
      // re-rendered to JPEG on the way through, which is also what stops an
      // iOS HEIC being uploaded under a .jpg name (see ServiceImageCropper).
      setPendingCropUris(result.assets.map(a => a.uri));
    }
  };

  const handleCropperDone = (framed: ServiceImageDraft[]) => {
    setPendingCropUris([]);
    if (framed.length > 0) setImages(prev => [...prev, ...framed]);
  };

  const handleRemoveImage = (index: number) => setImages(images.filter((_, i) => i !== index));

  // Array order IS the stored order — it becomes service_images.sort_order on
  // save, and index 0 is the photo that leads the service everywhere it's
  // shown. Splice-then-insert rather than a swap, so dragging across several
  // slots moves one photo through them instead of exchanging the two ends.
  // Framing is per photo, not per service — a provider may want a wide shot
  // shown whole and a close-up filling the frame in the same set.
  const handleToggleImageFit = (index: number) => {
    setImages(prev =>
      prev.map((img, i) =>
        i === index
          ? { ...img, fit: img.fit === 'cover' ? 'contain' : 'cover' }
          : img,
      ),
    );
  };

  const handleReorderImages = (from: number, to: number) => {
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleAddAddOn = () => {
    if (!newAddOnName.trim() || !newAddOnPrice.trim()) {
      tapWarn();
      setError('Give the add-on a name and a price.');
      return;
    }
    setError(null);
    setAddOns([...addOns, { id: Date.now(), dbId: null, name: newAddOnName.trim(), price: parseFloat(newAddOnPrice) || 0 }]);
    setNewAddOnName('');
    setNewAddOnPrice('');
    Keyboard.dismiss();
  };

  const handleRemoveAddOn = (id: number) => setAddOns(addOns.filter(a => a.id !== id));

  const handleAddTrend = () => {
    const t = trendInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !trendNames.includes(t)) setTrendNames([...trendNames, t]);
    setTrendInput('');
  };

  const handleAddContraindication = () => {
    const c = contraindicationInput.trim();
    if (c && !contraindications.includes(c)) setContraindications([...contraindications, c]);
    setContraindicationInput('');
  };

  const handleSave = () => {
    const problem =
      !name.trim() ? 'Give the service a name.'
      : !price.trim() ? 'Enter a price, or 0 if it varies.'
      : !duration.trim() ? 'Tap how long this service takes.'
      : null;
    if (problem) {
      tapWarn();
      setError(problem);
      // The presets are collapsed by default, so pointing at a missing
      // duration without opening them names a control that isn't on screen.
      if (!duration.trim()) setDurationOpen(true);
      return;
    }
    setError(null);
    onSave({
      id: service?.id || Date.now(),
      dbId: service?.dbId ?? null,
      name: name.trim(),
      price: parseFloat(price) || 0,
      duration: duration.trim(),
      bufferBeforeMins: bufferBefore.trim() ? parseInt(bufferBefore, 10) || 0 : null,
      bufferAfterMins: bufferAfter.trim() ? parseInt(bufferAfter, 10) || 0 : null,
      description: description.trim(),
      images,
      addOns,
      tags: selectedTags,
      techniqueTags: selectedTechniques,
      outcomeTags: selectedOutcomes,
      occasionTags: selectedOccasions,
      trendNames,
      isPregnancySafe,
      patchTestRequired,
      minAge: minAge ? parseInt(minAge, 10) : null,
      contraindications,
      aftercareNotes: aftercareNotes.trim(),
      serviceType,
      hairTypesSuitable,
      audience,
    });
    onClose();
  };

  const handleInputFocus = (inputName: string) => {
    const y = serviceInputPositions.current[inputName] ?? 0;
    // Wait for the keyboard height to be known (keyboardWillShow on iOS fires
    // almost immediately; Android only gets keyboardDidShow, which lands
    // after the keyboard is already up) before computing where to scroll.
    setTimeout(() => {
      const viewportH = scrollViewHeight.current || Dimensions.get('window').height * 0.5;
      // Real space still visible above the keyboard, minus a margin so the
      // field's label sits comfortably clear of the keyboard's top edge —
      // not jammed right against it.
      const visibleAboveKeyboard = Math.max(150, viewportH - keyboardHeight - 24);
      const target = Math.max(0, y - visibleAboveKeyboard + 140);
      scrollViewRef.current?.scrollTo({ y: target, animated: true });
    }, 350);
  };

  const SERVICE_TYPES: { value: ServiceData['serviceType']; label: string }[] = [
    { value: 'treatment',    label: 'Treatment' },
    { value: 'enhancement',  label: 'Enhancement' },
    { value: 'maintenance',  label: 'Maintenance' },
    { value: 'restorative',  label: 'Restorative' },
    { value: 'consultation', label: 'Consultation' },
  ];

  const SERVICE_AUDIENCE_OPTS: { value: ServiceData['audience']; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'women',    label: 'Women' },
    { value: 'men',      label: 'Men' },
    { value: 'kids',     label: 'Kids' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardDismissView style={styles.modalOverlay}>
        {/* Tap the strip above the sheet to dismiss. Rendered first so the
            sheet paints over it, and absolute so it doesn't take part in the
            overlay's layout. This replaces the Cancel button the footer used
            to carry — the sheet now has one action, like the dashboard's. */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { tapLight(); onClose(); }}
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
        />
        {/* Bottom sheet, matching the quick service editor on the My Services
            dashboard: grabber, eyebrow + title, then one accent action, and
            the same field treatment — a small uppercase label over a plain
            bordered box. It opens on the four fields that editor has (name,
            price, duration, description) so the form starts where a provider
            starts; photos, tags, safety and add-ons follow as ruled sections
            below, since this editor still owns every field that one doesn't. */}
        <LinearGradient colors={[modalTintTop, modalTintBottom]} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={styles.serviceModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.serviceSheetGrabber} />
            <View style={styles.serviceSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceSheetEyebrow}>{categoryName.toUpperCase()}</Text>
                <Text style={styles.serviceSheetTitle}>
                  {isEditing ? 'Edit service' : 'New service'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { tapLight(); onClose(); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={accentColor} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 60 }}
              onLayout={(e) => { scrollViewHeight.current = e.nativeEvent.layout.height; }}
            >
              {/* Photos open the sheet. A service is picked off its picture
                  before its wording, so the field a provider is most likely to
                  skip sits where they can't scroll past it. */}
              <View style={styles.inputGroup}>
                <Text style={styles.serviceSheetSection}>Service Images</Text>
                <ServiceImageCarousel images={images} onAddImage={handleAddImage} onRemoveImage={handleRemoveImage} onToggleFit={handleToggleImageFit} onReorder={handleReorderImages} size={100} styles={styles} />
                <ServiceImageCropper
                  visible={pendingCropUris.length > 0}
                  uris={pendingCropUris}
                  onDone={handleCropperDone}
                  onCancel={() => setPendingCropUris([])}
                  palette={{
                    bg: chrome.surf(0.98),
                    card: chrome.surf(0.35),
                    text: chrome.fg(0.92),
                    sub: chrome.fg(0.55),
                    accent: accentColor,
                  }}
                />
                <Text style={styles.serviceSheetHint}>Add multiple images to showcase your service</Text>
              </View>

              {/* Service Name */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['name'] = e.nativeEvent.layout.y; }}>
                <RequiredLabel required labelStyle={styles.serviceSheetLabel} styles={styles}>Service Name</RequiredLabel>
                <TextInput style={[styles.serviceSheetInput, fieldBox]} value={name} onChangeText={setName} placeholder="e.g., Classic Lash Extensions" placeholderTextColor={chrome.fg(0.4)} onFocus={() => handleInputFocus('name')} />
              </View>

              {/* Price and duration share one row — they're the pair a provider
                  decides together, and reading them apart is what made pricing
                  a service feel like two separate decisions. Duration stays a
                  preset tap rather than a typed value: the field collapses to
                  the chosen preset and expands the chips full-width beneath the
                  row, so the chips keep their tap targets at half the width. */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['price'] = e.nativeEvent.layout.y; }}>
                <View style={styles.serviceSheetPairRow}>
                  <View style={styles.serviceSheetPairItem}>
                    <RequiredLabel required labelStyle={styles.serviceSheetLabel} styles={styles}>Price (£)</RequiredLabel>
                    <TextInput style={[styles.serviceSheetInput, fieldBox]} value={price} onChangeText={setPrice} placeholder="e.g., 55" placeholderTextColor={chrome.fg(0.4)} keyboardType="decimal-pad" onFocus={() => handleInputFocus('price')} />
                  </View>
                  <View style={styles.serviceSheetPairItem}>
                    <RequiredLabel required labelStyle={styles.serviceSheetLabel} styles={styles}>Duration</RequiredLabel>
                    <TouchableOpacity
                      style={[styles.serviceSheetInput, styles.serviceSheetSelect, fieldBox]}
                      onPress={() => { tapLight(); setDurationOpen(open => !open); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={duration ? `Duration, ${duration}` : 'Choose how long this service takes'}
                    >
                      <Text style={[styles.serviceSheetSelectText, !duration && { color: chrome.fg(0.4) }]} numberOfLines={1}>
                        {duration || 'Tap to choose'}
                      </Text>
                      <Ionicons name={durationOpen ? 'chevron-up' : 'chevron-down'} size={16} color={accentColor} />
                    </TouchableOpacity>
                  </View>
                </View>
                {durationOpen && (
                  <DurationPicker value={duration} onChange={(value) => { setDuration(value); if (value) setDurationOpen(false); }} accentColor={accentColor} styles={styles} />
                )}
              </View>

              {/* Description */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['serviceDescription'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.serviceSheetLabel}>Description</Text>
                <TextInput style={[styles.serviceSheetInput, styles.serviceSheetInputMultiline, fieldBox]} value={description} onChangeText={setDescription} placeholder="What's included, what to expect" placeholderTextColor={chrome.fg(0.4)} multiline numberOfLines={4} onFocus={() => handleInputFocus('serviceDescription')} />
              </View>

              {/* Buffer time before/after — overrides the account-wide default
                  set in Scheduling. Presets rather than typed minutes: these
                  pad the blocked span around every booking of this service, so
                  an arbitrary number (7 min, or a mistyped 300) quietly eats
                  slots the picker then can't offer. The options are derived
                  from the same BUFFER_OPTS that screen uses, so a service can't
                  be given a padding the account level doesn't offer. */}
              <View style={styles.inputGroup}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Buffer Time (optional)</Text>
                <Text style={styles.serviceSheetHint}>Blocks extra minutes around this service so back-to-back bookings can't crowd it. "My default" follows the buffer set in Scheduling; "None" turns it off for this service only.</Text>
                <View style={styles.serviceSheetPairRow}>
                  <View style={styles.serviceSheetPairItem}>
                    <Text style={styles.serviceSheetLabel}>Before</Text>
                    <TouchableOpacity
                      style={[styles.serviceSheetInput, styles.serviceSheetSelect, fieldBox]}
                      onPress={() => { tapLight(); setOpenBuffer(open => (open === 'before' ? null : 'before')); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Buffer before, ${bufferOptionLabel(bufferBefore, SERVICE_BUFFER_BEFORE_OPTS)}`}
                    >
                      <Text style={styles.serviceSheetSelectText} numberOfLines={1}>{bufferOptionLabel(bufferBefore, SERVICE_BUFFER_BEFORE_OPTS)}</Text>
                      <Ionicons name={openBuffer === 'before' ? 'chevron-up' : 'chevron-down'} size={16} color={accentColor} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.serviceSheetPairItem}>
                    <Text style={styles.serviceSheetLabel}>After</Text>
                    <TouchableOpacity
                      style={[styles.serviceSheetInput, styles.serviceSheetSelect, fieldBox]}
                      onPress={() => { tapLight(); setOpenBuffer(open => (open === 'after' ? null : 'after')); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Buffer after, ${bufferOptionLabel(bufferAfter, SERVICE_BUFFER_AFTER_OPTS)}`}
                    >
                      <Text style={styles.serviceSheetSelectText} numberOfLines={1}>{bufferOptionLabel(bufferAfter, SERVICE_BUFFER_AFTER_OPTS)}</Text>
                      <Ionicons name={openBuffer === 'after' ? 'chevron-up' : 'chevron-down'} size={16} color={accentColor} />
                    </TouchableOpacity>
                  </View>
                </View>
                {openBuffer === 'before' && (
                  <BufferPicker value={bufferBefore} onChange={(value) => { setBufferBefore(value); setOpenBuffer(null); }} options={SERVICE_BUFFER_BEFORE_OPTS} accentColor={accentColor} styles={styles} />
                )}
                {openBuffer === 'after' && (
                  <BufferPicker value={bufferAfter} onChange={(value) => { setBufferAfter(value); setOpenBuffer(null); }} options={SERVICE_BUFFER_AFTER_OPTS} accentColor={accentColor} styles={styles} />
                )}
              </View>

              {/* ── Service Type ─────────────────────────────────────── */}
              {/* Tag sections sit above the kind-specific blocks — these
                  describe what the service IS and are relevant to every
                  provider type, so they shouldn't be buried below
                  aesthetics-only fields most providers never see. */}
              <View style={styles.inputGroup}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Service Type</Text>
                <Text style={styles.serviceSheetHint}>Helps clients understand what kind of service this is</Text>
                <View style={styles.chipGrid}>
                  {SERVICE_TYPES.map(({ value, label }) => {
                    const active = serviceType === value;
                    return (
                      <TouchableOpacity key={value} style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => { tapSelect(); setServiceType(active ? '' : value); }}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Audience ─────────────────────────────────────────── */}
              {/* Who this specific service is for — distinct from the
                  provider-level Clientele setting (who the business serves at
                  all). A "Men's Haircut" and a "Kids' Haircut" living under
                  one Hair category need to say so per service so the app can
                  suggest/match better, not just at the business level. */}
              <View style={styles.inputGroup}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Who's This For?</Text>
                <Text style={styles.serviceSheetHint}>Helps the app suggest this service to the right clients</Text>
                <View style={styles.chipGrid}>
                  {SERVICE_AUDIENCE_OPTS.map(({ value, label }) => {
                    const active = audience === value;
                    return (
                      <TouchableOpacity key={value} style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => { tapSelect(); setAudience(active ? '' : value); }}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Style Tags ───────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Style / Vibe</Text>
                <Text style={styles.serviceSheetHint}>How would you describe this service's aesthetic?</Text>
                <TagSelectWithOther options={styleOptions} selected={selectedTags} onToggle={toggleTag(selectedTags, setSelectedTags)} onAddOther={(t) => setSelectedTags(selectedTags.includes(t) ? selectedTags : [...selectedTags, t])} accentColor={accentColor} styles={styles} />
              </View>

              {/* ── Occasion Tags ────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Best For (Occasion)</Text>
                <Text style={styles.serviceSheetHint}>When would a client typically book this?</Text>
                <TagSelectWithOther options={occasionOptions} selected={selectedOccasions} onToggle={toggleTag(selectedOccasions, setSelectedOccasions)} onAddOther={(t) => setSelectedOccasions(selectedOccasions.includes(t) ? selectedOccasions : [...selectedOccasions, t])} accentColor={accentColor} styles={styles} />
              </View>

              {/* ── Technique Tags ───────────────────────────────────── */}
              {techniquOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <View style={styles.serviceSheetSectionRule} />
                  <Text style={styles.serviceSheetSection}>Techniques Used</Text>
                  <Text style={styles.serviceSheetHint}>Select every technique this service involves</Text>
                  <TagSelectWithOther options={techniquOptions} selected={selectedTechniques} onToggle={toggleTag(selectedTechniques, setSelectedTechniques)} onAddOther={(t) => setSelectedTechniques(selectedTechniques.includes(t) ? selectedTechniques : [...selectedTechniques, t])} accentColor={accentColor} styles={styles} />
                </View>
              )}

              {/* ── Outcome Tags ─────────────────────────────────────── */}
              {outcomeOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <View style={styles.serviceSheetSectionRule} />
                  <Text style={styles.serviceSheetSection}>Results / Outcomes</Text>
                  <Text style={styles.serviceSheetHint}>What will the client achieve with this service?</Text>
                  <TagSelectWithOther options={outcomeOptions} selected={selectedOutcomes} onToggle={toggleTag(selectedOutcomes, setSelectedOutcomes)} onAddOther={(t) => setSelectedOutcomes(selectedOutcomes.includes(t) ? selectedOutcomes : [...selectedOutcomes, t])} accentColor={accentColor} styles={styles} />
                </View>
              )}

              {/* ── Trend Names ──────────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['trendInput'] = e.nativeEvent.layout.y; }}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Trend Names (Optional)</Text>
                <Text style={styles.serviceSheetHint}>Viral names clients search for — tap the {CATEGORY_META[catKey].label.toLowerCase()} ones that fit</Text>
                {trendNames.length > 0 && (
                  <View style={styles.chipGrid}>
                    {trendNames.map(t => (
                      <TouchableOpacity key={t} style={[styles.chip, { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => { tapSelect(); setTrendNames(trendNames.filter(x => x !== t)); }}>
                        <Text style={styles.chipTextActive}>{t} ×</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <TextInput style={[styles.serviceSheetInput, fieldBox, { flex: 1 }]} value={trendInput} onChangeText={setTrendInput} placeholder="e.g. glazed-donut" placeholderTextColor={chrome.fg(0.4)} onSubmitEditing={handleAddTrend} returnKeyType="done" onFocus={() => handleInputFocus('trendInput')} />
                  <TouchableOpacity style={styles.addAddOnButton} onPress={() => { tapMedium(); handleAddTrend(); }}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipGrid}>
                  {trendOptions.filter(t => !trendNames.includes(t)).map(t => (
                    <TouchableOpacity key={t} style={styles.chip} onPress={() => { tapSelect(); setTrendNames([...trendNames, t]); }}>
                      <Text style={styles.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* ── Suitable Hair Types (HAIR only) — lets clients tell at a
                   glance whether this service fits their hair type before
                   booking. Empty selection = suits all hair types. ────── */}
              {isHair && (
                <View style={styles.inputGroup}>
                  <View style={styles.serviceSheetSectionRule} />
                  <Text style={styles.serviceSheetSection}>Suitable Hair Types</Text>
                  <Text style={styles.serviceSheetHint}>Select which hair types this service suits — leave blank if it suits all</Text>
                  <ChipSelect options={HAIR_TYPES} selected={hairTypesSuitable} onToggle={toggleTag(hairTypesSuitable, setHairTypesSuitable)} accentColor={accentColor} styles={styles} />
                </View>
              )}

              {/* ── Aesthetics Safety Section (AESTHETICS only) — shown right
                   under the description, since this is what clients need to
                   see before booking a treatment ─────────────────────── */}
              {isAesthetics && (
                <View style={[styles.inputGroup, styles.safetyCard]}>
                  <Text style={styles.safetySectionTitle}>Treatment Safety</Text>
                  <Text style={styles.serviceSheetHint}>Required for aesthetic treatments — shown to clients under the service description</Text>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Patch Test Required</Text>
                      <Text style={styles.toggleHint}>Client must be patch tested before this treatment</Text>
                    </View>
                    <Switch value={patchTestRequired} onValueChange={v => { tapSelect(); setPatchTestRequired(v); }} trackColor={{ false: chrome.fg(0.1), true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Pregnancy Safe</Text>
                      <Text style={styles.toggleHint}>This treatment is safe during pregnancy</Text>
                    </View>
                    <Switch value={isPregnancySafe} onValueChange={v => { tapSelect(); setIsPregnancySafe(v); }} trackColor={{ false: chrome.fg(0.1), true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['minAge'] = e.nativeEvent.layout.y; }}>
                    <Text style={styles.serviceSheetLabel}>Minimum Age</Text>
                    <TextInput style={[styles.serviceSheetInput, fieldBox]} value={minAge} onChangeText={setMinAge} placeholder="e.g. 18" placeholderTextColor={chrome.fg(0.4)} keyboardType="number-pad" onFocus={() => handleInputFocus('minAge')} />
                  </View>

                  <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['contraindicationInput'] = e.nativeEvent.layout.y; }}>
                    <Text style={styles.serviceSheetLabel}>Contraindications</Text>
                    <Text style={styles.serviceSheetHint}>Conditions that prevent this treatment — type your own, or tap a common one below</Text>
                    {contraindications.length > 0 && (
                      <View style={styles.chipGrid}>
                        {contraindications.map(c => (
                          <TouchableOpacity key={c} style={[styles.chip, styles.chipWarning]} onPress={() => { tapSelect(); setContraindications(contraindications.filter(x => x !== c)); }}>
                            <Text style={styles.chipTextActive}>{c} ×</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <View style={styles.addAddOnRow}>
                      <TextInput style={[styles.serviceSheetInput, fieldBox, { flex: 1 }]} value={contraindicationInput} onChangeText={setContraindicationInput} placeholder="e.g. active eczema" placeholderTextColor={chrome.fg(0.4)} onSubmitEditing={handleAddContraindication} returnKeyType="done" onFocus={() => handleInputFocus('contraindicationInput')} />
                      <TouchableOpacity style={styles.addAddOnButton} onPress={() => { tapMedium(); handleAddContraindication(); }}>
                        <Text style={styles.addAddOnButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Starter suggestions — tailored to this service's treatment
                        kind (same catKey the style/technique/outcome tags use)
                        rather than one generic aesthetics-flavoured list shown
                        to every provider type. Below the textbox so typing
                        stays the primary action. */}
                    <View style={{ marginTop: 8 }}>
                      <ChipSelect
                        options={contraindicationOptions.filter(c => !contraindications.includes(c))}
                        selected={[]}
                        onToggle={(c) => setContraindications([...contraindications, c])}
                        accentColor={accentColor}
                        styles={styles}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ── Pregnancy safe toggle (non-aesthetics) ───────────── */}
              {!isAesthetics && (
                <View style={styles.inputGroup}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Pregnancy Safe</Text>
                      <Text style={styles.toggleHint}>This service is safe during pregnancy</Text>
                    </View>
                    <Switch value={isPregnancySafe} onValueChange={v => { tapSelect(); setIsPregnancySafe(v); }} trackColor={{ false: chrome.fg(0.1), true: '#9C27B0' }} thumbColor="#fff" />
                  </View>
                </View>
              )}

              {/* ── Aftercare Notes ──────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['aftercareNotes'] = e.nativeEvent.layout.y; }}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Aftercare Notes (Optional)</Text>
                <TextInput style={[styles.serviceSheetInput, styles.serviceSheetInputMultiline, fieldBox]} value={aftercareNotes} onChangeText={setAftercareNotes} placeholder="e.g. Avoid water for 24 hours, no oil-based products..." placeholderTextColor={chrome.fg(0.4)} multiline numberOfLines={3} onFocus={() => handleInputFocus('aftercareNotes')} />
              </View>

              {/* ── Add-Ons ──────────────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['newAddOnName'] = e.nativeEvent.layout.y; serviceInputPositions.current['newAddOnPrice'] = e.nativeEvent.layout.y; }}>
                <View style={styles.serviceSheetSectionRule} />
                <Text style={styles.serviceSheetSection}>Add-Ons (Optional)</Text>
                <Text style={styles.serviceSheetHint}>Optional extras clients can add to this service</Text>
                {addOns.length > 0 && (
                  <View style={styles.addOnsContainer}>
                    {addOns.map((addOn) => (
                      <View key={addOn.id} style={styles.addOnItem}>
                        <View style={styles.addOnInfo}>
                          <Text style={styles.addOnName}>{addOn.name}</Text>
                          <Text style={styles.addOnPrice}>+£{addOn.price}</Text>
                        </View>
                        <TouchableOpacity style={styles.removeAddOnButton} onPress={() => { tapWarn(); handleRemoveAddOn(addOn.id); }}>
                          <Text style={styles.removeAddOnText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <TextInput style={[styles.serviceSheetInput, styles.addOnNameInput, fieldBox]} value={newAddOnName} onChangeText={setNewAddOnName} placeholder="Add-on name" placeholderTextColor={chrome.fg(0.4)} onFocus={() => handleInputFocus('newAddOnName')} />
                  <TextInput style={[styles.serviceSheetInput, styles.addOnPriceInput, fieldBox]} value={newAddOnPrice} onChangeText={setNewAddOnPrice} placeholder="£" placeholderTextColor={chrome.fg(0.4)} keyboardType="decimal-pad" onFocus={() => handleInputFocus('newAddOnPrice')} />
                  <TouchableOpacity style={styles.addAddOnButton} onPress={() => { tapMedium(); handleAddAddOn(); }}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.serviceSheetFooter}>
              {error ? <Text style={styles.serviceSheetError}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.serviceSheetSave, { backgroundColor: accentColor }]}
                onPress={() => { tapMedium(); handleSave(); }}
                activeOpacity={0.85}
              >
                <Text style={styles.serviceSheetSaveText}>
                  {isEditing ? 'Save changes' : 'Add service'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </KeyboardDismissView>
    </Modal>
  );
};

// Add Category Modal — pick a type (drives smart suggestions) or name your own.
interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string, description: string) => void;
  existing: string[];
  /** The provider's own declared business type (providerData.providerService)
   *  — drives which subcategories are suggested, e.g. Aesthetics providers
   *  see "Lip Fillers" / "Botox", not a generic Hair/Nails/Lashes list. */
  businessKind?: string;
  accentColor?: string;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ visible, onClose, onAdd, existing, businessKind, accentColor = '#AF9197' }) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');

  const existingLower = existing.map(e => e.trim().toLowerCase());
  const isDuplicate = (name: string) => existingLower.includes(name.trim().toLowerCase());

  const myKind = (CATEGORY_KINDS as string[]).includes((businessKind ?? '').toUpperCase())
    ? (businessKind!.toUpperCase() as CategoryKind)
    : 'OTHER';
  const subcategories = SUBCATEGORY_SUGGESTIONS_BY_CATEGORY[myKind];
  // A real business type with its own subcategory list → show those instead
  // of the generic Hair/Nails/Lashes/etc grid.
  const showSubcategories = myKind !== 'OTHER' && subcategories.length > 0;

  // Tapping a suggestion fills the name + description fields rather than
  // adding immediately — the provider can still edit the description (or the
  // name) before confirming with the + button, same review-before-save
  // pattern as picking a service template.
  const pickSuggestion = (name: string, description: string) => {
    setCategoryName(name);
    setCategoryDescription(description);
  };

  const addCategory = (name: string, description: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    if (isDuplicate(trimmed)) {
      Alert.alert('Already Added', `You already have a "${trimmed}" category.`);
      return;
    }
    onAdd(trimmed, description.trim());
    setCategoryName('');
    setCategoryDescription('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint={chrome.blurTint} style={styles.templateSheet}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add a Category</Text>
                <Text style={styles.templateSheetSub}>
                  {showSubcategories
                    ? `Suggested for your ${CATEGORY_META[myKind].label} business — tap to fill in`
                    : "Pick a type — we'll suggest matching services & tags"}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => { tapLight(); onClose(); }}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.templateGroupLabel}>Category Name</Text>
              <Text style={styles.inputHint}>Type your own, or tap a suggestion below.</Text>
              <View style={styles.addAddOnRow}>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, { flex: 1 }]}>
                  <TextInput
                    style={styles.textInput}
                    value={categoryName}
                    onChangeText={setCategoryName}
                    placeholder={CATEGORY_NAME_EXAMPLE_BY_CATEGORY[myKind]}
                    placeholderTextColor={chrome.fg(0.4)}
                    onSubmitEditing={() => addCategory(categoryName, categoryDescription)}
                    returnKeyType="done"
                  />
                </BlurView>
                <TouchableOpacity style={[styles.addAddOnButton, { backgroundColor: accentColor }]} onPress={() => { tapMedium(); addCategory(categoryName, categoryDescription); }}>
                  <Text style={styles.addAddOnButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.templateGroupLabel, { marginTop: 18 }]}>Description</Text>
              <Text style={styles.inputHint}>Shown to clients under this category — what it includes and why they should book.</Text>
              <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.inputBlurMultiline, { marginTop: 8 }]}>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={categoryDescription}
                  onChangeText={setCategoryDescription}
                  placeholder="e.g. Cuts, colour and treatments tailored to your hair type."
                  placeholderTextColor={chrome.fg(0.4)}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </BlurView>

              {showSubcategories ? (
                <View style={styles.categoryTypeGrid}>
                  {subcategories.map(sub => {
                    const used = isDuplicate(sub.name);
                    return (
                      <TouchableOpacity
                        key={sub.name}
                        style={[styles.categoryTypeCard, used && styles.categoryTypeCardUsed]}
                        onPress={() => { tapSelect(); !used && pickSuggestion(sub.name, sub.description); }}
                        activeOpacity={used ? 1 : 0.85}
                        disabled={used}
                      >
                        <Text style={styles.categoryTypeLabel}>{sub.name}</Text>
                        <Text style={styles.categoryTypeBlurb} numberOfLines={2}>{used ? 'Added' : sub.description}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.categoryTypeGrid}>
                  {CATEGORY_KINDS.map(kind => {
                    const meta = CATEGORY_META[kind];
                    const used = isDuplicate(meta.label);
                    return (
                      <TouchableOpacity
                        key={kind}
                        style={[styles.categoryTypeCard, used && styles.categoryTypeCardUsed]}
                        onPress={() => { tapSelect(); !used && pickSuggestion(meta.label, meta.description); }}
                        activeOpacity={used ? 1 : 0.85}
                        disabled={used}
                      >
                        <Text style={styles.categoryTypeLabel}>{meta.label}</Text>
                        <Text style={styles.categoryTypeBlurb}>{used ? 'Added' : meta.blurb}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </BlurView>
      </View>
    </Modal>
  );
};

// Transfer Data Modal
interface TransferDataModalProps {
  visible: boolean;
  onClose: () => void;
  onTransfer: (url: string) => Promise<void>;
  onSkip: () => void;
}

const TransferDataModal: React.FC<TransferDataModalProps> = ({
  visible,
  onClose,
  onTransfer,
  onSkip,
}) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  const [acuityUrl, setAcuityUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const handleTransferPress = async () => {
    const trimmed = acuityUrl.trim();
    if (!trimmed) {
      setErrorMsg('Please paste your Acuity Scheduling link first.');
      return;
    }
    if (!trimmed.startsWith('http')) {
      setErrorMsg('Please paste the full URL starting with https://');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    setStatusMsg('Fetching your Acuity page…');
    try {
      setStatusMsg('Reading your services…');
      await onTransfer(trimmed);
    } catch (e: any) {
      setErrorMsg(toUserMessage(e, "We couldn't read that page. Check the link and try again.", 'InfoRegScreen.acuityTransfer'));
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={40} tint={chrome.blurTint} style={styles.transferModal}>
          <LinearGradient
            colors={[chrome.surf(0.9), chrome.surf(0.7)]}
            style={styles.transferGradient}
          />
          <Text style={styles.transferTitle}>Import from Acuity</Text>
          <Text style={styles.transferSubtitle}>
            Paste your Acuity Scheduling link and we'll automatically import your services, prices, and business info.
          </Text>

          <BlurView intensity={15} tint={chrome.blurTint} style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={acuityUrl}
              onChangeText={(text) => { setAcuityUrl(text); setErrorMsg(''); }}
              placeholder="https://acuityscheduling.com/schedule.php?owner=…"
              placeholderTextColor={chrome.fg(0.4)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isLoading}
            />
          </BlurView>

          {errorMsg ? (
            <Text style={styles.transferError}>{errorMsg}</Text>
          ) : null}

          {isLoading ? (
            <View style={styles.transferLoadingRow}>
              <ActivityIndicator size="small" color="#AF9197" />
              <Text style={styles.transferLoadingText}>{statusMsg}</Text>
            </View>
          ) : null}

          <View style={styles.transferButtons}>
            <TouchableOpacity
              style={[styles.transferButton, isLoading && { opacity: 0.5 }]}
              onPress={() => { tapSelect(); handleTransferPress(); }}
              disabled={isLoading}
            >
              <Text style={styles.transferButtonText}>
                {isLoading ? 'Importing…' : 'Import My Profile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={() => { tapLight(); onSkip(); }} disabled={isLoading}>
              <Text style={styles.skipButtonText}>Start Fresh Instead</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

// Edit Category Modal
interface EditCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (oldName: string, newName: string, description: string) => void;
  categoryName: string;
  categoryDescription: string;
}

const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  visible,
  onClose,
  onSave,
  categoryName,
  categoryDescription,
}) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  const [newName, setNewName] = useState(categoryName);
  const [description, setDescription] = useState(categoryDescription);

  React.useEffect(() => {
    setNewName(categoryName);
    setDescription(categoryDescription);
  }, [categoryName, categoryDescription]);

  const handleSave = () => {
    if (!newName.trim()) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    onSave(categoryName, newName.trim(), description.trim());
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardDismissView style={styles.modalOverlay} dismissOnTap>
        <BlurView intensity={30} tint={chrome.blurTint} style={styles.smallModal}>
          <Text style={styles.smallModalTitle}>Edit Category</Text>
          <Text style={styles.inputLabel}>Name</Text>
          <BlurView intensity={15} tint={chrome.blurTint} style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Category name"
              placeholderTextColor={chrome.fg(0.4)}
              autoFocus
            />
          </BlurView>
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Description (shown to clients)</Text>
          <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.inputBlurMultiline]}>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="What's included in this category, and why clients should book it..."
              placeholderTextColor={chrome.fg(0.4)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </BlurView>
          <View style={styles.smallModalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { tapLight(); onClose(); }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={() => { tapMedium(); handleSave(); }}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardDismissView>
    </Modal>
  );
};

// Preview Modal — mirrors the live ProviderProfileScreen: same theme resolution,
// typography, and section set (including Portfolio), so what a provider sees
// here is what a client actually sees. Rebuilt whenever that screen changes.
//
// `portfolio` is the WORK gallery only. Venue shots arrive separately and
// render in their own block below it, because that is where a client meets
// them on the real profile (inside Additional Information) — feeding the
// masonry the raw portfolio_items list would show the provider a Portfolio
// grid no client ever sees.
interface PreviewModalProps {
  visible: boolean;
  onClose: () => void;
  providerData: ProviderRegistrationData;
  accentColor: string;
  portfolio: DbPortfolioItem[];
  venuePhotos: DbPortfolioItem[];
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  onClose,
  providerData,
  accentColor,
  portfolio,
  venuePhotos,
}) => {
  const styles = useScreenStyles();
  const chrome = useChrome();
  const insets = useSafeAreaInsets();
  const { width: previewScreenWidth } = useWindowDimensions();
  // SafeAreaView top inset is unreliable inside an RN Modal, so pad the header
  // by the real window inset directly to keep the PREVIEW badge clear of the
  // translucent status bar rather than riding up into it.
  const previewTopPad = insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44;
  const categoryNames = Object.keys(providerData.categories);
  const [selectedPreviewCategory, setSelectedPreviewCategory] = useState<string>(
    categoryNames[0] || ''
  );
  const [showFullAbout, setShowFullAbout] = useState(false);

  // Update selected category when categories change
  React.useEffect(() => {
    if (categoryNames.length > 0 && !categoryNames.includes(selectedPreviewCategory)) {
      setSelectedPreviewCategory(categoryNames[0] || '');
    }
  }, [categoryNames, selectedPreviewCategory]);

  // Mock rating for preview — this is a template/showcase view, not a live
  // reflection of the provider's real current reviews, so the hero rating
  // row stays a mock 5.0 rather than `providerData.rating`, and the Reviews
  // card below always renders (matching ProviderProfileScreen) but
  // deliberately shows no review data.
  const mockRating = 5.0;
  const PP = resolveProviderTheme(providerData.profileTheme);
  const cardBg = withAlpha(PP.card, PP.isDark ? 0.5 : 0.9);
  const cardBlurTint = PP.isDark ? ('dark' as const) : ('light' as const);
  const cardBlurIntensity = PP.isDark ? 35 : 25;
  const cardHighlightColors = (
    PP.isDark
      ? ['rgba(255,255,255,0.08)', 'transparent']
      : ['rgba(255,255,255,0.3)', 'transparent']
  ) as [string, string];
  // Mirror ProviderProfileScreen's hero logic EXACTLY for visual parity — see
  // ProviderMyProfileScreen.tsx for the same derivation with more detail.
  const heroBgColor = providerData.hasCustomGradient ? providerData.gradient[0] : PP.hero;
  const heroIsDark = !!providerData.backgroundImage || isDarkColor(heroBgColor ?? PP.hero);
  const heroText = heroIsDark ? '#fff' : '#26201E';
  const heroSub = heroIsDark ? 'rgba(255,255,255,0.96)' : 'rgba(38,32,30,0.78)';

  // Pinterest-style two-column masonry — same "deal into whichever column is
  // shorter" layout as ProviderProfileScreen's portfolio grid.
  const PREVIEW_PORTFOLIO_COL_W = (previewScreenWidth - 40 - 12) / 2;
  const portfolioColumns = useMemo(() => {
    const cols: (DbPortfolioItem & { tileHeight: number })[][] = [[], []];
    const colHeights = [0, 0];
    portfolio.forEach(item => {
      const ratio = item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
      const tileHeight = Math.min(Math.max(PREVIEW_PORTFOLIO_COL_W / ratio, 140), 300);
      const target = colHeights[0]! <= colHeights[1]! ? 0 : 1;
      cols[target]!.push({ ...item, tileHeight });
      colHeights[target]! += tileHeight + 12;
    });
    return cols;
  }, [portfolio, PREVIEW_PORTFOLIO_COL_W]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={[styles.previewContainer, { backgroundColor: PP.bg }]}>
        {/* Hero photo/gradient backdrop — mirror ProviderProfileScreen: a real
            cover photo (with a dark gradient overlay for legible text) when
            set via Branding, else the full custom gradient or the resolved
            theme's [hero → bg] for preset themes. */}
        {providerData.backgroundImage ? (
          <>
            <Image
              source={{ uri: providerData.backgroundImage }}
              style={[styles.previewHeroImage, { opacity: 0.88 }]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.18)', 'transparent']}
              locations={[0, 0.35, 0.62]}
              style={styles.previewHeroImage}
            />
          </>
        ) : (
          <LinearGradient
            colors={providerData.hasCustomGradient ? providerData.gradient : [PP.hero, PP.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.previewHeroImage}
          />
        )}
        <SafeAreaView style={styles.previewSafeArea} edges={['bottom']}>
          {/* Preview Header with back button */}
          <View style={[styles.previewHeader, { paddingTop: previewTopPad + 8 }]}>
            <TouchableOpacity style={styles.previewBackButton} onPress={() => { tapLight(); onClose(); }}>
              <Text style={styles.previewBackText}>←</Text>
            </TouchableOpacity>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>PREVIEW</Text>
            </View>
          </View>

          <ScrollView
            style={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.previewScrollContentContainer}
          >
            {/* Logo + profile info — floats directly over the hero photo/gradient */}
            <View style={styles.previewLogoContainer}>
              <View style={styles.previewLogoWrapper}>
                {providerData.logo ? (
                  <Image
                    source={{ uri: providerData.logo }}
                    style={styles.previewProviderLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.previewProviderLogo, { backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                      {(providerData.providerName || 'Y B')
                        .split(' ')
                        .map(w => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <LinearGradient
                  colors={[chrome.surf(0.3), 'transparent']}
                  style={styles.previewLogoGloss}
                />
              </View>
            </View>

            {/* Provider Info - Centered like ProviderProfileScreen */}
            <View style={styles.previewProviderInfoCenter}>
              <View style={styles.previewProviderNameRow}>
                <Text style={[styles.previewProviderNameLarge, { color: heroText }, heroIsDark && styles.previewHeroTextShadow]}>
                  {providerData.providerName || 'Your Business Name'}
                </Text>
                {providerData.isVerified && (
                  <Ionicons name="checkmark-circle" size={18} color={heroIsDark ? '#FFFFFF' : '#007AFF'} />
                )}
              </View>

              <Text style={[styles.previewMetaText, { color: heroSub }, heroIsDark && styles.previewHeroTextShadow]}>
                {(providerData.providerService === 'OTHER'
                  ? providerData.customServiceType || 'SERVICE'
                  : providerData.providerService
                ).toUpperCase()}
                {providerData.location ? ` · ${providerData.location.toUpperCase()}` : ''}
              </Text>

              {/* Rating */}
              <View style={styles.previewRatingContainer}>
                <View style={styles.previewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Text key={star} style={styles.previewStar}>★</Text>
                  ))}
                </View>
                <Text style={[styles.previewRatingText, { color: heroText }, heroIsDark && styles.previewHeroTextShadow]}>{mockRating}</Text>
              </View>

              {providerData.yearsExperience ? (
                <Text style={[styles.previewYearsText, { color: heroSub }, heroIsDark && styles.previewHeroTextShadow]}>{providerData.yearsExperience} years experience</Text>
              ) : null}

              {/* Slots with Bell */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[styles.previewSlotsPill, { backgroundColor: cardBg, borderColor: PP.border }]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.previewSlotsCardHighlight}
                />
                {/* Mirrors the computed pill on the real client-facing
                    profile — same scheduleReleaseDay source, so the preview
                    never shows text the live screen wouldn't. */}
                <Text style={[styles.previewSlotsText, { color: PP.sub }]}>
                  {providerData.scheduleReleaseDay != null
                    ? `Slots out every ${ordinalSuffix(providerData.scheduleReleaseDay)} of the month`
                    : "Set a release day below"}
                </Text>
                <View style={styles.previewBellButtonInline}>
                  <BellIcon size={16} color={PP.sub} />
                </View>
              </BlurView>
            </View>

            {/* The content sheet rises over the hero photo with its own large
                top corners — same floating-card-over-photo composition as
                ProviderProfileScreen. */}
            <View style={[styles.previewContentSheet, { backgroundColor: PP.bg }]}>
            <View style={[styles.previewContentSheetClip, { backgroundColor: PP.bg }]}>
              {/* About card — the Policy tab that used to live here moved out
                  to Business Profile → Policies along with editing, so this
                  preview no longer shows or depends on any policy state. */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[styles.previewCard, { backgroundColor: cardBg, borderColor: PP.border }]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.previewCardHighlight}
                />
                <Text style={[styles.previewSectionTitle, { color: PP.text }]}>About</Text>
                <Text style={[styles.previewAboutText, { color: PP.sub }]}>
                  {showFullAbout
                    ? providerData.aboutText || 'Your business description will appear here...'
                    : `${(providerData.aboutText || 'Your business description will appear here...').substring(0, 150)}...`}
                </Text>
                <TouchableOpacity
                  onPress={() => { tapSelect(); setShowFullAbout(!showFullAbout); }}
                  style={styles.previewMoreButton}
                >
                  <Text style={[styles.previewMoreButtonText, { color: PP.text }]}>
                    {showFullAbout ? 'Show Less' : 'More'}
                  </Text>
                </TouchableOpacity>
              </BlurView>

              {/* Services Section */}
              {categoryNames.length > 0 && (
                <View style={styles.previewServicesSection}>
                  <Text style={[styles.previewSectionTitleNoCard, { color: PP.text }]}>Services</Text>

                  {/* Category Tabs — shared frosted-glass pill, same as clients see */}
                  <FlatList
                    data={categoryNames}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.previewCategoryTabs}
                    keyExtractor={(item, index) => `preview-cat-${item}-${index}`}
                    renderItem={({ item }) => (
                      <CategoryTabPill
                        category={item}
                        isSelected={selectedPreviewCategory === item}
                        onPress={() => { tapSelect(); setSelectedPreviewCategory(item); }}
                        cardBg={selectedPreviewCategory === item ? accentColor : cardBg}
                        blurIntensity={cardBlurIntensity}
                        blurTint={cardBlurTint}
                        borderColor={selectedPreviewCategory === item ? 'transparent' : PP.border}
                        textColor={selectedPreviewCategory === item ? '#fff' : PP.text}
                      />
                    )}
                    contentContainerStyle={styles.previewCategoryTabsContent}
                  />

                  {/* Selected category's client-facing description */}
                  {providerData.categoryDescriptions?.[selectedPreviewCategory] ? (
                    <Text style={[styles.previewSelectedCategoryDescription, { color: PP.sub }]}>
                      {providerData.categoryDescriptions[selectedPreviewCategory]}
                    </Text>
                  ) : null}

                  {/* Services List */}
                  <View style={styles.previewCategoryServicesContainer}>
                    {providerData.categories[selectedPreviewCategory]?.map((service) => (
                      <BlurView
                        key={service.id}
                        intensity={cardBlurIntensity}
                        tint={cardBlurTint}
                        style={[styles.previewServiceItemCard, { backgroundColor: cardBg, borderColor: PP.border }]}
                      >
                        <LinearGradient
                          colors={cardHighlightColors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.previewCardHighlight}
                        />
                        <View style={styles.previewServiceItemRow}>
                          {/* Service Image — accent-tinted initial when no photo, so
                              description text starts at the same x on every card */}
                          {service.images && service.images.length > 0 ? (
                            <Image
                              source={{ uri: service.images[0]?.uri }}
                              style={styles.previewServiceImage}
                              resizeMode="cover"
                              fadeDuration={0}
                            />
                          ) : (
                            <View style={[styles.previewServiceImagePlaceholder, { backgroundColor: accentColor + '1C' }]}>
                              <Text style={[styles.previewServiceImagePlaceholderText, { color: accentColor }]}>
                                {(service.name || '?').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}

                          <View style={styles.previewServiceItemInfo}>
                            <Text style={[styles.previewServiceItemName, { color: PP.text }]}>{service.name}</Text>
                            <Text style={[styles.previewServiceItemDesc, { color: PP.sub }]} numberOfLines={2}>
                              {service.description}
                            </Text>
                            <View style={styles.previewServiceItemDetails}>
                              <Text style={[styles.previewServiceItemDuration, { color: PP.sub }]}>{service.duration}</Text>
                              <Text style={[styles.previewServiceItemPrice, { color: PP.text }]}>
                                £{service.price}
                              </Text>
                            </View>
                          </View>

                          {/* Book Button — decorative here (this is a preview of
                              the client view, not an editable live control) */}
                          <View style={[styles.previewBookButton, { backgroundColor: accentColor }]}>
                            <Text style={styles.previewBookButtonText}>Book</Text>
                          </View>
                        </View>

                        {/* Add-ons preview */}
                        {service.addOns && service.addOns.length > 0 && (
                          <View style={[styles.previewServiceAddOns, { borderTopColor: PP.border }]}>
                            <Text style={[styles.previewAddOnsLabel, { color: PP.sub }]}>Add-ons available:</Text>
                            {service.addOns.map((addOn) => (
                              <View key={addOn.id} style={styles.previewAddOnRow}>
                                <Text style={[styles.previewAddOnName, { color: PP.sub }]}>+ {addOn.name}</Text>
                                <Text style={[styles.previewAddOnPrice, { color: accentColor }]}>
                                  +£{addOn.price}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </BlurView>
                    ))}
                  </View>
                </View>
              )}

              {/* Reviews — this is a template/showcase view, not a live reflection
                  of real reviews, so the card always shows (matching
                  ProviderProfileScreen) but deliberately stays empty. */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[styles.previewCard, { backgroundColor: cardBg, borderColor: PP.border }]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.previewCardHighlight}
                />
                <Text style={[styles.previewSectionTitle, { color: PP.text }]}>Reviews</Text>
              </BlurView>

              {/* Contact Section */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[styles.previewCard, { backgroundColor: cardBg, borderColor: PP.border }]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.previewCardHighlight}
                />
                <Text style={[styles.previewSectionTitle, { color: PP.text }]}>Contact</Text>
                {providerData.location ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Location</Text>
                    <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>{providerData.location}</Text>
                  </View>
                ) : null}
                {providerData.phone ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Phone</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Message ›</Text>
                  </View>
                ) : null}
                {providerData.whatsapp ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>WhatsApp</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Open ›</Text>
                  </View>
                ) : null}
                {providerData.email ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Email</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Send ›</Text>
                  </View>
                ) : null}
                {providerData.instagram ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Instagram</Text>
                    <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>@{providerData.instagram} ›</Text>
                  </View>
                ) : null}
                {providerData.website ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Website</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Visit ›</Text>
                  </View>
                ) : null}
                {providerData.externalBookingUrl ? (
                  <View style={styles.previewContactRow}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Booking Link</Text>
                    <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>{providerData.externalBookingUrl}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.previewContactButton, { backgroundColor: accentColor }]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.previewContactButtonText}>Get In Touch</Text>
                </TouchableOpacity>
              </BlurView>

              {/* Portfolio Section — Pinterest-style two-column masonry, matching ProviderProfileScreen */}
              {portfolio.length > 0 && (
                <View style={styles.previewPortfolioSection}>
                  <Text style={[styles.previewSectionTitleNoCard, { color: PP.text, paddingHorizontal: 0 }]}>Portfolio</Text>
                  <View style={styles.previewPortfolioColumns}>
                    {portfolioColumns.map((column, colIdx) => (
                      <View key={`preview-pcol-${colIdx}`} style={styles.previewPortfolioColumn}>
                        {column.map(item => (
                          <View key={item.id} style={styles.previewPortfolioTile}>
                            <Image
                              source={{ uri: item.image_url }}
                              style={{ width: '100%', height: item.tileHeight }}
                              resizeMode="cover"
                              fadeDuration={0}
                            />
                            {item.caption ? (
                              <View style={styles.previewPortfolioCaptionWrap}>
                                <Text style={styles.previewPortfolioCaption} numberOfLines={1}>{item.caption}</Text>
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Venue — a horizontal strip under its own label, matching
                  ProviderAdditionalInfoSection's "Venue" block on the real
                  profile. Kept out of the masonry above so the preview shows
                  the provider where these photos actually land. */}
              {venuePhotos.length > 0 && (
                <View style={styles.previewPortfolioSection}>
                  <Text style={[styles.previewSectionTitleNoCard, { color: PP.text, paddingHorizontal: 0 }]}>Venue</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.previewVenueStrip}
                  >
                    {venuePhotos.map(item => (
                      <View key={item.id} style={styles.previewVenueTile}>
                        <Image
                          source={{ uri: item.image_url }}
                          style={styles.previewVenueImage}
                          resizeMode="cover"
                          fadeDuration={0}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

// Main Component
const InfoRegScreen: React.FC<InfoRegScreenProps> = ({ navigation }) => {
  // This screen always renders in light mode regardless of the app's dark
  // mode setting (see useScreenStyles/useChrome above) — nothing in this file
  // reads useTheme().isDarkMode or branches on the device/app appearance.
  // statusBarStyle mirrors what useTheme()'s legacy `theme.statusBar` would
  // be in light mode.
  const statusBarStyle = 'dark-content' as const;
  const styles = useScreenStyles();
  const chrome = useChrome();
  // Header/inline icons can't read a StyleSheet colour, so they take the same
  // palette token the sheet above is built from.
  const chromeText = lightTheme.text;
  const { user } = useAuth();

  // Read from the ROOT provider (App.tsx), deliberately not the nested
  // <SafeAreaProvider> this screen renders further down: this hook call sits
  // *above* that provider in the tree, so it still sees real window insets.
  //
  // Why the nested provider can't be trusted for the top inset here: it mounts
  // a native RNCSafeAreaProvider view and reports *that view's* own
  // safeAreaInsets, not the window's. Under `presentation: 'fullScreenModal'`
  // the modal's UIViewController can have the status-bar area already consumed
  // by the presentation container, so the nested view measures top ≈ 0 and
  // SafeAreaView edges={['top']} adds no padding at all — which is exactly why
  // the header's back/eye buttons rode up under the status bar. Same reason
  // DevSettingsScreen (another fullScreenModal) pads manually.
  const insets = useSafeAreaInsets();
  const topInset =
    insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44;
  // Bottom padding for both pinned bars. Only the home-indicator inset is
  // needed (with a small floor on devices that report none) — NOT the pill's
  // FLOATING_TAB_BAR_CLEARANCE, because the effect below hides the pill
  // outright while this editor is open. Padding the bars for a pill that isn't
  // there would just strand them above a band of empty space.
  const pinnedBarBottomPad = Math.max(insets.bottom, 12);

  // Hide the floating pill for as long as this editor is open. This is the
  // real fix for the pinned bars being covered, not a zIndex bump: the pill is
  // the Tab.Navigator's `tabBar`, rendered as a SIBLING of the tab screens and
  // painted after them. `EditProfile` is registered inside ProviderHomeNavigator,
  // a stack *nested within* one of those tab screens — so everything this screen
  // renders, fullScreenModal included, is a descendant of the very view the pill
  // is layered on top of. No zIndex/elevation set from in here can lift a child
  // above its own ancestor's later-painted sibling, which is why the pinned bars
  // stayed covered however high they were raised.
  //
  // Same mechanism ProviderProfileScreen uses (see its comment); IslandPillTabBar
  // already reads this option off the focused tab's route. Cleanup restores the
  // pill on blur so this screen's hidden state never leaks onto the next one.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [isFocused, navigation]);

  // Refresh the "Your Terms & Conditions" card label whenever this screen
  // regains focus — the provider may have just come back from writing them in
  // the ProviderIntakeForm builder. Failure leaves it null (card shows the
  // neutral label), never throws.
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    hasMyProviderTermsForm()
      .then(has => { if (!cancelled) setHasOwnTerms(has); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFocused]);

  // Ref for main scrollview to enable auto-scroll to focused inputs
  const mainScrollViewRef = useRef<ScrollView>(null);

  // ── Auto-scroll to the focused field ──────────────────────────────────
  // Each registered field keeps a handle to its own wrapper View, and the
  // position is MEASURED at focus time via measureLayout against the
  // ScrollView's inner content node. That yields the field's true offset
  // within the scroll content regardless of how deeply it's nested.
  //
  // This deliberately replaces the previous scheme, which stored a local
  // `e.nativeEvent.layout.y` from onLayout plus a per-field hardcoded fudge
  // constant (+150/+200/+500/+700/+750/+800/+850/+875/+900 …). Those
  // constants existed only to hand-compensate for the fact that, when one
  // section rendered at a time, a field's local layout.y was not its page
  // position. In a single continuous document every one of them would be
  // wrong at once — and wrong silently, scrolling to the wrong place rather
  // than erroring. Measuring removes the guesswork entirely: there is no
  // magic number left to keep in sync when the layout changes.
  const fieldNodes = useRef<Record<string, View | null>>({});
  const scrollContentRef = useRef<View>(null);

  const registerField = useCallback(
    (name: string) => (node: View | null) => { fieldNodes.current[name] = node; },
    [],
  );

  // Keeps the focused field clear of the keyboard without slamming it to the
  // very top of the viewport.
  const FOCUS_SCROLL_MARGIN = 120;

  const handleInputFocus = useCallback((inputName: string) => {
    const node = fieldNodes.current[inputName];
    const content = scrollContentRef.current;
    const scroller = mainScrollViewRef.current;
    if (!node || !content || !scroller) return;
    // Deferred a beat so the measurement happens after the keyboard-driven
    // layout settles, same reason the previous implementation waited.
    setTimeout(() => {
      // RN 0.81's measureLayout takes a HostInstance directly as the
      // relativeTo target (the numeric node handle form is the deprecated
      // one), so the content View's ref can be passed straight through.
      node.measureLayout(
        content,
        (_x, y) => {
          scroller.scrollTo({ y: Math.max(0, y - FOCUS_SCROLL_MARGIN), animated: true });
        },
        () => { /* node unmounted mid-measure — nothing to scroll to */ },
      );
    }, 300);
  }, []);

  // Form state
  const [providerData, setProviderData] = useState<ProviderRegistrationData>({
    providerName: '',
    providerService: 'HAIR',
    customServiceType: '',
    location: '',
    aboutText: '',
    scheduleReleaseDay: null,
    gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    hasCustomGradient: false,
    accentColor: '#7B1FA2',
    profileTheme: 'app',
    logo: null,
    categories: {},
    categoryDescriptions: {},
    phone: '',
    email: '',
    instagram: '',
    website: '',
    whatsapp: '',
    preferredContactMethods: ['in_app'],
    externalBookingUrl: '',
    yearsExperience: '',
    businessType: '',
    teamSize: '',
    accessibilityNotes: '',
    termsAcceptedAt: null,
    languagesSpoken: [],
    priceRange: '',
    serviceLocations: [],
    preferredPaymentMethods: [],
    fullAddress: '',
    fullAddressCoordinates: null,
    addressReleasePolicy: 'on_confirmation',
    backgroundImage: null,
    isVerified: false,
    rating: 0,
    bookingPolicies: null,
    cancellationNoticeHours: 0,
  });

  const [isEditMode, setIsEditMode] = useState(false);
  // Which section the reader is currently inside, for the scrollspy rail only.
  // Purely presentational: nothing gates on it, nothing renders conditionally
  // on it, and it never affects what's reachable. Every section is always
  // mounted, so unsaved edits can't be lost by scrolling.
  const [activeSpySection, setActiveSpySection] = useState<EditorSectionKey>(FIRST_EDITOR_SECTION);
  const [releaseDayPickerVisible, setReleaseDayPickerVisible] = useState(false);
  // Loaded/round-tripped, never edited here — Cancellation, Reschedule,
  // Deposit, No-show, Refund, Booking Instructions and the Policy Image all
  // moved to Business Profile → Policies. handleSubmit still writes this
  // blob back unchanged on every save so publishing never clobbers whatever
  // is currently saved in booking_policies. policiesLoaded gates that
  // write — see the load effect below for why.
  const [policies, setPolicies] = useState<ProviderPolicies>(DEFAULT_POLICIES);
  const [policiesLoaded, setPoliciesLoaded] = useState(false);

  // True until the existing-provider fetch settles — without this the form
  // renders with empty defaults ('Provider Registration', blank fields, the
  // 'app' theme) for a beat before the real saved data pops in, which reads
  // as a glitch. Gated in the render below, same as the other profile screens.
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);

  // Set when a pending "claim your business" code (from ClaimProviderScreen)
  // fails to confirm here — expired, already used, or wrong by the time the
  // signup wizard finished. Surfaced as a banner below so the provider isn't
  // left with a silently-blank, unclaimed profile and no explanation.
  const [claimError, setClaimError] = useState<string | null>(null);

  // Load existing provider data and policies from Supabase/AsyncStorage on mount
  useEffect(() => {
    if (!user?.id) { setIsLoadingProvider(false); return; }
    // If this account just came through the "claim your business" flow
    // (ClaimProviderScreen), attach it to the unclaimed row *before* loading
    // provider data below — once claimed, that same loadProviderFromSupabase
    // call picks up every scraped field (services included) for free, no
    // separate prefill path needed. Best-effort: an expired/already-used
    // code just means the provider sets up their profile from scratch.
    getPendingClaim()
      .then(pending => {
        if (!pending) return;
        return claimProviderProfile(pending.providerId, pending.code)
          .catch(err => {
            logger.warn('claimProviderProfile failed:', err?.message ?? err);
            setClaimError(
              "We couldn't confirm your business claim — the code may have expired or been entered wrong. " +
              'You can retry from Settings, or just continue setting up your profile below.'
            );
          })
          .finally(() => clearPendingClaim());
      })
      .catch(() => {})
      .finally(() => {
        loadProviderFromSupabase(user.id)
          .then(data => {
            if (data) {
              setProviderData(data);
              setIsEditMode(true);
              // Being in edit mode means this profile was published, which
              // required agreeing. Seed the real state rather than faking a
              // tick in the render — a box that draws checked but holds false
              // does nothing on the first tap and looks broken.
              setTermsAccepted(true);
              const firstCat = Object.keys(data.categories)[0];
              if (firstCat) setSelectedCategory(firstCat);
              // A contact field that exists elsewhere should already be in the
              // box, not blank with a note telling you where to go and type it.
              // The signup prefill below only runs on the very first save, so
              // an existing provider who never set an enquiry address saw an
              // empty field even though their business email was on file.
              if (!data.email) {
                getUserBusinessInfo(user.id)
                  .then(info => {
                    const businessEmail = info?.business_email;
                    if (!businessEmail) return;
                    setProviderData(prev => (prev.email ? prev : { ...prev, email: businessEmail }));
                  })
                  .catch(() => {});
              }
              return;
            }
            // No providers row yet — this is the first save. Prefill from
            // what the 5-step signup already collected (users table) instead
            // of starting blank, so the provider isn't retyping their own
            // business name/contact details from scratch.
            return getUserSignupPrefillInfo(user.id)
              .then(prefill => {
                if (!prefill) return;
                const validBusinessTypes: ProviderRegistrationData['businessType'][] = BUSINESS_TYPE_OPTS.map(o => o.value);
                const prefilledBusinessType = validBusinessTypes.find(v => v === prefill.business_type);
                const validTeamSizes: ProviderRegistrationData['teamSize'][] = ['solo', 'small_team', 'large_team'];
                const prefilledTeamSize = validTeamSizes.find(v => v === prefill.team_size);
                const validPriceRanges: ProviderRegistrationData['priceRange'][] = ['budget', 'mid', 'premium', 'luxury'];
                const prefilledPriceRange = validPriceRanges.find(v => v === prefill.price_range);
                setProviderData(prev => ({
                  ...prev,
                  providerName: prev.providerName || prefill.business_name || prefill.name || '',
                  phone: prev.phone || prefill.business_phone || prefill.phone || '',
                  email: prev.email || prefill.business_email || '',
                  instagram: prev.instagram || prefill.instagram || '',
                  website: prev.website || prefill.website || '',
                  businessType: prev.businessType || prefilledBusinessType || '',
                  teamSize: prev.teamSize || prefilledTeamSize || '',
                  accessibilityNotes: prev.accessibilityNotes || prefill.accessibility_notes || '',
                  languagesSpoken: prev.languagesSpoken.length ? prev.languagesSpoken : (prefill.languages_spoken ?? []),
                  priceRange: prev.priceRange || prefilledPriceRange || '',
                  // Round-trip only — this screen neither shows nor owns contact
                  // channels (Communications does). It's carried purely because
                  // saveProviderToSupabase writes preferred_contact_methods on
                  // every save, so dropping it here would reset the provider's
                  // Communications toggles to ['in_app'] whenever they edit
                  // anything in InfoReg.
                  preferredContactMethods: (prev.preferredContactMethods.length && prev.preferredContactMethods[0] !== 'in_app')
                    ? prev.preferredContactMethods
                    : (prefill.preferred_contact_methods?.length ? prefill.preferred_contact_methods : prev.preferredContactMethods),
                  serviceLocations: prev.serviceLocations.length ? prev.serviceLocations : (prefill.service_locations ?? []),
                  preferredPaymentMethods: prev.preferredPaymentMethods.length ? prev.preferredPaymentMethods : (prefill.preferred_payment_methods ?? []),
                }));
              })
              .catch(() => {});
          })
          .catch(() => {})
          .finally(() => setIsLoadingProvider(false));
      });
    // Load saved policies from Supabase, the only source of truth — the
    // device-local cache this used to fall back to was removed, because a
    // stale copy round-tripped back through a save could revert settings
    // changed on another device. Merge over defaults so fields added later
    // (e.g. bookingInstructions) are never undefined.
    loadProviderPolicies(user.id)
      .then(saved => {
        if (!saved) { setPoliciesLoaded(true); return; }
        // Verbatim round-trip — this screen edits no policy field, so every
        // key (the deposit ones PaymentsScreen owns included) is carried back
        // exactly as loaded. The old `depositOnly: merged.depositRequired`
        // collapse that used to sit here would now silently rewrite a
        // provider's "deposit optional" choice into "deposit required" on any
        // profile save, since depositOnly is no longer a mirror of
        // depositRequired.
        setPolicies({ ...DEFAULT_POLICIES, ...(saved as Partial<ProviderPolicies>) });
        setPoliciesLoaded(true);
      })
      // Deliberately leaves policiesLoaded false on failure — this screen no
      // longer edits any policy field (moved to PoliciesScreen), but
      // handleSubmit still round-trips this blob back to booking_policies on
      // every save. Writing it back while still at DEFAULT_POLICIES (never
      // successfully loaded) would silently overwrite a provider's real
      // cancellation/deposit/refund/no-show settings with defaults —
      // handleSubmit skips that write until this flag is true.
      .catch(() => {});
  }, [user?.id]);

  // ── Portfolio (client work gallery shown on the public profile) ───────────
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<DbPortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [venuePhotoUploading, setVenuePhotoUploading] = useState(false);
  // Address/venue photos live in the same portfolio_items table and list as
  // gallery photos, distinguished only by their category — a filtered view
  // over portfolioItems, not a separate data source. They are NOT portfolio
  // photos anywhere they're rendered, though: on the client's profile they
  // sit inside Additional Information, and Explore excludes them entirely,
  // so the two grids below (and every count taken off them) are fed by the
  // two halves of this split rather than by the raw list.
  const { work: workPhotos, venue: venuePhotos } = useMemo(
    () => splitPortfolioByKind(portfolioItems),
    [portfolioItems]
  );

  useEffect(() => {
    if (!user?.id) { setPortfolioLoading(false); return; }
    getProviderIdForUserId(user.id)
      .then(id => {
        if (id) setProviderDbId(id);
        else setPortfolioLoading(false); // no provider row yet — nothing to fetch
      })
      .catch(() => { setPortfolioLoading(false); });
  }, [user?.id, isEditMode]);

  useEffect(() => {
    if (!providerDbId) return;
    // getProviderPortfolio depends on providerDbId resolving first (a second
    // async hop after the main provider-data load), so it can still lag a
    // moment behind the loading gate above — track it separately so the
    // Portfolio card shows a spinner instead of a bare "no photos yet" flash.
    setPortfolioLoading(true);
    // includeVenue: the Address step's grid is where venue shots are managed,
    // so this screen is the other caller that needs both halves.
    getProviderPortfolio(providerDbId, { includeVenue: true })
      .then(({ work, venue }) => setPortfolioItems([...work, ...venue]))
      .catch(() => {})
      .finally(() => setPortfolioLoading(false));
  }, [providerDbId]);

  // category is optional and only stamped when passed — omitting it keeps
  // the default gallery-upload behavior of addPortfolioItem (falls back to
  // the provider's own service_category). Passing VENUE_PORTFOLIO_CATEGORY is
  // how the Address Confirmation step's photos land in the same
  // portfolio_items table/list while staying out of the work gallery, out of
  // Explore, and inside Additional Information on the client's profile.
  const handleAddPortfolioImages = useCallback(async (category?: string) => {
    if (!user?.id || !providerDbId) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    // Show each picked photo immediately using its local URI — upload happens
    // in the background, so selection never looks like it did nothing even on
    // a slow connection. Each temp entry is swapped for the real DB row (or
    // removed with an error) independently, so one failure in a multi-select
    // batch no longer silently drops the rest.
    const pending = result.assets.map((asset, i) => ({
      tempId: `temp-${Date.now()}-${i}`,
      asset,
    }));
    setPortfolioItems(prev => [
      ...pending.map(({ tempId, asset }): DbPortfolioItem => ({
        id: tempId,
        provider_id: providerDbId,
        service_id: null,
        image_url: asset.uri,
        caption: null,
        category: category ?? null,
        tags: null,
        price: null,
        aspect_ratio: asset.width && asset.height ? asset.width / asset.height : 1,
        is_featured: false,
        created_at: new Date().toISOString(),
        vibe_tags: null,
        occasion_tags: null,
        trend_names: null,
        hair_type_shown: null,
        skin_tone_shown: null,
      })),
      ...prev,
    ]);

    setPortfolioUploading(true);
    await Promise.all(pending.map(async ({ tempId, asset }) => {
      try {
        const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // fetch(localUri).blob() is unreliable for file:// URIs in React
        // Native ("Network request failed") — read via expo-file-system and
        // upload as bytes instead, same as the provider logo upload.
        const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
        const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
        const item = await addPortfolioItem(providerDbId, publicUrl, ratio, category);
        setPortfolioItems(prev => prev.map(p => (p.id === tempId ? item : p)));
      } catch (e: any) {
        setPortfolioItems(prev => prev.filter(p => p.id !== tempId));
        Alert.alert('Upload failed', toUserMessage(e, 'Could not upload one of those images. Please try again.', 'InfoRegScreen.uploadPortfolio'));
      }
    }));
    setPortfolioUploading(false);
  }, [user?.id, providerDbId]);

  const handleRemovePortfolioItem = useCallback(async (item: DbPortfolioItem) => {
    // Still-uploading optimistic entries have a local id and were never
    // persisted — just drop them locally, no DB/storage row exists yet.
    if (item.id.startsWith('temp-')) {
      setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
      return;
    }
    try {
      await deletePortfolioItem(item.id);
      setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
      // Best-effort storage cleanup — the row is the source of truth
      const marker = '/portfolio/';
      const idx = item.image_url.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(item.image_url.slice(idx + marker.length));
        try { await removePortfolioStorageObject(path); } catch { /* ignore */ }
      }
    } catch {
      Alert.alert('Error', 'Could not remove photo.');
    }
  }, []);

  // Modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Only required on first publish — an already-live provider has already
  // accepted once (providers.terms_accepted_at), so re-showing this on every
  // edit-save would be re-consent theatre, not a real gate.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  // Whether this provider has written their OWN client-facing Terms &
  // Conditions (a booking_intake_forms row, is_terms) — separate from the
  // CERVICED platform terms `termsAccepted` above. Just toggles the card's
  // "Set up" vs "Update" label; null until known. Editing happens on the
  // ProviderIntakeForm builder, opened from the card near the end of the doc.
  const [hasOwnTerms, setHasOwnTerms] = useState<boolean | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [currentCategory, setCurrentCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  // Distinguishes editing an existing service from adding a new (possibly
  // template pre-filled) one, so the modal title & save copy stay correct.
  const [isEditingService, setIsEditingService] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // Keeps the selected category tab in view — panning back to the start of
  // the strip every time you pick a category (especially one further along
  // the list) was disorienting.
  const categoryScrollRef = useRef<ScrollView>(null);
  // Live-reorder state for the category pill strip — categoryOrder mirrors
  // categoryNames but can diverge mid-drag (Reanimated `layout`-driven reflow)
  // before the final order is committed back into providerData.categories.
  // Pills are variable-width (sized to the category name), so reordering is
  // driven by each pill's measured x/width rather than a fixed step size.
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  // Mirrors categoryOrder but read/written synchronously inside the gesture
  // handlers below — touchmove events can fire faster than React commits a
  // re-render, so reading the `categoryOrder` state directly there was
  // occasionally acting on a one-step-stale order and glitching the reorder.
  const categoryOrderRef = useRef<string[]>([]);
  // The pill order as it was when the drag was granted. dragBaselineRef
  // freezes each pill's x for the whole gesture, so the slot maths has to walk
  // the order those x values belong to — see applyDragPosition.
  const dragOrderBaselineRef = useRef<string[]>([]);
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  // The just-dropped pill skips one layout-transition frame while it returns
  // from absolute positioning to the flex row. Without this, Reanimated tries
  // to animate that handoff in addition to the native drag animation, causing
  // the tiny pre-landing flicker.
  const [settlingCategory, setSettlingCategory] = useState<string | null>(null);
  const settleCategoryFrameRef = useRef<number | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  // A small lift makes it clear the pill is being carried, not merely scrolled.
  const dragLift = useRef(new Animated.Value(0)).current;
  // Per-pill PanResponder cache — PanResponder.create() must run exactly once
  // per pill and be reused across renders. Calling it fresh on every render
  // (as this used to) hands the actively-dragged pill a brand-new responder
  // object mid-gesture the moment ANY state changes — including the reorder's
  // own setCategoryOrder call — which drops/stalls in-flight touch events and
  // is what made the drag intermittently freeze.
  const categoryDragRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const pillLayoutRef = useRef<Record<string, { x: number; y: number; width: number }>>({});
  // Frozen snapshot of every pill's position, taken once when a drag starts.
  // The target-index math below reads ONLY this — not the live pillLayoutRef
  // — because live positions update asynchronously (via onLayout, after the
  // Reanimated `layout`-driven reflow settles) and lag behind fast finger
  // movement, which was causing the drag to glitch/stall after one swap.
  // The relative order of every OTHER pill never changes during a single
  // drag (only the dragged pill's insertion point among them does), so the
  // original snapshot stays geometrically valid for the whole gesture.
  const dragBaselineRef = useRef<Record<string, { x: number; y: number; width: number }>>({});
  const dragGrantXRef = useRef(0);
  const dragTargetRef = useRef(0);
  // Reordering used to arm on the very first touch move, which made the
  // handle read as accidentally grabby — a light tap that was meant to just
  // land on the pill could kick off a drag. Requiring a short hold before the
  // drag actually engages (see armCategoryDragRef/CATEGORY_DRAG_HOLD_MS below)
  // makes a deliberate press-and-hold the only thing that starts one.
  const categoryDragHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDragArmedRef = useRef(false);

  // Auto-scroll while dragging near either edge of the category strip — without
  // this, a pill can never be dragged past whatever happens to already be
  // visible on screen, so there was no way to place it at the very end of a
  // long list. scrollEnabled is turned off during a drag (below), so nothing
  // else moves categoryScrollXRef during a gesture — it's safe to treat as the
  // single source of truth for the current scroll offset.
  const categoryScrollXRef = useRef(0);
  const categoryViewportRef = useRef({ x: 0, width: 0 }); // screen-space frame of the ScrollView
  const categoryContentWidthRef = useRef(0);
  // A dragged pill is temporarily position:absolute, which removes it from
  // Yoga's horizontal measurement. Keep the strip at its pre-drag width so
  // native ScrollView never clamps the offset or drops the far-end target
  // while that pill is floating above the row.
  const [dragContentWidth, setDragContentWidth] = useState<number | null>(null);
  const isCategoryDraggingRef = useRef(false);
  const dragLatestPageXRef = useRef(0);
  const dragLatestDxRef = useRef(0);
  const dragAutoScrollDeltaRef = useRef(0); // accumulated scroll since this gesture's grant
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  // Frames the finger has held continuously inside the edge zone — auto-scroll
  // ramps up the longer it's held (see startCategoryAutoScroll), so a deliberate
  // hold reaches the far end of a long strip in a reasonable time.
  const dragAutoScrollHoldFramesRef = useRef(0);
  const AUTOSCROLL_EDGE = 70;
  const AUTOSCROLL_MAX_SPEED = 22;
  const AUTOSCROLL_RAMP_FRAMES = 40; // ~0.66s at 60fps to reach full ramp
  const AUTOSCROLL_MAX_RAMP = 2.2;
  const CATEGORY_STRIP_TRAILING_PADDING = 20; // matches categoryTabsContent's paddingRight
  const CATEGORY_STRIP_GAP = 10; // matches categoryTabsContent's gap
  const CATEGORY_DRAG_HOLD_MS = 220; // press-and-hold duration required before a reorder drag engages
  const CATEGORY_DRAG_HOLD_SLOP = 6; // px of finger movement tolerated while waiting to arm, before treating it as a scroll/tap instead

  // Handle logo selection
  const handleSelectLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    const asset = result.assets?.[0];
    if (!result.canceled && asset) {
      setProviderData(prev => ({ ...prev, logo: asset.uri }));
    }
  };

  // Handle data transfer from Acuity Scheduling URL
  const handleTransferData = useCallback(async (url: string) => {
    const extracted = await transferFromAcuity(url);
    // Preserve any existing contact fields not covered by Acuity import
    setProviderData(prev => ({ ...prev, ...extracted }));
    const firstCat = Object.keys(extracted.categories)[0];
    if (firstCat) setSelectedCategory(firstCat);
    setShowTransferModal(false);
    Alert.alert(
      'Import Complete!',
      `We found ${Object.values(extracted.categories).flat().length} services from your Acuity profile. Review and save when ready.`
    );
  }, []);

  // Add service category
  const handleAddCategory = useCallback((name: string, description: string) => {
    setProviderData(prev => ({
      ...prev,
      categories: { ...prev.categories, [name]: [] },
      categoryDescriptions: { ...prev.categoryDescriptions, [name]: description },
    }));
    setSelectedCategory(name);
  }, []);


  // Delete category
  const handleDeleteCategory = useCallback((name: string) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${name}" and all its services?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setProviderData(prev => {
              const newCategories = { ...prev.categories };
              delete newCategories[name];
              const newDescriptions = { ...prev.categoryDescriptions };
              delete newDescriptions[name];
              return { ...prev, categories: newCategories, categoryDescriptions: newDescriptions };
            });
            if (selectedCategory === name) {
              const remaining = Object.keys(providerData.categories).filter(c => c !== name);
              setSelectedCategory(remaining[0] || '');
            }
          },
        },
      ]
    );
  }, [providerData.categories, selectedCategory]);

  // Rename category (and/or update its description)
  const handleRenameCategory = useCallback((oldName: string, newName: string, description: string) => {
    if (!newName.trim()) return;
    const trimmedNew = newName.trim();

    setProviderData(prev => {
      const newCategories: Record<string, ServiceData[]> = {};
      const newDescriptions: Record<string, string> = {};
      Object.keys(prev.categories).forEach(key => {
        const targetKey = key === oldName ? trimmedNew : key;
        newCategories[targetKey] = prev.categories[key] || [];
        newDescriptions[targetKey] = key === oldName ? description : (prev.categoryDescriptions?.[key] ?? '');
      });
      return { ...prev, categories: newCategories, categoryDescriptions: newDescriptions };
    });

    if (selectedCategory === oldName) {
      setSelectedCategory(trimmedNew);
    }
    setShowEditCategoryModal(false);
    setEditingCategory('');
  }, [selectedCategory]);

  // Reorder a category left (-1) or right (+1). Categories live in an ordered
  // object, so we rebuild the object with the two keys swapped.
  const handleReorderCategory = useCallback((name: string, direction: -1 | 1) => {
    setProviderData(prev => {
      const keys = Object.keys(prev.categories);
      const from = keys.indexOf(name);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= keys.length) return prev;
      const reordered = [...keys];
      const moved = reordered.splice(from, 1)[0];
      if (moved === undefined) return prev;
      reordered.splice(to, 0, moved);
      const newCategories: Record<string, ServiceData[]> = {};
      reordered.forEach(key => { newCategories[key] = prev.categories[key] || []; });
      return { ...prev, categories: newCategories };
    });
  }, []);

  // Add/Edit service
  const handleSaveService = useCallback((service: ServiceData) => {
    setProviderData(prev => {
      const categoryServices = prev.categories[currentCategory] || [];
      const existingIndex = categoryServices.findIndex(s => s.id === service.id);

      let updatedServices;
      if (existingIndex >= 0) {
        // Update existing
        updatedServices = [...categoryServices];
        updatedServices[existingIndex] = service;
      } else {
        // Add new
        updatedServices = [...categoryServices, service];
      }

      return {
        ...prev,
        categories: {
          ...prev.categories,
          [currentCategory]: updatedServices,
        },
      };
    });
    setEditingService(null);
  }, [currentCategory]);

  // Delete service
  const handleDeleteService = useCallback((categoryName: string, serviceId: number) => {
    Alert.alert(
      'Delete Service',
      'Are you sure you want to delete this service?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setProviderData(prev => ({
              ...prev,
              categories: {
                ...prev.categories,
                [categoryName]: prev.categories[categoryName]?.filter(s => s.id !== serviceId) || [],
              },
            }));
          },
        },
      ]
    );
  }, []);

  // Submit registration
  const handleSubmit = useCallback(async () => {
    if (!providerData.providerName.trim()) {
      Alert.alert('Missing Information', 'Please enter your business name.');
      return;
    }
    if (!providerData.location.trim()) {
      Alert.alert('Missing Information', 'Please enter your location.');
      return;
    }
    if (!providerData.businessType) {
      Alert.alert('Missing Information', 'Please choose your business type — it decides whether clients come to you or you travel to them, and which address-sharing options you get.');
      return;
    }
    if (!providerData.fullAddress.trim()) {
      Alert.alert('Missing Information', 'Please enter your full address — required for every business type, including mobile. It is never shown publicly.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not Logged In', 'Please log in to save your profile.');
      return;
    }
    // Gates in edit mode too. It's a live checkbox either way, and a tick a
    // provider can clear without consequence isn't a control, it's decoration.
    if (!termsAccepted) {
      Alert.alert('Terms & Conditions', 'Please agree to the Terms & Conditions before saving your profile.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveProviderToSupabase(user.id, providerData, !isEditMode && termsAccepted);
      // Only round-trip booking_policies if it actually loaded successfully —
      // writing the in-memory `policies` back while it's still stuck at
      // DEFAULT_POLICIES (a failed load) would silently wipe out whatever a
      // provider had already saved via Business Profile → Policies.
      if (policiesLoaded) {
        await saveProviderPolicies(user.id, policies as unknown as Record<string, unknown>);
      }
      Alert.alert(
        'Profile Saved!',
        'Your provider profile has been saved successfully.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      // saveProviderToSupabase prefixes its error with the failing step, which
      // is what makes these diagnosable — but that belongs in the log, not in
      // front of a provider. toUserMessage reports it and returns safe copy.
      Alert.alert('Couldn\'t save your profile', toUserMessage(e, 'Please try again.', 'InfoRegScreen.saveProfile'));
    } finally {
      setIsSubmitting(false);
    }
  }, [providerData, user, policies, policiesLoaded, navigation, isEditMode, termsAccepted]);

  // ── Scrollspy ─────────────────────────────────────────────────────────
  // Each section's real top offset within the scroll content, keyed by section.
  // Written by onSectionLayout below, which measures against the ScrollView's
  // content — not a local `layout.y` — so these are true page positions.
  const sectionOffsets = useRef<Partial<Record<EditorSectionKey, number>>>({});

  const onSectionLayout = useCallback((key: EditorSectionKey, y: number) => {
    sectionOffsets.current[key] = y;
  }, []);

  // Position indicator only. Picks the last section whose top has passed the
  // reading line (a third of the way down the viewport), which is what "the
  // section I'm currently reading" means to a reader. Deliberately does not
  // scroll, gate, or navigate anything.
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const readingLine = y + e.nativeEvent.layoutMeasurement.height / 3;
    let current: EditorSectionKey = FIRST_EDITOR_SECTION;
    for (const s of EDITOR_SECTIONS) {
      const top = sectionOffsets.current[s.key];
      if (top !== undefined && top <= readingLine) current = s.key;
    }
    setActiveSpySection(prev => (prev === current ? prev : current));
  }, []);

  // Explicit "Next" affordance at the end of each section — additive to the
  // scrollspy above (which stays a passive, non-navigating indicator).
  // Jumps by measured offset rather than a fixed distance so it lands exactly
  // on the next section's heading regardless of how tall the current one is.
  const goToSection = useCallback((key: EditorSectionKey) => {
    const y = sectionOffsets.current[key];
    if (y === undefined) return;
    mainScrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  // Get adaptive accent color - now uses user-selected accent color
  const adaptiveAccentColor = useMemo(() => {
    return providerData.accentColor;
  }, [providerData.accentColor]);
  // The editor is part of the provider's brand experience too. Use exactly
  // the same resolved theme tokens as the public-profile preview rather than
  // defaulting new surfaces to white.
  const editTheme = useMemo(
    () => resolveProviderTheme(providerData.profileTheme),
    [providerData.profileTheme],
  );
  // Recomputed only when categories actually change, not on every keystroke
  // elsewhere in this screen's single providerData state blob.
  const categoryNames = useMemo(() => Object.keys(providerData.categories), [providerData.categories]);
  const serviceCount = useMemo(
    () => Object.values(providerData.categories).reduce((total, services) => total + services.length, 0),
    [providerData.categories],
  );
  // The hub's content: one entry per section, each summarising what's filled
  // in so the provider can see the whole profile at a glance and drill into
  // whichever part needs work. `required` mirrors exactly what handleSubmit
  // already refuses to save without — nothing here introduces a new validation
  // rule, it just surfaces the existing ones before Publish rather than as an
  // alert afterwards.
  const sectionSummaries = useMemo(
    (): {
      section: EditorSectionKey;
      title: string;
      rows: { label: string; value: string; required?: boolean }[];
    }[] => {
      const filled = (v: string | null | undefined) => (v ?? '').trim();
      const serviceTypeLabel =
        providerData.providerService === 'OTHER'
          ? filled(providerData.customServiceType)
          : filled(providerData.providerService);
      return [
        {
          section: 'identity',
          title: 'Business identity',
          rows: [
            { label: 'Business name', value: filled(providerData.providerName), required: true },
            { label: 'Service type', value: serviceTypeLabel },
            { label: 'Where you\'re based', value: filled(providerData.location), required: true },
            { label: 'Logo', value: providerData.logo ? 'Added' : '' },
          ],
        },
        {
          section: 'about',
          title: 'About & portfolio',
          rows: [
            { label: 'Introduction', value: filled(providerData.aboutText) ? 'Written' : '' },
            {
              label: 'Portfolio',
              value: workPhotos.length > 0 ? `${workPhotos.length} photo${workPhotos.length === 1 ? '' : 's'}` : '',
            },
          ],
        },
        {
          section: 'contact',
          title: 'Contact details',
          rows: [
            { label: 'Phone', value: filled(providerData.phone) },
            { label: 'Email', value: filled(providerData.email) },
            { label: 'Instagram', value: filled(providerData.instagram) },
            { label: 'Website', value: filled(providerData.website) },
          ],
        },
        {
          section: 'services',
          title: 'Services & prices',
          rows: [
            {
              label: 'Services',
              value: serviceCount > 0 ? `${serviceCount} across ${categoryNames.length} categor${categoryNames.length === 1 ? 'y' : 'ies'}` : '',
            },
          ],
        },
        {
          section: 'policies',
          title: 'Business setup',
          rows: [
            // Required to publish: business_type decides which address-release
            // timings exist and, more importantly, WHO TRAVELS TO WHOM — a
            // mobile provider goes to the client, everyone else is a venue the
            // client travels to. Left unset, a provider silently inherits the
            // column's 'on_confirmation' default and starts releasing an
            // address under a type nobody chose. It was already required at
            // signup (Step 4); the claim/transfer paths bypassed that, which
            // is how live rows ended up NULL.
            { label: 'Business type', value: filled(providerData.businessType) ? businessTypeLabel(providerData.businessType) : '', required: true },
            { label: 'Full address', value: filled(providerData.fullAddress) ? 'Added (stays private)' : '', required: true },
          ],
        },
      ];
    },
    [providerData, workPhotos.length, serviceCount, categoryNames.length],
  );

  // Only genuinely-required, genuinely-empty fields — this is what the roll-up
  // above Publish warns about and what Publish would otherwise fail on.
  const missingRequired = useMemo(
    () => sectionSummaries.flatMap(g => g.rows.filter(r => r.required && !r.value).map(r => r.label)),
    [sectionSummaries],
  );

  // Set membership of the above, so an individual field can flag itself inline
  // without each call site re-deriving "is this one empty" and drifting from
  // what Publish actually enforces. Keys are the row labels in
  // sectionSummaries — the same strings the roll-up prints.
  const missingRequiredSet = useMemo(() => new Set(missingRequired), [missingRequired]);

  // Keep the draggable order in sync with the real data — but never while a
  // drag is in progress, or the live reflow would get stomped mid-gesture.
  useEffect(() => {
    if (draggingCategory) return;
    categoryOrderRef.current = categoryNames;
    setCategoryOrder(categoryNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerData.categories, draggingCategory]);

  // Stop the auto-scroll RAF loop if the screen unmounts mid-drag.
  useEffect(() => () => {
    if (dragAutoScrollFrameRef.current != null) cancelAnimationFrame(dragAutoScrollFrameRef.current);
    if (settleCategoryFrameRef.current != null) cancelAnimationFrame(settleCategoryFrameRef.current);
    if (categoryDragHoldTimerRef.current != null) clearTimeout(categoryDragHoldTimerRef.current);
    isCategoryDraggingRef.current = false;
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    const t = setTimeout(() => {
      const L = pillLayoutRef.current[selectedCategory];
      if (L) categoryScrollRef.current?.scrollTo({ x: Math.max(0, L.x - 20), animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [selectedCategory]);

  // Array order IS the stored order: saveProviderToSupabase writes each
  // service's index as its sort_order, and that's what drives the order
  // clients see. Rebuilt from the dragged key list rather than spliced, so the
  // result matches exactly what the drag showed.
  const handleSetServiceOrder = useCallback((categoryName: string, orderedIds: string[]) => {
    setProviderData(prev => {
      const current = prev.categories[categoryName];
      if (!current) return prev;
      const byId = new Map(current.map(svc => [String(svc.id), svc]));
      const next = orderedIds
        .map(id => byId.get(id))
        .filter((svc): svc is ServiceData => svc !== undefined);
      // Anything the drag didn't know about (added mid-gesture) keeps its
      // place at the end rather than being dropped.
      for (const svc of current) {
        if (!orderedIds.includes(String(svc.id))) next.push(svc);
      }
      return {
        ...prev,
        categories: { ...prev.categories, [categoryName]: next },
      };
    });
  }, []);

  const handleSetCategoryOrder = useCallback((order: string[]) => {
    setProviderData(prev => {
      const newCategories: Record<string, ServiceData[]> = {};
      order.forEach(key => { newCategories[key] = prev.categories[key] || []; });
      return { ...prev, categories: newCategories };
    });
  }, []);

  // Drag-to-reorder for the services inside the selected category. Keyed by
  // service id as a string, since that's what survives a reorder — an index
  // key would follow the slot rather than the service.
  const selectedCategoryServices = providerData.categories[selectedCategory];
  const serviceDragKeys = useMemo(
    () => (selectedCategoryServices ?? []).map(svc => String(svc.id)),
    [selectedCategoryServices],
  );
  const serviceDragOnReorder = useCallback(
    (orderedIds: string[]) => handleSetServiceOrder(selectedCategory, orderedIds),
    [handleSetServiceOrder, selectedCategory],
  );
  const serviceDrag = useVerticalDragReorder({
    keys: serviceDragKeys,
    onReorder: serviceDragOnReorder,
  });

  const stopCategoryAutoScroll = useCallback(() => {
    if (dragAutoScrollFrameRef.current != null) {
      cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }
  }, []);

  // Shared by onPanResponderMove and the auto-scroll loop below — both need to
  // move the dragged pill and re-evaluate its swap target, the only
  // difference being where the "effective" finger offset comes from (a fresh
  // touch event vs. content having scrolled under a stationary finger).
  const applyDragPosition = useCallback((name: string, effectiveDx: number) => {
    dragX.setValue(effectiveDx);
    const draggedWidth = dragBaselineRef.current[name]?.width ?? 80;
    const draggedLeft = dragGrantXRef.current + effectiveDx;
    // This is the standard sortable-list threshold: a slot changes as soon as
    // the carried item's centre crosses a neighbour's centre. The previous
    // trailing-edge calculation made users drag almost a full pill width
    // before anything moved, which felt sticky rather than like drag-and-drop.
    const referenceX = draggedLeft + draggedWidth / 2;
    // Walks the order the frozen x values were measured in, NOT the live one.
    // This used to read categoryOrderRef, which this function itself reorders
    // on every swap — so from the first swap onwards the loop was scanning a
    // list whose baseline x values no longer ascended with it. The early
    // `break` then fired against whichever pill happened to sit at that index,
    // so the target index jumped around and the pill stopped tracking slots
    // properly after the first one. Iterating the baseline order keeps the x
    // values monotonic, which is the assumption the break depends on, and
    // makes the result a pure function of finger position: the same place
    // always produces the same order, rather than one that depends on the path
    // taken to get there.
    const others = dragOrderBaselineRef.current.filter(n => n !== name);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const otherName = others[i];
      const L = otherName ? dragBaselineRef.current[otherName] : undefined;
      if (!L) continue;
      if (referenceX < L.x + L.width / 2) { target = i; break; }
    }
    if (target !== dragTargetRef.current) {
      const next = [...others];
      next.splice(target, 0, name);
      categoryOrderRef.current = next;
      setCategoryOrder(next);
      dragTargetRef.current = target;
      Haptics.selectionAsync().catch(() => {});
    }
  }, [dragX]);

  // Auto-scrolls the strip while the finger holds near either edge, so a pill
  // can be dragged all the way to the start/end of a list longer than one
  // screen — without this the drag was capped at whatever already happened to
  // be visible. Keeps rescheduling itself every frame for the life of the
  // gesture (release/terminate cancel it) so it reacts the instant the finger
  // nears an edge, not just at the moment the gesture started.
  const startCategoryAutoScroll = useCallback((name: string) => {
    const tick = () => {
      const { x: vpX, width: vpWidth } = categoryViewportRef.current;
      const pageX = dragLatestPageXRef.current;
      let speed = 0;
      if (vpWidth > 0) {
        if (pageX < vpX + AUTOSCROLL_EDGE) {
          const depth = (vpX + AUTOSCROLL_EDGE - pageX) / AUTOSCROLL_EDGE;
          speed = -AUTOSCROLL_MAX_SPEED * Math.min(1, Math.max(0, depth));
        } else if (pageX > vpX + vpWidth - AUTOSCROLL_EDGE) {
          const depth = (pageX - (vpX + vpWidth - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE;
          speed = AUTOSCROLL_MAX_SPEED * Math.min(1, Math.max(0, depth));
        }
      }

      if (speed !== 0) {
        // Ramps up the longer the finger holds inside the edge zone, so a
        // deliberate hold covers a long strip in a reasonable time instead of
        // crawling at the same fixed speed the whole way.
        dragAutoScrollHoldFramesRef.current += 1;
        const ramp = 1 + (AUTOSCROLL_MAX_RAMP - 1) * Math.min(1, dragAutoScrollHoldFramesRef.current / AUTOSCROLL_RAMP_FRAMES);
        const maxScrollX = Math.max(0, categoryContentWidthRef.current - categoryViewportRef.current.width);
        const nextX = Math.max(0, Math.min(maxScrollX, categoryScrollXRef.current + speed * ramp));
        const applied = nextX - categoryScrollXRef.current;
        if (applied !== 0) {
          categoryScrollXRef.current = nextX;
          dragAutoScrollDeltaRef.current += applied;
          categoryScrollRef.current?.scrollTo({ x: nextX, animated: false });
          applyDragPosition(name, dragLatestDxRef.current + dragAutoScrollDeltaRef.current);
        }
      } else {
        dragAutoScrollHoldFramesRef.current = 0;
      }

      dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [applyDragPosition]);

  // Pills are variable-width, so the drag target is resolved by comparing
  // the dragged pill's live centre X against every other pill's measured
  // midpoint — not a fixed step size like a uniform grid would use.
  // Bound only to the small drag-handle icon (not the whole pill), so it
  // never competes with tapping to select, long-press for the rename/delete
  // menu, or side-to-side scrolling of the strip. All internal bookkeeping
  // reads/writes categoryOrderRef (not the categoryOrder state) so rapid
  // touchmove events always see the latest order — React's re-render can
  // lag a step behind the gesture, which was the source of the glitching.
  //
  // Memoized per pill name and created exactly once (see
  // categoryDragRespondersRef) — recreating PanResponder.create() on every
  // render was handing the actively-dragged pill a new responder object
  // mid-gesture and stalling touch delivery.
  const getCategoryDragResponder = useCallback((name: string) => {
    const cached = categoryDragRespondersRef.current[name];
    if (cached) return cached;

    // Actually engages the drag — separated from onPanResponderGrant so it can
    // be deferred until the hold threshold below elapses, instead of firing
    // the instant the finger touches down.
    const armDrag = (pageX: number) => {
      dragBaselineRef.current = { ...pillLayoutRef.current };
      dragOrderBaselineRef.current = [...categoryOrderRef.current];
      dragGrantXRef.current = dragBaselineRef.current[name]?.x ?? 0;
      dragTargetRef.current = categoryOrderRef.current.indexOf(name);
      dragAutoScrollDeltaRef.current = 0;
      dragAutoScrollHoldFramesRef.current = 0;
      dragLatestDxRef.current = 0;
      dragLatestPageXRef.current = pageX;
      dragX.setValue(0);
      dragLift.setValue(0);
      categoryDragArmedRef.current = true;
      setDraggingCategory(name);
      Animated.spring(dragLift, {
        toValue: 1,
        useNativeDriver: true,
        speed: 26,
        bounciness: 5,
      }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      // onContentSizeChange (below, on the ScrollView) reports the real
      // native content width and is the authoritative source whenever it's
      // fired — but it isn't guaranteed to have fired yet before the user's
      // very first drag, in which case categoryContentWidthRef is still its
      // 0 default, which clamped auto-scroll to zero distance and made a
      // drag look like it couldn't reach the end of the row at all. This
      // hand-summed estimate from each pill's own measured layout is only a
      // fallback for that gap — it must never overwrite an already-known
      // real value, or every subsequent drag inherits this slightly-off
      // estimate instead of the accurate one, permanently capping how far
      // auto-scroll can go short of the true end.
      if (categoryContentWidthRef.current === 0) {
        const rightmost = Object.values(dragBaselineRef.current)
          .reduce((max, p) => Math.max(max, p.x + p.width), 0);
        categoryContentWidthRef.current = rightmost + CATEGORY_STRIP_TRAILING_PADDING;
      }
      // Set this before the state update below. The re-render makes the
      // active pill absolute; without the frozen minimum width, that layout
      // pass shrinks the content and clamps horizontal scrolling mid-drag.
      isCategoryDraggingRef.current = true;
      setDragContentWidth(categoryContentWidthRef.current);
      // measureInWindow exists on the underlying native view via the
      // NativeMethods mixin, but isn't in ScrollView's TS surface.
      (categoryScrollRef.current as unknown as { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null)
        ?.measureInWindow((x, _y, width) => {
          categoryViewportRef.current = { x, width };
        });
      startCategoryAutoScroll(name);
    };

    const clearDragHoldTimer = () => {
      if (categoryDragHoldTimerRef.current != null) {
        clearTimeout(categoryDragHoldTimerRef.current);
        categoryDragHoldTimerRef.current = null;
      }
    };

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Without this, the surrounding horizontal ScrollView reclaims the touch
      // the moment it sees any movement (its native scroll recognizer requests
      // termination), which snapped the drag straight back before it could go
      // anywhere. The handle is a small, dedicated target, so holding onto the
      // gesture once granted here is safe and doesn't block scrolling anywhere else.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        // Claim the touch immediately (so the ScrollView doesn't steal it),
        // but don't actually start moving the pill until the finger has been
        // held for CATEGORY_DRAG_HOLD_MS — a bare tap or an early scroll
        // swipe (see onPanResponderMove) never reaches armDrag at all.
        categoryDragArmedRef.current = false;
        const pageX = evt.nativeEvent.pageX;
        clearDragHoldTimer();
        categoryDragHoldTimerRef.current = setTimeout(() => {
          categoryDragHoldTimerRef.current = null;
          armDrag(pageX);
        }, CATEGORY_DRAG_HOLD_MS);
      },
      onPanResponderMove: (evt, g) => {
        if (!categoryDragArmedRef.current) {
          // Any real movement before the hold threshold reads as a scroll or
          // a mis-tap, not a deliberate press-and-hold — bail out of arming
          // so the strip's own ScrollView keeps handling it.
          if (Math.abs(g.dx) > CATEGORY_DRAG_HOLD_SLOP || Math.abs(g.dy) > CATEGORY_DRAG_HOLD_SLOP) {
            clearDragHoldTimer();
          }
          return;
        }
        // Track the finger 1:1 — the pill is rendered as a position:absolute
        // overlay pinned to its frozen grant-time origin (see the render
        // below), so this offset is the ONLY thing moving it. Nothing about
        // reordering ever touches this pill's base position anymore, which
        // is what made a lerp/smoothing hack necessary before: that was
        // papering over the dragged pill's flex position jumping every time
        // the underlying array reordered out from under it.
        dragLatestDxRef.current = g.dx;
        dragLatestPageXRef.current = evt.nativeEvent.pageX;
        applyDragPosition(name, g.dx + dragAutoScrollDeltaRef.current);
      },
      onPanResponderRelease: () => {
        clearDragHoldTimer();
        if (!categoryDragArmedRef.current) return;
        categoryDragArmedRef.current = false;
        stopCategoryAutoScroll();
        const finalOrder = categoryOrderRef.current;
        handleSetCategoryOrder(finalOrder);
        // Animate the still-absolute pill the rest of the way to its new
        // slot's position, THEN hand off to flex layout — releasing straight
        // into flex (as this used to) reset `translateX` to a hardcoded 0
        // the instant `isDragging` flipped false, while the Yoga frame had
        // been frozen at the pill's grant-time origin the whole drag
        // (transform was the only thing tracking the finger). So the pill
        // would jump from wherever it was released straight back to where it
        // started — landing on top of whatever pill now occupied that spot —
        // before sliding to its real destination. Computing the actual target
        // x (from each preceding pill's frozen width, since order is the only
        // thing that changed) and animating there first means the handoff to
        // flex happens with the pill already sitting exactly where flex will
        // place it, so there's nothing left to jump — the Reanimated `layout`
        // transition on the wrapper (below) sees no position change at that
        // instant and stays silent.
        const idx = Math.max(0, finalOrder.indexOf(name));
        let targetX = 0;
        for (let i = 0; i < idx; i++) {
          const pillName = finalOrder[i];
          const w = (pillName ? dragBaselineRef.current[pillName]?.width : undefined) ?? 0;
          targetX += w + CATEGORY_STRIP_GAP;
        }
        const toValue = targetX - dragGrantXRef.current;
        Animated.parallel([
          Animated.timing(dragX, { toValue, duration: 150, useNativeDriver: true }),
          Animated.spring(dragLift, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }),
        ]).start(() => {
          isCategoryDraggingRef.current = false;
          setDragContentWidth(null);
          setSettlingCategory(name);
          setDraggingCategory(null);
          dragX.setValue(0);
          // Let Yoga commit the flex position first; enabling its layout
          // transition again on the following frame is then a no-op.
          settleCategoryFrameRef.current = requestAnimationFrame(() => {
            setSettlingCategory(current => current === name ? null : current);
            settleCategoryFrameRef.current = null;
          });
        });
      },
      onPanResponderTerminate: () => {
        clearDragHoldTimer();
        const wasArmed = categoryDragArmedRef.current;
        categoryDragArmedRef.current = false;
        if (!wasArmed) return;
        stopCategoryAutoScroll();
        isCategoryDraggingRef.current = false;
        setDragContentWidth(null);
        if (settleCategoryFrameRef.current != null) {
          cancelAnimationFrame(settleCategoryFrameRef.current);
          settleCategoryFrameRef.current = null;
        }
        setSettlingCategory(null);
        setDraggingCategory(null);
        dragX.setValue(0);
        dragLift.setValue(0);
      },
    });
    categoryDragRespondersRef.current[name] = responder;
    return responder;
  }, [dragX, dragLift, handleSetCategoryOrder, applyDragPosition, startCategoryAutoScroll, stopCategoryAutoScroll]);


  if (isLoadingProvider) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#AF9197" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Plain light-painted View instead of <ThemedBackground> — that
          component reads the app's shared ThemeContext directly, so it would
          still paint dark whenever the app itself is in dark mode. This
          screen ignores dark mode entirely (see useScreenStyles/useChrome
          above), so its root background is pinned to the same light bg
          value ThemedBackground would use in light mode. */}
      <View style={{ flex: 1, backgroundColor: lightTheme.bg }}>
        {/* Only paint the provider's custom gradient — same gate the hero
            preview uses (line ~1768). Without it this rendered unconditionally,
            defaulting to providerData.gradient's hardcoded placeholder rainbow
            at 0.85 opacity over the whole screen, which visually smothered
            the background's bg entirely. */}
        {providerData.hasCustomGradient && (
          <LinearGradient
            colors={providerData.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradientOverlay}
          />
        )}

        <StatusBar barStyle={statusBarStyle} translucent backgroundColor="transparent" />

        {/* Transfer Data Modal */}
        <TransferDataModal
          visible={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransferData}
          onSkip={() => setShowTransferModal(false)}
        />

        {/* Add Category Modal */}
        <AddCategoryModal
          visible={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          onAdd={handleAddCategory}
          existing={categoryNames}
          businessKind={providerData.providerService}
          accentColor={adaptiveAccentColor}
        />

        {/* Service Template Picker — shown first when adding a service */}
        <ServiceTemplatePicker
          visible={showTemplatePicker}
          categoryName={currentCategory}
          fallbackKind={providerData.providerService}
          accentColor={adaptiveAccentColor}
          onClose={() => setShowTemplatePicker(false)}
          onPick={(template) => {
            setShowTemplatePicker(false);
            setIsEditingService(false);
            setEditingService(createServiceDraft(template));
            setShowServiceModal(true);
          }}
        />

        {/* Add/Edit Service Modal */}
        <ServiceModal
          visible={showServiceModal}
          onClose={() => {
            setShowServiceModal(false);
            setEditingService(null);
          }}
          onSave={handleSaveService}
          service={editingService}
          categoryName={currentCategory}
          isEditing={isEditingService}
          fallbackKind={providerData.providerService}
          accentColor={adaptiveAccentColor}
        />

        {/* Edit Category Modal */}
        <EditCategoryModal
          visible={showEditCategoryModal}
          onClose={() => {
            setShowEditCategoryModal(false);
            setEditingCategory('');
          }}
          onSave={handleRenameCategory}
          categoryName={editingCategory}
          categoryDescription={providerData.categoryDescriptions?.[editingCategory] ?? ''}
        />

        {/* Preview Modal */}
        <PreviewModal
          visible={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          providerData={providerData}
          accentColor={adaptiveAccentColor}
          portfolio={workPhotos}
          venuePhotos={venuePhotos}
        />

        {/* No `edges` prop: under fullScreenModal the nested provider this sits
            inside under-reports both insets (see topInset above), so relying on
            edges={['top','bottom']} silently produced no padding at all. Top is
            applied manually from the root provider's inset; bottom is handled
            by each pinned bar's own paddingBottom. */}
        <SafeAreaView style={styles.safeArea} edges={[]}>
          {/* Header. One static title and one Back that always leaves the
              screen — with the hub/editor split gone there is no intermediate
              view left to back out to. Preview stays available throughout.
              Saving lives only on the pinned Publish button, so there's still
              exactly one save path. */}
          <View style={[styles.header, { paddingTop: topInset + 6 }]}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.5}
              onPress={() => {
                tapLight();
                navigation.goBack();
              }}
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {isEditMode ? 'Public Profile' : 'Set Up Your Profile'}
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => { tapSelect(); setShowPreviewModal(true); }}
              >
                <Ionicons name="eye-outline" size={20} color={chromeText} />
              </TouchableOpacity>
            </View>
          </View>

          {claimError && (
            <View style={styles.claimErrorBanner}>
              <Text style={styles.claimErrorText}>{claimError}</Text>
              <TouchableOpacity onPress={() => { tapSelect(); setClaimError(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color="#7A4B00" />
              </TouchableOpacity>
            </View>
          )}

          {/* The document and its scrollspy rail share a positioning context so
              the rail can pin itself over the scroll without scrolling with it. */}
          <View style={styles.docApp}>
            {/* ── Scrollspy rail ── Reading-position indicator ONLY. Not
                touchable, not a stepper, not a gate: it reports where you are
                and never constrains where you can go. */}
            <View style={styles.docScrollspy} pointerEvents="none">
              {EDITOR_SECTIONS.map(s => (
                <View
                  key={s.key}
                  style={[
                    styles.docSpySeg,
                    s.key === activeSpySection && { backgroundColor: adaptiveAccentColor },
                  ]}
                />
              ))}
            </View>

            <ScrollView
              ref={mainScrollViewRef}
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={true}
              onScroll={handleScroll}
              scrollEventThrottle={64}
              // The category-pill drag handle refuses to give up its responder to
              // the horizontal strip it lives in, but this outer vertical
              // ScrollView is a separate native scroll recognizer one level up —
              // without gating it too, it kept fighting the drag for ownership of
              // the touch (the whole page would scroll instead of, or as well as,
              // the pill dragging), and would occasionally win outright and cut
              // the drag gesture short, which is also why reordering could look
              // like the other pills weren't reacting to the drag at all.
              //
              // The service-card drag needs this even more than the pills do:
              // that one is VERTICAL inside this vertical scroller, so the two
              // gestures are the same gesture and the native recognizer wins
              // every time it's left enabled. (The image strip never hit this —
              // a horizontal drag inside a horizontal strip isn't competing
              // with the page's vertical scroll at all.) Refusing termination
              // once armed is necessary but not sufficient on iOS, where a pan
              // already in flight isn't always stopped by this flag alone.
              scrollEnabled={!draggingCategory && !serviceDrag.draggingKey}
            >
            {/* The measurement origin for every field's auto-scroll position.
                measureLayout against this node yields true content offsets —
                see handleInputFocus. */}
            <View ref={scrollContentRef} collapsable={false}>
            {/* ── 01 · Identity ── First section of the continuous
                document. Oversized numeral + typographic break carries the
                structure; there is no hub, no card border, and nothing to tap
                into. Required-field warnings now live inline at the offending
                field, with a roll-up next to Publish. */}
            <View
              style={styles.docSection}
              onLayout={(e) => onSectionLayout('identity', e.nativeEvent.layout.y)}
            >
              <Text style={[styles.docNum, { color: adaptiveAccentColor }]}>01</Text>
              <Text style={styles.docHeading}>Identity</Text>
              <Text style={styles.docSub}>Business identity · how clients first find you</Text>

              {/* Next now lives at the top of each section — a jump-ahead
                  control (like tapping a step in a progress bar), not a
                  "confirm this section" action, so it's available before
                  the fields below are filled in. */}
              <TouchableOpacity
                style={styles.docNextButton}
                onPress={() => {
                  tapSelect();
                  goToSection('about');
                }}
                activeOpacity={0.55}
              >
                <Text style={[styles.docNextButtonText, { color: chromeText }]}>Next · About & Portfolio</Text>
                <Ionicons name="arrow-down" size={13} color={adaptiveAccentColor} />
              </TouchableOpacity>

            {/* Plain circular avatar picker — no card chrome around it. The
                surrounding panel was doing nothing the circle doesn't already
                communicate, and the standard avatar treatment (circle + corner
                camera badge) reads as tappable on its own. Business name and
                the rest of Step 1 continue below, unchanged. */}
              <View style={styles.logoSection}>
                <TouchableOpacity
                  style={styles.logoContainer}
                  onPress={() => { tapSelect(); handleSelectLogo(); }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={providerData.logo ? 'Change logo' : 'Add logo'}
                >
                  {providerData.logo ? (
                    <Image
                      source={{ uri: providerData.logo }}
                      style={styles.providerLogo}
                      resizeMode="cover"
                      // Per the Scalability rules: without this any unrelated
                      // re-render can retrigger the default fade-in as a flicker.
                      fadeDuration={0}
                    />
                  ) : (
                    <View style={styles.logoPlaceholder}>
                      <Ionicons name="camera-outline" size={30} color={adaptiveAccentColor} />
                    </View>
                  )}
                  {/* Badge sits on the 45° diagonal of the circle rather than a
                      square's corner, so it hugs the edge instead of floating
                      off it — offset = r - (r/√2) - badgeR, rounded. */}
                  <View style={styles.logoEditBadge}>
                    <Ionicons name="camera" size={14} color={chrome.onAccent} />
                  </View>
                </TouchableOpacity>
                <Text style={styles.logoCaption}>
                  {providerData.logo ? 'Change Logo' : 'Add Logo'}
                </Text>
              </View>

            {/* Business Name */}
              <View
                style={styles.inputGroup}
                ref={registerField('businessName')}
              >
                <RequiredLabel required missing={missingRequiredSet.has('Business name')} styles={styles}>Business Name</RequiredLabel>
                {isEditMode ? (
                  <>
                    <View style={[styles.serviceCategoryChip, styles.serviceCategoryChipSelected, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }]}>
                      <Ionicons name="lock-closed" size={11} color={chrome.fg(0.5)} />
                      <Text style={[styles.serviceCategoryText, styles.serviceCategoryTextSelected]}>
                        {providerData.providerName}
                      </Text>
                    </View>
                    <Text style={styles.inputHint}>
                      Not editable here — change it in Business Profile → Business Details → Business Info. Once changed, it’s fixed for 14 days.
                    </Text>
                  </>
                ) : (
                  <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                    <TextInput
                      style={styles.textInput}
                      value={providerData.providerName}
                      onChangeText={(text) =>
                        setProviderData({ ...providerData, providerName: text })
                      }
                      placeholder="Enter your business name"
                      placeholderTextColor={chrome.fg(0.4)}
                      onFocus={() => handleInputFocus('businessName')}
                    />
                  </BlurView>
                )}
              </View>

              {/* Service Category — free to pick at sign-up, but locked once the
                  profile exists: everything else (subcategory suggestions, tag
                  pools, templates) is scoped off this choice, so changing it
                  later would silently orphan existing categories/services. */}
              <View style={styles.inputGroup}>
                <RequiredLabel required styles={styles}>Service Type</RequiredLabel>
                {isEditMode ? (
                  <>
                    <View style={[styles.serviceCategoryChip, styles.serviceCategoryChipSelected, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }]}>
                      <Ionicons name="lock-closed" size={11} color={chrome.fg(0.5)} />
                      <Text style={[styles.serviceCategoryText, styles.serviceCategoryTextSelected]}>
                        {providerData.providerService}
                      </Text>
                    </View>
                    <Text style={styles.inputHint}>Set at sign-up — contact support to change your service type.</Text>
                  </>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.serviceCategoryScroll}
                  >
                    {SERVICE_CATEGORIES.map((category) => (
                      <TouchableOpacity
                        key={category}
                        style={[
                          styles.serviceCategoryChip,
                          providerData.providerService === category &&
                            styles.serviceCategoryChipSelected,
                        ]}
                        onPress={() =>
                          { tapSelect(); setProviderData({ ...providerData, providerService: category }); }}
                      >
                        <Text
                          style={[
                            styles.serviceCategoryText,
                            providerData.providerService === category &&
                              styles.serviceCategoryTextSelected,
                          ]}
                        >
                          {category}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {/* Custom Service Type Input when OTHER is selected */}
                {providerData.providerService === 'OTHER' && (
                  <View
                    style={styles.customServiceInput}
                    ref={registerField('customService')}
                  >
                    <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                      <TextInput
                        style={styles.textInput}
                        value={providerData.customServiceType}
                        onChangeText={(text) =>
                          setProviderData({ ...providerData, customServiceType: text })
                        }
                        placeholder="What service do you provide?"
                        placeholderTextColor={chrome.fg(0.4)}
                        autoFocus
                        onFocus={() => handleInputFocus('customService')}
                      />
                    </BlurView>
                  </View>
                )}
              </View>

              {/* Location */}
              <View
                style={styles.inputGroup}
                ref={registerField('location')}
              >
                <RequiredLabel required missing={missingRequiredSet.has("Where you're based")} styles={styles}>Where you're based</RequiredLabel>
                {/* providerData.location → geocoded and saved as location_text:
                    the single place the business is based. Drives the Distance
                    filter/sort, free-text search matching, and the location
                    line on provider cards.

                    The separate "cities you cover" multi-select (serviceLocations
                    → providers.service_locations, feeding the client Search
                    "City" filter) lives in Business Details › AboutYouScreen —
                    not duplicated here.

                    Same stepped city → region → area picker the client uses for
                    "Your area" (AreaPicker) — "Other city…" / "Other…" fall back
                    to free text for anywhere we lack area data. Either way it
                    writes the same plain string to `providerData.location`. */}
                <AreaPicker
                  value={providerData.location}
                  onChange={(location) =>
                    setProviderData(prev => ({ ...prev, location }))
                  }
                  accentColor={adaptiveAccentColor}
                  subtitle="Shown on your public profile and used to place you in local searches — not your exact address."
                />
              </View>

            </View>

            {/* ── 02 · About & Portfolio ── */}
            <View
              style={styles.docSection}
              onLayout={(e) => onSectionLayout('about', e.nativeEvent.layout.y)}
            >
              <Text style={[styles.docNum, { color: adaptiveAccentColor }]}>02</Text>
              <Text style={styles.docHeading}>About & Portfolio</Text>
              <Text style={styles.docSub}>Your introduction and the work clients see</Text>

              <TouchableOpacity
                style={styles.docNextButton}
                onPress={() => {
                  tapSelect();
                  goToSection('contact');
                }}
                activeOpacity={0.55}
              >
                <Text style={[styles.docNextButtonText, { color: chromeText }]}>Next · Contact</Text>
                <Ionicons name="arrow-down" size={13} color={adaptiveAccentColor} />
              </TouchableOpacity>

            {/* About Section */}
              <View
                style={styles.inputGroup}
                ref={registerField('about')}
              >
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlurMultiline, styles.profileInputBox]}>
                  <TextInput
                    style={[styles.textInput, styles.textInputMultiline]}
                    value={providerData.aboutText}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, aboutText: text })
                    }
                    placeholder="Tell clients about your services, policies, deposit requirements..."
                    placeholderTextColor={chrome.fg(0.4)}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    onFocus={() => handleInputFocus('about')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                ref={registerField('scheduleReleaseDay')}
              >
                {/* Same setting as ProviderAutomationsScreen's "Notify
                    followers on schedule release day" card — both read/write
                    providers.automation_settings.scheduleReleaseDay, so
                    changing it here or there updates the same value and each
                    screen shows the current one on its own next load. The
                    client-facing profile's "Slots out every Nth of the
                    month" pill is computed live from this same value —
                    there's no separate free-text field to keep in sync
                    anymore, so this is the only place this ever needs
                    setting. */}
                {/* One control, not a switch plus a hidden picker. The switch
                    only ever meant "is a day set", and flipping it on guessed
                    today's date — a real value the provider never chose, which
                    then had to be corrected in the picker underneath. Now the
                    row IS the picker: tap it, choose a day (it opens on today
                    when nothing is set yet), and choosing "Don't notify" in
                    there is what clears it. */}
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Notify Followers on Release Day</Text>
                  <Text style={styles.toggleHint}>Clients who turned on notifications for your profile get a reminder on this day each month</Text>
                </View>
                <TouchableOpacity
                  style={styles.releaseDayBtn}
                  onPress={() => { tapSelect(); setReleaseDayPickerVisible(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.releaseDayBtnText}>
                    {providerData.scheduleReleaseDay != null
                      ? `Day ${providerData.scheduleReleaseDay} of every month`
                      : 'Choose a day'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={chrome.fg(0.5)} />
                </TouchableOpacity>
              </View>

            {/* Portfolio — client work gallery shown on your public profile */}
              <Text style={styles.sectionSubtitle}>
                Photos of your work, shown on your public profile in a two-column gallery.
              </Text>

              {portfolioLoading ? (
                <View style={styles.portfolioLoadingRow}>
                  <ActivityIndicator color="#AF9197" />
                </View>
              ) : (
                <View style={styles.portfolioGrid}>
                  {workPhotos.map(item => (
                    <View key={item.id} style={styles.portfolioThumbWrap}>
                      <Image source={{ uri: item.image_url }} style={styles.portfolioThumb} fadeDuration={0} />
                      <TouchableOpacity
                        style={styles.portfolioRemoveBtn}
                        onPress={() => { tapWarn(); handleRemovePortfolioItem(item); }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.portfolioRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.portfolioAddTile}
                    onPress={() => { tapMedium(); handleAddPortfolioImages(); }}
                    activeOpacity={0.8}
                    disabled={portfolioUploading || !providerDbId}
                  >
                    {portfolioUploading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.portfolioAddPlus}>+</Text>
                        <Text style={styles.portfolioAddText}>Add Photos</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {!providerDbId && !portfolioLoading && (
                <Text style={styles.inputHint}>Save your profile once before adding portfolio photos.</Text>
              )}

            </View>

            {/* ── 03 · Contact ── */}
            <View
              style={styles.docSection}
              onLayout={(e) => onSectionLayout('contact', e.nativeEvent.layout.y)}
            >
              <Text style={[styles.docNum, { color: adaptiveAccentColor }]}>03</Text>
              <Text style={styles.docHeading}>Contact</Text>
              <Text style={styles.docSub}>Public details — anyone browsing can use these</Text>

              <TouchableOpacity
                style={styles.docNextButton}
                onPress={() => {
                  tapSelect();
                  goToSection('services');
                }}
                activeOpacity={0.55}
              >
                <Text style={[styles.docNextButtonText, { color: chromeText }]}>Next · Services</Text>
                <Ionicons name="arrow-down" size={13} color={adaptiveAccentColor} />
              </TouchableOpacity>

            {/* Contact Information — the PUBLIC audience. Anything filled in
                here is published: it's what the Get In Touch button on your
                profile offers to anyone browsing, booked or not. The separate
                Business Profile → Communications toggles govern the other
                audience (clients who already hold an appointment, via Booking
                Details → Contact) and do not hide anything from this list. */}
              <Text style={styles.sectionSubtitle}>
                Public — anything you fill in here appears on your profile under
                Get In Touch, for general enquiries from anyone browsing. Contact
                options for clients who've already booked are set separately in
                Communications.
              </Text>

              <View
                style={styles.inputGroup}
                ref={registerField('phone')}
              >
                <Text style={styles.inputLabel}>Phone Number</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.phone}
                    onChangeText={(text) => setProviderData({ ...providerData, phone: text })}
                    placeholder="+44 7XXX XXXXXX"
                    placeholderTextColor={chrome.fg(0.4)}
                    keyboardType="phone-pad"
                    onFocus={() => handleInputFocus('phone')}
                  />
                </BlurView>
              </View>

              {/* Same providers.whatsapp_number the Communications screen edits —
                  one value, two editors, by design. The contact *details* are a
                  shared pool (signup fills what it collects, either screen can
                  fill the rest); what differs is who each screen publishes them
                  to. Filling it here makes it public; ticking WhatsApp in
                  Communications offers it to booked clients. */}
              <View
                style={styles.inputGroup}
                ref={registerField('whatsapp')}
              >
                <Text style={styles.inputLabel}>WhatsApp Number</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.whatsapp}
                    onChangeText={(text) => setProviderData({ ...providerData, whatsapp: text })}
                    placeholder="+44 7XXX XXXXXX"
                    placeholderTextColor={chrome.fg(0.4)}
                    keyboardType="phone-pad"
                    onFocus={() => handleInputFocus('whatsapp')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                ref={registerField('contactEmail')}
              >
                <Text style={styles.inputLabel}>Public Enquiry Email</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.email}
                    onChangeText={(text) => setProviderData({ ...providerData, email: text })}
                    placeholder="bookings@yourbusiness.com"
                    placeholderTextColor={chrome.fg(0.4)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('contactEmail')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                ref={registerField('instagram')}
              >
                <Text style={styles.inputLabel}>Instagram Handle</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.instagram}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, instagram: text.replace(/^@/, '') })
                    }
                    placeholder="yourbusiness"
                    placeholderTextColor={chrome.fg(0.4)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('instagram')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                ref={registerField('website')}
              >
                <Text style={styles.inputLabel}>Website</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.website}
                    onChangeText={(text) => setProviderData({ ...providerData, website: text })}
                    placeholder="https://yourbusiness.com"
                    placeholderTextColor={chrome.fg(0.4)}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('website')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                ref={registerField('externalBookingUrl')}
              >
                <Text style={styles.inputLabel}>External Booking Link (optional)</Text>
                <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.externalBookingUrl}
                    onChangeText={(text) => setProviderData({ ...providerData, externalBookingUrl: text })}
                    placeholder="e.g. your Fresha or Acuity booking page"
                    placeholderTextColor={chrome.fg(0.4)}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('externalBookingUrl')}
                  />
                </BlurView>
                <Text style={styles.inputHint}>
                  Already booking through Fresha, Treatwell, Acuity, or similar? Paste the link and clients will book directly there — Cerviced's in-app booking is skipped for your profile.
                </Text>
              </View>

              {/* Years of Experience moved to Business Profile → Business
                  Details → Business Info — it's an ongoing business fact a
                  provider updates over time, not first-publish setup.
                  providerData.yearsExperience still round-trips through this
                  screen untouched (hero preview reads it) so an existing
                  value is never lost by editing/saving here. */}

            </View>

            {/* ── 04 · Services ── */}
            <View
              style={styles.docSection}
              onLayout={(e) => onSectionLayout('services', e.nativeEvent.layout.y)}
            >
              <Text style={[styles.docNum, styles.docNumLead, { color: adaptiveAccentColor }]}>04</Text>
              <Text style={styles.docHeading}>Services</Text>
              <Text style={styles.docSub}>What you offer, and what it costs</Text>

              <TouchableOpacity
                style={styles.docNextButton}
                onPress={() => {
                  tapSelect();
                  goToSection('policies');
                }}
                activeOpacity={0.55}
              >
                <Text style={[styles.docNextButtonText, { color: chromeText }]}>Next · Address Confirmation</Text>
                <Ionicons name="arrow-down" size={13} color={adaptiveAccentColor} />
              </TouchableOpacity>

            {/* Services Section — extra top gap because this is the one
                section whose first element is itself a right-aligned button
                ("+ Add Category"). Without it, it stacks directly under the
                right-aligned "Next" above and the two read as one control. */}
              <View style={[styles.servicesSection, { marginTop: 26 }]}>
                <View style={styles.servicesSectionHeader}>
                  <Text style={styles.sectionTitleNoCard}>Your Services</Text>
                  <TouchableOpacity
                    style={[styles.addCategoryButton, { backgroundColor: adaptiveAccentColor }]}
                    onPress={() => { tapLight(); setShowCategoryModal(true); }}
                  >
                    <Text style={styles.addCategoryText}>+ Add Category</Text>
                  </TouchableOpacity>
                </View>

                {categoryNames.length === 0 ? (
                  <BlurView intensity={50} tint={chrome.blurTint} style={styles.emptyServicesCard}>
                    <Ionicons name="folder-open-outline" size={36} color={chrome.fg(0.35)} style={styles.emptyServicesEmoji} />
                    <Text style={styles.emptyServicesText}>
                      Tap <Text style={{ fontWeight: '700' }}>+ Add Category</Text> to pick what you offer
                      (Hair, Nails, Lashes…). We'll suggest matching services, durations and tags for each one.
                    </Text>
                  </BlurView>
                ) : (
                  <>
                    <Text style={styles.categoryHint}>
                      Tap to open · drag ☰ to reorder · long-press to edit or delete
                    </Text>
                    {/* Category Tabs */}
                    <ScrollView
                      ref={categoryScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.categoryTabs}
                      contentContainerStyle={[
                        styles.categoryTabsContent,
                        dragContentWidth != null && { minWidth: dragContentWidth },
                      ]}
                      scrollEnabled={!draggingCategory}
                      onScroll={(e) => { categoryScrollXRef.current = e.nativeEvent.contentOffset.x; }}
                      scrollEventThrottle={16}
                      onContentSizeChange={(w) => {
                        // The temporary absolute-positioned pill is excluded
                        // from this measurement; retaining the pre-drag width
                        // avoids replacing a correct value with that smaller one.
                        if (!isCategoryDraggingRef.current) categoryContentWidthRef.current = w;
                      }}
                    >
                      {categoryOrder.map((item, index) => {
                        const isSel = selectedCategory === item;
                        const isDragging = draggingCategory === item;
                        const isSettling = settlingCategory === item;
                        const layoutTransition = isDragging || isSettling
                          ? {}
                          : { layout: LinearTransition.duration(220) };
                        const panResponder = getCategoryDragResponder(item);
                        // While dragging, the pill is pulled out of the flex flow and
                        // pinned (via `left`) to exactly where it was when the gesture
                        // started — dragBaselineRef is frozen for the whole gesture, so
                        // this position never moves. `translateX` then follows the
                        // finger on top of that fixed point (raw gesture dx, plus
                        // whatever the auto-scroll loop has scrolled the strip by —
                        // since `left` stays fixed in content space, that scrolled
                        // amount has to be added back so the pill still tracks the
                        // finger's actual screen position while the content moves
                        // underneath it). Because the pill no longer participates in
                        // flex layout while dragging, reordering the array (which
                        // reflows the OTHER pills via the Reanimated `layout` transition
                        // below) can't yank its base position out from under it — that
                        // fight between "flex position just jumped to the new slot" and
                        // "translateX still assumes the old slot" was the source of the
                        // snap/bounce-back glitch at every swap.
                        const dragOrigin = isDragging ? dragBaselineRef.current[item] : undefined;
                        // Dims every pill except the one actually being dragged, so it's
                        // unambiguous which one is moving instead of it blending into a
                        // row of equally-solid pills.
                        const isOtherWhileDragging = !!draggingCategory && !isDragging;
                        return (
                          // Outer wrapper owns the real flex position (measured by
                          // onLayout below) and the escape-to-absolute-position-while-
                          // dragging behavior. It also carries the Reanimated `layout`
                          // transition, which animates THIS pill's position whenever
                          // categoryOrder changes and shifts it to a new index — that's
                          // what makes a drop read as "concrete": the other pills visibly
                          // slide open/closed to make room instead of instantly snapping,
                          // which is what RN's own LayoutAnimation was supposed to do but
                          // is known to silently no-op under the New Architecture.
                          <ReAnimated.View
                            key={item}
                            // The dragged/just-dropped pill owns its position
                            // directly. Every other pill keeps the normal
                            // animated reflow that opens and closes the gap.
                            {...layoutTransition}
                            onLayout={(e) => {
                              pillLayoutRef.current[item] = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, width: e.nativeEvent.layout.width };
                            }}
                            style={[
                              // `top` uses the pill's own measured y rather than a
                              // hardcoded 0 — assuming every pill sits flush at the
                              // row's top edge doesn't hold once padding/alignment on
                              // the strip is accounted for, and being off even a few
                              // px reads as the pill visibly popping out of the row
                              // into its own floating card instead of sliding along it.
                              isDragging && dragOrigin && {
                                position: 'absolute',
                                left: dragOrigin.x,
                                top: dragOrigin.y,
                                zIndex: 10,
                              },
                            ]}
                          >
                            {/* Inner view owns the raw finger-tracking transform (an RN
                                Animated.Value driven imperatively from the gesture
                                handlers) — kept separate from the outer Reanimated
                                wrapper since the two animation systems don't share values. */}
                            <Animated.View
                              style={[
                                {
                                  transform: [
                                    { translateX: isDragging ? dragX : 0 },
                                    {
                                      scale: isDragging
                                        ? dragLift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
                                        : 1,
                                    },
                                  ],
                                },
                                isOtherWhileDragging && styles.categoryTabDimmed,
                              ]}
                            >
                            <TouchableOpacity
                              style={[
                                styles.categoryTab,
                                isSel && styles.selectedCategoryTab,
                              ]}
                              activeOpacity={0.8}
                              onPress={() => { tapSelect(); setSelectedCategory(item); }}
                              onLongPress={() => {
                                tapMedium();
                                Alert.alert(
                                  `“${item}”`,
                                  'What would you like to do?',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Edit (name & description)', onPress: () => { setEditingCategory(item); setShowEditCategoryModal(true); } },
                                    ...(index > 0 ? [{ text: '← Move left', onPress: () => handleReorderCategory(item, -1) }] : []),
                                    ...(index < categoryOrder.length - 1 ? [{ text: 'Move right →', onPress: () => handleReorderCategory(item, 1) }] : []),
                                    { text: 'Delete', style: 'destructive' as const, onPress: () => handleDeleteCategory(item) },
                                  ]
                                );
                              }}
                            >
                              <BlurView
                                intensity={isDragging ? 40 : isSel ? 16 : 10}
                                tint={chrome.blurTint}
                                style={[
                                  styles.categoryTabBlur,
                                  isSel && styles.selectedCategoryTabBlur,
                                  // The blur/tint look here depends on what's actually
                                  // rendered behind the pill. Inline, that's the busy
                                  // strip of neighboring pills; but once dragging pulls
                                  // it out to float above wherever it started, its
                                  // neighbors have already slid away underneath it, so
                                  // the same translucent background reads as washed-out
                                  // instead of frosted glass. Bumping its own opacity
                                  // while dragging keeps it looking like a normal, solid
                                  // pill regardless of what's now behind it.
                                  isDragging && styles.draggingCategoryTabBlur,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.categoryTabText,
                                    isSel && styles.selectedCategoryTabText,
                                  ]}
                                >
                                  {item}
                                </Text>
                                {/* Dedicated drag handle. Unlike a service card or an
                                    image thumbnail, the pill itself can't be the grab
                                    area: it already owns a tap (select) AND a long-press
                                    (the Edit/Move/Delete menu), and that menu fires at
                                    ~500ms — right in the middle of a drag that armed at
                                    220ms — so holding the pill would pop an Alert over
                                    the gesture. The handle stays; its touch target is
                                    generous so it doesn't have to be aimed for. */}
                                <View {...panResponder.panHandlers} style={styles.categoryDragHandle} hitSlop={{ top: 16, bottom: 16, left: 12, right: 14 }}>
                                  <Ionicons name="reorder-three-outline" size={20} color={chrome.fg(0.4)} />
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                            </Animated.View>
                          </ReAnimated.View>
                        );
                      })}
                    </ScrollView>

                    {/* Selected category's client-facing description — same text
                        shown under the tab on the public profile. */}
                    {selectedCategory && providerData.categoryDescriptions?.[selectedCategory] ? (
                      <Text style={styles.selectedCategoryDescription}>
                        {providerData.categoryDescriptions[selectedCategory]}
                      </Text>
                    ) : null}

                    {/* Services in Selected Category */}
                    {selectedCategory && (
                      <View style={styles.categoryServicesContainer}>
                        {serviceDrag.orderedKeys.map((serviceKey) => {
                          const service = providerData.categories[selectedCategory]
                            ?.find(svc => String(svc.id) === serviceKey);
                          if (!service) return null;
                          return (
                          <Animated.View
                            key={service.id}
                            onLayout={serviceDrag.onItemLayout(serviceKey)}
                            // Hold anywhere on the card, exactly like the image
                            // thumbnails — not a small dedicated handle. Edit and
                            // Delete sit deeper in the tree and claim their own
                            // taps first, so they still work; the handle glyph
                            // below stays purely as the affordance that says the
                            // card can be moved.
                            {...(serviceDrag.orderedKeys.length > 1
                              ? serviceDrag.getHandlers(serviceKey)
                              : {})}
                            style={[styles.serviceItemCard, serviceDrag.getItemStyle(serviceKey)]}
                          >
                            <BlurView intensity={50} tint={chrome.blurTint} style={styles.serviceCardBlur}>
                              <LinearGradient
                                colors={[chrome.surf(0.3), 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={styles.cardHighlight}
                              />
                              <View style={styles.serviceItem}>
                                {/* Service Image Carousel */}
                                <View style={styles.serviceImageContainer}>
                                  {service.images.length > 0 ? (
                                    <FlatList
                                      data={service.images}
                                      horizontal
                                      pagingEnabled
                                      showsHorizontalScrollIndicator={false}
                                      keyExtractor={(item, index) => `${item.uri}-${index}`}
                                      renderItem={({ item }) => (
                                        <Image
                                          source={{ uri: item.uri }}
                                          style={styles.serviceImage}
                                          // The provider's own framing choice, so
                                          // this row shows what clients will see
                                          // rather than always cropping.
                                          resizeMode={item.fit}
                                          fadeDuration={0}
                                        />
                                      )}
                                    />
                                  ) : (
                                    <View style={styles.serviceImagePlaceholder}>
                                      <Ionicons name="camera-outline" size={24} color={chrome.fg(0.3)} />
                                    </View>
                                  )}
                                  {service.images.length > 1 && (
                                    <View style={styles.imageCountBadge}>
                                      <Text style={styles.imageCountText}>
                                        {service.images.length}
                                      </Text>
                                    </View>
                                  )}
                                </View>

                                <View style={styles.serviceInfo}>
                                  <Text style={styles.serviceName}>{service.name}</Text>
                                  <Text style={styles.serviceDescription} numberOfLines={2}>
                                    {service.description}
                                  </Text>
                                  <View style={styles.serviceDetails}>
                                    <Text style={styles.serviceDuration}>{service.duration}</Text>
                                    <Text
                                      style={[
                                        styles.servicePrice,
                                        { color: adaptiveAccentColor },
                                      ]}
                                    >
                                      £{service.price}
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.serviceActions}>
                                  <TouchableOpacity
                                    style={styles.editServiceButton}
                                    onPress={() => { tapSelect();
                                      setCurrentCategory(selectedCategory);
                                      setEditingService(service);
                                      setIsEditingService(true);
                                      setShowServiceModal(true);
                                    }}
                                  >
                                    <Text style={styles.editServiceText}>✎</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.deleteServiceButton}
                                    onPress={() =>
                                      { tapWarn(); handleDeleteService(selectedCategory, service.id); }}
                                  >
                                    <Text style={styles.deleteServiceText}>×</Text>
                                  </TouchableOpacity>
                                  {/* Dedicated drag handle, same as the category
                                      pills' — the only part of the card that starts
                                      a reorder, so tapping Edit/Delete and scrolling
                                      the page are never mistaken for a drag. */}
                                  {serviceDrag.orderedKeys.length > 1 && (
                                    <View style={styles.serviceDragHandle} pointerEvents="none">
                                      <Ionicons name="reorder-three-outline" size={20} color={chrome.fg(0.4)} />
                                    </View>
                                  )}
                                </View>
                              </View>
                            </BlurView>
                          </Animated.View>
                          );
                        })}

                        {/* Add Service Button — opens the template picker first */}
                        <TouchableOpacity
                          style={styles.addServiceButton}
                          onPress={() => { tapSelect();
                            setCurrentCategory(selectedCategory);
                            setShowTemplatePicker(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <BlurView intensity={30} tint={chrome.blurTint} style={styles.addServiceBlur}>
                            <Text style={[styles.addServiceText, { color: adaptiveAccentColor }]}>
                              + Add Service to {selectedCategory}
                            </Text>
                          </BlurView>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>

            </View>

            {/* ── 05 · Policies ── Full-bleed: no card wrapper, the
                typographic break is the only separator. */}
            <View
              style={[styles.docSection, styles.docSectionLast]}
              onLayout={(e) => onSectionLayout('policies', e.nativeEvent.layout.y)}
            >
              <Text style={[styles.docNum, { color: adaptiveAccentColor }]}>05</Text>
              <Text style={styles.docHeading}>Address Confirmation</Text>
              <Text style={styles.docSub}>Business setup, address release</Text>

              {/* Cancellations, reschedules, deposits, no-shows, refund policy,
                  booking instructions and the detailed policy image all moved to
                  Business Profile → Business Details → Policies — they're
                  ongoing business policy, not first-publish setup, and now live
                  alongside the rest of the app's reschedule/cancellation logic
                  instead of inside this one-shot registration document. What
                  stays here (business type, address, address release,
                  accessibility) is required or required-adjacent for first
                  publish, so a new provider is still asked for it during
                  signup. */}
              <Text style={styles.policySectionTitle}>Business Setup</Text>
              <View style={styles.docFieldRow}>
                <Text style={styles.policyLabel}>
                  TYPE <Text style={styles.requiredStar}>*</Text>
                </Text>
                {missingRequiredSet.has('Business type') && (
                  <Text style={styles.docFieldFlag}>Required</Text>
                )}
              </View>
                {/* Locked post-first-save: business_type decides who travels to
                    whom (mobile goes to the client; every other type is a venue
                    the client comes to) and drives the address-release timings
                    below — changing it later could silently leave an
                    already-live profile in an inconsistent state. The private
                    address itself is required for every type, mobile included;
                    an earlier version of this comment said mobile was exempt,
                    which has not been true since require_provider_address.sql. */}
                {isEditMode && providerData.businessType ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                    <View style={[styles.policyPill, { backgroundColor: adaptiveAccentColor, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons name="lock-closed" size={11} color="#fff" />
                      <Text style={[styles.policyPillText, { color: '#fff' }]}>
                        {businessTypeLabel(providerData.businessType)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pillRow}>
                    {BUSINESS_TYPE_OPTS.map(({ value: v, label: l }) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.policyPill, providerData.businessType === v && { backgroundColor: adaptiveAccentColor }]}
                        onPress={() => { tapSelect(); setProviderData(prev => ({
                          ...prev,
                          businessType: v,
                          // Switching type can strip the current timing from
                          // the allowed set. Without this, picking home_based
                          // + "1 week before" and then switching to mobile
                          // left week_before in state with no pill selected —
                          // and saved it, so a mobile provider's home address
                          // would auto-release a week before every booking.
                          // BusinessInfoScreen already did this; this screen
                          // wrote the type alone.
                          addressReleasePolicy: reconcileAddressReleasePolicy(v, prev.addressReleasePolicy),
                        })); }}
                      >
                        <Text style={[styles.policyPillText, providerData.businessType === v && { color: '#fff' }]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {isEditMode && providerData.businessType && (
                  <Text style={styles.inputHint}>
                    Not editable here — change it in Business Profile → Business Details → Business Info.
                  </Text>
                )}

              <View style={[styles.docFieldRow, { marginTop: 14 }]}>
                <Text style={styles.policyLabel}>
                  FULL ADDRESS <Text style={styles.requiredStar}>*</Text>
                </Text>
                {missingRequiredSet.has('Full address') && (
                  <Text style={styles.docFieldFlag}>Required</Text>
                )}
              </View>
              <Text style={styles.addressHint}>
                {providerData.businessType === 'mobile'
                  ? "Never shown publicly, and never sent to a client automatically — you travel to them, so they give you their address instead. If you do want to share yours, pick Manual release below and send it per booking from that booking's detail page. Include your postcode."
                  : providerData.businessType === 'home_based'
                  ? 'Shared with clients only when you release it — never shown publicly. Include your postcode.'
                  : 'Your business address. Shown to clients once booking is confirmed. Include your postcode.'}
              </Text>
              {/* Stays editable here, unlike the business type above it. This
                  screen is the only editor of the private address — moving it
                  behind a lock would leave nowhere to correct a typo in the
                  one field Publish hard-requires. */}
              <AddressPicker
                value={providerData.fullAddress}
                onChange={({ address, coordinates }) => setProviderData(prev => ({
                  ...prev,
                  fullAddress: address,
                  fullAddressCoordinates: coordinates,
                }))}
                accentColor={adaptiveAccentColor}
              />

              {/* Which timings each business type may offer is
                  ADDRESS_RELEASE_BY_BUSINESS_TYPE's job, not this screen's.
                  This used to be a hand-maintained `show:` flag per row —
                  a second copy of the same table that had to be edited in
                  lockstep with the real one, and wasn't. One source now.
                  Mobile is no longer excluded — it's offered exactly
                  'manual' plus the "Never share" pill below, because a
                  mobile provider's address should only ever leave by
                  hand, per booking. */}
              {providerData.businessType && (
                <>
                  <Text style={[styles.policyLabel, { marginTop: 14 }]}>ADDRESS RELEASE</Text>
                  <View style={styles.pillRow}>
                    {[
                      ...ADDRESS_RELEASE_OPTS
                        .filter(o => isAddressReleaseAllowed(providerData.businessType as BusinessType, o.value))
                        .map(o => ({ value: o.value as string, label: o.label })),
                      // Mobile only — see BusinessInfoScreen. '' is stored
                      // as NULL, i.e. never released.
                      ...(providerData.businessType === 'mobile'
                        ? [{ value: '', label: 'Never share' }]
                        : []),
                    ].map(({ value: v, label: l }) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.policyPill, (providerData.addressReleasePolicy ?? '') === v && { backgroundColor: adaptiveAccentColor }]}
                        onPress={() => { tapSelect(); setProviderData(prev => ({
                          ...prev,
                          // '' is the "Never share" pill — stored as null,
                          // which is what the column means by it.
                          addressReleasePolicy: v === '' ? null : (v as AddressReleasePolicy),
                        })); }}
                      >
                        <Text style={[styles.policyPillText, (providerData.addressReleasePolicy ?? '') === v && { color: '#fff' }]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* One lookup, from the same ADDRESS_RELEASE_OPTS the
                      pills above are built from. This was two copies of
                      the same object literal — an outer one used as a
                      presence check and an inner one rendered — and they
                      had already drifted: the inner copy was missing
                      five_days_before, so picking "5 days before" passed
                      the guard and then rendered an empty line. */}
                  {(() => {
                    if (providerData.addressReleasePolicy == null) {
                      return (
                        <Text style={styles.addressHint}>
                          Your address is never sent to clients. They give you theirs instead.
                        </Text>
                      );
                    }
                    const sub = ADDRESS_RELEASE_OPTS
                      .find(o => o.value === providerData.addressReleasePolicy)?.sub;
                    return sub ? <Text style={styles.addressHint}>{sub}</Text> : null;
                  })()}
                </>
              )}

              {/* Address/venue photos — stored as portfolio_items tagged
                  VENUE_PORTFOLIO_CATEGORY, so they share the table without
                  joining the work gallery: on the client's profile they render
                  inside Additional Information, and Explore's feed excludes
                  them. This grid is the only place they're managed.
                  Unlike the address text above, these are always public on
                  the profile regardless of business type or address-release
                  policy — the hint says so explicitly rather than implying
                  the same privacy the address field gets. */}
              <Text style={[styles.policyLabel, { marginTop: 14 }]}>ADDRESS PHOTOS</Text>
              <Text style={styles.addressHint}>
                Photos of your venue or workspace, shown publicly under Additional Information on your profile rather than in your portfolio — clients booking mobile or home-based providers often look for these before choosing who to book, so adding some can help boost bookings.
              </Text>
              <View style={[styles.portfolioGrid, styles.addressPhotoGrid]}>
                {venuePhotos.map(item => (
                  <View key={item.id} style={styles.portfolioThumbWrap}>
                    <Image source={{ uri: item.image_url }} style={styles.portfolioThumb} fadeDuration={0} />
                    <TouchableOpacity
                      style={styles.portfolioRemoveBtn}
                      onPress={() => { tapWarn(); handleRemovePortfolioItem(item); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.portfolioRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.portfolioAddTile}
                  onPress={async () => { tapMedium();
                    setVenuePhotoUploading(true);
                    try {
                      await handleAddPortfolioImages(VENUE_PORTFOLIO_CATEGORY);
                    } finally {
                      setVenuePhotoUploading(false);
                    }
                  }}
                  activeOpacity={0.8}
                  disabled={venuePhotoUploading || portfolioUploading || !providerDbId}
                >
                  {venuePhotoUploading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Text style={styles.portfolioAddPlus}>+</Text>
                      <Text style={styles.portfolioAddText}>Add Photos</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {!providerDbId && (
                <Text style={styles.inputHint}>Save your profile once before adding address photos.</Text>
              )}


              {/* WHERE YOU WORK (cities covered) moved up to 01 · Identity,
                  alongside "Where you're based" — the two location questions
                  belong together rather than four sections apart. */}

              {/* PRICE RANGE moved out to Services & Pricing (ServicesPricingScreen) —
                  same field, same providers.price_tier column, alongside the
                  rest of the "how you actually work" questions rather than
                  the first-publish document. `priceRange` remains on
                  providerData purely so an existing value round-trips
                  untouched through this screen's save. */}

              {/* ACCESSIBILITY moved out to Business Details → About You,
                  which is the only editor of the '|'-delimited
                  accessibility_notes column now. Asking the same chips in two
                  places is what let this screen write unparseable prose into
                  that column in the first place. `accessibilityNotes` stays on
                  providerData purely so an existing value round-trips
                  untouched through this screen's save. */}

              {/* What replaces it here is the plain-prose question that
                  actually belongs at first publish — the free-text box this
                  was before it got turned into a chip picker. It writes
                  booking_policies.bookingInstructions, the field already shown
                  to clients on every booking, rather than a second column
                  saying the same thing. Business Details → Policies is the
                  ongoing editor of that same field; this is the signup-time
                  ask, same key, same format. */}
              <Text style={[styles.policyLabel, { marginTop: 14 }]}>ANYTHING CLIENTS SHOULD KNOW</Text>
              <Text style={styles.addressHint}>
                Shown to clients on every booking (optional) — parking, buzzer codes, what to bring, how to find you.
              </Text>
              <BlurView intensity={15} tint={chrome.blurTint} style={[styles.inputBlurMultiline, styles.profileInputBox, { marginTop: 8 }]}>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={policies.bookingInstructions}
                  onChangeText={(text) => setPolicies(prev => ({ ...prev, bookingInstructions: text }))}
                  placeholder="e.g. Please arrive 10 minutes early. Free parking on the street outside."
                  placeholderTextColor={chrome.fg(0.4)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </BlurView>

              {/* The provider's OWN client-facing Terms & Conditions — a
                  booking_intake_forms row (is_terms), authored in the
                  ProviderIntakeForm builder, that a client must agree to
                  before adding this provider to their basket. Distinct from
                  the CERVICED platform terms checkbox at the end of this
                  document. Optional: a booking proceeds fine without one. This
                  card is the only entry point (it used to live on Business
                  Info). */}
              <Text style={[styles.policyLabel, { marginTop: 18 }]}>YOUR TERMS &amp; CONDITIONS</Text>
              <Text style={styles.addressHint}>
                Clients read and agree to these before they can add you to their basket (optional). Written as a form on the next screen.
              </Text>
              <TouchableOpacity
                style={[styles.releaseDayBtn, { alignSelf: 'stretch', justifyContent: 'space-between' }]}
                // This screen is typed against ProfileStackParamList (its
                // original client home) but actually renders inside the three
                // provider stacks as `EditProfile`, each of which registers
                // ProviderIntakeForm. The prop type can't see that, hence the
                // cast — same reason the navigators mount it as ComponentType<any>.
                onPress={() => { tapSelect(); (navigation as any).navigate('ProviderIntakeForm', { openTerms: true }); }}
                activeOpacity={0.7}
              >
                <Text style={styles.releaseDayBtnText}>
                  {hasOwnTerms ? 'Update your Terms & Conditions'
                    : hasOwnTerms === false ? 'Set up your Terms & Conditions'
                    : 'Your Terms & Conditions'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={chrome.fg(0.5)} />
              </TouchableOpacity>

              {/* PREFERRED PAYMENT TYPE, WHO YOU WORK WITH and LANGUAGES SPOKEN
                  moved out of registration to Business Details — payment/
                  clientele now live on ServicesPricingScreen and languages on
                  AboutYouScreen. They're standing business facts, not
                  things to decide while first publishing a profile.
                  `preferredPaymentMethods`, `teamSize` and `languagesSpoken`
                  remain on providerData so existing values round-trip
                  untouched; registration just no longer edits them. */}

              {/* ── End of document ── The CERVICED terms row and closing
                  note live at the natural end of the scroll, immediately
                  before the reader reaches Publish.

                  ONE row, not two. This used to be a checkbox shown only on
                  first publish plus a separate bare link further down that
                  showed always — so an existing provider got a link with no
                  checkbox, and a new one got a checkbox and then a second,
                  redundant link.

                  The box is a live control in BOTH modes and gates saving in
                  both. An existing provider starts ticked (they agreed to get
                  published) with the stored providers.terms_accepted_at date
                  beside it, but the tick is real state they can clear — at
                  which point Save refuses, same as first publish. It was
                  briefly drawn checked-but-disabled off isEditMode, which
                  meant the underlying value was still false and the first tap
                  did nothing visible. */}
              <View style={styles.docEnd}>
                <Text style={styles.docEndMark}>— END OF PROFILE —</Text>
                <Text style={styles.reviewFootnote}>
                  Publishing saves your profile and policies. You can come back and
                  change any of this at any time.
                </Text>

                {/* alignSelf:'stretch' is load-bearing. docEnd is
                    alignItems:'center', so without it this box sizes to its
                    content — and termsRowText's flex:1 inside an
                    unconstrained row collapses the label to zero width. The
                    checkbox rendered, the words didn't. */}
                <View style={[styles.termsBox, { marginTop: 16, alignSelf: 'stretch' }]}>
                  <TouchableOpacity
                    style={styles.termsRow}
                    activeOpacity={0.75}
                    onPress={() => { tapSelect(); setTermsAccepted(prev => !prev); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: termsAccepted }}
                  >
                    <View
                      style={[
                        styles.termsCheckbox,
                        termsAccepted && { backgroundColor: adaptiveAccentColor, borderColor: adaptiveAccentColor },
                      ]}
                    >
                      {termsAccepted && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={styles.termsRowText}>
                      I agree to the{' '}
                      {/* Its own onPress so tapping the words opens the terms
                          instead of toggling the box underneath. */}
                      <Text
                        style={[styles.termsRowLink, { color: adaptiveAccentColor }]}
                        onPress={() => { tapSelect(); setShowTermsModal(true); }}
                      >
                        CERVICED Terms &amp; Conditions
                      </Text>
                      {providerData.termsAcceptedAt
                        ? ` — agreed ${formatLongDate(providerData.termsAcceptedAt)}`
                        : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            </View>
          </ScrollView>

          {/* Publish — the document's single commit action, and the only
              thing on this screen that writes to the server. Now permanently
              visible: with no hub/section split there is no state in which
              saving would be ambiguous. The missing-required roll-up sits
              directly above it (each offending field also flags itself
              inline), so the reader sees what blocks publishing at the moment
              they reach the button. */}
          <View style={[styles.pinnedBar, { paddingBottom: pinnedBarBottomPad }]}>
            {missingRequired.length > 0 && (
              <View style={styles.publishWarningRow}>
                <Ionicons name="alert-circle-outline" size={15} color={REVIEW_WARN_COLOR} />
                <Text style={styles.publishWarningText} numberOfLines={2}>
                  {missingRequired.length === 1
                    ? `${missingRequired[0]} is still needed before you can publish.`
                    : `${missingRequired.join(', ')} are still needed before you can publish.`}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.pinnedBarButton,
                { backgroundColor: adaptiveAccentColor },
                isSubmitting && styles.pinnedBarButtonDisabled,
              ]}
              onPress={() => { tapMedium(); handleSubmit(); }}
              activeOpacity={0.85}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={chrome.onAccent} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={chrome.onAccent} />
                  <Text style={[styles.pinnedBarButtonText, { color: chrome.onAccent }]}>
                    Save &amp; Publish
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </View>

          <ReleaseDayPicker
            visible={releaseDayPickerVisible}
            value={providerData.scheduleReleaseDay ?? new Date().getDate()}
            accentColor={adaptiveAccentColor}
            cardColor={editTheme.card}
            textColor={editTheme.text}
            subColor={editTheme.sub}
            borderColor={editTheme.border}
            styles={styles}
            allowClear
            onClear={() => setProviderData(prev => ({ ...prev, scheduleReleaseDay: null }))}
            onSelect={(day) => setProviderData(prev => ({ ...prev, scheduleReleaseDay: day }))}
            onClose={() => setReleaseDayPickerVisible(false)}
          />

          {/* Reuses the same read-only Terms content shown from account
              settings — no separate copy to keep in sync. */}
          <Modal visible={showTermsModal} animationType="slide" transparent={false} onRequestClose={() => setShowTermsModal(false)}>
            <TermsScreen navigation={{ goBack: () => setShowTermsModal(false) }} />
          </Modal>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
};

// ── Theme-aware styles ───────────────────────────────────────────────────────
// This screen's chrome (header, section titles, field labels, frosted cards)
// used to hardcode #000 text on translucent-white fills, which rendered as
// black-on-near-black once ThemedBackground switched to the dark palette.
//
// Rather than thread the provider theme through all 13 sub-components in this
// file (they share this one `styles` object), the sheet is built per mode from
// the app's provider-hat palette — the same tokens ThemedBackground itself
// paints with — so every component keeps calling `styles.x` unchanged. Only
// colour values branch; every layout value below is exactly as it was.
//
// The per-provider `resolveProviderTheme()` tokens (editTheme/editCardBg) stay
// where they already are: they colour the provider's own BRANDED surfaces
// (brand identity card, setup guide, preview). This sheet covers the editor
// chrome around them, which follows the app's light/dark mode instead.
// Foreground ramp — replaces the old rgba(0,0,0,α) text tiers. In light mode
// these resolve to exactly the same near-black tones as before; in dark mode
// they become the palette's light text at the equivalent emphasis.
const fgFor = (isDark: boolean) => (alpha: number) =>
  isDark ? withAlpha('#F0ECE7', alpha) : `rgba(0,0,0,${alpha})`;
// Surface ramp — replaces the old rgba(255,255,255,α) frosted fills, which read
// as bright glass over a light background but as glare over a dark one.
//
// The light-mode base is a warm off-white (#FDFBF8), not pure #FFFFFF: against
// the app's warm cream backdrop a pure-white card reads as a cold rectangle
// pasted on top rather than a surface belonging to the same palette. Dark mode
// is unchanged — its ramp is a white overlay at low alpha, which is already a
// tint of the backdrop rather than an opaque fill.
// The dark multiplier was 0.34, which kept fills honest but left inputs and
// pills reading flat — barely separated from the backdrop. 0.52 lifts them to
// a legible surface while staying a *tint* of the backdrop rather than an
// opaque panel, so they still belong to the palette instead of sitting on it.
// Light mode keeps the warm off-white base for the same reason: brighter, but
// never pure white.
const surfFor = (isDark: boolean) => (alpha: number) =>
  isDark ? withAlpha('#FFFFFF', alpha * 0.52) : withAlpha('#FDFBF8', alpha);

/** Hairline edge for input/pill surfaces. A raised fill alone still reads soft;
 *  a defined border is what makes it look crisp rather than just lighter. Warm
 *  in light mode to match the cream backdrop, a white tint in dark mode. */
const edgeFor = (isDark: boolean) => (alpha: number) =>
  isDark ? withAlpha('#FFFFFF', alpha) : withAlpha('#8A7361', alpha);

/** The rose tint-shadow used across the provider surfaces (confirmed in
 *  ProviderMyProfileScreen). A flat black shadow greys the warm palette;
 *  this keeps depth in the same colour family as everything else. */
const CARD_SHADOW_COLOR = '#B87E92';

/** One radius scale for the whole screen, so the header buttons, cards and
 *  footer buttons read as one set rather than three separately-chosen values. */
const RADIUS = { headerButton: 17, card: 16, footerButton: 14 } as const;

/** Logo avatar picker geometry. The badge offset puts it on the circle's 45°
 *  diagonal — for a circle of radius r, the edge point there is r/√2 in from
 *  the bounding box on each axis, so centring a badge of radius br on it means
 *  insetting by r − r/√2 − br. Negative would push it off the edge; this lands
 *  it straddling the stroke, which is the standard avatar-picker look. */
const LOGO_SIZE = 104;
const LOGO_BADGE_SIZE = 32;
const LOGO_BADGE_OFFSET = Math.round(
  LOGO_SIZE / 2 - LOGO_SIZE / 2 / Math.SQRT2 - LOGO_BADGE_SIZE / 2,
);

const makeStyles = (isDark: boolean, screenWidth: number, screenHeight: number) => {
  const P = isDark ? darkTheme : lightTheme;
  const fg = fgFor(isDark);
  const surf = surfFor(isDark);
  const edge = edgeFor(isDark);
  // Accent-tinted chrome for the cohesive button/card family. The provider's
  // own accent varies per profile, so these are derived from the app palette's
  // accent (the chrome accent) rather than the provider's — the provider's
  // accent stays for the things that are genuinely theirs (primary actions,
  // section chips), and the surrounding furniture stays neutral-warm.
  const accentBorder = withAlpha(P.accent, isDark ? 0.22 : 0.16);
  return StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5E6FA',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.85,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    // paddingTop is supplied inline from the root provider's top inset —
    // deliberately NOT paddingVertical here, which would sit at the same
    // specificity as the inline override and make which one wins ambiguous.
    paddingBottom: 15,
  },
  // Header buttons, cards and footer buttons share one radius scale and the
  // same accent-tinted border, so they read as one intentional set.
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: surf(0.45),
    borderRadius: RADIUS.headerButton,
    borderWidth: 1,
    borderColor: accentBorder,
  },
  backButtonText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: P.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: surf(0.45),
    borderRadius: RADIUS.headerButton,
    borderWidth: 1,
    borderColor: accentBorder,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: P.text,
  },
  claimErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.4)',
  },
  claimErrorText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    color: '#7A4B00',
    marginRight: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // ── Logo Section ──────────────────────────────────────────────────────
  // A plain circular avatar picker, centred, with no card wrapper. Everything
  // here is derived from LOGO_SIZE so the circle stays a true circle (and the
  // badge stays on its edge) if the size is ever changed.
  logoSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  logoContainer: {
    position: 'relative',
  },
  providerLogo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 3,
    borderColor: surf(0.8),
  },
  logoPlaceholder: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: surf(0.3),
    borderWidth: 2,
    borderColor: accentBorder,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEditBadge: {
    position: 'absolute',
    // Placed on the circle's 45° diagonal, not a bounding-box corner, so it
    // sits ON the edge rather than drifting away from it.
    bottom: LOGO_BADGE_OFFSET,
    right: LOGO_BADGE_OFFSET,
    width: LOGO_BADGE_SIZE,
    height: LOGO_BADGE_SIZE,
    borderRadius: LOGO_BADGE_SIZE / 2,
    backgroundColor: P.accent,
    justifyContent: 'center',
    alignItems: 'center',
    // Ring in the page background so the badge reads as lifted off the circle.
    borderWidth: 2,
    borderColor: isDark ? P.card : P.bg,
    shadowColor: CARD_SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  logoCaption: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: fg(0.6),
    marginTop: 10,
  },

  // ── Continuous document ───────────────────────────────────────────────
  // Direction B: the whole profile is one scroll. Structure is carried by
  // oversized numerals and typographic breaks rather than bordered cards, so
  // there is deliberately no border/blur/shadow on a section itself.
  docApp: {
    flex: 1,
    position: 'relative',
  },
  // Reading-position rail. Pinned over the scroll (never scrolls with it) and
  // pointerEvents="none" at the call site — it is an indicator, not a control.
  docScrollspy: {
    position: 'absolute',
    right: 6,
    top: 24,
    bottom: 24,
    width: 3,
    flexDirection: 'column',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  docSpySeg: {
    flex: 1,
    marginVertical: 2,
    borderRadius: 2,
    backgroundColor: fg(0.12),
  },
  // Full-bleed section: a hairline rule and generous space do the separating.
  docSection: {
    marginBottom: 40,
    paddingBottom: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: fg(0.12),
  },
  docSectionLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  // The oversized numeral. Low opacity so it reads as a structural watermark
  // rather than competing with the heading; colour is applied at the call site
  // from the provider's accent.
  // 0.18 was faint enough that the numerals read as texture rather than as the
  // structure they're meant to carry; 0.32 keeps them clearly secondary to the
  // heading while actually being legible.
  docNum: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 46,
    lineHeight: 50,
    opacity: 0.42,
    marginBottom: -6,
  },

  /** Services (04) carries the most work of any section — the service list,
   *  categories and the whole ServiceModal — so its numeral steps up over its
   *  siblings. The heading itself stays at the shared 24: DESIGN_SYSTEM.md caps
   *  section headings at 20–24, so emphasis comes from the numeral alone rather
   *  than an out-of-scale heading. */
  docNumLead: {
    fontSize: 60,
    lineHeight: 64,
    opacity: 0.6,
  },
  docHeading: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 24,
    letterSpacing: 0.2,
    color: P.text,
    marginBottom: 4,
  },
  docSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    color: fg(0.85),
    marginBottom: 20,
  },
  // Additive jump-to-next affordance at the foot of each section — the
  // scrollspy rail stays a passive indicator, this is a separate, optional
  // shortcut for a reader who'd rather tap than scroll. Deliberately a small,
  // right-aligned outlined pill — NOT full-width/filled/shadowed like a
  // primary CTA, since Publish (pinnedBarButton) is the only real primary
  // action on this screen and this shouldn't visually compete with it.
  // Surface fill + accent-tinted border matches the header icon buttons
  // (backButton) rather than any filled-accent treatment.
  docNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    marginTop: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: RADIUS.footerButton,
    backgroundColor: surf(isDark ? 0.4 : 0.6),
    borderWidth: 1,
    borderColor: accentBorder,
  },
  docNextButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  // Closing typographic marker — signals the scroll has genuinely ended,
  // which matters more without a hub to return to.
  docEnd: {
    alignItems: 'center',
    marginTop: 30,
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: fg(0.12),
  },
  docEndMark: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1,
    color: fg(0.6),
    marginBottom: 12,
  },
  // ── Inline required-field flag ────────────────────────────────────────
  // Sits on the field's own label row, so "this blocks publishing" is visible
  // where the problem is and not only in a roll-up. Amber, not the provider
  // accent — see REVIEW_WARN_COLOR.
  // Label and flag share one baseline-aligned row, so the flag reads as
  // belonging to that field rather than floating between fields.
  docFieldRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  // Was 10px, which made the one flag explaining why Publish is blocked the
  // faintest thing on the row. 11.5 with tighter tracking stays compact but is
  // actually readable; the amber was already full-strength.
  docFieldFlag: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: REVIEW_WARN_COLOR,
  },
  // Roll-up above Publish. The counterpart to the inline flags — same amber,
  // same source (missingRequired), so the two can never disagree.
  publishWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  publishWarningText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 15,
    color: REVIEW_WARN_COLOR,
  },
  // ── Pinned bottom bar ─────────────────────────────────────────────────
  // Permanent bottom chrome sitting BELOW the ScrollView (not floating over
  // it), so the primary action is always reachable without scrolling to the
  // end. Same position in the tree the old step-wizard footer occupied.
  pinnedBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: fg(0.12),
    // Matches the screen background (ThemedBackground paints palette.bg) so
    // the pinned bar reads as part of the page rather than a separate white
    // slab. Was isDark ? P.card : '#FDFBF8' — an off-white that didn't
    // correspond to any background token and visibly banded against #F5F1EC.
    backgroundColor: P.bg,
  },
  // Full-width, flat accent fill — the standard primary-action treatment.
  pinnedBarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: RADIUS.footerButton,
    shadowColor: CARD_SHADOW_COLOR,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.30 : 0.22,
    shadowRadius: 8,
    elevation: 2,
  },
  pinnedBarButtonDisabled: {
    opacity: 0.6,
  },
  pinnedBarButtonText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 15,
    fontWeight: "bold",
  },

  // ── Section editor footer ─────────────────────────────────────────────
  // flex-end, not space-between: on the first section Back is hidden, and
  // space-between would leave Next stranded on the left. This keeps Next
  // pinned right in both cases, with Back sitting to its left when present.
  // Plainer secondary treatment — a surface fill with the shared accent-tinted
  // border, matching the header icon buttons rather than the primary action.


  // ── Review & publish step ─────────────────────────────────────────────
  // The header row already carries its own bottom margin; this just lets the
  // title take the free space so "Edit" stays pinned right.
  // Only for a required field that's actually empty — an optional blank
  // stays neutral, so the warn colour always means "this blocks publishing".
  reviewFootnote: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    color: fg(0.66),
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  // A dedicated card rather than a bare row floating in the section flow —
  // the terms gate gets the same boxed treatment as an input field, so it
  // reads as its own distinct, important checkpoint before Publish.
  termsBox: {
    borderRadius: 12,
    backgroundColor: surf(isDark ? 0.3 : 0.96),
    borderWidth: 1,
    borderColor: edge(isDark ? 0.15 : 0.13),
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 18,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: fg(0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsRowText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
    color: P.text,
  },
  termsRowLink: {
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  // Zero-height: the 40px white gradient that sat on top of every card is
  // gone. Kept as a style (rather than deleting the <LinearGradient> from
  // the remaining service-card render site) so the markup stays untouched and
  // the sheen is one line away if it's ever wanted back.
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Portfolio manager
  portfolioLoadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Address photos sit directly under their hint text with no card or divider
  // between them, so the grid needs its own breathing room — the Portfolio
  // grid gets that from the section heading above it instead.
  addressPhotoGrid: {
    marginTop: 10,
  },
  portfolioThumbWrap: {
    position: 'relative',
    width: 84,
    height: 84,
  },
  portfolioThumb: {
    width: 84,
    height: 84,
    borderRadius: 14,
  },
  portfolioThumbUploading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioRemoveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  portfolioAddTile: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: fg(0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioAddPlus: {
    fontSize: 22,
    color: fg(0.7),
    fontWeight: '300',
    lineHeight: 24,
  },
  portfolioAddText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 9,
    color: fg(0.72),
    marginTop: 2,
  },

  // ── Elevated section header: numbered accent chip + stronger title ──
  sectionSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
    color: fg(0.7),
    marginBottom: 18,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: P.text,
  },

  // Input Groups
  inputGroup: {
    marginBottom: 14,
  },
  // Field labels carry the form's structure, so they were the worst thing to
  // have sitting at 0.55 — uppercase at 11px is already low-contrast before
  // any alpha is applied. Lifted to 0.78 and up a half-point in size.
  inputLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: fg(0.78),
    marginBottom: 7,
  },
  inputHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '700',
    color: fg(0.86),
    marginTop: 6,
  },
  // Bright, well-defined text-box card — was a near-invisible 0.2-alpha
  // white fill that washed out against the modal's own light background.
  // elevation: 0 (Android only, both below) — overflow:'hidden' +
  // borderRadius + a non-zero elevation clips Android's shadow to the
  // rounded outline instead of letting it fade outward, showing as a dark
  // ring. iOS keeps its shadow via shadow* above.
  inputBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: P.surfaceRaised,
    borderWidth: 1.5,
    borderColor: fg(0.08),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 0,
  },
  inputBlurMultiline: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: P.surfaceRaised,
    borderWidth: 1.5,
    borderColor: fg(0.08),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 0,
  },
  // Reverts the main provider profile form's fields back to their original
  // translucent look (only the Add Service modal's boxes got the brighter
  // card treatment) — merged over inputBlur/inputBlurMultiline to cancel
  // out the border/shadow/solid-fill additions.
  //
  // Quieter still now: a soft tonal fill with no border and no shadow, so the
  // field sits INSIDE its card instead of reading as a second raised surface
  // stacked on the first. The card carries the weight; the input just holds
  // the value.
  // Fill brightened 0.16 → 0.28 so the fields read clearly against their card
  // rather than nearly disappearing into it. Deliberately still short of the
  // full inputBlur treatment: the border/shadow stay off, so this is a
  // brighter quiet field, not a second raised surface on top of the card.
  // Brighter fill + a hairline edge instead of the old borderless surf(0.28),
  // which read flat against the backdrop. Shadow stays off — depth here comes
  // from the edge, not a drop shadow, so fields stay crisp rather than puffy.
  profileInputBox: {
    borderRadius: 12,
    backgroundColor: surf(isDark ? 0.3 : 0.96),
    borderWidth: 1,
    borderColor: edge(isDark ? 0.15 : 0.13),
    shadowOpacity: 0,
    elevation: 0,
  },
  textInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    color: P.text,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textInputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },

  // ── Location picker ──
  // The city trigger deliberately matches profileInputBox's quiet tonal fill
  // rather than releaseDayBtn's bordered pill, so it reads as the Location
  // field itself (which it replaces) and not as a button sitting beside one.
  locationSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    backgroundColor: surf(0.28),
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  locationSelectText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    color: P.text,
  },
  locationStepLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: fg(0.72),
    marginTop: 14,
  },

  // Service Categories
  serviceCategoryScroll: {
    flexGrow: 0,
  },
  serviceCategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: surf(0.2),
    marginRight: 10,
    borderWidth: 1,
    borderColor: surf(0.3),
  },
  serviceCategoryChipSelected: {
    backgroundColor: fg(0.15),
    borderColor: fg(0.3),
  },
  serviceCategoryText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: fg(0.7),
  },
  serviceCategoryTextSelected: {
    color: P.text,
  },

  // Gradient Selector
  gradientSelector: {
    alignItems: 'center',
  },
  gradientPreviewLarge: {
    width: '100%',
    height: 60,
    borderRadius: 15,
    marginBottom: 10,
  },
  gradientSelectorText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    color: fg(0.6),
  },

  // Services Section
  servicesSection: {
    marginBottom: 20,
  },
  servicesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  addCategoryButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addCategoryText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#fff',
  },
  emptyServicesCard: {
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: surf(0.15),
  },
  emptyServicesEmoji: {
    fontSize: 30,
    marginBottom: 10,
  },
  emptyServicesText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    color: fg(0.6),
    textAlign: 'center',
    lineHeight: 20,
  },

  // Category Tabs
  categoryHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    color: fg(0.6),
    marginBottom: 10,
  },
  selectedCategoryDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    color: fg(0.65),
    marginBottom: 14,
  },
  categoryTabs: {
    marginBottom: 15,
    maxHeight: 52,
  },
  categoryTabsContent: {
    paddingRight: 20,
    gap: 10,
  },
  // Pills keep their capsule shape (they are pills, not cards) but pick up the
  // accent-tinted border the rest of the screen's controls now share, so the
  // restored strip sits inside the polished language rather than beside it.
  categoryTab: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: accentBorder,
  },
  categoryTabBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: surf(0.08),
    borderRadius: 20,
    overflow: 'hidden',
  },
  // The selected pill is the one piece of the strip that's genuinely the
  // provider's own state, so it takes the provider accent rather than another
  // near-identical surface tint (which read as barely-selected before).
  selectedCategoryTab: {
    borderColor: withAlpha(P.accent, isDark ? 0.45 : 0.35),
  },
  selectedCategoryTabBlur: {
    backgroundColor: withAlpha(P.accent, isDark ? 0.20 : 0.12),
  },
  selectedCategoryTabText: {
    color: P.text,
  },
  draggingCategoryTabBlur: {
    backgroundColor: surf(0.9),
  },
  categoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: fg(0.7),
  },
  // Applied to every pill except the one actively being dragged, so it's
  // unambiguous which pill is moving instead of a row of equally-solid pills.
  categoryTabDimmed: {
    opacity: 0.45,
  },
  categoryDragHandle: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  serviceDragHandle: {
    marginLeft: 4,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  // Matches the section cards: same radius scale, same accent-tinted border,
  // same rose tint-shadow, so a service card reads as the same material.
  // elevation: 0 (Android only) — doubly at risk: surf(0.1) is a
  // translucent fill that lets Android's elevation shadow bleed straight
  // through as a dark ring, AND overflow:'hidden' + borderRadius clips
  // whatever shadow remains to the rounded outline instead of letting it
  // fade outward. iOS keeps its shadow via shadow* above.
  serviceItemCard: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    backgroundColor: surf(0.1),
    borderWidth: 1,
    borderColor: accentBorder,
    shadowColor: CARD_SHADOW_COLOR,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.18 : 0.12,
    shadowRadius: 8,
    elevation: 0,
  },
  serviceCardBlur: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  serviceImageContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  serviceImage: {
    width: 60,
    height: 60,
  },
  serviceImagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: surf(0.3),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageCountText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#fff',
  },
  serviceInfo: {
    flex: 1,
    marginRight: 10,
  },
  serviceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: P.text,
    marginBottom: 4,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: fg(0.6),
    marginBottom: 6,
  },
  serviceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: fg(0.68),
  },
  servicePrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  serviceActions: {
    gap: 8,
  },
  editServiceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: surf(0.4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  editServiceText: {
    fontSize: 14,
  },
  deleteServiceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,100,100,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteServiceText: {
    fontSize: 18,
    color: '#c00',
    fontWeight: 'bold',
  },
  addServiceButton: {
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: fg(0.2),
  },
  addServiceBlur: {
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: surf(0.1),
  },
  addServiceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },
  // Service Cards
  categoryServicesContainer: {
    gap: 12,
  },


  // Required-field asterisk
  requiredStar: {
    // Scaled with inputLabel (14 → 11): at the old 13 it outweighed the label
    // it was marking. Softened too — it's a marker, not a warning.
    color: 'rgba(229,57,53,0.85)',
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
  },

  // Duration quick-picker chips
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: fg(0.14),
    backgroundColor: surf(0.45),
  },
  durationChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: fg(0.7),
  },
  durationChipTextActive: {
    color: '#fff',
  },

  // Bottom-sheet modals (template picker, add category)
  templateSheet: {
    height: '82%',
    marginTop: 'auto',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    // Below templateCard/categoryTypeCard's surf(0.55): a sheet backdrop
    // brighter than the cards sitting on it (0.75 in dark mode washes out
    // to a near-white panel over BlurView's tint="dark") inverts the surface
    // hierarchy — the container should read dimmer than its contents.
    backgroundColor: surf(0.4),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: fg(0.18),
    marginTop: 10,
    marginBottom: 2,
  },
  templateSheetSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    color: fg(0.66),
    marginTop: 3,
  },
  templateGroupLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: fg(0.6),
    marginTop: 22,
    marginBottom: 4,
  },
  templateScratchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: surf(0.4),
  },
  templateScratchIcon: {
    fontSize: 22,
  },
  templateScratchTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: P.text,
  },
  templateScratchSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    color: fg(0.5),
    marginTop: 2,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 16,
    marginTop: 10,
    backgroundColor: surf(0.55),
    borderWidth: 1,
    borderColor: fg(0.06),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  templateName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: P.text,
  },
  templateDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    color: fg(0.5),
    marginTop: 3,
  },
  templateAdd: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },

  // Category type picker cards
  categoryTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  categoryTypeCard: {
    // Math.floor avoids a sub-pixel rounding overflow that can push the 3rd
    // column onto its own row (3 fractional widths + 2 gaps summing to just
    // over the available width).
    width: Math.floor((screenWidth - 40 - 24) / 3),
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: surf(0.55),
    borderWidth: 1,
    borderColor: fg(0.06),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryTypeCardUsed: {
    opacity: 0.45,
  },
  categoryTypeLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: P.text,
  },
  categoryTypeBlurb: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 10,
    color: fg(0.5),
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 13,
  },


  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    // Keeps the sheet clear of the system navigation bar.
    paddingBottom: BOTTOM_SAFE_GAP,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: fg(0.1),
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: P.text,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: fg(0.15),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: P.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Gradient Picker Modal
  gradientPickerModal: {
    flex: 1,
    marginTop: 100,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  gradientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    paddingBottom: 40,
  },
  gradientOption: {
    width: (screenWidth - 75) / 3,
    alignItems: 'center',
    padding: 10,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gradientOptionSelected: {
    borderColor: P.text,
    backgroundColor: surf(0.3),
  },
  gradientPreview: {
    width: '100%',
    height: 50,
    borderRadius: 10,
    marginBottom: 8,
  },
  gradientName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: P.text,
    textAlign: 'center',
  },

  // Service Modal
  // A sheet that sits at the bottom rather than a near-fullscreen panel, so
  // it reads the same as the quick editor on the My Services dashboard. Only
  // ServiceModal uses this rule — the other modals keep modalHeader/
  // modalFooter, which are shared and deliberately untouched.
  serviceModal: {
    marginTop: 'auto',
    height: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  serviceSheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: fg(0.25),
    marginTop: 10,
    marginBottom: 14,
  },
  serviceSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  serviceSheetEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    color: fg(0.6),
    marginBottom: 3,
  },
  serviceSheetTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
    color: P.text,
  },
  // Fields inside the service sheet only. They mirror the quick editor on the
  // My Services dashboard: a small uppercase label over a plain bordered box,
  // no blur and no drop shadow, so the field sits inside the sheet rather than
  // reading as a second raised surface on top of it. The screen-wide
  // inputLabel/inputBlur pair is deliberately left alone — every other step of
  // registration still uses it.
  serviceSheetLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: fg(0.68),
    marginBottom: 6,
  },
  // Group headings — Photos, Scheduling, How clients find this, Safety &
  // aftercare, Extras — plus the heading that opens each tag block inside
  // them. Deliberately a step up from serviceSheetLabel in size, weight and
  // contrast: with 17 blocks in one scroll, a sheet whose headings all render
  // at field-label weight reads as one undifferentiated flow.
  serviceSheetSection: {
    // BakbakOne, per DESIGN_SYSTEM's one rule: uppercase/display type is
    // BakbakOne, sentences are Jura. It's a single-weight face, so there's no
    // fontWeight to set — the letterSpacing carries the caps instead.
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: P.text,
    marginBottom: 8,
  },
  // Hairline above each group heading. The separation is what makes the
  // sections read as sections — the heavier type alone doesn't do it once the
  // form is this long.
  serviceSheetSectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: fg(0.14),
    marginTop: 12,
    marginBottom: 18,
  },
  serviceSheetHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 17,
    color: fg(0.5),
    marginBottom: 8,
  },
  serviceSheetInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    color: P.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  serviceSheetInputMultiline: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  // A field that opens a picker rather than the keyboard — same box as
  // serviceSheetInput, with the value and its chevron on one line.
  serviceSheetSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  serviceSheetSelectText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 18,
    color: P.text,
  },
  serviceSheetPairRow: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceSheetPairItem: {
    flex: 1,
  },
  // Shown in the sheet instead of the Alert.alert the footer used to raise, so
  // the reason a save didn't go through stays next to the button that refused.
  serviceSheetError: {
    color: '#FF453A',
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 10,
  },
  serviceSheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  serviceSheetSave: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  serviceSheetSaveText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#FFFFFF',
    fontSize: 15,
  },

  // Small Modal (Add Category Modal)
  smallModal: {
    marginHorizontal: 30,
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: 25,
    borderRadius: 30,
    backgroundColor: surf(0.95),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
  },
  smallModalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: P.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  smallModalButtons: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
  },

  // Transfer Modal
  transferModal: {
    marginHorizontal: 25,
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: 30,
    borderRadius: 25,
    overflow: 'hidden',
  },
  transferGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  transferTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    color: P.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  transferSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    color: fg(0.7),
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
  transferButtons: {
    gap: 12,
    marginTop: 20,
  },
  transferButton: {
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#AF9197',
    alignItems: 'center',
  },
  transferButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: fg(0.2),
    alignItems: 'center',
    backgroundColor: surf(0.3),
  },
  skipButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: P.text,
  },
  transferError: {
    fontSize: 13,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  transferLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  transferLoadingText: {
    fontSize: 13,
    color: '#AF9197',
    fontStyle: 'italic',
  },

  // Buttons
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: fg(0.2),
    alignItems: 'center',
    backgroundColor: surf(0.2),
  },
  cancelButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: P.text,
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#AF9197',
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
  },

  // Carousel
  carouselContainer: {
    alignItems: 'center',
  },
  carouselContent: {
    gap: 10,
  },
  carouselImageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
  },
  carouselImage: {
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addImageButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: fg(0.3),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: surf(0.2),
  },
  addImageIcon: {
    fontSize: 24,
    color: fg(0.5),
  },
  addImageText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 10,
    color: fg(0.5),
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  // Sits on the first thumbnail so "the first one leads your service" is
  // visible on the strip itself, not only in the hint below it.
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  coverBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Bottom-right so it never sits under the remove button (top-right) or the
  // Cover badge (bottom-left).
  fitToggle: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  fitToggleText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  carouselHint: {
    marginTop: 8,
    fontSize: 11,
    color: fg(0.45),
    textAlign: 'center',
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: fg(0.2),
  },
  carouselDotActive: {
    backgroundColor: fg(0.6),
  },

  // Accent Color Picker Modal
  accentPickerModal: {
    flex: 1,
    marginTop: 150,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  accentPickerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    color: fg(0.6),
    textAlign: 'center',
    marginBottom: 20,
  },
  accentColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  accentColorOption: {
    width: (screenWidth - 90) / 4,
    alignItems: 'center',
    padding: 10,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accentColorOptionSelected: {
    borderColor: P.text,
    backgroundColor: surf(0.3),
  },
  accentColorSwatch: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  accentColorName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 10,
    color: P.text,
    textAlign: 'center',
  },

  // Preview Modal - Matches ProviderProfileScreen exactly
  previewContainer: {
    flex: 1,
  },
  previewSafeArea: {
    flex: 1,
  },
  // Full-bleed, exactly like ProviderProfileScreen/ProviderMyProfileScreen's
  // heroImage. A fixed height (this was 340) cut the backdrop off partway
  // through the hero block — the logo, name, rating and years-experience
  // stack runs past 340pt once the status inset and header are counted — so
  // the bare PP.bg showed through behind the lower hero text while the
  // content sheet still floated over it. The sheet below is opaque, so
  // extending to the bottom changes nothing except covering that gap.
  previewHeroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  previewBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: surf(0.25),
    borderRadius: 20,
  },
  previewBackText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
  },
  previewBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#fff',
    letterSpacing: 1,
  },
  previewScrollContent: {
    flex: 1,
  },
  previewScrollContentContainer: {
    paddingBottom: 40,
  },
  previewHeroTextShadow: {
    textShadowColor: fg(0.55),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  // The content sheet rises over the hero photo with its own large top
  // corners — same floating-card-over-photo composition as
  // ProviderProfileScreen's contentSheet.
  previewContentSheet: {
    borderTopLeftRadius: PREVIEW_SHEET_LIP_RADIUS,
    borderTopRightRadius: PREVIEW_SHEET_LIP_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  // Radius + overflow live on this INNER view, separate from
  // previewContentSheet's shadow — iOS silently drops a view's shadow when
  // overflow:'hidden' is set on that same view, so clip and shadow must be on
  // different layers. Without the clip the opaque PP.bg painted as a hard
  // square over the hero backdrop (the rounded top corners never actually cut),
  // which read as the sheet chopping the hero off. Mirrors
  // ProviderMyProfileScreen's contentSheet/contentSheetClip pair exactly.
  previewContentSheetClip: {
    minHeight: screenHeight,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 60,
    borderTopLeftRadius: PREVIEW_SHEET_LIP_RADIUS,
    borderTopRightRadius: PREVIEW_SHEET_LIP_RADIUS,
    overflow: 'hidden',
  },
  // Logo — same 148x148 dimensions as ProviderProfileScreen
  previewLogoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  previewLogoWrapper: {
    position: 'relative',
    width: 148,
    height: 148,
  },
  previewProviderLogo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 4,
    borderColor: 'rgba(255, 253, 251, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  previewLogoGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  // Provider Info - Centered
  previewProviderInfoCenter: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  previewProviderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  previewProviderNameLarge: {
    fontFamily: 'Prata-Regular',
    fontSize: 30,
    lineHeight: 40,
    textAlign: 'center',
  },
  previewMetaText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  // Rating
  previewRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 8,
  },
  previewStars: {
    flexDirection: 'row',
    gap: 3,
  },
  previewStar: {
    fontSize: 12,
    color: '#FFD700',
  },
  previewRatingText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 4,
  },
  previewYearsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    opacity: 0.9,
    letterSpacing: 0.4,
  },
  // Slots with Bell
  previewSlotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  previewSlotsCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  previewSlotsText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    zIndex: 2,
  },
  previewBellButtonInline: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: surf(0.3),
    zIndex: 2,
  },
  // Generic frosted card — About / Reviews / Contact
  previewCard: {
    padding: 22,
    borderRadius: 26,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
  },
  previewCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  previewSectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  previewSectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  previewAboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  previewMoreButton: {
    alignSelf: 'flex-start',
  },
  previewMoreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Services Section
  previewServicesSection: {
    marginBottom: 20,
  },
  previewCategoryTabs: {
    marginBottom: 15,
    maxHeight: 60,
  },
  previewCategoryTabsContent: {
    gap: 12,
    paddingVertical: 8,
  },
  previewSelectedCategoryDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    marginTop: -6,
  },
  previewCategoryServicesContainer: {
    gap: 12,
  },
  previewServiceItemCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 15,
    marginBottom: 12,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
  },
  previewServiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewServiceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  previewServiceImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  previewServiceImagePlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
  },
  previewServiceItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  previewServiceItemName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 4,
  },
  previewServiceItemDesc: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 6,
  },
  previewServiceItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewServiceItemDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
  },
  previewServiceItemPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Book Button
  previewBookButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewBookButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Add-ons in preview
  previewServiceAddOns: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  previewAddOnsLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 10,
    marginBottom: 4,
  },
  previewAddOnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  previewAddOnName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
  },
  previewAddOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  // Contact rows — matches ProviderProfileScreen's contactRow layout
  previewContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  previewContactLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
  },
  previewContactValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    paddingLeft: 16,
  },
  previewContactAction: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
  },
  previewContactButton: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  previewContactButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.6,
    color: '#fff',
  },
  // Portfolio — Pinterest-style two-column masonry, matching ProviderProfileScreen
  previewPortfolioSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  previewPortfolioColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  previewPortfolioColumn: {
    flex: 1,
    gap: 12,
  },
  previewPortfolioTile: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
  },
  // Venue strip — same tile size as the client profile's Venue block in
  // ProviderAdditionalInfoSection (150x105), not a masonry tile.
  previewVenueStrip: {
    gap: 10,
    paddingRight: 8,
  },
  previewVenueTile: {
    width: 150,
    height: 105,
    borderRadius: 14,
    overflow: 'hidden',
  },
  previewVenueImage: {
    width: '100%',
    height: '100%',
  },
  previewPortfolioCaptionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  previewPortfolioCaption: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
    color: '#fff',
  },

  // Custom Service Type Input
  customServiceInput: {
    marginTop: 10,
  },

  // Accent Color Preview
  accentColorPreview: {
    width: '100%',
    height: 60,
    borderRadius: 15,
    marginBottom: 10,
  },

  // Category Edit Hint
  categoryEditHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    fontWeight: '600',
    color: fg(0.55),
    marginTop: 2,
  },

  // Add-Ons Styles
  addOnsContainer: {
    marginTop: 10,
    marginBottom: 15,
    gap: 8,
  },
  addOnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: surf(0.3),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  addOnInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    marginRight: 10,
  },
  addOnName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    color: P.text,
    flex: 1,
  },
  addOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#7B1FA2',
  },
  removeAddOnButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,100,100,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAddOnText: {
    fontSize: 16,
    color: '#c00',
    fontWeight: 'bold',
  },
  addAddOnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  addOnNameInput: {
    flex: 2,
  },
  addOnPriceInput: {
    flex: 1,
  },
  addAddOnButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#AF9197',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddOnButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },

  // ── Chip select — styled like the service template cards (templateCard)
  // so tag options read as small pickable cards, not flat pills. ──
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: surf(0.55),
    borderWidth: 1,
    borderColor: fg(0.06),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  chipWarning: {
    backgroundColor: '#FF6868',
    borderColor: '#FF6868',
  },
  chipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: P.text,
  },
  chipTextActive: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#fff',
  },

  // ── Safety card (Aesthetics) ──
  safetyCard: {
    backgroundColor: 'rgba(156,39,176,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(156,39,176,0.18)',
    padding: 16,
    gap: 12,
  },
  // The Treatment Safety card's heading is the same class of subheading as
  // serviceSheetSection and sits in the same sheet, so it takes the same face —
  // only the colour differs, since the safety card is deliberately its own.
  safetySectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#6A1B9A',
    marginBottom: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
    color: fg(0.85),
  },
  toggleHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    color: fg(0.6),
    marginTop: 1,
  },

  releaseDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: fg(0.12),
    backgroundColor: fg(0.04),
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
  releaseDayBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: fg(0.75),
  },

  releasePickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,18,0.46)',
    // Keeps the sheet clear of the system navigation bar.
    paddingBottom: BOTTOM_SAFE_GAP,
  },
  releasePickerSheet: {
    backgroundColor: P.surfaceRaised,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  releasePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  releasePickerEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    color: fg(0.46),
    marginBottom: 4,
  },
  releasePickerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
    color: '#20191C',
  },
  releasePickerClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fg(0.06),
  },
  releasePickerSubtext: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 18,
    color: fg(0.57),
    marginTop: 10,
    marginBottom: 18,
  },
  releasePickerClearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 14,
  },
  releasePickerClearText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  releasePickerDoneButton: {
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 20,
  },
  releasePickerDoneText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: '#FFFFFF',
  },

  // ── Tab switcher ──
  // ── Policies step ──
  // Matched to the Profile tab's hierarchy. These were the only headings on
  // the screen with no fontFamily at all, so they rendered in the OS default
  // while everything around them used the app's two fonts.
  policySectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
    color: fg(0.82),
    marginBottom: 12,
  },
  // 10px uppercase at 0.42 alpha with 1.3 tracking was the faintest text on the
  // screen — these are section labels, not fine print. Bigger, less spaced out,
  // and much closer to full strength.
  policyLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: fg(0.72),
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 4,
  },
  // Unselected pills sit on the surface ramp with a hairline edge rather than a
  // flat fg() wash — fg() is the *text* ramp, so using it as a fill read muddy.
  policyPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: surf(isDark ? 0.16 : 0.9),
    borderWidth: 1,
    borderColor: edge(isDark ? 0.14 : 0.13),
  },
  policyPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: fg(0.55),
  },
  policyNote: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: edge(isDark ? 0.16 : 0.14),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: P.text,
    backgroundColor: surf(isDark ? 0.16 : 0.92),
  },
  addressHint: {
    fontSize: 13,
    fontWeight: '600',
    color: fg(0.72),
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 18,
  },

  });
};

// Only the light sheet is ever used — InfoRegScreen deliberately ignores the
// app's dark mode setting (the registration/business-details flow reads as a
// single document meant to look the same regardless of device theme), so
// there's no dark counterpart to build or look up.

/** The themed style sheet for this screen — always the light sheet, never
 *  read from useTheme().isDarkMode the way the rest of the app's screens do. */
// Styles are rebuilt when the window changes rather than frozen at module
// load, so the tile grids below still divide the real screen width after a
// rotation or in split-screen.
const useScreenStyles = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return useMemo(() => makeStyles(false, screenWidth, screenHeight), [screenWidth, screenHeight]);
};

// Same ramp the sheet above is built from, for the colours that can't live in
// a StyleSheet: `placeholderTextColor`, `<Ionicons color>`, `trackColor`, etc.
const lightChrome = {
  fg: fgFor(false),
  surf: surfFor(false),
  text: lightTheme.text,
  onAccent: lightTheme.onAccent,
  blurTint: 'light' as const,
};

/** Colours for inline props that a StyleSheet can't carry — always the light
 *  ramp, for the same reason useScreenStyles() above never reads dark mode. */
const useChrome = () => lightChrome;

export default InfoRegScreen;
