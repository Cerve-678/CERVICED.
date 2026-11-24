/**
 * A public provider page for links and QR codes at /@handle.
 *
 * It loads through the same hook as the app's profile (useProviderProfileData)
 * and draws the same hero, sheet and price list, so what a visitor sees here
 * is what a client sees in the app. Book opens the app's own BookingSheet and
 * then the web's review (webBooking.ts); until payment is built that only
 * shows in local development, and "Open in app" sits in the top bar.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BookingSheet } from '../components/BookingSheet';
import type { BookingSheetProps, BookingSheetResult } from '../components/BookingSheet';
import { FullImageViewer } from '../components/FullImageViewer';
import { LogoZoomViewer } from '../components/LogoZoomViewer';
import ProfileHeroBackdrop from '../components/ProfileHeroBackdrop';
import { heroPhotoPickLimit } from '../constants/pageStyles';
import { parseThemeKey } from '../constants/providerThemes';
import { additionalInfoGroups, goodToKnowText, howToGetThere } from '../features/providers/additionalInfo';
import { heroPhotoFramesOf } from '../features/providers/HeroPhoto';
import { heroPhotosForPage } from '../features/providers/heroPhotos';
import { VeilBackdrop } from '../features/providers/heroes/SheerHero';
import { pageJumpTargets } from '../features/providers/page/jumpTargets';
import { ProviderPageHero } from '../features/providers/page/ProviderPageHero';
import { ProviderPageServices } from '../features/providers/page/ProviderPageServices';
import { ProviderPageSheet } from '../features/providers/page/ProviderPageSheet';
import { useProviderPagePalette } from '../features/providers/page/providerPagePalette';
import { PolicyStoryViewer, usePolicyEdgeColours } from '../features/providers/PolicyPages';
import { policyImageEdges, policyImageUrls } from '../features/providers/policyImages';
import type { ProviderProfileData, ProviderProfileService } from '../features/providers/profileTypes';
import { ProviderContactSheet } from '../features/providers/ProviderContactSheet';
import { providerContactOptions } from '../features/providers/contactOptions';
import type { ProviderContactOption } from '../features/providers/contactOptions';
import { ProviderReviewsModal } from '../features/providers/ProviderReviewsModal';
import { useProviderProfileData } from '../features/providers/useProviderProfileData';
import type { ProviderProfileDataState } from '../features/providers/useProviderProfileData';
import { getPublicProviderAddress } from '../services/databaseService';
import type { PublicProviderAddress } from '../services/databaseService';
import { logger } from '../utils/logger';
import { mapsUrlFor } from '../utils/mapsLink';
import { SiteMessagePage } from './SiteMessagePage';
import { WEB_BOOKING_ENABLED, sheetInitialFrom } from './webBooking';
import type { WebBookingChoice } from './webBooking';
import { WebAccountStep } from './WebAccountStep';
import type { WebBookingAccount } from './WebAccountStep';
import { WebCheckoutSheet } from './WebCheckoutSheet';

const PAGE_WIDTH = 480;
const TOP_BAR_HEIGHT = 54;
/** The app's inline price list shows this many before "See all". */
const SERVICES_COLLAPSED_LIMIT = 6;
const noop = () => {};

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => {});
}

export function ProviderWebPage({ handle }: { handle: string }) {
  const data = useProviderProfileData(handle);
  const { height } = useWindowDimensions();

  if (data.loading) return <SiteMessagePage title="Loading profile" body="Getting this provider’s page ready." />;
  if (data.loadFailed) return <SiteMessagePage title="Couldn’t load profile" body="Please refresh the page and try again." />;
  if (!data.provider || !data.providerDbId) {
    return <SiteMessagePage title="Profile unavailable" body="This provider’s page is not available right now." />;
  }
  return <ProviderWebPageContent provider={data.provider} providerDbId={data.providerDbId} data={data} height={height} />;
}

function ProviderWebPageContent({
  provider, providerDbId, data, height,
}: {
  provider: ProviderProfileData;
  providerDbId: string;
  data: ProviderProfileDataState;
  height: number;
}) {
  const palette = useProviderPagePalette(provider);
  const { pageStyle, OP, adaptiveAccentColor, squareCards } = palette;
  const isLinkOnly = provider.isLinkOnly;
  const { work: workPortfolio, venue: venuePortfolio } = data.portfolio;

  // ── Price list: the same type → category → first six as the app ──────────
  // Kept as what was picked and checked against the current catalogue, since
  // the first paint is the light profile and the full catalogue lands after.
  const [pickedServiceType, setSelectedServiceType] = useState('');
  const selectedServiceType = provider.categoriesByType[pickedServiceType] ? pickedServiceType : provider.serviceTypes[0] ?? '';
  const categoriesForType = provider.categoriesByType[selectedServiceType] ?? provider.categories;
  const categoryNames = Object.keys(categoriesForType);
  const [pickedCategory, setSelectedCategory] = useState('');
  const selectedCategory = categoriesForType[pickedCategory] ? pickedCategory : categoryNames[0] ?? '';
  const selectedCategoryServices = categoriesForType[selectedCategory] ?? [];
  // The app opens a sheet for the rest; here the list opens out in place.
  const [showAllServices, setShowAllServices] = useState(false);
  useEffect(() => setShowAllServices(false), [selectedServiceType, selectedCategory]);
  const visibleServices = showAllServices
    ? selectedCategoryServices
    : selectedCategoryServices.slice(0, SERVICES_COLLAPSED_LIMIT);
  const [listWidth, setListWidth] = useState(0);
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const serviceCountsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [type, byCategory] of Object.entries(provider.categoriesByType)) {
      counts[type] = Object.values(byCategory).reduce((total, list) => total + list.length, 0);
    }
    return counts;
  }, [provider.categoriesByType]);

  // ── Hero photos: the style's picks and captions, as the app shows them ───
  const heroPickLimit = heroPhotoPickLimit(pageStyle);
  const heroPhotoItems = useMemo(() => heroPhotosForPage(workPortfolio, heroPickLimit), [workPortfolio, heroPickLimit]);
  const heroPhotoUris = useMemo(() => heroPhotoItems.map(item => item.image_url), [heroPhotoItems]);
  const heroPhotoCaptions = useMemo(() => heroPhotoItems.map(item => item.caption ?? ''), [heroPhotoItems]);
  const heroPhotoFrames = useMemo(() => heroPhotoFramesOf(heroPhotoItems), [heroPhotoItems]);

  // ── Contact: a salon on "Always visible" shows its full address ──────────
  // The server decides who qualifies and returns null for everyone else.
  const [publicAddress, setPublicAddress] = useState<PublicProviderAddress | null>(null);
  useEffect(() => {
    setPublicAddress(null);
    if (isLinkOnly) return;
    let cancelled = false;
    getPublicProviderAddress(providerDbId)
      .then(address => { if (!cancelled) setPublicAddress(address); })
      .catch((error: unknown) => logger.warn('[ProviderWebPage] public address load failed:', error));
    return () => { cancelled = true; };
  }, [providerDbId, isLinkOnly]);
  const contactDetails = useMemo(() => ({
    location: publicAddress?.fullAddress ?? provider.location,
    locationMapUrl: publicAddress ? mapsUrlFor(publicAddress) : null,
    phone: provider.phone,
    whatsapp: provider.whatsapp,
    email: provider.email,
    instagram: provider.instagram,
    website: provider.website,
  }), [publicAddress, provider]);
  const additionalInfo = useMemo(() => ({
    groups: additionalInfoGroups(provider, pageStyle),
    goodToKnow: goodToKnowText(provider),
    directions: howToGetThere(provider),
  }), [provider, pageStyle]);

  // ── Policy pictures ──────────────────────────────────────────────────────
  const policyPages = useMemo(() => policyImageUrls(provider.bookingPolicies), [provider.bookingPolicies]);
  const savedPolicyEdges = useMemo(() => policyImageEdges(provider.bookingPolicies), [provider.bookingPolicies]);
  const policyEdges = usePolicyEdgeColours(policyPages, savedPolicyEdges);
  const [policyStoryIndex, setPolicyStoryIndex] = useState<number | null>(null);
  const [showPolicyImage, setShowPolicyImage] = useState(false);

  // ── Section links and scrolling ──────────────────────────────────────────
  const aboutCardRef = useRef<ViewInstance>(null);
  const policiesSectionRef = useRef<ViewInstance>(null);
  const servicesSectionRef = useRef<ViewInstance>(null);
  const reviewsSectionRef = useRef<ViewInstance>(null);
  const policyPagesRef = useRef<ViewInstance>(null);
  const jumpTargets = useMemo(() => pageJumpTargets(provider, pageStyle.jumpBar, policyPages.length, {
    about: aboutCardRef,
    services: servicesSectionRef,
    policies: policiesSectionRef,
    policyPages: policyPagesRef,
    reviews: reviewsSectionRef,
  }), [provider, pageStyle.jumpBar, policyPages.length]);
  // The page scrolls inside this ScrollView, not the window, so a jump has to
  // move it: window.scrollBy did nothing here.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const scrollToSection = useCallback((target: ViewInstance | null) => {
    target?.measureInWindow((_x, y) => {
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - TOP_BAR_HEIGHT - 16), animated: true });
    });
  }, []);

  // ── Viewers, the same ones the app opens ─────────────────────────────────
  const [photoViewer, setPhotoViewer] = useState<string[] | null>(null);
  const openImages = useCallback((images: { uri: string }[], index: number) => {
    const uri = images[index]?.uri;
    if (uri) setPhotoViewer([uri]);
  }, []);
  const [showLogo, setShowLogo] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const { loadAllReviews } = data;
  const openReviews = useCallback(() => {
    setShowReviews(true);
    void loadAllReviews();
  }, [loadAllReviews]);

  // Get In Touch: the ways they publish, then their page in the app, where
  // Get In Touch opens the chat (a visitor here isn't signed in, so there's
  // no chat on the website).
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const contactOptions = useMemo<ProviderContactOption[]>(() => [
    ...providerContactOptions(provider),
    {
      key: 'app',
      icon: 'chatbubbles-outline',
      label: 'Message in the CERVICED app',
      detail: 'Opens their page in the app',
      url: `cerviced://provider/${provider.id}`,
    },
  ], [provider]);
  const openContact = useCallback(() => {
    setContactNote(null);
    setContactSheetVisible(true);
  }, []);
  const pickContact = useCallback((option: ProviderContactOption) => {
    openUrl(option.url);
    if (option.key !== 'app') {
      setContactSheetVisible(false);
      return;
    }
    // A browser gives no answer when the app isn't installed. If the page is
    // still showing a moment later, nothing opened: say so and keep the other
    // ways in view.
    setContactNote(null);
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setContactNote('Nothing opened? The CERVICED app isn’t on this device. You can still reach them another way above.');
      }
    }, 1500);
  }, []);

  // ── Booking: the app's own sheet, then the web's checkout in place of the Cart ──
  // A link-only provider takes bookings on their own site, as in the app.
  const canBook = WEB_BOOKING_ENABLED && !isLinkOnly;
  const [sheetService, setSheetService] = useState<ProviderProfileService | null>(null);
  const [sheetInitial, setSheetInitial] = useState<BookingSheetProps['initial']>(undefined);
  const [choice, setChoice] = useState<WebBookingChoice | null>(null);
  // Who is booking, once signed in with an email code and their details saved.
  const [bookingAccount, setBookingAccount] = useState<WebBookingAccount | null>(null);
  const openBookingSheet = useCallback((service: ProviderProfileService) => {
    setSheetInitial(undefined);
    setSheetService(service);
  }, []);
  const submitBookingSheet = useCallback((result: BookingSheetResult) => {
    if (sheetService) setChoice({ service: sheetService, result });
    setSheetService(null);
  }, [sheetService]);
  const changeBooking = useCallback(() => {
    if (!choice) return;
    setSheetInitial(sheetInitialFrom(choice.result));
    setSheetService(choice.service);
    setChoice(null);
  }, [choice]);

  const renderServices = () => (
    <ProviderPageServices
      provider={provider}
      palette={palette}
      services={visibleServices}
      showAll={!showAllServices && selectedCategoryServices.length > SERVICES_COLLAPSED_LIMIT
        ? { count: selectedCategoryServices.length, onPress: () => setShowAllServices(true) }
        : null}
      selectedServiceType={selectedServiceType}
      serviceCountsByType={serviceCountsByType}
      onSelectServiceType={setSelectedServiceType}
      categoryNames={categoryNames}
      selectedCategory={selectedCategory}
      onSelectCategory={setSelectedCategory}
      listWidth={listWidth}
      onListWidth={setListWidth}
      expandedServiceIds={expanded}
      onToggleExpanded={id => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })}
      onOpenImages={openImages}
      canBook={canBook}
      takingBookings={data.takingBookings}
      serviceFullyBooked={{}}
      serviceNearTermAvailability={{}}
      onBook={openBookingSheet}
      selectMode={false}
      onToggleSelectMode={noop}
      selectedServiceIds={new Set()}
      addOnsBySelectedService={{}}
      onToggleServiceSelected={noop}
      onEditAddOns={noop}
      waitlistPlaces={{}}
      onOpenHeldPlace={noop}
      onOpenWaitlistPlace={noop}
      onJoinWaitlist={noop}
    />
  );

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: OP.bg }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => window.location.assign('/')} accessibilityRole="link">
            <Text style={styles.wordmark}>CERVICED</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openUrl(`cerviced://provider/${provider.id}`)} accessibilityRole="link">
            <Text style={styles.openApp}>Open in app</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.page}>
          {/* The app's backdrop: their photo dimmed under a darker top, or the theme's gradient. */}
          {provider.backgroundImage ? (
            <>
              <Image source={{ uri: provider.backgroundImage }} style={[StyleSheet.absoluteFill, styles.backdropPhoto]} contentFit="cover" transition={0} />
              <LinearGradient
                colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.18)', 'transparent']}
                locations={[0, 0.35, 0.62]}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : (
            <ProfileHeroBackdrop
              colors={provider.hasCustomGradient ? provider.gradient : [palette.baseTheme.hero, palette.baseTheme.bg]}
              finish={parseThemeKey(provider.profileTheme).finish}
              style={StyleSheet.absoluteFill}
            />
          )}
          {palette.veilTheme ? <VeilBackdrop style={StyleSheet.absoluteFill} /> : null}
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={64}
          >
            <ProviderPageHero
              provider={provider}
              palette={palette}
              heroPhotoUris={heroPhotoUris}
              heroPhotoCaptions={heroPhotoCaptions}
              heroPhotoFrames={heroPhotoFrames}
              isLinkOnly={isLinkOnly}
              recommendHeart={null}
              bell={{ enabled: false, loading: false, canSave: false }}
              aboutCardRef={aboutCardRef}
              onOpenHeroPhoto={index => openImages(heroPhotoUris.map(uri => ({ uri })), index)}
              onOpenLogo={() => setShowLogo(true)}
              onBookNow={() => scrollToSection(servicesSectionRef.current)}
              onToggleBell={noop}
              onAboutCollapse={noop}
              onGetInTouch={openContact}
              onOpenLinkOnlyBooking={() => provider.externalBookingUrl && openUrl(provider.externalBookingUrl)}
              onRecordStat={noop}
            />
            <ProviderPageSheet
              provider={provider}
              palette={palette}
              isLinkOnly={isLinkOnly}
              takingBookings={data.takingBookings}
              closureReason={data.closureReason}
              minHeight={height}
              renderServices={renderServices}
              additionalInfo={additionalInfo}
              contactDetails={contactDetails}
              reviews={data.reviews}
              reviewsLoading={data.reviewsLoading}
              openingHours={data.openingHours}
              openingHoursLoading={data.openingHoursLoading}
              workPortfolio={workPortfolio}
              venuePortfolio={venuePortfolio}
              portfolioLoading={data.portfolioLoading}
              portfolioError={data.portfolioError}
              onRetryPortfolio={() => void data.reloadPortfolio()}
              policyPages={policyPages}
              policyEdges={policyEdges}
              jumpTargets={jumpTargets}
              aboutCardRef={aboutCardRef}
              policiesSectionRef={policiesSectionRef}
              servicesSectionRef={servicesSectionRef}
              reviewsSectionRef={reviewsSectionRef}
              policyPagesRef={policyPagesRef}
              onScrollToSection={scrollToSection}
              onAboutCollapse={noop}
              onOpenPolicyStory={setPolicyStoryIndex}
              onOpenPolicyImage={() => setShowPolicyImage(true)}
              onOpenReviews={openReviews}
              onContactLink={openUrl}
              onPublicContactLink={openUrl}
              onGetInTouch={openContact}
              onOpenImage={openImages}
            />
          </ScrollView>
        </View>
      </View>

      {canBook ? (
        <>
          <BookingSheet
            isVisible={sheetService !== null}
            onClose={() => setSheetService(null)}
            mode="add"
            service={sheetService}
            initial={sheetInitial}
            onSubmit={submitBookingSheet}
            adaptiveAccentColor={adaptiveAccentColor}
            backgroundColor={OP.card}
            providerIdentifier={providerDbId}
            providerDisplayName={provider.displayName || provider.providerName}
            providerKey={provider.providerName}
            providerServiceCategory={provider.providerService}
            bookingPolicies={provider.bookingPolicies ?? null}
            showPolicyPagesCard={pageStyle.key !== 'classic'}
            submitLabel="Continue"
          />
          <WebCheckoutSheet
            choice={choice}
            providerName={provider.displayName || provider.providerName}
            accentColor={adaptiveAccentColor}
            backgroundColor={OP.card}
            onChange={changeBooking}
            onClose={() => setChoice(null)}
          >
            {tokens => (
              <WebAccountStep tokens={tokens} accentColor={adaptiveAccentColor} onReadyChange={setBookingAccount} />
            )}
          </WebCheckoutSheet>
        </>
      ) : null}
      <FullImageViewer uris={policyPages} visible={showPolicyImage} onClose={() => setShowPolicyImage(false)} label="Policy document" />
      <PolicyStoryViewer
        urls={policyPages}
        edges={policyEdges}
        startIndex={policyStoryIndex}
        title={`${provider.displayName} · Policy`}
        onClose={() => setPolicyStoryIndex(null)}
        onZoom={() => {
          setPolicyStoryIndex(null);
          setShowPolicyImage(true);
        }}
      />
      <FullImageViewer uris={photoViewer ?? []} visible={photoViewer !== null} onClose={() => setPhotoViewer(null)} label="Photo" />
      <LogoZoomViewer
        uri={provider.providerLogo?.uri}
        framing={provider.providerLogoFraming}
        visible={showLogo}
        onClose={() => setShowLogo(false)}
        accessibilityName={provider.displayName}
      />
      <ProviderContactSheet
        visible={contactSheetVisible}
        onClose={() => setContactSheetVisible(false)}
        title="Get in touch"
        subtitle={`Choose how you’d like to reach ${provider.displayName}.`}
        emptyText=""
        options={contactOptions}
        onPick={pickContact}
        note={contactNote}
        maxWidth={PAGE_WIDTH}
        colors={{ surface: OP.surface, card: OP.card, border: OP.border, text: OP.text, sub: OP.sub }}
      />
      <ProviderReviewsModal
        isVisible={showReviews}
        onClose={() => setShowReviews(false)}
        reviews={data.reviews}
        providerName={provider.providerName}
        adaptiveAccentColor={adaptiveAccentColor}
        providerGradient={provider.gradient ?? OP.gradient}
        squareCards={squareCards}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  topBar: { width: '100%', maxWidth: PAGE_WIDTH, height: TOP_BAR_HEIGHT, backgroundColor: '#FFFFFF', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: '#5C4033', fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 1 },
  openApp: { color: '#5C4033', fontFamily: 'JosefinSans_600SemiBold', fontSize: 15 },
  page: { width: '100%', maxWidth: PAGE_WIDTH, flex: 1, overflow: 'hidden' },
  backdropPhoto: { opacity: 0.88 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
});
