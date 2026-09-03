/**
 * My Services — where a provider manages their catalogue and their work.
 *
 * This screen has been two wrong things already. It started as a near-1:1
 * replica of the client-facing profile, which was redundant the moment you
 * notice InfoRegScreen's editor already has a real PREVIEW modal. It was then
 * a grid of status tiles — which read like a dashboard but wasn't one, because
 * every tile's tap landed in the same 7,254-line InfoReg document. A screen
 * whose only verb is "open the big form" has no reason to exist.
 *
 * So it manages things directly now. Services are listed by category and
 * edited in place: change a price, add a service, hide one that isn't on offer
 * this month — without reposting the whole profile. Portfolio photos are added
 * and removed here too. Those are the two things a provider touches weekly.
 *
 * The remaining links are links because their destinations are already real,
 * focused screens rather than sections of the big form: Schedule
 * (ProviderScheduleScreen), Policies (PoliciesScreen, in the Business Details
 * hub) and Branding (BrandingScreen).
 *
 * Deliberately NOT analytics. No revenue, no charts, no trends — that's
 * ProviderAnalyticsScreen's job.
 *
 * Status comes from the shared features/providers/goLiveStatus module, which
 * ProviderHomeScreen's setup card also uses. That sharing is the point: the
 * old "Profile Health 5/7" card scored a different, softer list with no
 * schedule item at all, so a provider could be told they were ready for
 * clients while the server was still refusing to publish them.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadProviderFromSupabase,
  uploadToStorage,
} from '../../services/providerRegistrationService';
import type { ProviderRegistrationData } from '../../services/providerRegistrationService';
import {
  addPortfolioItem,
  createMyService,
  deletePortfolioItem,
  getMyBookmarkCount,
  getMyProviderProfile,
  getMyTopServices,
  getMyServiceCatalogue,
  getProviderPortfolio,
  getMyProviderTermsText,
  getProviderReviews,
  setMyServiceActive,
  updateMyService,
  type MyServiceDraft,
} from '../../services/databaseService';
import type { DbPortfolioItem, DbService } from '../../types/database';
import type { ProviderServicesStackParamList } from '../../navigation/types';
import { resolveProviderTheme, withAlpha, isDarkColor } from '../../constants/providerThemes';
import { AvailabilityService } from '../../services/AvailabilityService';
import type { AvailabilitySummary } from '../../services/AvailabilityService';
import AvailabilityCard from '../../components/AvailabilityCard';
import { ThemedBackground } from '../../components/ThemedBackground';
import { logger } from '../../utils/logger';
import { toUserMessage } from '../../utils/userFacingError';
import { buildPolicyDisplayRows } from '../../utils/policyDisplay';
import ServiceEditorSheet, {
  EMPTY_SERVICE_VALUE,
  toEditorValue,
  type ServiceEditorPalette,
  type ServiceEditorValue,
} from '../../features/providers/ServiceEditorSheet';
import {
  fetchGoLiveStatus,
  buildGoLiveSteps,
  buildGoLiveHeadline,
  type GoLiveStatus,
  type GoLiveStepKey,
} from '../../features/providers/goLiveStatus';
import { splitPortfolioByKind } from '../../features/providers/venuePhotos';


// Hero → content transition, inherited from the client-facing profile.
const SHEET_LIP_RADIUS = 36;

// Portfolio rail: portrait tiles, sized so a third one peeks past the card's
// right edge and the strip reads as scrollable without a scrollbar.
const PHOTO_GAP = 10;
const PHOTO_W = 108;
const PHOTO_H = 136;

// Half-width cards, two to a row, same padding.
const HALF_GAP = 12;
/** Half-width tile, measured per render rather than captured at module
 *  load, so the paired tiles still split the row after a rotation. */
const halfWidth = (screenWidth: number) => (screenWidth - 40 - HALF_GAP) / 2;

// Setup ring on the status card. Radius is inset by half the stroke so the
// band sits fully inside the SVG box rather than clipping at its edge.
const RING_SIZE = 118;
const RING_STROKE = 11;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

/** Where each shared go-live step is fixed, from the MyServices stack. All
 *  three destinations are registered on this navigator, so each tap pushes
 *  with this screen underneath rather than bouncing to another tab's root and
 *  leaving its back button with nothing to return to. */
const GO_LIVE_STEP_SCREENS: Record<GoLiveStepKey, keyof ProviderServicesStackParamList> = {
  profile: 'EditProfile',
  schedule: 'ProviderSchedule',
  services: 'EditProfile',
  address: 'EditProfile',
  policies: 'Policies',
  payment: 'Payments',
  logo: 'EditProfile',
  // Terms live inside EditProfile (InfoReg)'s own "Your Terms &
  // Conditions" card. Portfolio is handled as a special case in
  // handleGoLiveStep below (it's edited inline on this screen, not a
  // separate destination) — this entry only exists to satisfy the
  // Record's exhaustiveness and is never actually navigated to.
  terms: 'EditProfile',
  portfolio: 'ProviderServicesMain',
};

/** Attention colours. Only the two "something's outstanding" tones are fixed:
 *  amber has to read as amber whatever accent a provider picks, same reasoning
 *  as AvailabilityCard's dots. A healthy profile is drawn in the provider's own
 *  accent instead of a success green — nothing on this screen is a traffic
 *  light, and the green read as an alert of its own. */
const TONE_COLOR = {
  blocked: '#FF9500',
  stalled: '#FF9500',
} as const;

/** The two halves of this screen: how the profile is doing, and the service
 *  catalogue itself. Everything service-related lives under 'services'. */
type ProfileTab = 'dashboard' | 'services';

const PROFILE_TABS: { key: ProfileTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'dashboard', label: 'DASHBOARD', icon: 'grid-outline' },
  { key: 'services', label: 'SERVICES', icon: 'pricetags-outline' },
];

const MAX_POLICY_ROWS = 4;
const MAX_REVIEW_PREVIEWS = 2;
const MAX_PORTFOLIO_TILES = 9;

/** True when there's anything worth showing about the booking policy — either
 *  descriptive booking_policies or the enforced cancellation window. */
function hasPolicyInfo(providerData: ProviderRegistrationData): boolean {
  const bp = providerData.bookingPolicies;
  return (
    providerData.cancellationNoticeHours > 0 ||
    (!!bp &&
      ((!!bp.depositRequired && !!bp.depositAmount) ||
        (!!bp.cancelNotice && bp.cancelNotice !== 'none') ||
        !!(bp.rescheduleNotice || bp.maxReschedules) ||
        (!!bp.noShowAction && bp.noShowAction !== 'none')))
  );
}

interface DashPalette {
  text: string;
  sub: string;
  border: string;
  sep: string;
  cardBg: string;
  blurTint: 'light' | 'dark';
  blurIntensity: number;
  highlight: [string, string];
  accent: string;
}

/** A full-width card: eyebrow, title, optional headline value, and whatever
 *  detail belongs underneath. Tappable as a whole when `onPress` is given. */
const DashCard = React.memo(function DashCard({
  palette,
  eyebrow,
  title,
  value,
  onPress,
  children,
}: {
  palette: DashPalette;
  eyebrow: string;
  title: string;
  value?: string | undefined;
  onPress?: (() => void) | undefined;
  children?: React.ReactNode;
}) {
  const handlePress = useCallback(() => {
    if (!onPress) return;
    Haptics.selectionAsync().catch(() => {});
    onPress();
  }, [onPress]);

  const body = (
    <BlurView
      intensity={palette.blurIntensity}
      tint={palette.blurTint}
      style={[
        styles.dashCard,
        { backgroundColor: palette.cardBg, borderColor: palette.border },
      ]}
    >
      <LinearGradient
        colors={palette.highlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardHighlight}
      />
      <View style={styles.dashHeader}>
        <View style={styles.dashHeaderText}>
          <Text style={[styles.dashEyebrow, { color: palette.sub }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text
            style={[styles.dashTitle, { color: palette.text }]}
          >
            {title}
          </Text>
        </View>
        {value ? <Text style={[styles.dashValue, { color: palette.accent }]}>{value}</Text> : null}
        {onPress ? (
          <Ionicons name="chevron-forward" size={16} color={palette.sub} />
        ) : null}
      </View>
      {children}
    </BlurView>
  );

  if (!onPress) return <View style={styles.dashCardShadow}>{body}</View>;
  return (
    <View style={styles.dashCardShadow}>
      <TouchableOpacity activeOpacity={0.75} onPress={handlePress}>
        {body}
      </TouchableOpacity>
    </View>
  );
});

/** Nothing here yet — said as the consequence for clients, not as a scold. */
const DashEmpty = React.memo(function DashEmpty({
  palette,
  text,
}: {
  palette: DashPalette;
  text: string;
}) {
  return <Text style={[styles.dashEmpty, { color: palette.sub }]}>{text}</Text>;
});

/** One service in the catalogue. The tile body opens the editor; the eye is a
 *  separate hit target that hides/shows without opening anything. */
const ServiceTile = React.memo(function ServiceTile({
  service,
  palette,
  busy,
  onEdit,
  onToggleActive,
}: {
  service: DbService;
  palette: DashPalette;
  busy: boolean;
  onEdit: (service: DbService) => void;
  onToggleActive: (service: DbService) => void;
}) {
  const hidden = !service.is_active;
  const { width: screenWidth } = useWindowDimensions();
  return (
    <TouchableOpacity
      style={[
        styles.serviceTile,
        { width: halfWidth(screenWidth) },
        { backgroundColor: palette.cardBg, borderColor: palette.border },
        hidden && styles.serviceTileHidden,
      ]}
      activeOpacity={0.75}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onEdit(service);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${service.name}`}
    >
      <Text style={[styles.serviceTileName, { color: palette.text }]} numberOfLines={2}>
        {service.name}
      </Text>
      <Text style={[styles.serviceTileMeta, { color: palette.sub }]} numberOfLines={1}>
        {service.duration_minutes} min{hidden ? ' · hidden' : ''}
      </Text>

      <View style={styles.serviceTileFooter}>
        <Text
          style={[styles.serviceTilePrice, { color: hidden ? palette.sub : palette.text }]}
          numberOfLines={1}
        >
          £{service.price}
          {service.price_max ? `–£${service.price_max}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.serviceToggle}
          activeOpacity={0.6}
          disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={
            service.is_active
              ? `Hide ${service.name} from clients`
              : `Show ${service.name} to clients`
          }
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onToggleActive(service);
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.sub} />
          ) : (
            <Ionicons
              name={service.is_active ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={service.is_active ? palette.accent : palette.sub}
            />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

interface Props {
  navigation: any;
}

export default function ProviderMyProfileScreen({ navigation }: Props) {
  const { theme } = useTheme();
  // Measured per render, not captured at module load: the paired tiles and the
  // quick-action row both divide the screen width between them.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user } = useAuth();
  const [providerData, setProviderData] = useState<ProviderRegistrationData | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [services, setServices] = useState<DbService[]>([]);
  // Work photos only — venue/workspace shots aren't portfolio photos to a
  // client (they render inside Additional Information on the profile and never
  // appear in Explore) and they're added and removed in Business Profile's
  // "Address photos" grid, not here. getProviderPortfolio now excludes them in
  // SQL unless asked for, so this screen never fetches what it can't show.
  const [workPhotos, setWorkPhotos] = useState<DbPortfolioItem[]>([]);
  // Profile-Health-only, not part of the shared go-live fetch (Home never
  // renders these, and workPhotos is already fetched here for the grid
  // below — reusing it avoids a duplicate portfolio_items query).
  const [termsSet, setTermsSet] = useState(false);
  const [reviews, setReviews] = useState<
    { id: string; name: string; rating: number; comment: string; date: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  // null means "not answered yet" — a failed read must never render as an
  // all-false checklist telling a live provider they've done nothing.
  const [goLive, setGoLive] = useState<GoLiveStatus | null>(null);
  // providers.review_count, not reviews.length: the reviews query is capped at
  // a page, so counting the rows we happened to fetch would tell a provider
  // with 40 reviews that they have 20. This is also the exact number clients
  // see on their card in search, which is the number worth reporting back.
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  // How many clients have saved this provider — the cheapest real performance
  // number on the screen, and the way into the full analytics.
  const [bookmarkCount, setBookmarkCount] = useState<number | null>(null);
  // What clients actually book, busiest first — the one thing on this screen
  // that reports back on the catalogue rather than describing it.
  const [topServices, setTopServices] = useState<{ name: string; count: number }[] | null>(null);

  // Editor state. editingId is the row being changed, or null for a new
  // service in editingCategory.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editorInitial, setEditorInitial] = useState<ServiceEditorValue>(EMPTY_SERVICE_VALUE);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Which half of the sheet is showing. Not navigation state: both halves read
  // the same already-loaded data, so switching must not refetch or reset the
  // scroll position the way pushing a screen would.
  const [tab, setTab] = useState<ProfileTab>('dashboard');
  // null = "hasn't been touched", which reads as open for a provider who isn't
  // live yet and closed for one who is. An initial `false` would hide the only
  // instructions an unpublished provider has.
  const [stepsOpen, setStepsOpen] = useState<boolean | null>(null);

  // Reload data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        // Don't blank the screen on refocus — isLoading is only true on the
        // very first mount (useState(true)). On later focuses we keep what's
        // on screen and refresh behind it instead of flashing a spinner every
        // time you tab back.
        try {
          let parsed: ProviderRegistrationData | null = null;

          if (user?.id) {
            // Two independent lookups — run them together, not one after the
            // other. The whole provider row is read here rather than just its
            // id: it costs the same single row but carries logo_url,
            // has_gone_live and review_count too, so everything below reuses
            // it instead of re-reading the same provider once per consumer.
            const [loaded, profile] = await Promise.all([
              loadProviderFromSupabase(user.id),
              getMyProviderProfile(),
            ]);
            parsed = loaded;

            if (profile) {
              setProviderId(profile.id);
              setReviewCount(profile.review_count ?? 0);

              // The catalogue is what this screen is for, so it's awaited
              // rather than fired and forgotten — everything else can arrive
              // late without the screen looking broken.
              const catalogue = await getMyServiceCatalogue(profile.id);
              setServices(catalogue.services);

              getProviderPortfolio(profile.id)
                .then(({ work }) => setWorkPhotos(work))
                .catch(() => {});

              getMyProviderTermsText()
                .then(text => setTermsSet(text.trim().length > 0))
                .catch(err => {
                  logger.error('[MyServices] terms status load failed:', err);
                });

              getMyBookmarkCount()
                .then(setBookmarkCount)
                .catch(err => {
                  logger.error('[MyServices] bookmark count load failed:', err);
                });

              getMyTopServices(90, 1)
                .then(setTopServices)
                .catch(err => {
                  logger.error('[MyServices] top services load failed:', err);
                });

              setAvailabilityLoading(true);
              AvailabilityService.getAvailabilitySummary(profile.id, {
                includeExtendedSearch: false,
              })
                .then(setAvailability)
                .catch(() => setAvailability(null))
                .finally(() => setAvailabilityLoading(false));

              getProviderReviews(profile.id, { limit: 20 })
                .then(dbReviews =>
                  setReviews(
                    dbReviews.map(r => ({
                      id: r.id,
                      name: r.user?.name ?? 'Anonymous',
                      rating: r.rating,
                      comment: r.comment ?? '',
                      date: new Date(r.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    })),
                  ),
                )
                .catch(() => {});

              // Passed the profile we already hold, so this costs the three
              // status reads and not a fourth lookup of the same row.
              fetchGoLiveStatus(profile)
                .then(setGoLive)
                .catch(err => {
                  logger.error('[MyServices] go-live status load failed:', err);
                  setGoLive(null);
                });
            }
          }

          setProviderData(parsed);
        } catch (e) {
          logger.error('[MyServices] load failed:', e);
        } finally {
          setIsLoading(false);
        }
      };
      load();
    }, [user?.id]),
  );

  const serviceType = useMemo(() => {
    if (!providerData) return '';
    return providerData.providerService === 'OTHER'
      ? providerData.customServiceType
      : providerData.providerService;
  }, [providerData]);

  /** Services grouped for display, plus the real breakdown of what's in the
   *  catalogue. Live and hidden are counted separately: a provider with eight
   *  services, three of them switched off, is not offering eight things — and
   *  a single total would hide exactly the fact they came here to check. */
  const catalogue = useMemo(() => {
    const groups = new Map<string, DbService[]>();
    for (const service of services) {
      const list = groups.get(service.category_name);
      if (list) list.push(service);
      else groups.set(service.category_name, [service]);
    }
    const live = services.filter(service => service.is_active);
    const prices = live.map(service => service.price).filter(p => Number.isFinite(p) && p > 0);
    const priceLabel =
      prices.length === 0
        ? null
        : (() => {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            return min === max ? `£${min}` : `£${min}–£${max}`;
          })();

    return {
      groups: Array.from(groups, ([name, items]) => ({ name, items })),
      liveCount: live.length,
      hiddenCount: services.length - live.length,
      priceLabel,
    };
  }, [services]);

  const policyRows = useMemo(() => {
    if (!providerData) return [];
    return buildPolicyDisplayRows(
      providerData.bookingPolicies,
      providerData.cancellationNoticeHours,
    );
  }, [providerData]);

  /** goLive plus the two Profile-Health-only fields it never fetches itself
   *  (see GoLiveStatus's portfolioSet/termsSet doc comment) — merged here
   *  rather than inside fetchGoLiveStatus so that fetch stays free of a
   *  portfolio_items query ProviderHomeScreen would never use, reusing the
   *  workPhotos this screen already loads for its own grid instead. */
  const goLiveWithHealth = useMemo<GoLiveStatus | null>(
    () => goLive ? { ...goLive, portfolioSet: workPhotos.length > 0, termsSet } : null,
    [goLive, workPhotos, termsSet],
  );

  /** What the ring reads — every step counts, portfolio/T&Cs and the
   *  optional logo included: none of them block go-live, but a live
   *  provider missing one genuinely hasn't finished setting up. Whether
   *  clients can actually book is the headline's job, taken straight from
   *  has_gone_live — never re-derived from this number. */
  const setup = useMemo(() => {
    const steps = goLiveWithHealth ? buildGoLiveSteps(goLiveWithHealth) : [];
    const total = steps.length;
    const done = steps.filter(step => step.done).length;
    const ratio = total === 0 ? 0 : done / total;
    const word = !goLive
      ? '—'
      : goLive.isLive
        ? ratio === 1
          ? 'Excellent'
          : 'Live'
        : steps.some(step => step.required && !step.done)
          ? 'Setup'
          : 'Almost';
    return { done, total, ratio, percent: Math.round(ratio * 100), word };
  }, [goLive, goLiveWithHealth]);

  const showSteps = stepsOpen ?? !(goLive?.isLive ?? false);
  const topService = topServices?.[0] ?? null;
  // Every step ticked, the optional logo included — the one state where the
  // card has nothing left to ask for and can move out of the way.
  const setupComplete = setup.percent === 100;

  const averageRating = providerData?.rating ?? 0;
  // Falls back to the rows in hand only while the count hasn't arrived, so an
  // in-flight load never briefly claims "0 reviews" under a visible one.
  const totalReviews = reviewCount ?? reviews.length;

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handleEditSchedule = useCallback(() => {
    navigation.navigate('ProviderSchedule');
  }, [navigation]);

  const handleEditBranding = useCallback(() => {
    navigation.navigate('Branding');
  }, [navigation]);

  const handleOpenAnalytics = useCallback(() => {
    navigation.navigate('Analytics');
  }, [navigation]);

  const handleEditPolicies = useCallback(() => {
    navigation.navigate('Policies');
  }, [navigation]);

  const handleSelectTab = useCallback((next: ProfileTab) => {
    Haptics.selectionAsync().catch(() => {});
    setTab(next);
  }, []);

  const handleToggleSteps = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setStepsOpen(!showSteps);
  }, [showSteps]);

  /** The reference's routine row. Every tile pushes on THIS stack (or switches
   *  tab), so nothing here lands at a bare tab root with a dead back button. */
  const quickActions = useMemo<
    { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[]
  >(
    () => [
      {
        key: 'services',
        label: 'Services',
        icon: 'sparkles-outline',
        onPress: () => handleSelectTab('services'),
      },
      {
        key: 'schedule',
        label: 'Schedule',
        icon: 'calendar-outline',
        onPress: () => navigation.navigate('ProviderSchedule'),
      },
      {
        key: 'clients',
        label: 'Clients',
        icon: 'people-outline',
        onPress: () => navigation.navigate('Clientele'),
      },
      {
        key: 'offers',
        label: 'Offers',
        icon: 'gift-outline',
        onPress: () => navigation.navigate('Promotions'),
      },
      {
        key: 'packs',
        label: 'Info packs',
        icon: 'documents-outline',
        onPress: () => navigation.navigate('InfoPacks'),
      },
    ],
    [handleSelectTab, navigation],
  );

  // ── Service editing ─────────────────────────────────────────────────────

  const openNewService = useCallback((categoryName: string) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(null);
    setEditingCategory(categoryName);
    setEditorInitial(EMPTY_SERVICE_VALUE);
    setEditorOpen(true);
  }, []);

  const openEditService = useCallback((service: DbService) => {
    setEditingId(service.id);
    setEditingCategory(service.category_name);
    setEditorInitial(toEditorValue(service));
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const handleSaveService = useCallback(
    async (draft: MyServiceDraft) => {
      if (!providerId) return;
      setSaving(true);
      try {
        if (editingId) {
          const updated = await updateMyService(editingId, draft);
          setServices(prev => prev.map(s => (s.id === updated.id ? { ...s, ...updated } : s)));
        } else {
          const created = await createMyService(providerId, editingCategory, draft);
          setServices(prev => [...prev, created]);
        }
        setEditorOpen(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e) {
        logger.error('[MyServices] save service failed:', e);
        Alert.alert(
          'Could not save',
          toUserMessage(e, "That didn't save. Please try again.", 'MyServices.saveService'),
        );
      } finally {
        setSaving(false);
      }
    },
    [providerId, editingId, editingCategory],
  );

  const handleToggleActive = useCallback(async (service: DbService) => {
    const next = !service.is_active;
    setTogglingId(service.id);
    // Optimistic: the eye flips immediately and reverts if the write fails,
    // rather than sitting unchanged while a provider taps it again.
    setServices(prev => prev.map(s => (s.id === service.id ? { ...s, is_active: next } : s)));
    try {
      await setMyServiceActive(service.id, next);
    } catch (e) {
      setServices(prev =>
        prev.map(s => (s.id === service.id ? { ...s, is_active: service.is_active } : s)),
      );
      logger.error('[MyServices] toggle service failed:', e);
      Alert.alert(
        'Could not update',
        toUserMessage(e, "That didn't save. Please try again.", 'MyServices.toggleService'),
      );
    } finally {
      setTogglingId(null);
    }
  }, []);

  // ── Portfolio ───────────────────────────────────────────────────────────

  const handleAddPhotos = useCallback(async () => {
    if (!user?.id || !providerId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    setPhotoUploading(true);
    // Each photo uploads independently so one failure in a multi-select
    // doesn't silently drop the rest — same shape as the InfoReg uploader.
    await Promise.all(
      result.assets.map(async asset => {
        try {
          const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          // fetch(localUri).blob() is unreliable for file:// URIs in React
          // Native — uploadToStorage reads via expo-file-system instead.
          const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
          const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
          const item = await addPortfolioItem(providerId, publicUrl, ratio);
          setWorkPhotos(prev => [item, ...prev]);
        } catch (e) {
          logger.error('[MyServices] portfolio upload failed:', e);
          Alert.alert(
            'Upload failed',
            toUserMessage(e, 'Could not upload one of those photos.', 'MyServices.addPhotos'),
          );
        }
      }),
    );
    setPhotoUploading(false);
  }, [user?.id, providerId]);

  // Portfolio is a special case: it's edited inline on this screen (the
  // grid below), not a separate destination, so tapping that step opens the
  // picker directly instead of navigating anywhere.
  const handleGoLiveStep = useCallback(
    (key: GoLiveStepKey) => {
      Haptics.selectionAsync().catch(() => {});
      if (key === 'portfolio') { void handleAddPhotos(); return; }
      navigation.navigate(GO_LIVE_STEP_SCREENS[key]);
    },
    [navigation, handleAddPhotos],
  );

  const handleRemovePhoto = useCallback((item: DbPortfolioItem) => {
    Alert.alert('Remove photo?', 'Clients will no longer see it on your profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setWorkPhotos(prev => prev.filter(p => p.id !== item.id));
          try {
            await deletePortfolioItem(item.id);
          } catch (e) {
            setWorkPhotos(prev => [item, ...prev]);
            logger.error('[MyServices] portfolio delete failed:', e);
            Alert.alert(
              'Could not remove',
              toUserMessage(e, "That didn't save. Please try again.", 'MyServices.removePhoto'),
            );
          }
        },
      },
    ]);
  }, []);

  // ── Theme ───────────────────────────────────────────────────────────────

  const PP = useMemo(
    () => resolveProviderTheme(providerData?.profileTheme),
    [providerData?.profileTheme],
  );
  const cardBg = withAlpha(PP.card, PP.isDark ? 0.82 : 0.98);
  const cardBlurTint = PP.isDark ? ('dark' as const) : ('light' as const);
  const cardBlurIntensity = PP.isDark ? 35 : 25;
  const cardHighlightColors = useMemo(
    () =>
      (PP.isDark
        ? ['rgba(255,255,255,0.08)', 'transparent']
        : ['rgba(255,255,255,0.3)', 'transparent']) as [string, string],
    [PP.isDark],
  );
  const accentColor = providerData?.accentColor || PP.accent;
  // The reference's black pill, flipped on dark themes so it stays the
  // highest-contrast thing on the card instead of sinking into it.
  const inkBg = PP.isDark ? '#F2F0F0' : '#101010';
  const inkText = PP.isDark ? '#101010' : '#FFFFFF';
  // Two washes of the provider's own accent rather than the reference's fixed
  // lilac/peach — this screen wears the provider's branding, not ours.
  const tintStrong = withAlpha(accentColor, PP.isDark ? 0.24 : 0.16);
  const tintSoft = withAlpha(accentColor, PP.isDark ? 0.12 : 0.07);

  const dashPalette = useMemo<DashPalette>(
    () => ({
      text: PP.text,
      sub: PP.sub,
      border: PP.border,
      sep: PP.sep,
      cardBg,
      blurTint: cardBlurTint,
      blurIntensity: cardBlurIntensity,
      highlight: cardHighlightColors,
      accent: accentColor,
    }),
    [
      PP.text,
      PP.sub,
      PP.border,
      PP.sep,
      cardBg,
      cardBlurTint,
      cardBlurIntensity,
      cardHighlightColors,
      accentColor,
    ],
  );

  const editorPalette = useMemo<ServiceEditorPalette>(
    () => ({
      bg: PP.bg,
      card: cardBg,
      text: PP.text,
      sub: PP.sub,
      border: PP.border,
      accent: accentColor,
    }),
    [PP.bg, cardBg, PP.text, PP.sub, PP.border, accentColor],
  );

  // Mirror the client-facing hero logic exactly for visual parity: a
  // background photo always forces the dark (white-text) treatment, since the
  // overlay under it guarantees contrast regardless of the photo's brightness.
  const heroBgColor = providerData?.hasCustomGradient ? providerData?.gradient[0] : PP.hero;
  const heroIsDark =
    !!providerData?.backgroundImage || (heroBgColor ? isDarkColor(heroBgColor) : true);
  const heroText = heroIsDark ? '#FFFFFF' : '#26201E';
  const heroSub = heroIsDark ? 'rgba(255,255,255,0.96)' : 'rgba(38,32,30,0.78)';

  if (isLoading) {
    return (
      <ThemedBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#a342c3" />
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  if (!providerData) {
    return (
      <ThemedBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <Ionicons
              name="storefront-outline"
              size={72}
              color={theme.text + '30'}
              style={{ marginBottom: 16 }}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Set Up Your Profile</Text>
            <Text style={[styles.emptySubtitle, { color: theme.text + '66' }]}>
              Create your provider profile so clients can discover and book your services.
            </Text>
            <TouchableOpacity
              style={[styles.setupButton, { backgroundColor: '#007AFF' }]}
              onPress={handleEditProfile}
            >
              <Text style={styles.setupButtonText}>Create Profile</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  const headline = goLiveWithHealth ? buildGoLiveHeadline(goLiveWithHealth) : null;
  // 'liveWithExtras' reads the same as 'live' here — it's encouragement, not
  // a warning, since the provider is already bookable either way.
  const toneColor =
    headline && (headline.tone === 'blocked' || headline.tone === 'stalled')
      ? TONE_COLOR[headline.tone]
      : accentColor;

  /* The go-live card. It leads the dashboard while anything is still
     outstanding and drops to the bottom once the profile is finished —
     at that point it's a receipt, not an instruction. */
  const statusSection = (
    <>
      {/* ── Status hero ────────────────────────────────────────
          A ring instead of a bare checklist: the headline answers
          "am I bookable", the ring answers "how far off", and the
          steps stay one tap away rather than always occupying the
          top of the screen for a provider who's already live. */}
      {headline && goLiveWithHealth ? (
        <View style={styles.dashCardShadow}>
          <BlurView
            intensity={cardBlurIntensity}
            tint={cardBlurTint}
            style={[styles.statusCard, { backgroundColor: cardBg, borderColor: PP.border }]}
          >
            <LinearGradient
              colors={cardHighlightColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardHighlight}
            />
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, { backgroundColor: toneColor }]} />
              <Text style={[styles.dashEyebrow, { color: PP.sub }]}>YOUR PROFILE TODAY</Text>
            </View>

            <View style={styles.statusBody}>
              <View style={styles.ringWrap}>
                <Svg width={RING_SIZE} height={RING_SIZE}>
                  <SvgCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={withAlpha(toneColor, PP.isDark ? 0.22 : 0.16)}
                    strokeWidth={RING_STROKE}
                  />
                  <SvgCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={toneColor}
                    strokeWidth={RING_STROKE}
                    strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                    strokeDashoffset={RING_CIRC * (1 - setup.ratio)}
                    strokeLinecap="round"
                    rotation={-90}
                    originX={RING_SIZE / 2}
                    originY={RING_SIZE / 2}
                  />
                </Svg>
                <View style={styles.ringLabel} pointerEvents="none">
                  <Text style={[styles.ringValue, { color: PP.text }]}>{setup.percent}%</Text>
                  <Text style={[styles.ringUnit, { color: PP.sub }]}>/100%</Text>
                  <Text style={[styles.ringWord, { color: toneColor }]}>{setup.word}</Text>
                </View>
              </View>

              <View style={styles.statusText}>
                <Text style={[styles.statusTitle, { color: PP.text }]}>{headline.title}</Text>
                <Text style={[styles.statusDetail, { color: PP.sub }]} numberOfLines={4}>
                  {headline.detail ??
                    (goLiveWithHealth.isLive
                      ? 'Clients can find you in search and book your services.'
                      : 'Finish the steps below and your profile publishes itself.')}
                </Text>
                <TouchableOpacity
                  style={[styles.inkPill, { backgroundColor: inkBg }]}
                  onPress={handleToggleSteps}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showSteps }}
                >
                  <Text style={[styles.inkPillText, { color: inkText }]}>
                    {showSteps ? 'HIDE DETAILS' : 'VIEW DETAILS'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {showSteps ? (
              <View style={styles.stepList}>
                {/* Same shape as the reference's "4/5 completed"
                    strip, over the steps the database actually
                    gates on. */}
                <View style={styles.stepListHeader}>
                  <Text style={[styles.dashEyebrow, { color: PP.sub }]}>
                    SETUP · {setup.total} STEPS
                  </Text>
                  <Text style={[styles.stepCount, { color: PP.sub }]}>
                    Completed {setup.done}/{setup.total}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: withAlpha(toneColor, 0.16) }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: toneColor, width: `${setup.percent}%` },
                    ]}
                  />
                </View>
                {buildGoLiveSteps(goLiveWithHealth).map(step => (
                  <TouchableOpacity
                    key={step.key}
                    onPress={() => handleGoLiveStep(step.key)}
                    disabled={step.done}
                    activeOpacity={0.7}
                    style={styles.stepRow}
                  >
                    <Ionicons
                      name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={step.done ? accentColor : PP.sub}
                    />
                    <Text
                      style={[
                        styles.stepLabel,
                        {
                          color: step.done ? PP.sub : PP.text,
                          textDecorationLine: step.done ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {step.label}
                    </Text>
                    {/* Only the six blocking steps count toward the
                        headline's "N steps left" — this tag is what makes
                        that number traceable back to the list instead of
                        looking arbitrary next to profile/portfolio/terms,
                        which are real setup but never gate go-live. Drops
                        once done — a completed step isn't an outstanding
                        go-live requirement any more, and the strikethrough
                        already marks it finished. */}
                    {step.blocking && !step.done && (
                      <View style={[styles.requiredTag, { borderColor: withAlpha(toneColor, 0.4) }]}>
                        <Text style={[styles.requiredTagText, { color: toneColor }]}>REQUIRED</Text>
                      </View>
                    )}
                    {step.done ? null : (
                      <Ionicons name="chevron-forward" size={14} color={PP.sub} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </BlurView>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: PP.bg }]}>
      {providerData.backgroundImage ? (
        <>
          <Image
            source={{ uri: providerData.backgroundImage }}
            style={[styles.heroImage, { opacity: 0.88 }]}
            resizeMode="cover"
            fadeDuration={0}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.18)', 'transparent']}
            locations={[0, 0.35, 0.62]}
            style={styles.heroImage}
          />
        </>
      ) : (
        <LinearGradient
          colors={providerData.hasCustomGradient ? providerData.gradient : [PP.hero, PP.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroImage}
        />
      )}

      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity header. Scrolls with the content rather than being
              pinned: it carries stats and actions now, so holding it on screen
              would cost the working area most of the top of the phone. */}
          <View style={styles.profileHeader}>
            <View style={styles.identityRow}>
              <View style={styles.identityText}>
                <View style={styles.nameRow}>
                  <Text
                    style={[styles.displayName, { color: heroText }, heroIsDark && styles.heroTextShadow]}
                    numberOfLines={2}
                  >
                    {providerData.providerName || 'Your Business Name'}
                  </Text>
                  {providerData.isVerified && (
                    <Ionicons
                      name="checkmark-circle"
                      size={19}
                      color={heroIsDark ? '#FFFFFF' : '#007AFF'}
                      style={styles.verifiedTick}
                    />
                  )}
                </View>
                <Text
                  style={[styles.handle, { color: heroSub }, heroIsDark && styles.heroTextShadow]}
                  numberOfLines={1}
                >
                  {[
                    (serviceType || 'SERVICE').toLowerCase(),
                    providerData.location ? providerData.location.toLowerCase() : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>

              {providerData.logo ? (
                <Image
                  source={{ uri: providerData.logo }}
                  style={styles.avatar}
                  resizeMode="cover"
                  fadeDuration={0}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: accentColor }]}>
                  <Text style={styles.avatarInitials}>
                    {providerData.providerName
                      .split(' ')
                      .map(w => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            {/* Counts live here rather than in a sentence under the Services
                heading. Same numbers, read at a glance instead of parsed. */}
            <View style={styles.statRow}>
              {[
                { value: String(catalogue.liveCount), label: catalogue.liveCount === 1 ? 'Service' : 'Services' },
                { value: String(workPhotos.length), label: workPhotos.length === 1 ? 'Photo' : 'Photos' },
                {
                  value: totalReviews > 0 ? String(averageRating) : '—',
                  label: totalReviews === 1 ? 'Review' : 'Reviews',
                },
              ].map(stat => (
                <View key={stat.label} style={styles.stat}>
                  <Text
                    style={[styles.statValue, { color: heroText }, heroIsDark && styles.heroTextShadow]}
                  >
                    {stat.value}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: heroSub }, heroIsDark && styles.heroTextShadow]}
                  >
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Primary action plus two shortcuts, same shape as the reference.
                All three go somewhere real — the circles are Schedule and
                Branding, which own themselves rather than being sections of
                the profile form. */}
            <View style={styles.actionRow}>
              {/* Ink pill, like every CTA in the reference — and it has to
                  invert over a dark hero photo to stay the loud one. */}
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: heroIsDark ? '#FFFFFF' : '#101010' }]}
                onPress={handleEditProfile}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.primaryActionText, { color: heroIsDark ? '#101010' : '#FFFFFF' }]}
                >
                  EDIT PROFILE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.circleAction, { backgroundColor: withAlpha(PP.card, 0.9), borderColor: PP.border }]}
                onPress={handleEditSchedule}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Edit your schedule"
              >
                <Ionicons name="calendar-outline" size={19} color={PP.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.circleAction, { backgroundColor: withAlpha(PP.card, 0.9), borderColor: PP.border }]}
                onPress={handleEditBranding}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Edit your branding"
              >
                <Ionicons name="color-palette-outline" size={19} color={PP.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.contentSheet, { backgroundColor: PP.bg }]}>
            <View style={[styles.contentSheetClip, { minHeight: screenHeight, backgroundColor: PP.bg }]}>
              {/* Dashboard vs Services. Two different jobs — how the
                  profile is doing, and the catalogue itself — so each gets a
                  tab rather than one scroll that buries the services under
                  status cards. */}
              <View
                style={[
                  styles.tabBar,
                  { backgroundColor: withAlpha(PP.card, PP.isDark ? 0.6 : 0.75), borderColor: PP.border },
                ]}
              >
                {PROFILE_TABS.map(item => {
                  const selected = tab === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.tab, selected && { backgroundColor: accentColor }]}
                      onPress={() => handleSelectTab(item.key)}
                      activeOpacity={0.75}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.label}
                    >
                      <Ionicons
                        name={item.icon}
                        size={15}
                        color={selected ? '#FFFFFF' : PP.sub}
                      />
                      <Text style={[styles.tabLabel, { color: selected ? '#FFFFFF' : PP.sub }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {tab === 'dashboard' ? (
                <>
                  {setupComplete ? null : statusSection}

                  {/* ── What clients say ───────────────────────────────────── */}
                  <Text style={[styles.sectionLabel, { color: PP.sub }]}>WHAT CLIENTS SAY</Text>

                  {/* No onPress: there's no review-management screen to send them
                      to, and a card that looks tappable but isn't is worse than
                      one that plainly isn't. */}
                  <DashCard
                    palette={dashPalette}
                    eyebrow="REVIEWS"
                    title={totalReviews === 1 ? '1 review' : `${totalReviews} reviews`}
                    value={totalReviews > 0 ? `★ ${averageRating}` : undefined}
                  >
                    {totalReviews === 0 ? (
                      <DashEmpty
                        palette={dashPalette}
                        text="No reviews yet — they appear here once clients leave them."
                      />
                    ) : (
                      <View style={styles.dashBody}>
                        {reviews.slice(0, MAX_REVIEW_PREVIEWS).map(review => (
                          <View
                            key={review.id}
                            style={[styles.reviewItem, { borderBottomColor: PP.sep }]}
                          >
                            <View style={styles.reviewHeader}>
                              <Text style={[styles.reviewerName, { color: PP.text }]} numberOfLines={1}>
                                {review.name}
                              </Text>
                              <View style={styles.reviewRating}>
                                {[1, 2, 3, 4, 5].map(star => (
                                  <Ionicons
                                    key={star}
                                    name="star"
                                    size={11}
                                    color={star <= review.rating ? '#FFD700' : PP.border}
                                  />
                                ))}
                              </View>
                              <Text style={[styles.reviewDate, { color: PP.sub }]}>{review.date}</Text>
                            </View>
                            {review.comment ? (
                              <Text style={[styles.reviewComment, { color: PP.sub }]} numberOfLines={3}>
                                {review.comment}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                        {totalReviews > MAX_REVIEW_PREVIEWS ? (
                          <Text style={[styles.dashMore, { color: PP.sub }]}>
                            +{totalReviews - MAX_REVIEW_PREVIEWS} more
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </DashCard>

                  {/* ── Deposits & rules ──────────────────────────────────── */}
                  <Text style={[styles.sectionLabel, { color: PP.sub }]}>DEPOSITS &amp; RULES</Text>

                  {/* Paired tinted tiles, the mode-select pair from the
                      reference. Portrait rather than letterboxed: the policies
                      tile has to show the actual rules, not a truncated
                      sentence claiming there are some. */}
                  <View style={styles.halfRow}>
                    <TouchableOpacity
                      style={[styles.tintCard, { width: halfWidth(screenWidth), backgroundColor: tintStrong, borderColor: PP.border }]}
                      onPress={handleEditPolicies}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Edit your booking policies"
                    >
                      <View style={styles.tintHead}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={accentColor} />
                        <Text style={[styles.tintEyebrow, { color: PP.sub }]}>Booking policies</Text>
                      </View>

                      <Text style={[styles.tintTitle, { color: PP.text }]} numberOfLines={1}>
                        {hasPolicyInfo(providerData) ? 'DEPOSITS & RULES' : 'NOTHING SET YET'}
                      </Text>

                      {policyRows.length === 0 ? (
                        <Text style={[styles.halfSub, { color: PP.sub }]} numberOfLines={4}>
                          Clients see nothing about deposits or cancellations.
                        </Text>
                      ) : (
                        <View style={styles.policyList}>
                          {policyRows.slice(0, MAX_POLICY_ROWS - 1).map(row => (
                            <View key={row.label} style={styles.policyItem}>
                              <Ionicons name={row.icon} size={13} color={accentColor} />
                              <View style={styles.policyItemText}>
                                <Text style={[styles.policyLabel, { color: PP.sub }]} numberOfLines={1}>
                                  {row.label}
                                </Text>
                                <Text style={[styles.policyValue, { color: PP.text }]} numberOfLines={2}>
                                  {row.value}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Branding moved out: it's already the palette button on
                        the header, and a second door to it was worth less than
                        two numbers nothing else on this screen reports. Both
                        open the analytics screen that owns the detail. */}
                    <View style={[styles.tintColumn, { width: halfWidth(screenWidth) }]}>
                      <TouchableOpacity
                        style={[styles.tintCardShort, { backgroundColor: tintSoft, borderColor: PP.border }]}
                        onPress={handleOpenAnalytics}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Open your analytics"
                      >
                        <View style={styles.tintHead}>
                          <Ionicons name="bookmark-outline" size={13} color={accentColor} />
                          <Text style={[styles.tintEyebrow, { color: PP.sub }]}>Saved by</Text>
                        </View>
                        <View style={styles.shortBody}>
                          <Text style={[styles.shortValue, { color: PP.text }]}>
                            {bookmarkCount === null ? '—' : bookmarkCount}
                          </Text>
                          <Text style={[styles.shortSub, { color: PP.sub }]} numberOfLines={2}>
                            {bookmarkCount === 1 ? 'client' : 'clients'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.tintCardShort, { backgroundColor: tintStrong, borderColor: PP.border }]}
                        onPress={handleOpenAnalytics}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Open your analytics"
                      >
                        <View style={styles.tintHead}>
                          <Ionicons name="flame-outline" size={13} color={accentColor} />
                          <Text style={[styles.tintEyebrow, { color: PP.sub }]}>Most booked</Text>
                        </View>
                        {/* 90 days, and only confirmed or completed — an empty
                            state here means nobody booked, not that the tile
                            failed to load. */}
                        <Text style={[styles.shortTitle, { color: PP.text }]} numberOfLines={2}>
                          {topServices === null ? '—' : (topService?.name ?? 'No bookings yet')}
                        </Text>
                        {topService ? (
                          <Text style={[styles.shortSub, { color: PP.sub }]} numberOfLines={1}>
                            {topService.count} in 90 days
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── Portfolio ──────────────────────────────────────────── */}
                  <Text style={[styles.sectionLabel, { color: PP.sub }]}>YOUR WORK</Text>

                  <View style={styles.dashCardShadow}>
                    <BlurView
                      intensity={cardBlurIntensity}
                      tint={cardBlurTint}
                      style={[styles.dashCard, { backgroundColor: cardBg, borderColor: PP.border }]}
                    >
                      <LinearGradient
                        colors={cardHighlightColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.cardHighlight}
                      />
                      <View style={styles.dashHeader}>
                        <View style={styles.dashHeaderText}>
                          <Text style={[styles.dashEyebrow, { color: PP.sub }]}>PORTFOLIO</Text>
                          <Text style={[styles.dashBigValue, { color: PP.text }]}>
                            {workPhotos.length === 1 ? '1 photo' : `${workPhotos.length} photos`}
                          </Text>
                          <Text style={[styles.dashBigSub, { color: PP.sub }]}>
                            {workPhotos.length === 0
                              ? 'Clients have nothing of your work to browse.'
                              : 'The first thing clients look at on your profile.'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.addChip, { borderColor: PP.border }]}
                          onPress={handleAddPhotos}
                          disabled={photoUploading}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Add portfolio photos"
                        >
                          {photoUploading ? (
                            <ActivityIndicator size="small" color={accentColor} />
                          ) : (
                            <>
                              <Ionicons name="add" size={15} color={accentColor} />
                              <Text style={[styles.addChipText, { color: accentColor }]}>Add</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* A rail, not a 3-across grid: portrait tiles at the
                          size clients actually see them, bleeding off the card
                          edge so it reads as a strip you scroll rather than a
                          form field. The add tile leads it, so the first thing
                          an empty portfolio offers is the way to fill it. */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.photoRail}
                        contentContainerStyle={styles.photoRailContent}
                      >
                        {workPhotos.slice(0, MAX_PORTFOLIO_TILES).map(item => (
                          <View key={item.id} style={styles.photoWrap}>
                            <Image
                              source={{ uri: item.image_url }}
                              style={[styles.photo, { borderColor: PP.border }]}
                              resizeMode="cover"
                              fadeDuration={0}
                            />
                            <TouchableOpacity
                              style={styles.photoRemove}
                              onPress={() => handleRemovePhoto(item)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              accessibilityRole="button"
                              accessibilityLabel="Remove this photo"
                            >
                              <Ionicons name="close" size={13} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        ))}

                        {workPhotos.length > MAX_PORTFOLIO_TILES ? (
                          <View style={[styles.photoMore, { borderColor: PP.border }]}>
                            <Text style={[styles.photoMoreText, { color: PP.sub }]}>
                              +{workPhotos.length - MAX_PORTFOLIO_TILES}
                            </Text>
                          </View>
                        ) : null}
                      </ScrollView>
                    </BlurView>
                  </View>

                  {/* ── Manage ─────────────────────────────────────────────── */}
                  <View style={styles.rowHeader}>
                    <Text style={[styles.sectionLabel, { color: PP.sub }]}>MANAGE</Text>
                    <TouchableOpacity onPress={handleEditProfile} activeOpacity={0.7}>
                      <Text style={[styles.rowHeaderLink, { color: accentColor }]}>Edit profile</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dashCardShadow}>
                    <BlurView
                      intensity={cardBlurIntensity}
                      tint={cardBlurTint}
                      style={[styles.dashCard, { backgroundColor: cardBg, borderColor: PP.border }]}
                    >
                      <LinearGradient
                        colors={cardHighlightColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.cardHighlight}
                      />
                      <View style={styles.quickRow}>
                        {quickActions.map(action => (
                          <TouchableOpacity
                            key={action.key}
                            style={[styles.quickItem, { width: (screenWidth - 76) / 5 }]}
                            onPress={action.onPress}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={action.label}
                          >
                            <View
                              style={[
                                styles.quickCircle,
                                { backgroundColor: tintStrong, borderColor: PP.border },
                              ]}
                            >
                              <Ionicons name={action.icon} size={18} color={accentColor} />
                            </View>
                            <Text style={[styles.quickLabel, { color: PP.sub }]} numberOfLines={1}>
                              {action.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </BlurView>
                  </View>

                  {/* ── How you take bookings ──────────────────────────────── */}
                  <Text style={[styles.sectionLabel, { color: PP.sub }]}>HOW YOU TAKE BOOKINGS</Text>

                  <View style={styles.availabilityWrap}>
                    <AvailabilityCard
                      summary={availability}
                      loading={availabilityLoading}
                      cardBg={cardBg}
                      blurIntensity={cardBlurIntensity}
                      blurTint={cardBlurTint}
                      borderColor={PP.border}
                      textColor={PP.text}
                      subTextColor={PP.sub}
                      accentColor={accentColor}
                      onEditSchedule={handleEditSchedule}
                    />
                  </View>

                  {setupComplete ? statusSection : null}
                </>
              ) : (
                <>
                  {/* ── Services ───────────────────────────────────────────── */}
                  {catalogue.groups.length === 0 ? (
                    <View style={styles.dashCardShadow}>
                      <BlurView
                        intensity={cardBlurIntensity}
                        tint={cardBlurTint}
                        style={[styles.dashCard, { backgroundColor: cardBg, borderColor: PP.border }]}
                      >
                        <LinearGradient
                          colors={cardHighlightColors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.cardHighlight}
                        />
                        <Text style={[styles.dashTitle, { color: PP.text }]}>No services yet</Text>
                        {/* Categories are created with the rest of the profile, so
                            the very first one still starts there — there's nothing
                            for an "add a service" button here to add it to yet. */}
                        <DashEmpty
                          palette={dashPalette}
                          text="Set up your first category and service in your profile, then manage them here."
                        />
                        <TouchableOpacity
                          style={[styles.primaryButton, { backgroundColor: accentColor }]}
                          onPress={handleEditProfile}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.primaryButtonText}>Set up services</Text>
                        </TouchableOpacity>
                      </BlurView>
                    </View>
                  ) : (
                    /* Every category on screen at once, as tiles: switching
                       categories to change one price was a hop that earned
                       nothing, and a tile shows the two things being managed —
                       the price and whether clients can see it — without
                       reading a row left to right. */
                    catalogue.groups.map(group => (
                      <View key={group.name} style={styles.serviceGroup}>
                        <View style={styles.rowHeader}>
                          <Text style={[styles.sectionLabel, { color: PP.sub }]}>
                            {group.name.toUpperCase()} · {group.items.length}{' '}
                            {group.items.length === 1 ? 'SERVICE' : 'SERVICES'}
                          </Text>
                          <TouchableOpacity
                            style={[styles.addChip, { borderColor: PP.border, marginBottom: 10 }]}
                            onPress={() => openNewService(group.name)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Add a service to ${group.name}`}
                          >
                            <Ionicons name="add" size={15} color={accentColor} />
                            <Text style={[styles.addChipText, { color: accentColor }]}>Add</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.tileGrid}>
                          {group.items.map(service => (
                            <ServiceTile
                              key={service.id}
                              service={service}
                              palette={dashPalette}
                              busy={togglingId === service.id}
                              onEdit={openEditService}
                              onToggleActive={handleToggleActive}
                            />
                          ))}
                        </View>
                      </View>
                    ))
                  )}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <ServiceEditorSheet
        visible={editorOpen}
        initial={editorInitial}
        categoryName={editingCategory}
        isNew={editingId == null}
        saving={saving}
        palette={editorPalette}
        onSave={handleSaveService}
        onClose={closeEditor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  setupButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Identity header, laid out like the reference: the name is the loudest
  // thing on screen, the avatar is pushed to the right rather than centred,
  // and the counts sit under both as columns instead of a sentence.
  profileHeader: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 22,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  identityText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  // The reference's headline treatment: heavy, uppercase, tight, and the
  // loudest thing above the fold — not a serif nameplate.
  displayName: {
    flexShrink: 1,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.2,
    textTransform: 'uppercase',
  },
  // Sits on the first line's cap height rather than centring between two
  // wrapped lines of a 34pt title.
  verifiedTick: {
    marginTop: 6,
  },
  handle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  // Demoted to a top-right chip, the size of the reference's bell/avatar
  // pair, so the name owns the width instead of splitting it.
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255, 253, 251, 0.9)',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },
  statRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  // Fixed-width columns, not flex: the reference's stats are left-aligned in a
  // row that stops well before the right edge, and spreading them edge to edge
  // reads as a table instead.
  stat: {
    width: 92,
  },
  statValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
    lineHeight: 25,
  },
  statLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.4,
  },
  circleAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTextShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  contentSheet: {
    borderTopLeftRadius: SHEET_LIP_RADIUS,
    borderTopRightRadius: SHEET_LIP_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  // Radius + overflow live on this INNER view, separate from contentSheet's
  // shadow — iOS silently drops a view's shadow when overflow:'hidden' is set
  // on that same view, so clip and shadow must be on different layers.
  contentSheetClip: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 130,
    borderTopLeftRadius: SHEET_LIP_RADIUS,
    borderTopRightRadius: SHEET_LIP_RADIUS,
    overflow: 'hidden',
  },

  // Dashboard / Services switch, sitting above everything in the sheet.
  tabBar: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: 18,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 18,
  },
  tabLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.9,
  },

  // Section headings
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowHeaderLink: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 10,
    marginTop: 6,
  },
  sectionLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 10,
    marginTop: 6,
  },

  // Shared card chrome. Shadow lives on the outer wrapper, separate from the
  // card's own overflow:'hidden' — iOS silently drops a view's shadow when
  // overflow:'hidden' is set on that same view.
  dashCardShadow: {
    marginBottom: 14,
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  dashCard: {
    padding: 18,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  halfRow: {
    flexDirection: 'row',
    gap: HALF_GAP,
    marginBottom: 14,
  },
  halfSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  dashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dashHeaderText: {
    flex: 1,
  },
  dashEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  dashTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    lineHeight: 22,
  },
  // The reference's headline number: the count is the loudest thing in the
  // card, with the sentence demoted underneath it.
  dashBigValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 30,
    lineHeight: 35,
  },
  dashBigSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  dashValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
  },
  dashBody: {
    marginTop: 12,
  },
  dashMore: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 10,
  },
  dashEmpty: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    opacity: 0.85,
  },

  // Buttons
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#FFFFFF',
    fontSize: 14,
  },

  // Service tiles
  serviceGroup: {
    marginBottom: 8,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: HALF_GAP,
    marginBottom: 14,
  },
  serviceTile: {
    height: 124,
    padding: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Hidden services stay legible rather than being greyed to nothing — the
  // provider still has to read them to decide what to switch back on.
  serviceTileHidden: {
    opacity: 0.62,
  },
  serviceTileName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    lineHeight: 19,
  },
  serviceTileMeta: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 3,
  },
  serviceTileFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  serviceTilePrice: {
    flex: 1,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    lineHeight: 24,
  },
  serviceToggle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Portfolio grid
  // Negative margins cancel the card's own padding so the rail runs to both
  // edges, then the content padding puts the first tile back on the grid.
  photoRail: {
    marginTop: 16,
    marginHorizontal: -18,
  },
  photoRailContent: {
    paddingHorizontal: 18,
    gap: PHOTO_GAP,
  },
  photoWrap: {
    width: PHOTO_W,
    height: PHOTO_H,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMore: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMoreText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },


  // Live status card
  statusCard: {
    padding: 20,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    lineHeight: 27,
  },
  statusDetail: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  stepLabel: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 13,
  },
  requiredTag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  requiredTagText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.6,
  },
  statusBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absolute so the readout centres on the ring rather than pushing it.
  ringLabel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 31,
    lineHeight: 35,
  },
  ringUnit: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.6,
  },
  ringWord: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  statusText: {
    flex: 1,
  },
  inkPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    marginTop: 12,
  },
  inkPillText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  stepList: {
    marginTop: 16,
  },
  stepListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepCount: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },

  // Quick actions — the reference's routine row.
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickItem: {
    alignItems: 'center',
    gap: 8,
  },
  quickCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.2,
  },

  // Paired tinted tiles. Fixed height so the two agree on a baseline even when
  // one carries swatches and the other doesn't.
  tintCard: {
    height: 214,
    padding: 16,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tintHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tintEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  tintTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    lineHeight: 22,
    marginTop: 10,
  },
  // The actual rules, stacked — the whole reason this tile got taller.
  policyList: {
    marginTop: 12,
    gap: 10,
  },
  policyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  policyItemText: {
    flex: 1,
  },
  policyLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  policyValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  // Two landscape tiles stacked beside the tall policies tile, summing to its
  // height so the row stays square-cornered rather than ragged.
  tintColumn: {
    gap: HALF_GAP,
  },
  tintCardShort: {
    height: (214 - HALF_GAP) / 2,
    padding: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shortBody: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  shortValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 34,
    lineHeight: 39,
  },
  shortTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    lineHeight: 19,
    marginTop: 6,
  },
  shortSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 15,
  },

  availabilityWrap: {
    marginBottom: 14,
  },

  // Reviews
  reviewItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reviewerName: {
    flex: 1,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
  },
  reviewComment: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 18,
  },
});
