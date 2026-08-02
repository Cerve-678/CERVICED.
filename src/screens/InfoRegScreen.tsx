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
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputFocusEventData,
  Switch,
  Animated,
  PanResponder,
} from 'react-native';
import ReAnimated, { LinearTransition } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StackScreenProps } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
// Icon imports
import { BellIcon } from '../components/IconLibrary';
import CategoryTabPill from '../components/CategoryTabPill';
import { Ionicons } from '@expo/vector-icons';

// Theme imports
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

// Auth
import { useAuth } from '../contexts/AuthContext';

// Supabase registration service
import { saveProviderToSupabase, loadProviderFromSupabase, saveProviderPolicies, loadProviderPolicies, uploadToStorage } from '../services/providerRegistrationService';
import type { ProviderRegistrationData } from '../services/providerRegistrationService';
import { transferFromAcuity } from '../services/acuityTransferService';
import { getPendingClaim, claimProviderProfile, clearPendingClaim } from '../services/providerClaimService';
import { supabase } from '../lib/supabase';
import { getProviderPortfolio, addPortfolioItem, deletePortfolioItem, getProviderIdForUserId, getUserSignupPrefillInfo } from '../services/databaseService';
import type { DbPortfolioItem } from '../types/database';

import {
  resolveProviderTheme,
  withAlpha,
  isDarkColor,
  blend,
} from '../constants/providerThemes';

// Navigation types
import { ProfileStackParamList } from '../navigation/types';
import { logger } from '../utils/logger';

type InfoRegScreenProps = StackScreenProps<ProfileStackParamList, 'ProfileMain'>;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
// Hero → content transition, copied from ProviderProfileScreen: the logo/name/
// rating/slots float directly over the hero photo/gradient, then the content
// sheet rises over it with a rounded lip. Keep this in sync with that screen.
const PREVIEW_SHEET_LIP_RADIUS = 36;

// Service categories (removed BARBER and SKINCARE)
const SERVICE_CATEGORIES = [
  'HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'
];

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  salon: 'Salon',
  studio: 'Studio',
  home_based: 'Home Based',
  mobile: 'Mobile',
};

// Accent color options
const ACCENT_COLORS = [
  { name: 'Berry', color: '#C2185B' },
  { name: 'Purple', color: '#7B1FA2' },
  { name: 'Deep Purple', color: '#4A148C' },
  { name: 'Indigo', color: '#303F9F' },
  { name: 'Blue', color: '#1565C0' },
  { name: 'Teal', color: '#00838F' },
  { name: 'Green', color: '#2E7D32' },
  { name: 'Orange', color: '#E65100' },
  { name: 'Brown', color: '#4E342E' },
  { name: 'Rose', color: '#AD1457' },
  { name: 'Coral', color: '#FF5722' },
  { name: 'Gold', color: '#FF8F00' },
];

// Predefined gradient options - expanded with more themes
const GRADIENT_PRESETS: Array<{ name: string; colors: [string, string, ...string[]] }> = [
  { name: 'App Default', colors: ['#EDE8E2', '#C4A8AE', '#AF9197'] },
  { name: 'Sunset', colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
  { name: 'Rose Gold', colors: ['#FF69B4', '#FFB6C1', '#FFC1CC'] },
  { name: 'Ocean', colors: ['#5fd5dcff', '#bd66ff9c', '#33CCCC'] },
  { name: 'Purple Haze', colors: ['#8d59acff', '#c069c4ff', '#aba0a1ff'] },
  { name: 'Forest', colors: ['#1B4332', '#2D5A3D', '#40916C'] },
  { name: 'Warm Nude', colors: ['#FFE4B5', '#FFDAB9', '#FFB347'] },
  { name: 'Deep Pink', colors: ['#830c53ff', '#f6bbe9ff', '#572862ff'] },
  { name: 'Royal Blue', colors: ['#8ba4e9ff', '#073784ff', '#37106aff'] },
  { name: 'Lavender', colors: ['#E6E6FA', '#DDA0DD', '#DA70D6'] },
  { name: 'Mocha', colors: ['#8c5c0eff', '#311f00ff', '#6f430eff'] },
  { name: 'Lash Bae', colors: ['#dc8fedb5', '#e0d3e0ff', '#2d2d2d'] },
  // New themes
  { name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Cherry', colors: ['#EB3349', '#F45C43', '#FF6B6B'] },
  { name: 'Peach', colors: ['#FFD89B', '#FFCC99', '#FF9966'] },
  { name: 'Mint', colors: ['#00B09B', '#96C93D', '#A8E6CF'] },
  { name: 'Blush', colors: ['#FFECD2', '#FCB69F', '#FF8A80'] },
  { name: 'Cosmic', colors: ['#C33764', '#1D2671', '#0F0C29'] },
  { name: 'Honey', colors: ['#F7971E', '#FFD200', '#FFE066'] },
  { name: 'Grape', colors: ['#5B247A', '#1BCEDF', '#7B4397'] },
  { name: 'Slate', colors: ['#4B6CB7', '#182848', '#2C3E50'] },
  { name: 'Rosewood', colors: ['#D4145A', '#FBB03B', '#ED4264'] },
  { name: 'Ice', colors: ['#74EBD5', '#ACB6E5', '#E0EAFC'] },
  { name: 'Ember', colors: ['#FF416C', '#FF4B2B', '#F5AF19'] },
  { name: 'Custom', colors: ['#FFFFFF', '#EEEEEE', '#DDDDDD'] },
];

// Provider data interface for registration
// ProviderRegistrationData now comes from providerRegistrationService — kept
// as a single source of truth so fields (like profileTheme) never drift out
// of sync between the two.

// ─── Policy types ────────────────────────────────────────────────────────────
type CancelNotice     = 'none' | '24h' | '48h' | '72h';
type CancelPenalty    = 'none' | 'deposit' | 'full';
type RescheduleNotice = 'same_day' | '24h' | '48h' | '72h';
type MaxReschedules   = '1' | '2' | 'unlimited';
type DepositType      = 'percent' | 'fixed';
type NoShowAction     = 'none' | 'warn' | 'charge_deposit' | 'charge_full';

interface ProviderPolicies {
  cancelNotice:     CancelNotice;
  cancelPenalty:    CancelPenalty;
  cancelNote:       string;
  rescheduleNotice: RescheduleNotice;
  maxReschedules:   MaxReschedules;
  rescheduleNote:   string;
  depositRequired:  boolean;
  /** Client must pay the deposit — no "pay in full" choice at checkout. */
  depositOnly:      boolean;
  depositType:      DepositType;
  depositAmount:    string;
  depositNote:      string;
  noShowAction:     NoShowAction;
  noShowNote:       string;
  /** Optional instructions stamped onto every new booking (e.g. "please
   *  arrive 10 minutes early") — shown to clients in their booking details */
  bookingInstructions: string;
  /** Optional photo of a fuller policy document (e.g. a house-rules sheet,
   *  a scanned consent form) — shown to clients via a pop-up on their
   *  profile view, on top of the structured fields above. */
  policyImageUrl: string;
}

const DEFAULT_POLICIES: ProviderPolicies = {
  cancelNotice:     '24h',
  cancelPenalty:    'none',
  cancelNote:       '',
  rescheduleNotice: '24h',
  maxReschedules:   '1',
  rescheduleNote:   '',
  depositRequired:  false,
  depositOnly:      false,
  depositType:      'percent',
  depositAmount:    '',
  depositNote:      '',
  noShowAction:     'none',
  noShowNote:       '',
  bookingInstructions: '',
  policyImageUrl:   '',
};

// Add-on interface
interface AddOnData {
  id: number;
  name: string;
  price: number;
}

interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  // Blank = no override. before defaults to 0; after inherits the provider's global buffer.
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: string[];
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

const isAestheticsService = (cat: string, fallback?: string) => inferCategoryKind(cat, fallback) === 'AESTHETICS';

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

// Starter contraindications for aesthetic treatments — common, well-established
// conditions practitioners routinely screen for. Tap to add instantly; providers
// can still type their own for anything treatment-specific.
// TODO: revisit with a proper pass on current per-treatment guidance — see the
// research prompt in the PR/commit notes for sourcing more specific ones.
const COMMON_CONTRAINDICATIONS = [
  'Pregnant or breastfeeding',
  'Active cold sore / skin infection in area',
  'Blood thinning medication',
  'Autoimmune condition',
  'Keloid scarring history',
  'Active acne in treatment area',
  'Allergy to local anaesthetic',
  'Recent sunburn / sun exposure',
  'Uncontrolled diabetes',
  'Under 18 without guardian consent',
];

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

// Quick-pick durations — providers tap instead of typing "1 hour".
const DURATION_PRESETS = ['15 min', '30 min', '45 min', '1 hr', '1 hr 30', '2 hr', '2 hr 30', '3 hr', '3 hr 30', '4 hr'];

// A fresh, empty service — optionally seeded from a template so name + duration
// (+ a sensible service type) arrive pre-filled.
const makeServiceDraft = (template?: ServiceTemplate | null): ServiceData => ({
  id: Date.now(),
  name: template?.name ?? '',
  price: 0,
  duration: template?.duration ?? '',
  bufferBeforeMins: null,
  bufferAfterMins: null,
  description: template?.description ?? '',
  images: [],
  addOns: [],
  tags: template?.styleTags ?? [],
  techniqueTags: template?.techniqueTags ?? [],
  outcomeTags: template?.outcomeTags ?? [],
  occasionTags: template?.occasionTags ?? [],
  trendNames: template?.trendNames ?? [],
  isPregnancySafe: false,
  patchTestRequired: false,
  minAge: null,
  contraindications: [],
  aftercareNotes: '',
  serviceType: template?.serviceType ?? '',
});

// Service Image Carousel Component
interface ServiceImageCarouselProps {
  images: string[];
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  size?: number;
}

const ServiceImageCarousel: React.FC<ServiceImageCarouselProps> = ({
  images,
  onAddImage,
  onRemoveImage,
  size = 80,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / size);
    setActiveIndex(index);
  }, [size]);

  return (
    <View style={styles.carouselContainer}>
      <FlatList
        ref={flatListRef}
        data={[...images, 'add']}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item}-${index}`}
        getItemLayout={(_data, index) => ({ length: size, offset: size * index, index })}
        renderItem={({ item, index }) => {
          if (item === 'add') {
            return (
              <TouchableOpacity
                style={[styles.addImageButton, { width: size, height: size }]}
                onPress={onAddImage}
                activeOpacity={0.7}
              >
                <Text style={styles.addImageIcon}>+</Text>
                <Text style={styles.addImageText}>Add</Text>
              </TouchableOpacity>
            );
          }
          return (
            <View style={[styles.carouselImageContainer, { width: size, height: size }]}>
              <Image
                source={{ uri: item }}
                style={[styles.carouselImage, { width: size, height: size }]}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => onRemoveImage(index)}
              >
                <Text style={styles.removeImageIcon}>×</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={styles.carouselContent}
      />
      {images.length > 0 && (
        <View style={styles.carouselDots}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.carouselDot,
                activeIndex === index && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// Gradient Picker Modal
interface GradientPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (colors: [string, string, ...string[]]) => void;
  currentGradient: [string, string, ...string[]];
}

const GradientPickerModal: React.FC<GradientPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  currentGradient,
}) => {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.gradientPickerModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Your Gradient</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.gradientGrid}>
                {GRADIENT_PRESETS.map((preset, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.gradientOption,
                      JSON.stringify(preset.colors) === JSON.stringify(currentGradient) &&
                        styles.gradientOptionSelected,
                    ]}
                    onPress={() => {
                      onSelect(preset.colors);
                      onClose();
                    }}
                  >
                    <LinearGradient
                      colors={preset.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.gradientPreview}
                    />
                    <Text style={styles.gradientName}>{preset.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </BlurView>
      </View>
    </Modal>
  );
};

// ─── Reusable chip-select row ─────────────────────────────────────────────────
interface ChipSelectProps {
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  accentColor?: string;
}
const ChipSelect: React.FC<ChipSelectProps> = ({ options, selected, onToggle, accentColor = '#9C27B0' }) => (
  <View style={styles.chipGrid}>
    {options.map(opt => {
      const active = selected.includes(opt);
      return (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
          onPress={() => onToggle(opt)}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── Label with a red required asterisk ───────────────────────────────────────
const RequiredLabel: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <Text style={styles.inputLabel}>
    {children}
    {required && <Text style={styles.requiredStar}> *</Text>}
  </Text>
);

// ─── Duration quick-picker ────────────────────────────────────────────────────
// Providers tap a preset instead of typing "1 hour". A value that isn't a preset
// (older data / imports) shows as its own selected chip so nothing is ever lost.
interface DurationPickerProps {
  value: string;
  onChange: (v: string) => void;
  accentColor?: string;
}
const DurationPicker: React.FC<DurationPickerProps> = ({ value, onChange, accentColor = '#AF9197' }) => {
  const presets = DURATION_PRESETS.includes(value) || !value
    ? DURATION_PRESETS
    : [value, ...DURATION_PRESETS];
  return (
    <View style={styles.chipGrid}>
      {presets.map(opt => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.durationChip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
            onPress={() => onChange(active ? '' : opt)}
            activeOpacity={0.8}
          >
            <Text style={[styles.durationChipText, active && styles.durationChipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
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
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.templateSheet}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add a {categoryName || meta.label} Service</Text>
                <Text style={styles.templateSheetSub}>Pick a starting point or build your own</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <TouchableOpacity style={[styles.templateScratchCard, { borderColor: accentColor }]} onPress={() => onPick(null)} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={20} color={accentColor} style={styles.templateScratchIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateScratchTitle}>Start from scratch</Text>
                  <Text style={styles.templateScratchSub}>Blank service — fill in your own details</Text>
                </View>
              </TouchableOpacity>

              {templates.length > 0 && (
                <Text style={styles.templateGroupLabel}>Popular {groupLabel} services</Text>
              )}
              {templates.map(t => (
                <TouchableOpacity key={t.name} style={styles.templateCard} onPress={() => onPick(t)} activeOpacity={0.85}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color="rgba(0,0,0,0.5)" />
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
                      onPress={() => onPick(buildVariantTemplate(categoryName.trim(), group, opt, scope))}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateName}>{categoryName.trim()} ({opt})</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={12} color="rgba(0,0,0,0.5)" />
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

// Add/Edit Service Modal
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
  // Text boxes and modal background stay tinted with the provider's own
  // accent colour (matching their chosen brand aesthetic) instead of a
  // generic white/grey — just blended much closer to white so they stay
  // bright and legible rather than being noticeably tinted.
  const inputTint = blend(accentColor, '#FFFFFF', 0.96);
  const modalTintTop = blend(accentColor, '#FFFFFF', 0.93);
  const modalTintBottom = blend(accentColor, '#FFFFFF', 0.82);
  const catKey = inferCategoryKind(categoryName, fallbackKind);
  const isAesthetics = catKey === 'AESTHETICS';
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

  const [name, setName] = useState(service?.name || '');
  const [price, setPrice] = useState(service?.price ? String(service.price) : '');
  const [duration, setDuration] = useState(service?.duration || '');
  const [bufferBefore, setBufferBefore] = useState(service?.bufferBeforeMins?.toString() || '');
  const [bufferAfter, setBufferAfter] = useState(service?.bufferAfterMins?.toString() || '');
  const [description, setDescription] = useState(service?.description || '');
  const [images, setImages] = useState<string[]>(service?.images || []);
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
  // Safety state
  const [isPregnancySafe, setIsPregnancySafe] = useState(service?.isPregnancySafe ?? false);
  const [patchTestRequired, setPatchTestRequired] = useState(
    service?.patchTestRequired ?? (!service && PATCH_TEST_DEFAULT_CATEGORIES.has(catKey))
  );
  const [minAge, setMinAge] = useState(service?.minAge?.toString() || '');
  const [contraindications, setContraindications] = useState<string[]>(service?.contraindications || []);
  const [contraindicationInput, setContraindicationInput] = useState('');
  const [aftercareNotes, setAftercareNotes] = useState(service?.aftercareNotes || '');

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
    setBufferBefore(service?.bufferBeforeMins?.toString() || '');
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
    setIsPregnancySafe(service?.isPregnancySafe ?? false);
    setPatchTestRequired(service?.patchTestRequired ?? (!service && PATCH_TEST_DEFAULT_CATEGORIES.has(catKey)));
    setMinAge(service?.minAge?.toString() || '');
    setContraindications(service?.contraindications || []);
    setContraindicationInput('');
    setAftercareNotes(service?.aftercareNotes || '');
  }, [service]);

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
      setImages([...images, ...result.assets.map(a => a.uri)]);
    }
  };

  const handleRemoveImage = (index: number) => setImages(images.filter((_, i) => i !== index));

  const handleAddAddOn = () => {
    if (!newAddOnName.trim() || !newAddOnPrice.trim()) {
      Alert.alert('Missing Information', 'Please enter add-on name and price.');
      return;
    }
    setAddOns([...addOns, { id: Date.now(), name: newAddOnName.trim(), price: parseFloat(newAddOnPrice) || 0 }]);
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
    if (!name.trim() || !price.trim() || !duration.trim()) {
      Alert.alert('Missing Information', 'Please add a service name, price and duration (the fields marked with a red *).');
      return;
    }
    onSave({
      id: service?.id || Date.now(),
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

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <LinearGradient colors={[modalTintTop, modalTintBottom]} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={styles.serviceModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={[styles.modalHeader, { borderBottomColor: `${accentColor}33`, borderBottomWidth: 2 }]}>
              <Text style={styles.modalTitle}>
                {isEditing ? 'Edit Service' : `New ${categoryName} Service`}
              </Text>
              <TouchableOpacity style={[styles.modalCloseButton, { backgroundColor: `${accentColor}22` }]} onPress={onClose}>
                <Text style={[styles.modalCloseText, { color: accentColor }]}>✕</Text>
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
              {/* Service Images */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Images</Text>
                <ServiceImageCarousel images={images} onAddImage={handleAddImage} onRemoveImage={handleRemoveImage} size={100} />
                <Text style={styles.inputHint}>Add multiple images to showcase your service</Text>
              </View>

              {/* Service Name */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['name'] = e.nativeEvent.layout.y; }}>
                <RequiredLabel required>Service Name</RequiredLabel>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, { backgroundColor: inputTint }]}>
                  <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder="e.g., Classic Lash Extensions" placeholderTextColor="rgba(0,0,0,0.4)" onFocus={() => handleInputFocus('name')} />
                </BlurView>
              </View>

              {/* Price */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['price'] = e.nativeEvent.layout.y; }}>
                <RequiredLabel required>Price (£)</RequiredLabel>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, { backgroundColor: inputTint }]}>
                  <TextInput style={styles.textInput} value={price} onChangeText={setPrice} placeholder="e.g., 55" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={() => handleInputFocus('price')} />
                </BlurView>
              </View>

              {/* Duration — tap a preset instead of typing */}
              <View style={styles.inputGroup}>
                <RequiredLabel required>Duration</RequiredLabel>
                <Text style={styles.inputHint}>Tap how long this service takes</Text>
                <DurationPicker value={duration} onChange={setDuration} accentColor={accentColor} />
              </View>

              {/* Buffer time before/after — overrides the account-wide default from Automations */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['bufferBefore'] = e.nativeEvent.layout.y; serviceInputPositions.current['bufferAfter'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.inputLabel}>Buffer Time (optional)</Text>
                <Text style={styles.inputHint}>Blocks extra minutes around this service so back-to-back bookings can't crowd it. Leave blank to use your account default.</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputHint, { marginBottom: 4 }]}>Before</Text>
                    <BlurView intensity={15} tint="light" style={[styles.inputBlur, { backgroundColor: inputTint }]}>
                      <TextInput style={styles.textInput} value={bufferBefore} onChangeText={setBufferBefore} placeholder="0" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={() => handleInputFocus('bufferBefore')} />
                    </BlurView>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputHint, { marginBottom: 4 }]}>After</Text>
                    <BlurView intensity={15} tint="light" style={[styles.inputBlur, { backgroundColor: inputTint }]}>
                      <TextInput style={styles.textInput} value={bufferAfter} onChangeText={setBufferAfter} placeholder="Default" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={() => handleInputFocus('bufferAfter')} />
                    </BlurView>
                  </View>
                </View>
              </View>

              {/* Description */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['serviceDescription'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlurMultiline, { backgroundColor: inputTint }]}>
                  <TextInput style={[styles.textInput, styles.textInputMultiline]} value={description} onChangeText={setDescription} placeholder="Describe your service..." placeholderTextColor="rgba(0,0,0,0.4)" multiline numberOfLines={4} textAlignVertical="top" onFocus={() => handleInputFocus('serviceDescription')} />
                </BlurView>
              </View>

              {/* ── Aesthetics Safety Section (AESTHETICS only) — shown right
                   under the description, since this is what clients need to
                   see before booking a treatment ─────────────────────── */}
              {isAesthetics && (
                <View style={[styles.inputGroup, styles.safetyCard]}>
                  <Text style={styles.safetySectionTitle}>Treatment Safety</Text>
                  <Text style={styles.inputHint}>Required for aesthetic treatments — shown to clients under the service description</Text>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Patch Test Required</Text>
                      <Text style={styles.toggleHint}>Client must be patch tested before this treatment</Text>
                    </View>
                    <Switch value={patchTestRequired} onValueChange={setPatchTestRequired} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Pregnancy Safe</Text>
                      <Text style={styles.toggleHint}>This treatment is safe during pregnancy</Text>
                    </View>
                    <Switch value={isPregnancySafe} onValueChange={setIsPregnancySafe} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['minAge'] = e.nativeEvent.layout.y; }}>
                    <Text style={styles.inputLabel}>Minimum Age</Text>
                    <BlurView intensity={15} tint="light" style={[styles.inputBlur, { backgroundColor: inputTint }]}>
                      <TextInput style={styles.textInput} value={minAge} onChangeText={setMinAge} placeholder="e.g. 18" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={() => handleInputFocus('minAge')} />
                    </BlurView>
                  </View>

                  <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['contraindicationInput'] = e.nativeEvent.layout.y; }}>
                    <Text style={styles.inputLabel}>Contraindications</Text>
                    <Text style={styles.inputHint}>Conditions that prevent this treatment — type your own, or tap a common one below</Text>
                    {contraindications.length > 0 && (
                      <View style={styles.chipGrid}>
                        {contraindications.map(c => (
                          <TouchableOpacity key={c} style={[styles.chip, styles.chipWarning]} onPress={() => setContraindications(contraindications.filter(x => x !== c))}>
                            <Text style={styles.chipTextActive}>{c} ×</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <View style={styles.addAddOnRow}>
                      <BlurView intensity={15} tint="light" style={[styles.inputBlur, { flex: 1, backgroundColor: inputTint }]}>
                        <TextInput style={styles.textInput} value={contraindicationInput} onChangeText={setContraindicationInput} placeholder="e.g. active eczema" placeholderTextColor="rgba(0,0,0,0.4)" onSubmitEditing={handleAddContraindication} returnKeyType="done" onFocus={() => handleInputFocus('contraindicationInput')} />
                      </BlurView>
                      <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddContraindication}>
                        <Text style={styles.addAddOnButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Starter suggestions — common contraindications across aesthetic
                        treatments. Below the textbox so typing stays the primary action. */}
                    <View style={[styles.chipGrid, { marginTop: 8 }]}>
                      {COMMON_CONTRAINDICATIONS.filter(c => !contraindications.includes(c)).map(c => (
                        <TouchableOpacity key={c} style={styles.chip} onPress={() => setContraindications([...contraindications, c])}>
                          <Text style={styles.chipText}>{c}</Text>
                        </TouchableOpacity>
                      ))}
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
                    <Switch value={isPregnancySafe} onValueChange={setIsPregnancySafe} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>
                </View>
              )}

              {/* ── Aftercare Notes ──────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['aftercareNotes'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.inputLabel}>Aftercare Notes (Optional)</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlurMultiline, { backgroundColor: inputTint }]}>
                  <TextInput style={[styles.textInput, styles.textInputMultiline]} value={aftercareNotes} onChangeText={setAftercareNotes} placeholder="e.g. Avoid water for 24 hours, no oil-based products..." placeholderTextColor="rgba(0,0,0,0.4)" multiline numberOfLines={3} textAlignVertical="top" onFocus={() => handleInputFocus('aftercareNotes')} />
                </BlurView>
              </View>

              {/* ── Service Type ─────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Type</Text>
                <Text style={styles.inputHint}>Helps clients understand what kind of service this is</Text>
                <View style={styles.chipGrid}>
                  {SERVICE_TYPES.map(({ value, label }) => {
                    const active = serviceType === value;
                    return (
                      <TouchableOpacity key={value} style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => setServiceType(active ? '' : value)}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Style Tags ───────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Style / Vibe</Text>
                <Text style={styles.inputHint}>How would you describe this service's aesthetic?</Text>
                <ChipSelect options={styleOptions} selected={selectedTags} onToggle={toggleTag(selectedTags, setSelectedTags)} accentColor={accentColor} />
              </View>

              {/* ── Occasion Tags ────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Best For (Occasion)</Text>
                <Text style={styles.inputHint}>When would a client typically book this?</Text>
                <ChipSelect options={occasionOptions} selected={selectedOccasions} onToggle={toggleTag(selectedOccasions, setSelectedOccasions)} accentColor={accentColor} />
              </View>

              {/* ── Technique Tags ───────────────────────────────────── */}
              {techniquOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Techniques Used</Text>
                  <Text style={styles.inputHint}>Select every technique this service involves</Text>
                  <ChipSelect options={techniquOptions} selected={selectedTechniques} onToggle={toggleTag(selectedTechniques, setSelectedTechniques)} accentColor={accentColor} />
                </View>
              )}

              {/* ── Outcome Tags ─────────────────────────────────────── */}
              {outcomeOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Results / Outcomes</Text>
                  <Text style={styles.inputHint}>What will the client achieve with this service?</Text>
                  <ChipSelect options={outcomeOptions} selected={selectedOutcomes} onToggle={toggleTag(selectedOutcomes, setSelectedOutcomes)} accentColor={accentColor} />
                </View>
              )}

              {/* ── Trend Names ──────────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['trendInput'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.inputLabel}>Trend Names (Optional)</Text>
                <Text style={styles.inputHint}>Viral names clients search for — tap the {CATEGORY_META[catKey].label.toLowerCase()} ones that fit</Text>
                {trendNames.length > 0 && (
                  <View style={styles.chipGrid}>
                    {trendNames.map(t => (
                      <TouchableOpacity key={t} style={[styles.chip, { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => setTrendNames(trendNames.filter(x => x !== t))}>
                        <Text style={styles.chipTextActive}>{t} ×</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, { flex: 1, backgroundColor: inputTint }]}>
                    <TextInput style={styles.textInput} value={trendInput} onChangeText={setTrendInput} placeholder="e.g. glazed-donut" placeholderTextColor="rgba(0,0,0,0.4)" onSubmitEditing={handleAddTrend} returnKeyType="done" onFocus={() => handleInputFocus('trendInput')} />
                  </BlurView>
                  <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddTrend}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipGrid}>
                  {trendOptions.filter(t => !trendNames.includes(t)).map(t => (
                    <TouchableOpacity key={t} style={styles.chip} onPress={() => setTrendNames([...trendNames, t])}>
                      <Text style={styles.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* ── Add-Ons ──────────────────────────────────────────── */}
              <View style={styles.inputGroup} onLayout={(e) => { serviceInputPositions.current['newAddOnName'] = e.nativeEvent.layout.y; serviceInputPositions.current['newAddOnPrice'] = e.nativeEvent.layout.y; }}>
                <Text style={styles.inputLabel}>Add-Ons (Optional)</Text>
                <Text style={styles.inputHint}>Optional extras clients can add to this service</Text>
                {addOns.length > 0 && (
                  <View style={styles.addOnsContainer}>
                    {addOns.map((addOn) => (
                      <View key={addOn.id} style={styles.addOnItem}>
                        <View style={styles.addOnInfo}>
                          <Text style={styles.addOnName}>{addOn.name}</Text>
                          <Text style={styles.addOnPrice}>+£{addOn.price}</Text>
                        </View>
                        <TouchableOpacity style={styles.removeAddOnButton} onPress={() => handleRemoveAddOn(addOn.id)}>
                          <Text style={styles.removeAddOnText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnNameInput, { backgroundColor: inputTint }]}>
                    <TextInput style={styles.textInput} value={newAddOnName} onChangeText={setNewAddOnName} placeholder="Add-on name" placeholderTextColor="rgba(0,0,0,0.4)" onFocus={() => handleInputFocus('newAddOnName')} />
                  </BlurView>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnPriceInput, { backgroundColor: inputTint }]}>
                    <TextInput style={styles.textInput} value={newAddOnPrice} onChangeText={setNewAddOnPrice} placeholder="£" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={() => handleInputFocus('newAddOnPrice')} />
                  </BlurView>
                  <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddAddOn}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accentColor }]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>{isEditing ? 'Save Changes' : 'Add Service'}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </KeyboardAvoidingView>
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
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.templateSheet}>
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
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.templateGroupLabel}>Category Name</Text>
              <Text style={styles.inputHint}>Type your own, or tap a suggestion below.</Text>
              <View style={styles.addAddOnRow}>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, { flex: 1 }]}>
                  <TextInput
                    style={styles.textInput}
                    value={categoryName}
                    onChangeText={setCategoryName}
                    placeholder={CATEGORY_NAME_EXAMPLE_BY_CATEGORY[myKind]}
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onSubmitEditing={() => addCategory(categoryName, categoryDescription)}
                    returnKeyType="done"
                  />
                </BlurView>
                <TouchableOpacity style={[styles.addAddOnButton, { backgroundColor: accentColor }]} onPress={() => addCategory(categoryName, categoryDescription)}>
                  <Text style={styles.addAddOnButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.templateGroupLabel, { marginTop: 18 }]}>Description</Text>
              <Text style={styles.inputHint}>Shown to clients under this category — what it includes and why they should book.</Text>
              <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.inputBlurMultiline, { marginTop: 8 }]}>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={categoryDescription}
                  onChangeText={setCategoryDescription}
                  placeholder="e.g. Cuts, colour and treatments tailored to your hair type."
                  placeholderTextColor="rgba(0,0,0,0.4)"
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
                        onPress={() => !used && pickSuggestion(sub.name, sub.description)}
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
                        onPress={() => !used && pickSuggestion(meta.label, meta.description)}
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
      setErrorMsg(e?.message || 'Something went wrong. Please try again.');
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={40} tint="light" style={styles.transferModal}>
          <LinearGradient
            colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
            style={styles.transferGradient}
          />
          <Text style={styles.transferTitle}>Import from Acuity</Text>
          <Text style={styles.transferSubtitle}>
            Paste your Acuity Scheduling link and we'll automatically import your services, prices, and business info.
          </Text>

          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={acuityUrl}
              onChangeText={(text) => { setAcuityUrl(text); setErrorMsg(''); }}
              placeholder="https://acuityscheduling.com/schedule.php?owner=…"
              placeholderTextColor="rgba(0,0,0,0.4)"
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
              onPress={handleTransferPress}
              disabled={isLoading}
            >
              <Text style={styles.transferButtonText}>
                {isLoading ? 'Importing…' : 'Import My Profile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} disabled={isLoading}>
              <Text style={styles.skipButtonText}>Start Fresh Instead</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

// Accent Color Picker Modal
interface AccentColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (color: string) => void;
  currentColor: string;
}

const AccentColorPickerModal: React.FC<AccentColorPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  currentColor,
}) => {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.accentPickerModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Accent Color</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.accentPickerSubtitle}>
                This color will be used for buttons and highlights
              </Text>
              <View style={styles.accentColorGrid}>
                {ACCENT_COLORS.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.accentColorOption,
                      currentColor === item.color && styles.accentColorOptionSelected,
                    ]}
                    onPress={() => {
                      onSelect(item.color);
                      onClose();
                    }}
                  >
                    <View style={[styles.accentColorSwatch, { backgroundColor: item.color }]} />
                    <Text style={styles.accentColorName}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
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
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <BlurView intensity={30} tint="light" style={styles.smallModal}>
          <Text style={styles.smallModalTitle}>Edit Category</Text>
          <Text style={styles.inputLabel}>Name</Text>
          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Category name"
              placeholderTextColor="rgba(0,0,0,0.4)"
              autoFocus
            />
          </BlurView>
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Description (shown to clients)</Text>
          <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.inputBlurMultiline]}>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="What's included in this category, and why clients should book it..."
              placeholderTextColor="rgba(0,0,0,0.4)"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </BlurView>
          <View style={styles.smallModalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Preview Modal — mirrors the live ProviderProfileScreen: same theme resolution,
// typography, and section set (including Portfolio), so what a provider sees
// here is what a client actually sees. Rebuilt whenever that screen changes.
interface PreviewModalProps {
  visible: boolean;
  onClose: () => void;
  providerData: ProviderRegistrationData;
  accentColor: string;
  portfolio: DbPortfolioItem[];
  // Live, possibly-unsaved Policies-tab state — shown here instead of
  // providerData.bookingPolicies so the preview reflects in-progress edits,
  // same as every other field on this modal.
  policies: ProviderPolicies;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  onClose,
  providerData,
  accentColor,
  portfolio,
  policies,
}) => {
  const categoryNames = Object.keys(providerData.categories);
  const [selectedPreviewCategory, setSelectedPreviewCategory] = useState<string>(
    categoryNames[0] || ''
  );
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [infoTab, setInfoTab] = useState<'about' | 'policy'>('about');
  const [showPolicyImage, setShowPolicyImage] = useState(false);

  // Mirrors hasPolicyInfo(provider) on ProviderProfileScreen, against the
  // live editable policies state rather than the last-saved DB snapshot.
  const hasPolicyInfo =
    providerData.cancellationNoticeHours > 0 ||
    (!!policies.depositRequired && !!policies.depositAmount) ||
    (!!policies.cancelNotice && policies.cancelNotice !== 'none') ||
    !!(policies.rescheduleNotice || policies.maxReschedules) ||
    (!!policies.noShowAction && policies.noShowAction !== 'none');

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
  const PREVIEW_PORTFOLIO_COL_W = (screenWidth - 40 - 12) / 2;
  const portfolioColumns = useMemo(() => {
    const cols: Array<Array<DbPortfolioItem & { tileHeight: number }>> = [[], []];
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
        <SafeAreaView style={styles.previewSafeArea} edges={['top', 'bottom']}>
          {/* Preview Header with back button */}
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewBackButton} onPress={onClose}>
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
                  colors={['rgba(255,255,255,0.3)', 'transparent']}
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
                <Text style={[styles.previewSlotsText, { color: PP.sub }]}>
                  {providerData.slotsText || 'Booking info here'}
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
              {/* About / Policy tabbed card */}
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
                {hasPolicyInfo && (
                  <View style={[styles.previewInfoTabRow, { borderBottomColor: PP.border }]}>
                    <TouchableOpacity
                      style={[styles.previewInfoTab, infoTab === 'about' && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
                      onPress={() => setInfoTab('about')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.previewInfoTabText, { color: infoTab === 'about' ? PP.text : PP.sub }]}>About</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.previewInfoTab, infoTab === 'policy' && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
                      onPress={() => setInfoTab('policy')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.previewInfoTabText, { color: infoTab === 'policy' ? PP.text : PP.sub }]}>Policy</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {infoTab === 'about' || !hasPolicyInfo ? (
                  <>
                    {!hasPolicyInfo && (
                      <Text style={[styles.previewSectionTitle, { color: PP.text }]}>About</Text>
                    )}
                    <Text style={[styles.previewAboutText, { color: PP.sub }]}>
                      {showFullAbout
                        ? providerData.aboutText || 'Your business description will appear here...'
                        : `${(providerData.aboutText || 'Your business description will appear here...').substring(0, 150)}...`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowFullAbout(!showFullAbout)}
                      style={styles.previewMoreButton}
                    >
                      <Text style={[styles.previewMoreButtonText, { color: PP.text }]}>
                        {showFullAbout ? 'Show Less' : 'More'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  /* Policy tab content — mirrors ProviderProfileScreen's row-building exactly,
                     against the live (possibly unsaved) Policies-tab state. */
                  (() => {
                    const bp = policies;
                    const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tag?: string }[] = [];
                    if (bp.depositRequired && bp.depositAmount) {
                      rows.push({
                        icon: 'card-outline',
                        label: 'Deposit',
                        value: bp.depositType === 'percent' ? `${bp.depositAmount}% required` : `£${bp.depositAmount} required`,
                        ...(bp.depositOnly ? { tag: 'ONLY' } : {}),
                      });
                    }
                    const cancelPenaltyText =
                      bp.cancelPenalty && bp.cancelPenalty !== 'none'
                        ? ` · ${bp.cancelPenalty === 'deposit' ? 'deposit kept' : 'full charge'}`
                        : '';
                    if (providerData.cancellationNoticeHours > 0) {
                      rows.push({
                        icon: 'time-outline',
                        label: 'Cancellation',
                        value: `${providerData.cancellationNoticeHours} hours' notice${cancelPenaltyText}`,
                      });
                    } else if (bp.cancelNotice && bp.cancelNotice !== 'none') {
                      rows.push({ icon: 'time-outline', label: 'Cancellation', value: `${bp.cancelNotice} notice${cancelPenaltyText}` });
                    }
                    if (bp.rescheduleNotice || bp.maxReschedules) {
                      const parts: string[] = [];
                      if (bp.rescheduleNotice && bp.rescheduleNotice !== 'same_day') parts.push(`${bp.rescheduleNotice} notice`);
                      if (bp.maxReschedules && bp.maxReschedules !== 'unlimited') parts.push(`max ${bp.maxReschedules}`);
                      if (parts.length > 0) rows.push({ icon: 'calendar-outline', label: 'Reschedule', value: parts.join(' · ') });
                    }
                    if (bp.noShowAction && bp.noShowAction !== 'none') {
                      rows.push({
                        icon: 'close-circle-outline',
                        label: 'No-show',
                        value: bp.noShowAction === 'warn' ? 'Warning issued' : bp.noShowAction === 'charge_deposit' ? 'Deposit charged' : 'Full charge',
                      });
                    }
                    if (bp.cancelNote) {
                      rows.push({ icon: 'information-circle-outline', label: 'Note', value: bp.cancelNote });
                    }
                    return (
                      <View style={{ paddingTop: 8 }}>
                        {rows.map((row, i) => (
                          <View
                            key={i}
                            style={[styles.previewPolicyRow, i < rows.length - 1 && { borderBottomColor: PP.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
                          >
                            <View style={styles.previewPolicyIcon}>
                              <Ionicons name={row.icon} size={18} color={PP.sub} />
                            </View>
                            <View style={styles.previewPolicyRowText}>
                              <View style={styles.previewPolicyLabelRow}>
                                <Text style={[styles.previewPolicyLabel, { color: PP.sub }]}>{row.label}</Text>
                                {!!row.tag && (
                                  <View style={[styles.previewPolicyTag, { backgroundColor: accentColor }]}>
                                    <Text style={styles.previewPolicyTagText}>{row.tag}</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.previewPolicyValue, { color: PP.text }]}>{row.value}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })()
                )}

                {policies.policyImageUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowPolicyImage(true)}
                    style={[styles.previewPolicyImageFab, { backgroundColor: accentColor }]}
                    accessibilityLabel="View full policy details"
                    accessibilityRole="button"
                  >
                    <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}
              </BlurView>

              {policies.policyImageUrl ? (
                <Modal visible={showPolicyImage} transparent animationType="fade" onRequestClose={() => setShowPolicyImage(false)}>
                  <TouchableOpacity style={styles.previewPolicyImageModalOverlay} activeOpacity={1} onPress={() => setShowPolicyImage(false)}>
                    <Image source={{ uri: policies.policyImageUrl }} style={styles.previewPolicyImageModalFull} resizeMode="contain" />
                  </TouchableOpacity>
                </Modal>
              ) : null}

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
                        onPress={() => setSelectedPreviewCategory(item)}
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
                              source={{ uri: service.images[0] }}
                              style={styles.previewServiceImage}
                              resizeMode="cover"
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
                {providerData.phone && providerData.preferredContactMethods.includes('phone') ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Phone</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Message ›</Text>
                  </View>
                ) : null}
                {providerData.whatsapp && providerData.preferredContactMethods.includes('whatsapp') ? (
                  <View style={[styles.previewContactRow, { borderBottomColor: PP.sep }]}>
                    <Text style={[styles.previewContactLabel, { color: PP.sub }]}>WhatsApp</Text>
                    <Text style={[styles.previewContactAction, { color: PP.text }]}>Open ›</Text>
                  </View>
                ) : null}
                {providerData.email && providerData.preferredContactMethods.includes('email') ? (
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
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

// Main Component
const InfoRegScreen: React.FC<InfoRegScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { user } = useAuth();

  // Ref for main scrollview to enable auto-scroll to focused inputs
  const mainScrollViewRef = useRef<ScrollView>(null);

  // Track input positions for auto-scroll
  const inputPositions = useRef<Record<string, number>>({});

  // Handle input focus - auto-scroll to show the input
  const handleInputFocus = useCallback((inputName: string, yPosition?: number) => {
    if (yPosition !== undefined) {
      inputPositions.current[inputName] = yPosition;
    }
    const scrollTo = inputPositions.current[inputName] || 0;
    setTimeout(() => {
      mainScrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollTo - 250),
        animated: true,
      });
    }, 300);
  }, []);

  // Form state
  const [providerData, setProviderData] = useState<ProviderRegistrationData>({
    providerName: '',
    providerService: 'HAIR',
    customServiceType: '',
    location: '',
    aboutText: '',
    slotsText: 'Slots out every 15th of the month',
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
    fullAddress: '',
    addressReleasePolicy: 'on_confirmation',
    backgroundImage: null,
    isVerified: false,
    rating: 0,
    bookingPolicies: null,
    cancellationNoticeHours: 0,
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'policies'>('profile');
  const [policies, setPolicies] = useState<ProviderPolicies>(DEFAULT_POLICIES);
  const [policyImageUploading, setPolicyImageUploading] = useState(false);

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
              const firstCat = Object.keys(data.categories)[0];
              if (firstCat) setSelectedCategory(firstCat);
              return;
            }
            // No providers row yet — this is the first save. Prefill from
            // what the 5-step signup already collected (users table) instead
            // of starting blank, so the provider isn't retyping their own
            // business name/contact details from scratch.
            return getUserSignupPrefillInfo(user.id)
              .then(prefill => {
                if (!prefill) return;
                const validBusinessTypes: ProviderRegistrationData['businessType'][] = ['salon', 'studio', 'home_based', 'mobile'];
                const prefilledBusinessType = validBusinessTypes.find(v => v === prefill.business_type);
                setProviderData(prev => ({
                  ...prev,
                  providerName: prev.providerName || prefill.business_name || prefill.name || '',
                  phone: prev.phone || prefill.business_phone || prefill.phone || '',
                  email: prev.email || prefill.business_email || '',
                  instagram: prev.instagram || prefill.instagram || '',
                  website: prev.website || prefill.website || '',
                  businessType: prev.businessType || prefilledBusinessType || '',
                }));
              })
              .catch(() => {});
          })
          .catch(() => {})
          .finally(() => setIsLoadingProvider(false));
      });
    // Load saved policies from Supabase (source of truth), falling back to
    // the local cache inside loadProviderPolicies. Merge over defaults so
    // fields added later (e.g. bookingInstructions) are never undefined.
    loadProviderPolicies(user.id)
      .then(saved => { if (saved) setPolicies({ ...DEFAULT_POLICIES, ...(saved as Partial<ProviderPolicies>) }); })
      .catch(() => {});
  }, [user?.id]);

  // ── Portfolio (client work gallery shown on the public profile) ───────────
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<DbPortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioUploading, setPortfolioUploading] = useState(false);

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
    getProviderPortfolio(providerDbId)
      .then(setPortfolioItems)
      .catch(() => {})
      .finally(() => setPortfolioLoading(false));
  }, [providerDbId]);

  const handleAddPortfolioImages = useCallback(async () => {
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
        category: null,
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
        const item = await addPortfolioItem(providerDbId, publicUrl, ratio);
        setPortfolioItems(prev => prev.map(p => (p.id === tempId ? item : p)));
      } catch (e: any) {
        setPortfolioItems(prev => prev.filter(p => p.id !== tempId));
        Alert.alert('Upload failed', e?.message ?? 'Could not upload one of the images.');
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
        try { await supabase.storage.from('portfolio').remove([path]); } catch { /* ignore */ }
      }
    } catch {
      Alert.alert('Error', 'Could not remove photo.');
    }
  }, []);

  // Modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
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
  // Tracks the dragged pill's effective position from the previous call, so
  // applyDragPosition can tell which way it's currently travelling (see the
  // hysteresis comment inside it).
  const dragPrevEffectiveDxRef = useRef(0);

  // Auto-scroll while dragging near either edge of the category strip — without
  // this, a pill can never be dragged past whatever happens to already be
  // visible on screen, so there was no way to place it at the very end of a
  // long list. scrollEnabled is turned off during a drag (below), so nothing
  // else moves categoryScrollXRef during a gesture — it's safe to treat as the
  // single source of truth for the current scroll offset.
  const categoryScrollXRef = useRef(0);
  const categoryViewportRef = useRef({ x: 0, width: 0 }); // screen-space frame of the ScrollView
  const categoryContentWidthRef = useRef(0);
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
  const setPolicy = useCallback(<K extends keyof ProviderPolicies>(key: K, value: ProviderPolicies[K]) => {
    setPolicies(prev => ({ ...prev, [key]: value }));
  }, []);

  // Detailed policy image — a free-form photo (house rules sheet, consent
  // form, etc.) clients can pop open from their view of this profile,
  // alongside the structured fields above. Stored as a URL inside the same
  // policies blob, so it saves/loads with everything else on this tab —
  // uploaded to storage right away (so we have a public URL to hold onto),
  // but only actually persisted to the provider row when Save is tapped,
  // same as every other field here.
  const handlePickPolicyImage = useCallback(async () => {
    if (!user?.id) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // No fixed `aspect` — a policy document photo is usually portrait, not
      // square, so the crop handles start at the photo's own shape and the
      // provider drags them to whatever they actually want to keep.
      allowsEditing: true,
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    setPolicyImageUploading(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/policy-${Date.now()}.${ext}`;
      const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
      setPolicy('policyImageUrl', publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload the image.');
    } finally {
      setPolicyImageUploading(false);
    }
  }, [user?.id, setPolicy]);

  const handleRemovePolicyImage = useCallback(() => {
    setPolicy('policyImageUrl', '');
  }, [setPolicy]);

  const handleSubmit = useCallback(async () => {
    if (!providerData.providerName.trim()) {
      Alert.alert('Missing Information', 'Please enter your business name.');
      return;
    }
    if (!providerData.location.trim()) {
      Alert.alert('Missing Information', 'Please enter your location.');
      return;
    }
    if (!providerData.fullAddress.trim()) {
      Alert.alert('Missing Information', 'Please enter your full address — required for every business type now, including mobile (it stays private).');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not Logged In', 'Please log in to save your profile.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveProviderToSupabase(user.id, providerData);
      await saveProviderPolicies(user.id, policies as unknown as Record<string, unknown>);
      Alert.alert(
        'Profile Saved!',
        'Your provider profile has been saved successfully.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      logger.error('Error saving provider profile:', e);
      // Surface the real reason (saveProviderToSupabase prefixes it with the
      // failing step) instead of a generic message, so failures are diagnosable.
      Alert.alert('Couldn\'t save your profile', e?.message ?? 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [providerData, user, policies]);

  // Get adaptive accent color - now uses user-selected accent color
  const adaptiveAccentColor = useMemo(() => {
    return providerData.accentColor;
  }, [providerData.accentColor]);

  const categoryNames = Object.keys(providerData.categories);

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
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    const t = setTimeout(() => {
      const L = pillLayoutRef.current[selectedCategory];
      if (L) categoryScrollRef.current?.scrollTo({ x: Math.max(0, L.x - 20), animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [selectedCategory]);

  const handleSetCategoryOrder = useCallback((order: string[]) => {
    setProviderData(prev => {
      const newCategories: Record<string, ServiceData[]> = {};
      order.forEach(key => { newCategories[key] = prev.categories[key] || []; });
      return { ...prev, categories: newCategories };
    });
  }, []);

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
    // Direction of travel since the last call — used below to pick which edge
    // of the dragged pill has to cross a neighbor's midpoint.
    const movingRight = effectiveDx >= dragPrevEffectiveDxRef.current;
    dragPrevEffectiveDxRef.current = effectiveDx;
    // Comparing against the dragged pill's CENTRE made a neighbor jump out of
    // the way the instant the two pills were roughly side by side — reads as
    // premature, since the dragged pill hadn't actually moved past it yet.
    // Using the edge FURTHEST BEHIND in the direction of travel (left edge
    // while moving right, right edge while moving left) requires the dragged
    // pill to have substantially overlapped/passed a neighbor before it
    // yields its slot.
    const referenceX = movingRight ? draggedLeft : draggedLeft + draggedWidth;
    const others = categoryOrderRef.current.filter(n => n !== name);
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

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Without this, the surrounding horizontal ScrollView reclaims the touch
      // the moment it sees any movement (its native scroll recognizer requests
      // termination), which snapped the drag straight back before it could go
      // anywhere. The handle is a small, dedicated target, so holding onto the
      // gesture once granted here is safe and doesn't block scrolling anywhere else.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        dragBaselineRef.current = { ...pillLayoutRef.current };
        dragGrantXRef.current = dragBaselineRef.current[name]?.x ?? 0;
        dragTargetRef.current = categoryOrderRef.current.indexOf(name);
        dragAutoScrollDeltaRef.current = 0;
        dragAutoScrollHoldFramesRef.current = 0;
        dragPrevEffectiveDxRef.current = 0;
        dragLatestDxRef.current = 0;
        dragLatestPageXRef.current = evt.nativeEvent.pageX;
        dragX.setValue(0);
        setDraggingCategory(name);
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
        // measureInWindow exists on the underlying native view via the
        // NativeMethods mixin, but isn't in ScrollView's TS surface.
        (categoryScrollRef.current as unknown as { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null)
          ?.measureInWindow((x, _y, width) => {
            categoryViewportRef.current = { x, width };
          });
        startCategoryAutoScroll(name);
      },
      onPanResponderMove: (evt, g) => {
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
        Animated.timing(dragX, { toValue, duration: 150, useNativeDriver: true }).start(() => {
          setDraggingCategory(null);
          dragX.setValue(0);
        });
      },
      onPanResponderTerminate: () => {
        stopCategoryAutoScroll();
        setDraggingCategory(null);
        dragX.setValue(0);
      },
    });
    categoryDragRespondersRef.current[name] = responder;
    return responder;
  }, [dragX, handleSetCategoryOrder, applyDragPosition, startCategoryAutoScroll, stopCategoryAutoScroll]);

  if (isLoadingProvider) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#AF9197" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemedBackground>
        <LinearGradient
          colors={providerData.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientOverlay}
        />

        <StatusBar barStyle={theme.statusBar} translucent backgroundColor="transparent" />

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
            setEditingService(makeServiceDraft(template));
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
          portfolio={portfolioItems}
          policies={policies}
        />

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isEditMode ? 'Edit Profile' : 'Provider Registration'}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => setShowPreviewModal(true)}
              >
                <Ionicons name="eye-outline" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerIconButton, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Ionicons name="checkmark" size={22} color="#000" />}
              </TouchableOpacity>
            </View>
          </View>

          {claimError && (
            <View style={styles.claimErrorBanner}>
              <Text style={styles.claimErrorText}>{claimError}</Text>
              <TouchableOpacity onPress={() => setClaimError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color="#7A4B00" />
              </TouchableOpacity>
            </View>
          )}

            <ScrollView
              ref={mainScrollViewRef}
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={true}
              // The category-pill drag handle refuses to give up its responder to
              // the horizontal strip it lives in, but this outer vertical
              // ScrollView is a separate native scroll recognizer one level up —
              // without gating it too, it kept fighting the drag for ownership of
              // the touch (the whole page would scroll instead of, or as well as,
              // the pill dragging), and would occasionally win outright and cut
              // the drag gesture short, which is also why reordering could look
              // like the other pills weren't reacting to the drag at all.
              scrollEnabled={!draggingCategory}
            >
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <TouchableOpacity
                style={styles.logoContainer}
                onPress={handleSelectLogo}
                activeOpacity={0.8}
              >
                {providerData.logo ? (
                  <Image
                    source={{ uri: providerData.logo }}
                    style={styles.providerLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="camera-outline" size={28} color="#a342c3" />
                    <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                  </View>
                )}
                <View style={styles.logoEditBadge}>
                  <Ionicons name="pencil-outline" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Tab switcher */}
            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'profile' && { backgroundColor: adaptiveAccentColor }]}
                onPress={() => setActiveTab('profile')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, activeTab === 'profile' && styles.tabBtnTextActive]}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'policies' && { backgroundColor: adaptiveAccentColor }]}
                onPress={() => setActiveTab('policies')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, activeTab === 'policies' && styles.tabBtnTextActive]}>Policies</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'profile' && (<>

            {/* Business Name */}
            <View style={styles.cardShadowWrap}>
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['businessName'] = e.nativeEvent.layout.y; }}
              >
                <RequiredLabel required>Business Name</RequiredLabel>
                {isEditMode ? (
                  <>
                    <View style={[styles.serviceCategoryChip, styles.serviceCategoryChipSelected, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }]}>
                      <Ionicons name="lock-closed" size={11} color="rgba(0,0,0,0.5)" />
                      <Text style={[styles.serviceCategoryText, styles.serviceCategoryTextSelected]}>
                        {providerData.providerName}
                      </Text>
                    </View>
                    <Text style={styles.inputHint}>Set at sign-up — contact support to change your business name.</Text>
                  </>
                ) : (
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                    <TextInput
                      style={styles.textInput}
                      value={providerData.providerName}
                      onChangeText={(text) =>
                        setProviderData({ ...providerData, providerName: text })
                      }
                      placeholder="Enter your business name"
                      placeholderTextColor="rgba(0,0,0,0.4)"
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
                <RequiredLabel required>Service Type</RequiredLabel>
                {isEditMode ? (
                  <>
                    <View style={[styles.serviceCategoryChip, styles.serviceCategoryChipSelected, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }]}>
                      <Ionicons name="lock-closed" size={11} color="rgba(0,0,0,0.5)" />
                      <Text style={[styles.serviceCategoryText, styles.serviceCategoryTextSelected]}>
                        {providerData.providerService}
                      </Text>
                    </View>
                    <Text style={styles.inputHint}>Set at sign-up — your business type can't be changed here.</Text>
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
                          setProviderData({ ...providerData, providerService: category })
                        }
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
                    onLayout={(e) => { inputPositions.current['customService'] = e.nativeEvent.layout.y + 150; }}
                  >
                    <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                      <TextInput
                        style={styles.textInput}
                        value={providerData.customServiceType}
                        onChangeText={(text) =>
                          setProviderData({ ...providerData, customServiceType: text })
                        }
                        placeholder="What service do you provide?"
                        placeholderTextColor="rgba(0,0,0,0.4)"
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
                onLayout={(e) => { inputPositions.current['location'] = e.nativeEvent.layout.y + 200; }}
              >
                <RequiredLabel required>Location</RequiredLabel>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.location}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, location: text })
                    }
                    placeholder="e.g., North West London"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onFocus={() => handleInputFocus('location')}
                  />
                </BlurView>
              </View>
            </BlurView>
            </View>

            {/* About Section */}
            <View style={styles.cardShadowWrap}>
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>About Your Business</Text>
              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['about'] = e.nativeEvent.layout.y + 500; }}
              >
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlurMultiline, styles.profileInputBox]}>
                  <TextInput
                    style={[styles.textInput, styles.textInputMultiline]}
                    value={providerData.aboutText}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, aboutText: text })
                    }
                    placeholder="Tell clients about your services, policies, deposit requirements..."
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    onFocus={() => handleInputFocus('about')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['slots'] = e.nativeEvent.layout.y + 600; }}
              >
                <Text style={styles.inputLabel}>Availability Message</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.slotsText}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, slotsText: text })
                    }
                    placeholder="e.g., Slots out every 15th of the month"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onFocus={() => handleInputFocus('slots')}
                  />
                </BlurView>
              </View>
            </BlurView>
            </View>

            {/* Portfolio — client work gallery shown on your public profile */}
            <View style={styles.cardShadowWrap}>
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Text style={styles.sectionSubtitle}>
                Photos of your work, shown on your public profile in a two-column gallery.
              </Text>

              {portfolioLoading ? (
                <View style={styles.portfolioLoadingRow}>
                  <ActivityIndicator color="#AF9197" />
                </View>
              ) : (
                <View style={styles.portfolioGrid}>
                  {portfolioItems.map(item => (
                    <View key={item.id} style={styles.portfolioThumbWrap}>
                      <Image source={{ uri: item.image_url }} style={styles.portfolioThumb} />
                      <TouchableOpacity
                        style={styles.portfolioRemoveBtn}
                        onPress={() => handleRemovePortfolioItem(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.portfolioRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.portfolioAddTile}
                    onPress={handleAddPortfolioImages}
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
            </BlurView>
            </View>

            {/* Contact Information */}
            <View style={styles.cardShadowWrap}>
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>Contact Information</Text>
              <Text style={styles.sectionSubtitle}>
                What clients see on your public profile
              </Text>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['phone'] = e.nativeEvent.layout.y + 700; }}
              >
                <Text style={styles.inputLabel}>Phone Number</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.phone}
                    onChangeText={(text) => setProviderData({ ...providerData, phone: text })}
                    placeholder="+44 7XXX XXXXXX"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="phone-pad"
                    onFocus={() => handleInputFocus('phone')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['contactEmail'] = e.nativeEvent.layout.y + 750; }}
              >
                <Text style={styles.inputLabel}>Contact Email</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.email}
                    onChangeText={(text) => setProviderData({ ...providerData, email: text })}
                    placeholder="bookings@yourbusiness.com"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('contactEmail')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['instagram'] = e.nativeEvent.layout.y + 800; }}
              >
                <Text style={styles.inputLabel}>Instagram Handle</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.instagram}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, instagram: text.replace(/^@/, '') })
                    }
                    placeholder="yourbusiness"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('instagram')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['website'] = e.nativeEvent.layout.y + 850; }}
              >
                <Text style={styles.inputLabel}>Website</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.website}
                    onChangeText={(text) => setProviderData({ ...providerData, website: text })}
                    placeholder="https://yourbusiness.com"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('website')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['externalBookingUrl'] = e.nativeEvent.layout.y + 875; }}
              >
                <Text style={styles.inputLabel}>External Booking Link (optional)</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.externalBookingUrl}
                    onChangeText={(text) => setProviderData({ ...providerData, externalBookingUrl: text })}
                    placeholder="e.g. your Fresha or Acuity booking page"
                    placeholderTextColor="rgba(0,0,0,0.4)"
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

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['experience'] = e.nativeEvent.layout.y + 900; }}
              >
                <Text style={styles.inputLabel}>Years of Experience</Text>
                <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.profileInputBox]}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.yearsExperience}
                    onChangeText={(text) => setProviderData({ ...providerData, yearsExperience: text.replace(/[^0-9]/g, '') })}
                    placeholder="e.g., 5"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('experience')}
                  />
                </BlurView>
              </View>
            </BlurView>
            </View>

            {/* Services Section */}
            <View style={styles.servicesSection}>
              <View style={styles.servicesSectionHeader}>
                <Text style={styles.sectionTitleNoCard}>Your Services</Text>
                <TouchableOpacity
                  style={[styles.addCategoryButton, { backgroundColor: adaptiveAccentColor }]}
                  onPress={() => setShowCategoryModal(true)}
                >
                  <Text style={styles.addCategoryText}>+ Add Category</Text>
                </TouchableOpacity>
              </View>

              {categoryNames.length === 0 ? (
                <BlurView intensity={50} tint="light" style={styles.emptyServicesCard}>
                  <Ionicons name="folder-open-outline" size={36} color="rgba(0,0,0,0.35)" style={styles.emptyServicesEmoji} />
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
                    contentContainerStyle={styles.categoryTabsContent}
                    scrollEnabled={!draggingCategory}
                    onScroll={(e) => { categoryScrollXRef.current = e.nativeEvent.contentOffset.x; }}
                    scrollEventThrottle={16}
                    onContentSizeChange={(w) => { categoryContentWidthRef.current = w; }}
                  >
                    {categoryOrder.map((item, index) => {
                      const isSel = selectedCategory === item;
                      const isDragging = draggingCategory === item;
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
                          layout={LinearTransition.duration(220)}
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
                              { transform: [{ translateX: isDragging ? dragX : 0 }] },
                              isOtherWhileDragging && styles.categoryTabDimmed,
                            ]}
                          >
                          <TouchableOpacity
                            style={[
                              styles.categoryTab,
                              isSel && styles.selectedCategoryTab,
                            ]}
                            activeOpacity={0.8}
                            onPress={() => setSelectedCategory(item)}
                            onLongPress={() => {
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
                              tint="light"
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
                              {/* Dedicated drag handle — the only part of the pill that
                                  starts a reorder, so tapping, long-pressing and
                                  side-scrolling the strip are never mistaken for a drag. */}
                              <View {...panResponder.panHandlers} style={styles.categoryDragHandle} hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}>
                                <Ionicons name="reorder-three-outline" size={20} color="rgba(0,0,0,0.4)" />
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
                      {providerData.categories[selectedCategory]?.map((service) => (
                        <View key={service.id} style={styles.serviceItemCard}>
                          <BlurView intensity={50} tint="light" style={styles.serviceCardBlur}>
                            <LinearGradient
                              colors={['rgba(255,255,255,0.3)', 'transparent']}
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
                                    keyExtractor={(_, index) => index.toString()}
                                    renderItem={({ item }) => (
                                      <Image
                                        source={{ uri: item }}
                                        style={styles.serviceImage}
                                        resizeMode="cover"
                                      />
                                    )}
                                  />
                                ) : (
                                  <View style={styles.serviceImagePlaceholder}>
                                    <Ionicons name="camera-outline" size={24} color="rgba(0,0,0,0.3)" />
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
                                  onPress={() => {
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
                                    handleDeleteService(selectedCategory, service.id)
                                  }
                                >
                                  <Text style={styles.deleteServiceText}>×</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </BlurView>
                        </View>
                      ))}

                      {/* Add Service Button — opens the template picker first */}
                      <TouchableOpacity
                        style={styles.addServiceButton}
                        onPress={() => {
                          setCurrentCategory(selectedCategory);
                          setShowTemplatePicker(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <BlurView intensity={30} tint="light" style={styles.addServiceBlur}>
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

            </>)}

            {activeTab === 'policies' && (
              <BlurView intensity={50} tint="light" style={styles.policiesCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={styles.cardHighlight}
                />

                {/* Cancellation */}
                <Text style={styles.policySectionTitle}>Cancellation</Text>
                <Text style={styles.policyLabel}>NOTICE REQUIRED</Text>
                <View style={styles.pillRow}>
                  {(['none', '24h', '48h', '72h'] as CancelNotice[]).map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.policyPill, policies.cancelNotice === opt && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('cancelNotice', opt)}
                    >
                      <Text style={[styles.policyPillText, policies.cancelNotice === opt && { color: '#fff' }]}>
                        {opt === 'none' ? 'None' : opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.policyLabel, { marginTop: 12 }]}>IF CANCELLED LATE</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'none' as CancelPenalty,    l: 'No penalty' },
                    { v: 'deposit' as CancelPenalty, l: 'Deposit kept' },
                    { v: 'full' as CancelPenalty,    l: 'Full charge' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.cancelPenalty === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('cancelPenalty', v)}
                    >
                      <Text style={[styles.policyPillText, policies.cancelPenalty === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (e.g. cancellations via message only)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.cancelNote}
                  onChangeText={v => setPolicy('cancelNote', v)}
                />

                <View style={styles.policySep} />

                {/* Rescheduling */}
                <Text style={styles.policySectionTitle}>Rescheduling</Text>
                <Text style={styles.policyLabel}>NOTICE REQUIRED</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'same_day' as RescheduleNotice, l: 'Same day' },
                    { v: '24h' as RescheduleNotice,      l: '24h' },
                    { v: '48h' as RescheduleNotice,      l: '48h' },
                    { v: '72h' as RescheduleNotice,      l: '72h' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.rescheduleNotice === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('rescheduleNotice', v)}
                    >
                      <Text style={[styles.policyPillText, policies.rescheduleNotice === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.policyLabel, { marginTop: 12 }]}>MAX RESCHEDULES PER BOOKING</Text>
                <View style={styles.pillRow}>
                  {(['1', '2', 'unlimited'] as MaxReschedules[]).map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.policyPill, policies.maxReschedules === opt && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('maxReschedules', opt)}
                    >
                      <Text style={[styles.policyPillText, policies.maxReschedules === opt && { color: '#fff' }]}>
                        {opt === 'unlimited' ? 'Unlimited' : opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (optional)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.rescheduleNote}
                  onChangeText={v => setPolicy('rescheduleNote', v)}
                />

                <View style={styles.policySep} />

                {/* Deposit */}
                <Text style={styles.policySectionTitle}>Deposit</Text>
                <View style={styles.depositHeader}>
                  <Text style={styles.policyLabel}>REQUIRE DEPOSIT</Text>
                  <Switch
                    value={policies.depositRequired}
                    onValueChange={v => setPolicy('depositRequired', v)}
                    trackColor={{ false: 'rgba(0,0,0,0.12)', true: adaptiveAccentColor }}
                    thumbColor="#fff"
                  />
                </View>
                {policies.depositRequired && (
                  <>
                    <View style={styles.depositRow}>
                      <View style={styles.pillRow}>
                        {(['percent', 'fixed'] as DepositType[]).map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.policyPill, policies.depositType === opt && { backgroundColor: adaptiveAccentColor }]}
                            onPress={() => setPolicy('depositType', opt)}
                          >
                            <Text style={[styles.policyPillText, policies.depositType === opt && { color: '#fff' }]}>
                              {opt === 'percent' ? '%' : '£'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.depositInput}
                        placeholder={policies.depositType === 'percent' ? 'e.g. 20' : 'e.g. 25'}
                        placeholderTextColor="rgba(0,0,0,0.3)"
                        value={policies.depositAmount}
                        onChangeText={v => setPolicy('depositAmount', v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <TextInput
                      style={styles.policyNote}
                      placeholder="Note (optional)"
                      placeholderTextColor="rgba(0,0,0,0.3)"
                      value={policies.depositNote}
                      onChangeText={v => setPolicy('depositNote', v)}
                    />
                    <View style={styles.depositHeader}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.policyLabel}>DEPOSIT ONLY</Text>
                        <Text style={styles.policySubLabel}>
                          Clients must pay the deposit — they won't be able to choose to pay in full.
                        </Text>
                      </View>
                      <Switch
                        value={policies.depositOnly}
                        onValueChange={v => setPolicy('depositOnly', v)}
                        trackColor={{ false: 'rgba(0,0,0,0.12)', true: adaptiveAccentColor }}
                        thumbColor="#fff"
                      />
                    </View>
                  </>
                )}

                <View style={styles.policySep} />

                {/* No-show */}
                <Text style={styles.policySectionTitle}>No-show</Text>
                <Text style={styles.policyLabel}>ACTION</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'none' as NoShowAction,           l: 'No action' },
                    { v: 'warn' as NoShowAction,           l: 'Warn client' },
                    { v: 'charge_deposit' as NoShowAction, l: 'Charge deposit' },
                    { v: 'charge_full' as NoShowAction,    l: 'Charge in full' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.noShowAction === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('noShowAction', v)}
                    >
                      <Text style={[styles.policyPillText, policies.noShowAction === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (optional)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.noShowNote}
                  onChangeText={v => setPolicy('noShowNote', v)}
                />

                <View style={styles.policySep} />

                {/* Booking instructions — stamped onto every new booking */}
                <Text style={styles.policySectionTitle}>Booking Instructions</Text>
                <Text style={styles.policyLabel}>SHOWN TO CLIENTS ON EVERY BOOKING (OPTIONAL)</Text>
                <TextInput
                  style={styles.policyNote}
                  placeholder='e.g. "Please arrive 10 minutes early", parking info…'
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.bookingInstructions}
                  onChangeText={v => setPolicy('bookingInstructions', v)}
                  multiline
                />

                <View style={styles.policySep} />

                {/* Detailed policy image — a photo clients can pop open from
                    their view of this profile, for anything too specific
                    for the pill options above (a full house-rules sheet, a
                    consent form, etc). */}
                <Text style={styles.policySectionTitle}>Detailed Policy Image</Text>
                <Text style={styles.policyLabel}>
                  OPTIONAL — SHOWN AS A POP-UP ON YOUR PROFILE
                </Text>
                <View style={styles.portfolioGrid}>
                  {policies.policyImageUrl ? (
                    <View style={styles.portfolioThumbWrap}>
                      <TouchableOpacity
                        onPress={handlePickPolicyImage}
                        disabled={policyImageUploading}
                        activeOpacity={0.7}
                      >
                        <Image
                          source={{ uri: policies.policyImageUrl }}
                          style={styles.portfolioThumb}
                        />
                        {policyImageUploading && (
                          <View style={styles.portfolioThumbUploading}>
                            <ActivityIndicator size="small" color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.portfolioRemoveBtn}
                        onPress={handleRemovePolicyImage}
                        disabled={policyImageUploading}
                      >
                        <Text style={styles.portfolioRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {!policies.policyImageUrl && (
                    <TouchableOpacity
                      style={styles.portfolioAddTile}
                      onPress={handlePickPolicyImage}
                      disabled={policyImageUploading}
                    >
                      {policyImageUploading ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <>
                          <Text style={styles.portfolioAddPlus}>+</Text>
                          <Text style={styles.portfolioAddText}>Add Image</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {policies.policyImageUrl ? (
                  <TouchableOpacity
                    onPress={handlePickPolicyImage}
                    disabled={policyImageUploading}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={[styles.policyLabel, { color: adaptiveAccentColor }]}>
                      {policyImageUploading ? 'UPLOADING…' : 'REPLACE PHOTO'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* ── Business Setup ── */}
                <View style={styles.policySep} />
                <Text style={styles.policySectionTitle}>Business Setup</Text>
                <Text style={styles.policyLabel}>TYPE</Text>
                {/* Locked post-first-save: business_type decides whether a
                    private address is required (mobile is exempt) and drives
                    address-release timing options below — changing it later
                    could silently leave an already-live profile in an
                    inconsistent state. */}
                {isEditMode && providerData.businessType ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                    <View style={[styles.policyPill, { backgroundColor: adaptiveAccentColor, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons name="lock-closed" size={11} color="#fff" />
                      <Text style={[styles.policyPillText, { color: '#fff' }]}>
                        {BUSINESS_TYPE_LABELS[providerData.businessType] ?? providerData.businessType}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pillRow}>
                    {([
                      { v: 'salon'     as const, l: 'Salon' },
                      { v: 'studio'    as const, l: 'Studio' },
                      { v: 'home_based'as const, l: 'Home Based' },
                      { v: 'mobile'    as const, l: 'Mobile' },
                    ]).map(({ v, l }) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.policyPill, providerData.businessType === v && { backgroundColor: adaptiveAccentColor }]}
                        onPress={() => setProviderData(prev => ({ ...prev, businessType: v }))}
                      >
                        <Text style={[styles.policyPillText, providerData.businessType === v && { color: '#fff' }]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {isEditMode && providerData.businessType && (
                  <Text style={styles.inputHint}>Set at sign-up — contact support to change your business type.</Text>
                )}

                <>
                  <Text style={[styles.policyLabel, { marginTop: 14 }]}>
                    FULL ADDRESS <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <Text style={styles.addressHint}>
                    {providerData.businessType === 'mobile'
                      ? "Private — never shown to clients. You travel to them, so this is just used to verify your account and keep your records accurate. Include your postcode."
                      : providerData.businessType === 'home_based'
                      ? 'Shared with clients only when you release it — never shown publicly. Include your postcode.'
                      : 'Your business address. Shown to clients once booking is confirmed. Include your postcode.'}
                  </Text>
                  <TextInput
                    style={styles.policyNote}
                    placeholder="e.g. 42 Oak Street, London, N1 2AB"
                    placeholderTextColor="rgba(0,0,0,0.3)"
                    value={providerData.fullAddress}
                    onChangeText={v => setProviderData(prev => ({ ...prev, fullAddress: v }))}
                    multiline
                  />

                  {providerData.businessType !== 'mobile' && (
                    <>
                      <Text style={[styles.policyLabel, { marginTop: 14 }]}>ADDRESS RELEASE</Text>
                      <View style={styles.pillRow}>
                        {([
                          { v: 'always'           as const, l: 'Always visible',  show: providerData.businessType === 'salon' || providerData.businessType === 'studio' },
                          { v: 'on_confirmation'  as const, l: 'On confirmation', show: true },
                          { v: 'day_before'       as const, l: '24h before',      show: providerData.businessType === 'home_based' },
                          { v: 'two_days_before'  as const, l: '48h before',      show: providerData.businessType === 'home_based' },
                          { v: 'three_days_before'as const, l: '72h before',      show: providerData.businessType === 'home_based' },
                          { v: 'five_days_before' as const, l: '5 days before',   show: providerData.businessType === 'home_based' },
                          { v: 'week_before'      as const, l: '1 week before',   show: providerData.businessType === 'home_based' },
                          { v: 'manual'           as const, l: 'Manual release',  show: providerData.businessType === 'home_based' },
                        ]).filter(o => o.show).map(({ v, l }) => (
                          <TouchableOpacity
                            key={v}
                            style={[styles.policyPill, providerData.addressReleasePolicy === v && { backgroundColor: adaptiveAccentColor }]}
                            onPress={() => setProviderData(prev => ({ ...prev, addressReleasePolicy: v }))}
                          >
                            <Text style={[styles.policyPillText, providerData.addressReleasePolicy === v && { color: '#fff' }]}>{l}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {({
                        always:           'Your address is always visible to booked clients.',
                        on_confirmation:  'Address is shared automatically when the booking is confirmed.',
                        day_before:       'Address is automatically shared 24 hours before the appointment.',
                        two_days_before:  'Address is automatically shared 48 hours before the appointment.',
                        three_days_before: 'Address is automatically shared 72 hours before the appointment.',
                        five_days_before:  'Address is automatically shared 5 days before the appointment.',
                        week_before:       'Address is automatically shared 1 week before the appointment.',
                        manual:           'You control when each client receives your address from the booking detail page.',
                      } as Record<string, string>)[providerData.addressReleasePolicy] ? (
                        <Text style={styles.addressHint}>
                          {(({
                            always:           'Your address is always visible to booked clients.',
                            on_confirmation:  'Address is shared automatically when the booking is confirmed.',
                            day_before:       'Address is automatically shared 24 hours before the appointment.',
                            two_days_before:  'Address is automatically shared 48 hours before the appointment.',
                            three_days_before:'Address is automatically shared 72 hours before the appointment.',
                            week_before:      'Address is automatically shared 1 week before the appointment.',
                            manual:           'You control when each client receives your address from the booking detail page.',
                          } as Record<string, string>)[providerData.addressReleasePolicy])}
                        </Text>
                      ) : null}
                    </>
                  )}
                </>
              </BlurView>
            )}

          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
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
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  backButtonText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: '#000',
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

  // Logo Section
  logoSection: {
    alignItems: 'center',
    marginBottom: 25,
  },
  logoContainer: {
    position: 'relative',
  },
  providerLogo: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  logoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 5,
  },
  logoPlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.6)',
  },
  logoEditBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  logoEditIcon: {
    fontSize: 16,
  },

  // Cards
  // Shadow lives on the OUTER wrapper (cardShadowWrap), not here — this is a
  // BlurView, and overflow:hidden is required for the native blur effect to
  // clip to the rounded corners (without it, the blur renders as a square
  // block poking past the rounded border). overflow:hidden also silently
  // kills a shadow on the same view, hence the separate wrapper.
  card: {
    padding: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  cardShadowWrap: {
    borderRadius: 25,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 6,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
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
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioAddPlus: {
    fontSize: 22,
    color: 'rgba(0,0,0,0.5)',
    fontWeight: '300',
    lineHeight: 24,
  },
  portfolioAddText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },

  // Section Titles
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 15,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
  },

  // Input Groups
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    marginBottom: 8,
  },
  inputHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.72)',
    marginTop: 6,
  },
  // Bright, well-defined text-box card — was a near-invisible 0.2-alpha
  // white fill that washed out against the modal's own light background.
  inputBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  inputBlurMultiline: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  // Reverts the main provider profile form's fields back to their original
  // translucent look (only the Add Service modal's boxes got the brighter
  // card treatment) — merged over inputBlur/inputBlurMultiline to cancel
  // out the border/shadow/solid-fill additions.
  profileInputBox: {
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  textInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    color: '#000',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textInputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },

  // Service Categories
  serviceCategoryScroll: {
    flexGrow: 0,
  },
  serviceCategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  serviceCategoryChipSelected: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderColor: 'rgba(0,0,0,0.3)',
  },
  serviceCategoryText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
  },
  serviceCategoryTextSelected: {
    color: '#000',
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
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  emptyServicesEmoji: {
    fontSize: 30,
    marginBottom: 10,
  },
  emptyServicesText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Category Tabs
  categoryHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 10,
  },
  selectedCategoryDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(0,0,0,0.65)',
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
  categoryTab: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  selectedCategoryTab: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  categoryTabBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  selectedCategoryTabBlur: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  draggingCategoryTabBlur: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  categoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
  },
  selectedCategoryTabText: {
    color: '#000',
  },
  categoryDragHandle: {
    marginLeft: 6,
    paddingHorizontal: 2,
  },
  // Applied to every pill except the one actively being dragged, so it's
  // unambiguous which pill is moving instead of a row of equally-solid pills.
  categoryTabDimmed: {
    opacity: 0.45,
  },

  // Required-field asterisk
  requiredStar: {
    color: '#E53935',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },

  // Duration quick-picker chips
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.14)',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  durationChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: 'rgba(0,0,0,0.7)',
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
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: 10,
    marginBottom: 2,
  },
  templateSheetSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 3,
  },
  templateGroupLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  templateScratchIcon: {
    fontSize: 22,
  },
  templateScratchTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: '#000',
  },
  templateScratchSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 16,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  templateName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: '#000',
  },
  templateDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
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
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
    color: '#000',
  },
  categoryTypeBlurb: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 13,
  },

  // Service Cards
  categoryServicesContainer: {
    gap: 12,
  },
  serviceItemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
    backgroundColor: 'rgba(255,255,255,0.3)',
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
    color: '#000',
    marginBottom: 4,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0,0,0,0.6)',
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
    color: 'rgba(0,0,0,0.5)',
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
    backgroundColor: 'rgba(255,255,255,0.4)',
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
    borderColor: 'rgba(0,0,0,0.2)',
  },
  addServiceBlur: {
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addServiceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
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
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: '#000',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 15,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
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
    borderColor: '#000',
    backgroundColor: 'rgba(255,255,255,0.3)',
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
    color: '#000',
    textAlign: 'center',
  },

  // Service Modal
  serviceModal: {
    flex: 1,
    marginTop: 80,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },

  // Small Modal (Add Category Modal)
  smallModal: {
    marginHorizontal: 30,
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: 25,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  smallModalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
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
    color: '#000',
    textAlign: 'center',
    marginBottom: 10,
  },
  transferSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
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
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  skipButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
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
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  cancelButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
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
    borderColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  addImageIcon: {
    fontSize: 24,
    color: 'rgba(0,0,0,0.5)',
  },
  addImageText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  carouselDotActive: {
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
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
    borderColor: '#000',
    backgroundColor: 'rgba(255,255,255,0.3)',
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
    fontSize: 10,
    color: '#000',
    textAlign: 'center',
  },

  // Preview Modal - Matches ProviderProfileScreen exactly
  previewContainer: {
    flex: 1,
  },
  previewSafeArea: {
    flex: 1,
  },
  previewHeroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  previewBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  // The content sheet rises over the hero photo with its own large top
  // corners — same floating-card-over-photo composition as
  // ProviderProfileScreen's contentSheet.
  previewContentSheet: {
    minHeight: screenHeight,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 60,
    borderTopLeftRadius: PREVIEW_SHEET_LIP_RADIUS,
    borderTopRightRadius: PREVIEW_SHEET_LIP_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
    elevation: 3,
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

  // About/Policy tab switcher
  previewInfoTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginHorizontal: -4,
  },
  previewInfoTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  previewInfoTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Policy tab rows
  previewPolicyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  previewPolicyIcon: {
    width: 28,
    alignItems: 'center',
  },
  previewPolicyRowText: {
    flex: 1,
  },
  previewPolicyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewPolicyLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  previewPolicyTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 2,
  },
  previewPolicyTagText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#fff',
  },
  previewPolicyValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    fontWeight: '700',
  },
  previewPolicyImageFab: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  previewPolicyImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPolicyImageModalFull: {
    width: '100%',
    height: '80%',
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
    elevation: 3,
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
    elevation: 3,
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
    color: 'rgba(0,0,0,0.55)',
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
    backgroundColor: 'rgba(255,255,255,0.3)',
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
    fontSize: 14,
    color: '#000',
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
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
    color: '#000',
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
  safetySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
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
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.75)',
  },
  toggleHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginTop: 1,
  },

  // ── Tab switcher ──
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  tabBtnTextActive: {
    color: '#fff',
  },

  // ── Policies tab ──
  policiesCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
  },
  policySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.75)',
    marginBottom: 10,
  },
  policyLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: 'rgba(0,0,0,0.4)',
    marginBottom: 8,
  },
  policySubLabel: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
    lineHeight: 16,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 4,
  },
  policyPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  policyPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.55)',
  },
  policyNote: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: 'rgba(0,0,0,0.7)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  policySep: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 18,
  },
  depositHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  depositInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  savePoliciesBtn: {
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  savePoliciesBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  addressHint: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 18,
  },

});

export default InfoRegScreen;
