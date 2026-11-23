/** A public, read-only provider page for links and QR codes at /@handle. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { ViewInstance } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProfileHeroBackdrop from '../components/ProfileHeroBackdrop';
import { parseThemeKey } from '../constants/providerThemes';
import { additionalInfoGroups, goodToKnowText, howToGetThere } from '../features/providers/additionalInfo';
import { heroPhotoFramesOf } from '../features/providers/HeroPhoto';
import { heroPhotos } from '../features/providers/heroPhotos';
import { mapProviderProfileData } from '../features/providers/profileMapper';
import type { ProviderProfileData } from '../features/providers/profileTypes';
import { policyImageEdges, policyImageUrls } from '../features/providers/policyImages';
import { VeilBackdrop } from '../features/providers/heroes/SheerHero';
import { ProviderPageHero } from '../features/providers/page/ProviderPageHero';
import { ProviderPageServices } from '../features/providers/page/ProviderPageServices';
import { ProviderPageSheet } from '../features/providers/page/ProviderPageSheet';
import { buildProviderPagePalette } from '../features/providers/page/providerPagePalette';
import { getProviderBySlug, getProviderPortfolio } from '../services/databaseService';
import type { DbPortfolioItem } from '../types/database';
import { SiteMessagePage } from './SiteMessagePage';

const PAGE_WIDTH = 480;
const noop = () => {};

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => {});
}

export function ProviderWebPage({ handle }: { handle: string }) {
  const [provider, setProvider] = useState<ProviderProfileData | null>(null);
  const [work, setWork] = useState<DbPortfolioItem[]>([]);
  const [venue, setVenue] = useState<DbPortfolioItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState(false);
  const [reload, setReload] = useState(0);
  const { height } = useWindowDimensions();

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setProvider(null);
    setWork([]);
    setVenue([]);
    setPortfolioLoading(true);
    setPortfolioError(false);
    void getProviderBySlug(handle, { forceRefresh: true }).then(async row => {
      if (!active) return;
      if (!row) { setStatus('notFound'); return; }
      setProvider(mapProviderProfileData(row));
      setStatus('ready');
      try {
        const photos = await getProviderPortfolio(row.id, { includeVenue: true });
        if (active) { setWork(photos.work); setVenue(photos.venue); }
      } catch {
        if (active) setPortfolioError(true);
      } finally {
        if (active) setPortfolioLoading(false);
      }
    }).catch(() => {
      if (active) setStatus('error');
    });
    return () => { active = false; };
  }, [handle, reload]);

  if (status === 'loading') return <SiteMessagePage title="Loading profile" body="Getting this provider’s page ready." />;
  if (status === 'notFound') return <SiteMessagePage title="Profile unavailable" body="This provider’s page is not available right now." />;
  if (status === 'error' || !provider) return <SiteMessagePage title="Couldn’t load profile" body="Please refresh the page and try again." />;
  return (
    <ProviderWebPageContent
      provider={provider}
      work={work}
      venue={venue}
      portfolioLoading={portfolioLoading}
      portfolioError={portfolioError}
      retry={() => setReload(value => value + 1)}
      height={height}
    />
  );
}

function ProviderWebPageContent({
  provider, work, venue, portfolioLoading, portfolioError, retry, height,
}: {
  provider: ProviderProfileData;
  work: DbPortfolioItem[];
  venue: DbPortfolioItem[];
  portfolioLoading: boolean;
  portfolioError: boolean;
  retry: () => void;
  height: number;
}) {
  const palette = useMemo(() => buildProviderPagePalette(provider), [provider]);
  const [selectedServiceType, setSelectedServiceType] = useState(provider.serviceTypes[0] ?? '');
  const categoriesForType = provider.categoriesByType[selectedServiceType] ?? provider.categories;
  const categoryNames = Object.keys(categoriesForType);
  const [selectedCategory, setSelectedCategory] = useState(categoryNames[0] ?? '');
  const shownCategory = categoriesForType[selectedCategory] ? selectedCategory : categoryNames[0] ?? '';
  const [listWidth, setListWidth] = useState(0);
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const serviceCountsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [type, byCategory] of Object.entries(provider.categoriesByType)) {
      counts[type] = Object.values(byCategory).reduce((total, list) => total + list.length, 0);
    }
    return counts;
  }, [provider]);
  const heroPhotosForStyle = useMemo(() => heroPhotos(work, 3), [work]);
  const heroPhotoUris = heroPhotosForStyle.map(photo => photo.image_url);
  const heroPhotoFrames = heroPhotoFramesOf(heroPhotosForStyle);
  const aboutCardRef = useRef<ViewInstance>(null);
  const policiesSectionRef = useRef<ViewInstance>(null);
  const servicesSectionRef = useRef<ViewInstance>(null);
  const reviewsSectionRef = useRef<ViewInstance>(null);
  const policyPagesRef = useRef<ViewInstance>(null);
  const jumpTo = useCallback((target: ViewInstance | null) => {
    target?.measureInWindow((_x, y) => window.scrollBy({ top: y - 88, behavior: 'smooth' }));
  }, []);
  const openContact = useCallback(() => {
    if (provider.email) openUrl(`mailto:${provider.email}`);
    else if (provider.phone) openUrl(`tel:${provider.phone.replace(/\s/g, '')}`);
    else if (provider.website) openUrl(provider.website);
    else if (provider.instagram) openUrl(`https://instagram.com/${provider.instagram}`);
  }, [provider]);
  const openPhoto = useCallback((images: { uri: string }[], index: number) => {
    const url = images[index]?.uri;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);
  const renderServices = () => (
    <ProviderPageServices
      provider={provider}
      palette={palette}
      services={categoriesForType[shownCategory] ?? []}
      showAll={null}
      selectedServiceType={selectedServiceType}
      serviceCountsByType={serviceCountsByType}
      onSelectServiceType={setSelectedServiceType}
      categoryNames={categoryNames}
      selectedCategory={shownCategory}
      onSelectCategory={setSelectedCategory}
      listWidth={listWidth}
      onListWidth={setListWidth}
      expandedServiceIds={expanded}
      onToggleExpanded={id => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })}
      onOpenImages={(images, index) => openPhoto(images.map(image => ({ uri: image.uri })), index)}
      canBook={false}
      takingBookings
      serviceFullyBooked={{}}
      serviceNearTermAvailability={{}}
      onBook={noop}
      selectMode={false}
      onToggleSelectMode={noop}
      selectedServiceIds={new Set()}
      addOnsBySelectedService={{}}
      onToggleServiceSelected={noop}
      onEditAddOns={noop}
      waitlistPlaces={{}}
      onOpenHeldPlace={noop}
      onLeaveWaitlist={noop}
      onJoinWaitlist={noop}
    />
  );

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: palette.OP.bg }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => window.location.assign('/')} accessibilityRole="link">
            <Text style={styles.wordmark}>CERVICED</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openUrl(`cerviced://provider/${provider.id}`)} accessibilityRole="link">
            <Text style={styles.openApp}>Open in app</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.page}>
          {provider.backgroundImage ? (
            <Image source={{ uri: provider.backgroundImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <ProfileHeroBackdrop
              colors={provider.hasCustomGradient ? provider.gradient : [palette.baseTheme.hero, palette.baseTheme.bg]}
              finish={parseThemeKey(provider.profileTheme).finish}
              style={StyleSheet.absoluteFill}
            />
          )}
          {palette.veilTheme ? <VeilBackdrop style={StyleSheet.absoluteFill} /> : null}
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
            <ProviderPageHero
              provider={provider}
              palette={palette}
              heroPhotoUris={heroPhotoUris}
              heroPhotoFrames={heroPhotoFrames}
              isLinkOnly={provider.isLinkOnly}
              recommendHeart={null}
              bell={{ enabled: false, loading: false, canSave: false }}
              aboutCardRef={aboutCardRef}
              onOpenHeroPhoto={index => openPhoto(heroPhotoUris.map(uri => ({ uri })), index)}
              onOpenLogo={() => provider.providerLogo?.uri && window.open(provider.providerLogo.uri, '_blank', 'noopener,noreferrer')}
              onBookNow={() => jumpTo(servicesSectionRef.current)}
              onToggleBell={noop}
              onAboutCollapse={noop}
              onGetInTouch={openContact}
              onOpenLinkOnlyBooking={() => provider.externalBookingUrl && openUrl(provider.externalBookingUrl)}
              onRecordStat={noop}
            />
            <ProviderPageSheet
              provider={provider}
              palette={palette}
              isLinkOnly={provider.isLinkOnly}
              takingBookings
              closureReason={null}
              minHeight={height}
              renderServices={renderServices}
              additionalInfo={{
                groups: additionalInfoGroups(provider, palette.pageStyle),
                goodToKnow: goodToKnowText(provider),
                directions: howToGetThere(provider),
              }}
              contactDetails={{
                location: provider.location,
                locationMapUrl: null,
                phone: provider.phone,
                whatsapp: provider.whatsapp,
                email: provider.email,
                instagram: provider.instagram,
                website: provider.website,
              }}
              reviews={[]}
              reviewsLoading={false}
              openingHours={null}
              openingHoursLoading={false}
              workPortfolio={work}
              venuePortfolio={venue}
              portfolioLoading={portfolioLoading}
              portfolioError={portfolioError}
              onRetryPortfolio={retry}
              policyPages={policyImageUrls(provider.bookingPolicies)}
              policyEdges={policyImageEdges(provider.bookingPolicies)}
              jumpTargets={[
                { key: 'about', ref: aboutCardRef },
                { key: 'services', ref: servicesSectionRef },
                { key: 'policies', ref: policiesSectionRef },
                { key: 'reviews', ref: reviewsSectionRef },
              ]}
              aboutCardRef={aboutCardRef}
              policiesSectionRef={policiesSectionRef}
              servicesSectionRef={servicesSectionRef}
              reviewsSectionRef={reviewsSectionRef}
              policyPagesRef={policyPagesRef}
              onScrollToSection={jumpTo}
              onAboutCollapse={noop}
              onOpenPolicyStory={noop}
              onOpenPolicyImage={noop}
              onOpenReviews={noop}
              onContactLink={openUrl}
              onPublicContactLink={openUrl}
              onGetInTouch={openContact}
              onOpenImage={openPhoto}
            />
          </ScrollView>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  topBar: { width: '100%', maxWidth: PAGE_WIDTH, height: 54, backgroundColor: '#FFFFFF', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: '#5C4033', fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 1 },
  openApp: { color: '#5C4033', fontFamily: 'JosefinSans_600SemiBold', fontSize: 15 },
  page: { width: '100%', maxWidth: PAGE_WIDTH, flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
});
