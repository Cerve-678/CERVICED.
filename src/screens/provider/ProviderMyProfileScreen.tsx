import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { loadProviderFromSupabase } from '../../services/providerRegistrationService';
import type { ProviderRegistrationData } from '../../services/providerRegistrationService';
import { getProviderPortfolio, getProviderReviews, getProviderIdForUserId } from '../../services/databaseService';
import type { DbPortfolioItem } from '../../types/database';
import { resolveProviderTheme, withAlpha, isDarkColor } from '../../constants/providerThemes';
import { AvailabilityService } from '../../services/AvailabilityService';
import type { AvailabilitySummary } from '../../services/AvailabilityService';
import AvailabilityCard from '../../components/AvailabilityCard';
import CategoryTabPill from '../../components/CategoryTabPill';
import SlidingTabs from '../../components/SlidingTabs';
import AppBackground from '../../components/AppBackground';
import { logger } from '../../utils/logger';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Hero → content transition, copied from ProviderProfileScreen: the logo/name/
// rating/slots float directly over the hero photo/gradient, then the content
// sheet rises over it with a rounded lip. Keep this in sync with that screen.
const SHEET_LIP_RADIUS = 36;

const INFO_TABS = [
  { key: 'about' as const,  label: 'About' },
  { key: 'policy' as const, label: 'Policy' },
];

const StarIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>★</Text>
);

/** True when there's anything worth showing on the Policy tab — either
 *  descriptive booking_policies or the enforced cancellation window. Mirrors
 *  ProviderProfileScreen's hasPolicyInfo exactly. */
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

interface Props {
  navigation: any;
}

// Mirrors ProviderProfileScreen's live design (hero photo/gradient, floating
// logo+info, the rounded BlurView "sheet" of cards, typography, section set)
// so a provider's own view of their profile is what a client sees.
// Rebuild this whenever that screen changes.
export default function ProviderMyProfileScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [providerData, setProviderData] = useState<ProviderRegistrationData | null>(null);
  const [portfolio, setPortfolio] = useState<DbPortfolioItem[]>([]);
  const [reviews, setReviews] = useState<{ id: string; name: string; rating: number; comment: string; date: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [infoTab, setInfoTab] = useState<'about' | 'policy'>('about');
  const [showPolicyImage, setShowPolicyImage] = useState(false);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);

  // Reload data every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        // Don't blank the screen on refocus — isLoading is only true on the very
        // first mount (useState(true)). On later focuses we keep the current
        // profile on screen and refresh in the background instead of flashing a
        // spinner every time you tab back.
        try {
          let parsed: ProviderRegistrationData | null = null;

          if (user?.id) {
            // Two independent lookups — run them together, not one after the other.
            const [loaded, providerId] = await Promise.all([
              loadProviderFromSupabase(user.id),
              getProviderIdForUserId(user.id),
            ]);
            parsed = loaded;
            if (providerId) {
              getProviderPortfolio(providerId).then(setPortfolio).catch(() => {});
              // Live availability for the header card. Fire-and-forget like the
              // portfolio/reviews fetches above so the profile paints without
              // waiting on it; a failure leaves the card hidden rather than
              // showing a stale or invented schedule.
              setAvailabilityLoading(true);
              AvailabilityService.getAvailabilitySummary(providerId)
                .then(setAvailability)
                .catch(() => setAvailability(null))
                .finally(() => setAvailabilityLoading(false));
              // Already have providerId from getProviderIdForUserId above —
              // call getProviderReviews directly instead of
              // getMyProviderReviews(), which would re-resolve the same
              // provider row from scratch via a second, heavier query.
              getProviderReviews(providerId)
                .then(dbReviews => setReviews(dbReviews.map(r => ({
                  id: r.id,
                  name: r.user?.name ?? 'Anonymous',
                  rating: r.rating,
                  comment: r.comment ?? '',
                  date: new Date(r.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  }),
                }))))
                .catch(() => {});
            }
          }

          setProviderData(parsed);
          if (parsed) {
            const cats = Object.keys(parsed.categories);
            if (cats.length > 0 && !cats.includes(selectedCategory)) {
              setSelectedCategory(cats[0] ?? '');
            }
          }
        } catch (e) {
          logger.error('Error loading provider data:', e);
        } finally {
          setIsLoading(false);
        }
      };
      load();
    }, [user?.id, selectedCategory])
  );

  const categoryNames = useMemo(() => {
    if (!providerData) return [];
    return Object.keys(providerData.categories);
  }, [providerData]);

  const currentServices = useMemo(() => {
    if (!providerData || !selectedCategory) return [];
    return providerData.categories[selectedCategory] || [];
  }, [providerData, selectedCategory]);

  const serviceType = useMemo(() => {
    if (!providerData) return '';
    return providerData.providerService === 'OTHER'
      ? providerData.customServiceType
      : providerData.providerService;
  }, [providerData]);

  // This screen is the provider's home for their public presence, not only a
  // mirror of what clients see. Keep the signal deliberately practical: these
  // are the pieces that make a profile bookable and trustworthy. Each item
  // carries the screen it's fixed on (InfoReg's own editor for the original
  // five, Business Details' sub-screens for the rest) so the missing-items
  // list can navigate there directly instead of just naming the gap.
  const profileReadiness = useMemo(() => {
    if (!providerData) return { complete: 0, total: 6, services: 0, missing: [] as { label: string; screen: string }[] };
    const services = Object.values(providerData.categories).reduce((count, category) => count + category.length, 0);
    const items = [
      { done: Boolean(providerData.logo), label: 'add a logo', screen: 'EditProfile' },
      { done: Boolean(providerData.aboutText.trim()), label: 'write an introduction', screen: 'EditProfile' },
      { done: Boolean(providerData.location.trim()), label: 'add your location', screen: 'EditProfile' },
      { done: services > 0, label: 'add services and prices', screen: 'EditProfile' },
      { done: portfolio.length > 0, label: 'add portfolio photos', screen: 'EditProfile' },
      // Booking policies live in Business Details, not InfoReg's editor —
      // see hasPolicyInfo above (mirrors ProviderProfileScreen's own check).
      { done: hasPolicyInfo(providerData), label: 'set your booking policies', screen: 'Policies' },
    ];
    return {
      complete: items.filter(item => item.done).length,
      total: items.length,
      services,
      missing: items.filter(item => !item.done).map(item => ({ label: item.label, screen: item.screen })),
    };
  }, [providerData, portfolio.length]);

  // Pinterest-style two-column masonry — same "deal into whichever column is
  // shorter" layout as ProviderProfileScreen's portfolio grid.
  const PORTFOLIO_COL_W = (screenWidth - 40 - 12) / 2;
  const portfolioColumns = useMemo(() => {
    const cols: (DbPortfolioItem & { tileHeight: number })[][] = [[], []];
    const colHeights = [0, 0];
    portfolio.forEach(item => {
      const ratio = item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
      const tileHeight = Math.min(Math.max(PORTFOLIO_COL_W / ratio, 140), 300);
      const target = colHeights[0]! <= colHeights[1]! ? 0 : 1;
      cols[target]!.push({ ...item, tileHeight });
      colHeights[target]! += tileHeight + 12;
    });
    return cols;
  }, [portfolio, PORTFOLIO_COL_W]);

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handleEditSchedule = useCallback(() => {
    navigation.navigate('ProviderSchedule');
  }, [navigation]);

  const PP = useMemo(
    () => resolveProviderTheme(providerData?.profileTheme),
    [providerData?.profileTheme]
  );
  const cardBg = withAlpha(PP.card, PP.isDark ? 0.82 : 0.98);
  const cardBlurTint = PP.isDark ? ('dark' as const) : ('light' as const);
  const cardBlurIntensity = PP.isDark ? 35 : 25;
  const cardHighlightColors = (
    PP.isDark
      ? ['rgba(255,255,255,0.08)', 'transparent']
      : ['rgba(255,255,255,0.3)', 'transparent']
  ) as [string, string];
  const accentColor = providerData?.accentColor || PP.accent;
  // Mirror ProviderProfileScreen's hero logic EXACTLY for visual parity:
  //   hasCustomGradient = providers.gradient was genuinely saved; else the
  //   theme's own hero colour. A background photo always forces the dark
  //   (white-text) treatment, since the dark overlay under it guarantees
  //   contrast regardless of the photo's own brightness.
  const heroBgColor = providerData?.hasCustomGradient ? providerData?.gradient[0] : PP.hero;
  const heroIsDark = !!providerData?.backgroundImage || (heroBgColor ? isDarkColor(heroBgColor) : true);
  const heroText = heroIsDark ? '#FFFFFF' : '#26201E';
  const heroSub = heroIsDark ? 'rgba(255,255,255,0.96)' : 'rgba(38,32,30,0.78)';

  // Loading state — waiting for Supabase / fonts
  if (isLoading) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#a342c3" />
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  // Empty state — no profile submitted yet
  if (!providerData) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <Ionicons name="storefront-outline" size={72} color={theme.text + '30'} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Set Up Your Profile
            </Text>
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
      </AppBackground>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: PP.bg }]}>
      {/* Hero photo/gradient backdrop — mirror ProviderProfileScreen: a real
          cover photo (with a dark gradient overlay for legible text) when
          set via Branding, else the full custom gradient or the resolved
          theme's [hero → bg] for preset themes. */}
      {providerData.backgroundImage ? (
        <>
          <Image
            source={{ uri: providerData.backgroundImage }}
            style={[styles.heroImage, { opacity: 0.88 }]}
            resizeMode="cover"
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
        {/* Profile hub action — the public-profile editor is still one tap
            away, but this screen now leads with the useful operational view. */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + profile info — floats directly over the hero photo/gradient */}
          <View style={styles.heroInfoWrap}>
            <View style={styles.logoContainer}>
              <View style={styles.logoWrapper}>
                {providerData.logo ? (
                  <Image
                    source={{ uri: providerData.logo }}
                    style={styles.providerLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.providerLogo,
                      { backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' },
                    ]}
                  >
                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                      {providerData.providerName
                        .split(' ')
                        .map(w => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                  style={styles.logoGloss}
                />
              </View>
            </View>

            {/* Provider Info — editorial strip */}
            <View style={styles.providerInfoCenter}>
              {/* Name + verified */}
              <View style={styles.providerNameRow}>
                <Text
                  style={[styles.providerDisplayName, { color: heroText }, heroIsDark && styles.heroTextShadow]}
                >
                  {providerData.providerName || 'Your Business Name'}
                </Text>
                {providerData.isVerified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={heroIsDark ? '#FFFFFF' : '#007AFF'}
                  />
                )}
              </View>

              <Text style={[styles.providerMeta, { color: heroSub }, heroIsDark && styles.heroTextShadow]}>
                {(serviceType || 'SERVICE').toUpperCase()}
                {providerData.location ? ` · ${providerData.location.toUpperCase()}` : ''}
              </Text>

              {/* Rating inline — real average, same as clients see */}
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <StarIcon key={star} size={12} color="#FFD700" />
                ))}
                <Text style={[styles.ratingInline, { color: heroText }, heroIsDark && styles.heroTextShadow]}>
                  {providerData.rating}
                </Text>
              </View>

              {providerData.yearsExperience ? (
                <Text style={[styles.yearsExp, { color: heroSub }, heroIsDark && styles.heroTextShadow]}>
                  {providerData.yearsExperience} years experience
                </Text>
              ) : null}

              {/* Catalogue size — categories and services as two square stat
                  tiles. Both counts reuse values already derived above
                  (categoryNames / profileReadiness.services, the same figure
                  the readiness card counts) rather than re-deriving them, so
                  they can't drift apart. */}
              <View style={styles.statBoxRow}>
                <View style={[styles.statBox, { borderColor: heroSub, backgroundColor: heroIsDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.28)' }]}>
                  <Text style={[styles.statBoxValue, { color: heroText }, heroIsDark && styles.heroTextShadow]}>
                    {categoryNames.length}
                  </Text>
                  <Text style={[styles.statBoxLabel, { color: heroSub }, heroIsDark && styles.heroTextShadow]}>
                    {categoryNames.length === 1 ? 'CATEGORY' : 'CATEGORIES'}
                  </Text>
                </View>
                <View style={[styles.statBox, { borderColor: heroSub, backgroundColor: heroIsDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.28)' }]}>
                  <Text style={[styles.statBoxValue, { color: heroText }, heroIsDark && styles.heroTextShadow]}>
                    {profileReadiness.services}
                  </Text>
                  <Text style={[styles.statBoxLabel, { color: heroSub }, heroIsDark && styles.heroTextShadow]}>
                    {profileReadiness.services === 1 ? 'SERVICE' : 'SERVICES'}
                  </Text>
                </View>
              </View>

            </View>
          </View>

          {/* The content sheet rises over the hero photo with its own large
              top corners — same floating-card-over-photo composition as
              ProviderProfileScreen. */}
          <View style={[styles.contentSheet, { backgroundColor: PP.bg }]}>
            <View style={[styles.contentSheetClip, { backgroundColor: PP.bg }]}>
            <View style={styles.profileHubCardShadow}>
            <BlurView
              intensity={cardBlurIntensity}
              tint={cardBlurTint}
              style={[styles.profileHubCard, { backgroundColor: cardBg, borderColor: PP.border }]}
            >
              <LinearGradient
                colors={cardHighlightColors}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <View style={styles.profileHubHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.profileHubEyebrow, { color: PP.sub }]}>PROFILE HEALTH</Text>
                  <Text style={[styles.profileHubTitle, { color: PP.text }]}>
                    {profileReadiness.complete === profileReadiness.total ? 'Ready for clients' : 'Keep building your profile'}
                  </Text>
                </View>
                <View style={[styles.readinessBadge, { backgroundColor: accentColor + '22' }]}>
                  <Text style={[styles.readinessBadgeText, { color: accentColor }]}>
                    {profileReadiness.complete}/{profileReadiness.total}
                  </Text>
                </View>
              </View>
              <Text style={[styles.profileHubSubtext, { color: PP.sub }]}>
                {profileReadiness.services} service{profileReadiness.services === 1 ? '' : 's'} and {portfolio.length} portfolio photo{portfolio.length === 1 ? '' : 's'} live.
              </Text>

              {/* Each unfinished item is its own tappable row — jumps
                  straight to wherever it's fixed (InfoReg's editor for
                  profile basics, Business Details for policies) instead of
                  just naming the gap and leaving the provider to find it. */}
              {profileReadiness.missing.length > 0 && (
                <View style={styles.readinessChecklist}>
                  {profileReadiness.missing.map(item => (
                    <TouchableOpacity
                      key={item.label}
                      style={styles.readinessChecklistRow}
                      onPress={() => navigation.navigate(item.screen)}
                      activeOpacity={0.65}
                    >
                      <Ionicons name="ellipse-outline" size={14} color={accentColor} />
                      <Text style={[styles.readinessChecklistText, { color: PP.text }]}>
                        {item.label}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={PP.sub} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </BlurView>
            </View>

            <Text style={[styles.clientViewLabel, { color: PP.sub }]}>YOUR CLIENT-FACING PROFILE</Text>
            {/* Live availability — replaces the old hand-typed slotsText pill.
                Sits in the sheet rather than over the hero so the status
                colours stay legible against any provider theme or cover
                photo. Tapping goes to ProviderSchedule, which owns editing. */}
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

            {/* About / Policy tabbed card */}
            <View style={styles.aboutCardShadow}>
            <BlurView
              intensity={cardBlurIntensity}
              tint={cardBlurTint}
              style={[styles.aboutCard, { backgroundColor: cardBg, borderColor: PP.border }]}
            >
              <LinearGradient
                colors={cardHighlightColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              {/* Tab switcher — only show if there are policy rows */}
              {hasPolicyInfo(providerData) && (
                <View style={[styles.infoTabRow, { borderBottomColor: PP.border }]}>
                  <SlidingTabs
                    tabs={INFO_TABS}
                    activeKey={infoTab}
                    onPress={setInfoTab}
                    accentColor={accentColor}
                    inactiveTextColor={PP.sub}
                    scrollable={false}
                  />
                </View>
              )}

              {infoTab === 'about' || !hasPolicyInfo(providerData) ? (
                <>
                  {!hasPolicyInfo(providerData) && (
                    <Text style={[styles.sectionTitle, { color: PP.text }]}>About</Text>
                  )}
                  <Text style={[styles.aboutText, { color: PP.sub }]}>
                    {showFullAbout
                      ? providerData.aboutText
                      : `${providerData.aboutText.substring(0, 150)}...`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowFullAbout(!showFullAbout)}
                    style={styles.moreButton}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.moreButtonText, { color: PP.text }]}>
                      {showFullAbout ? 'Show Less' : 'More'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Policy tab content — mirrors ProviderProfileScreen's row-building exactly */
                (() => {
                  const bp = providerData.bookingPolicies;
                  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tag?: string }[] = [];
                  if (bp?.depositRequired && bp.depositAmount) {
                    rows.push({
                      icon: 'card-outline',
                      label: 'Deposit',
                      value: bp.depositType === 'percent' ? `${bp.depositAmount}% required` : `£${bp.depositAmount} required`,
                    });
                  }
                  const cancelPenaltyText =
                    bp?.cancelPenalty && bp.cancelPenalty !== 'none'
                      ? ` · ${bp.cancelPenalty === 'deposit' ? 'deposit kept' : 'full charge'}`
                      : '';
                  if (providerData.cancellationNoticeHours > 0) {
                    rows.push({
                      icon: 'time-outline',
                      label: 'Cancellation',
                      value: `${providerData.cancellationNoticeHours} hours' notice${cancelPenaltyText}`,
                    });
                  } else if (bp?.cancelNotice && bp.cancelNotice !== 'none') {
                    rows.push({ icon: 'time-outline', label: 'Cancellation', value: `${bp.cancelNotice} notice${cancelPenaltyText}` });
                  }
                  if (bp?.rescheduleNotice || bp?.maxReschedules) {
                    const parts: string[] = [];
                    if (bp.rescheduleNotice && bp.rescheduleNotice !== 'same_day') parts.push(`${bp.rescheduleNotice} notice`);
                    if (bp.maxReschedules && bp.maxReschedules !== 'unlimited') parts.push(`max ${bp.maxReschedules}`);
                    if (parts.length > 0) rows.push({ icon: 'calendar-outline', label: 'Reschedule', value: parts.join(' · ') });
                  }
                  if (bp?.noShowAction && bp.noShowAction !== 'none') {
                    rows.push({
                      icon: 'close-circle-outline',
                      label: 'No-show',
                      value: bp.noShowAction === 'warn' ? 'Warning issued' : bp.noShowAction === 'charge_deposit' ? 'Deposit charged' : 'Full charge',
                    });
                  }
                  if (bp?.cancelNote) {
                    rows.push({ icon: 'information-circle-outline', label: 'Note', value: bp.cancelNote });
                  }
                  return (
                    <View style={{ paddingTop: 8 }}>
                      {rows.map((row, i) => (
                        <View
                          key={i}
                          style={[styles.policyRow, i < rows.length - 1 && { borderBottomColor: PP.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
                        >
                          <View style={styles.policyIcon}>
                            <Ionicons name={row.icon} size={18} color={PP.sub} />
                          </View>
                          <View style={styles.policyRowText}>
                            <View style={styles.policyLabelRow}>
                              <Text style={[styles.policyLabel, { color: PP.sub }]}>{row.label}</Text>
                              {!!row.tag && (
                                <View style={[styles.policyTag, { backgroundColor: accentColor }]}>
                                  <Text style={styles.policyTagText}>{row.tag}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.policyValue, { color: PP.text }]}>{row.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })()
              )}

              {/* Floating policy-photo button — the only way in for a provider
                  who uploaded this photo but filled in none of the structured
                  fields (which is why the tab switcher doesn't gate on it). */}
              {providerData.bookingPolicies?.policyImageUrl ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowPolicyImage(true)}
                  style={[styles.policyImageFab, { backgroundColor: accentColor }]}
                  accessibilityLabel="View full policy details"
                  accessibilityRole="button"
                >
                  <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </BlurView>
            </View>

            {providerData.bookingPolicies?.policyImageUrl ? (
              <Modal visible={showPolicyImage} transparent animationType="fade" onRequestClose={() => setShowPolicyImage(false)}>
                <TouchableOpacity
                  style={styles.policyImageModalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowPolicyImage(false)}
                >
                  <Image
                    source={{ uri: providerData.bookingPolicies.policyImageUrl }}
                    style={styles.policyImageModalFull}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </Modal>
            ) : null}

            {/* Services Section */}
            {categoryNames.length > 0 && (
              <View style={styles.servicesSection}>
                <Text style={[styles.sectionTitleNoCard, { color: PP.text }]}>Services</Text>

                {/* Category Tabs — shared frosted-glass pill, same as clients see */}
                <FlatList
                  data={categoryNames}
                  renderItem={({ item: category }) => (
                    <CategoryTabPill
                      category={category}
                      isSelected={selectedCategory === category}
                      onPress={() => setSelectedCategory(category)}
                      cardBg={selectedCategory === category ? accentColor : cardBg}
                      blurIntensity={cardBlurIntensity}
                      blurTint={cardBlurTint}
                      borderColor={selectedCategory === category ? 'transparent' : PP.border}
                      textColor={selectedCategory === category ? '#FFFFFF' : PP.text}
                    />
                  )}
                  keyExtractor={(item) => item}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryTabs}
                  contentContainerStyle={styles.categoryTabsContent}
                />

                {/* Selected category's client-facing description — same text
                    clients see under this tab on the public profile. */}
                {providerData?.categoryDescriptions?.[selectedCategory] ? (
                  <Text style={[styles.categoryDescriptionText, { color: PP.sub }]}>
                    {providerData.categoryDescriptions[selectedCategory]}
                  </Text>
                ) : null}

                {/* Service Cards */}
                <View style={styles.categoryServicesContainer}>
                  {currentServices.map((service) => (
                    <View key={service.id} style={styles.serviceItemCardShadow}>
                    <BlurView
                      intensity={cardBlurIntensity}
                      tint={cardBlurTint}
                      style={[styles.serviceItemCard, { backgroundColor: cardBg, borderColor: PP.border }]}
                    >
                      <LinearGradient
                        colors={cardHighlightColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.cardHighlight}
                      />
                      <View style={styles.serviceItem}>
                        {/* Service Image — accent-tinted initial when no photo, so
                            description text starts at the same x on every card */}
                        {service.images && service.images.length > 0 ? (
                          <Image
                            source={{ uri: service.images[0] }}
                            style={styles.serviceImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.serviceImage, styles.serviceImagePlaceholder, { backgroundColor: accentColor + '1C' }]}>
                            <Text style={[styles.serviceImagePlaceholderText, { color: accentColor }]}>
                              {service.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Service Info */}
                        <View style={styles.serviceInfo}>
                          <Text style={[styles.serviceName, { color: PP.text }]}>{service.name}</Text>
                          {service.description ? (
                            <Text style={[styles.serviceDescription, { color: PP.sub }]} numberOfLines={2}>
                              {service.description}
                            </Text>
                          ) : null}
                          <View style={styles.serviceDetails}>
                            <Text style={[styles.serviceDuration, { color: PP.sub }]}>{service.duration}</Text>
                            <Text style={[styles.servicePrice, { color: PP.text }]}>
                              {'£'}{service.price}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {/* Add-ons — itemized name + price, same detail level as the Preview */}
                      {service.addOns && service.addOns.length > 0 && (
                        <View style={[styles.serviceAddOns, { borderTopColor: PP.border }]}>
                          <Text style={[styles.addOnsLabel, { color: PP.sub }]}>Add-ons available:</Text>
                          {service.addOns.map(addOn => (
                            <View key={addOn.id} style={styles.addOnRow}>
                              <Text style={[styles.addOnName, { color: PP.sub }]}>+ {addOn.name}</Text>
                              <Text style={[styles.addOnPrice, { color: accentColor }]}>+£{addOn.price}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </BlurView>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Reviews — same card always shows (matching ProviderProfileScreen),
                just with nothing under the title when there are none yet. */}
            <View style={styles.reviewsCardShadow}>
            <BlurView
              intensity={cardBlurIntensity}
              tint={cardBlurTint}
              style={[styles.reviewsCard, { backgroundColor: cardBg, borderColor: PP.border }]}
            >
              <LinearGradient
                colors={cardHighlightColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={[styles.sectionTitle, { color: PP.text }]}>Reviews</Text>
              {reviews.slice(0, 5).map(review => (
                  <View key={review.id} style={[styles.reviewItem, { borderBottomColor: PP.sep }]}>
                    <View style={styles.reviewHeader}>
                      <Text style={[styles.reviewerName, { color: PP.text }]}>{review.name}</Text>
                      <View style={styles.reviewRating}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <Ionicons
                            key={star}
                            name="star"
                            size={12}
                            color={star <= review.rating ? '#FFD700' : PP.border}
                          />
                        ))}
                      </View>
                      <Text style={[styles.reviewDate, { color: PP.sub }]}>{review.date}</Text>
                    </View>
                    {review.comment ? (
                      <Text style={[styles.reviewComment, { color: PP.sub }]}>{review.comment}</Text>
                    ) : null}
                  </View>
                ))}
            </BlurView>
            </View>

            {/* Contact Info */}
            <View style={styles.contactCardShadow}>
            <BlurView
              intensity={cardBlurIntensity}
              tint={cardBlurTint}
              style={[styles.contactCard, { backgroundColor: cardBg, borderColor: PP.border }]}
            >
              <LinearGradient
                colors={cardHighlightColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={[styles.sectionTitle, { color: PP.text }]}>Contact</Text>
              {providerData.location ? (
                <View style={[styles.contactRow, { borderBottomColor: PP.sep }]}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>Location</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]} numberOfLines={1}>{providerData.location}</Text>
                </View>
              ) : null}
              {providerData.phone && providerData.preferredContactMethods.includes('phone') ? (
                <View style={[styles.contactRow, { borderBottomColor: PP.sep }]}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>Phone</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]}>{providerData.phone}</Text>
                </View>
              ) : null}
              {providerData.whatsapp && providerData.preferredContactMethods.includes('whatsapp') ? (
                <View style={[styles.contactRow, { borderBottomColor: PP.sep }]}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>WhatsApp</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]}>{providerData.whatsapp}</Text>
                </View>
              ) : null}
              {providerData.email && providerData.preferredContactMethods.includes('email') ? (
                <View style={[styles.contactRow, { borderBottomColor: PP.sep }]}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>Email</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]} numberOfLines={1}>{providerData.email}</Text>
                </View>
              ) : null}
              {providerData.instagram ? (
                <View style={[styles.contactRow, { borderBottomColor: PP.sep }]}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>Instagram</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]} numberOfLines={1}>@{providerData.instagram}</Text>
                </View>
              ) : null}
              {providerData.website ? (
                <View style={styles.contactRow}>
                  <Text style={[styles.contactRowLabel, { color: PP.sub }]}>Website</Text>
                  <Text style={[styles.contactRowText, { color: PP.text }]} numberOfLines={1}>{providerData.website}</Text>
                </View>
              ) : null}
            </BlurView>
            </View>

            {/* Portfolio — Pinterest-style two-column masonry, matching ProviderProfileScreen */}
            {portfolio.length > 0 && (
              <View style={styles.portfolioSection}>
                <Text style={[styles.sectionTitleNoCard, { color: PP.text, paddingHorizontal: 0 }]}>
                  Portfolio
                </Text>
                <View style={styles.portfolioColumns}>
                  {portfolioColumns.map((column, colIdx) => (
                    <View key={`pcol-${colIdx}`} style={styles.portfolioColumn}>
                      {column.map(item => (
                        <View key={item.id} style={styles.portfolioTileShadow}>
                        <View style={styles.portfolioTile}>
                          <Image
                            source={{ uri: item.image_url }}
                            style={{ width: '100%', height: item.tileHeight }}
                            resizeMode="cover"
                          />
                          {item.caption ? (
                            <View style={styles.portfolioCaptionWrap}>
                              <Text style={styles.portfolioCaption} numberOfLines={1}>
                                {item.caption}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
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

  // Top bar — this screen has its own real "Edit Profile" affordance where
  // clients get a transparent nav bar with back/bookmark/share, so it isn't
  // mirrored 1:1; heroInfoWrap below doesn't need the client screen's 100px
  // clearance since this bar already reserves its own layout space.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  editButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
    fontSize: 13,
  },

  heroInfoWrap: {
    paddingTop: 10,
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
  // shadow — iOS silently drops a view's shadow when overflow:'hidden' is
  // set on that same view, so clip and shadow must be on different layers.
  // This also guarantees the rounded top corners are clipped from the very
  // first frame instead of only after a scroll-triggered relayout.
  contentSheetClip: {
    minHeight: screenHeight,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 130,
    borderTopLeftRadius: SHEET_LIP_RADIUS,
    borderTopRightRadius: SHEET_LIP_RADIUS,
    overflow: 'hidden',
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrapper: {
    position: 'relative',
    width: 148,
    height: 148,
  },
  providerLogo: {
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
  logoGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 148,
    height: 148,
    borderRadius: 74,
  },

  // Provider info — hero text, matches ProviderProfileScreen typography
  providerInfoCenter: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  providerDisplayName: {
    fontFamily: 'Prata-Regular',
    fontSize: 30,
    lineHeight: 40,
    textAlign: 'center',
  },
  providerMeta: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 8,
  },
  ratingInline: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 4,
  },
  yearsExp: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    opacity: 0.9,
    letterSpacing: 0.4,
  },
  statBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  // Square, not a pill: fixed equal width/height with a small corner radius.
  statBox: {
    width: 72,
    height: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statBoxValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    lineHeight: 26,
  },
  statBoxLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.6,
  },
  availabilityWrap: {
    marginBottom: 20,
  },
  // Provider-only profile hub. This sits above the client-facing preview so
  // the tab earns its place as a working surface, while keeping the useful
  // "what clients see" preview immediately below it.
  profileHubCard: {
    padding: 20,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Shadow lives on this outer wrapper, separate from profileHubCard's
  // overflow:'hidden' — iOS silently drops a view's shadow when
  // overflow:'hidden' is set on that same view, so clip and shadow must be
  // on different layers (same fix as contentSheet/contentSheetClip above).
  profileHubCardShadow: {
    marginBottom: 18,
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  profileHubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileHubEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  profileHubTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },
  readinessBadge: {
    minWidth: 46,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
  },
  readinessBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
  },
  readinessChecklist: {
    marginTop: 10,
    gap: 2,
  },
  readinessChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
  },
  readinessChecklistText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
  },
  profileHubSubtext: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  clientViewLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 10,
    marginLeft: 2,
  },

  // Generic frosted card
  aboutCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Shadow lives on this outer wrapper, separate from aboutCard's
  // overflow:'hidden' — see profileHubCardShadow above for why.
  aboutCardShadow: {
    marginBottom: 20,
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  aboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  moreButton: {
    alignSelf: 'flex-start',
  },
  moreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // About/Policy tab switcher
  infoTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginHorizontal: -4,
  },
  // Policy tab rows
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  policyIcon: {
    width: 28,
    alignItems: 'center',
  },
  policyRowText: {
    flex: 1,
  },
  policyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  policyLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  policyTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 2,
  },
  policyTagText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#fff',
  },
  policyValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    fontWeight: '700',
  },
  // Floating circular button, bottom-right of the About/Policy card — opens
  // the provider's uploaded policy photo.
  policyImageFab: {
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
  policyImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  policyImageModalFull: {
    width: '100%',
    height: '80%',
  },

  // Reviews
  reviewsCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Shadow lives on this outer wrapper, separate from reviewsCard's
  // overflow:'hidden' — see profileHubCardShadow above for why.
  reviewsCardShadow: {
    marginBottom: 20,
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  reviewItem: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    marginLeft: 'auto',
  },
  reviewComment: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  // Services section
  servicesSection: {
    marginBottom: 20,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },

  // Category tabs
  categoryTabs: {
    marginBottom: 20,
    maxHeight: 60,
  },
  categoryTabsContent: {
    paddingRight: 20,
    gap: 12,
    paddingVertical: 8,
  },
  categoryDescriptionText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    marginTop: -12,
    marginBottom: 14,
  },

  // Service cards
  categoryServicesContainer: {
    gap: 15,
  },
  serviceItemCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 15,
  },
  // Shadow lives on this outer wrapper, separate from serviceItemCard's
  // overflow:'hidden' — see profileHubCardShadow above for why. No
  // marginBottom to carry — card-to-card spacing here comes from
  // categoryServicesContainer's gap, not a per-card margin.
  serviceItemCardShadow: {
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  serviceImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceImagePlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 5,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  serviceDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
  },
  servicePrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Add-ons — itemized list under the service card, matching Preview's detail level
  serviceAddOns: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  addOnsLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    marginBottom: 4,
  },
  addOnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  addOnName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
  },
  addOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },

  // Contact rows — matches ProviderProfileScreen's contactRow layout
  contactCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Shadow lives on this outer wrapper, separate from contactCard's
  // overflow:'hidden' — see profileHubCardShadow above for why.
  contactCardShadow: {
    marginBottom: 20,
    borderRadius: 26,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  contactRowLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
  },
  contactRowText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    paddingLeft: 16,
  },

  // Portfolio — two-column masonry
  portfolioSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  portfolioColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  portfolioColumn: {
    flex: 1,
    gap: 12,
  },
  // Shadow lives on this outer wrapper, separate from portfolioTileClip's
  // overflow:'hidden' — see contentSheet/contentSheetClip above for why.
  portfolioTileShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  portfolioTile: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  portfolioCaptionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  portfolioCaption: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
    color: '#fff',
  },
});
