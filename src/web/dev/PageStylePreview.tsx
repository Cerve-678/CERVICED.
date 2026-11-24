/**
 * Developer-only: the shared provider page (src/features/providers/page/)
 * drawn in the browser with a sample provider, in any page style. Open
 * /_dev/page-styles?style=<key> in a development build. It exists to check
 * that the app's own page components render on the web unchanged, before the
 * real /@handle page is built on them. It is not reachable on the live site
 * (parseSitePath only allows it when __DEV__).
 */
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { ViewInstance } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProfileHeroBackdrop from '../../components/ProfileHeroBackdrop';
import { PAGE_STYLES, isPageStyleKey } from '../../constants/pageStyles';
import { parseThemeKey } from '../../constants/providerThemes';
import { additionalInfoGroups, goodToKnowText, howToGetThere } from '../../features/providers/additionalInfo';
import { VeilBackdrop } from '../../features/providers/heroes/SheerHero';
import { ProviderPageHero } from '../../features/providers/page/ProviderPageHero';
import { ProviderPageServices } from '../../features/providers/page/ProviderPageServices';
import { ProviderPageSheet } from '../../features/providers/page/ProviderPageSheet';
import { buildProviderPagePalette } from '../../features/providers/page/providerPagePalette';
import { SAMPLE_OPENING_HOURS, SAMPLE_REVIEWS, samplePageProvider } from './samplePageProvider';

/** The page is drawn at phone width, as the app draws it. */
const PAGE_WIDTH = 430;
const noop = () => {};

export function PageStylePreview({ styleKey }: { styleKey: string | null }) {
  const pageStyleKey = styleKey && isPageStyleKey(styleKey) ? styleKey : 'classic';
  const provider = useMemo(() => samplePageProvider(pageStyleKey), [pageStyleKey]);
  const palette = useMemo(() => buildProviderPagePalette(provider), [provider]);
  const { height } = useWindowDimensions();

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
  }, [provider.categoriesByType]);

  const aboutCardRef = useRef<ViewInstance>(null);
  const policiesSectionRef = useRef<ViewInstance>(null);
  const servicesSectionRef = useRef<ViewInstance>(null);
  const reviewsSectionRef = useRef<ViewInstance>(null);
  const policyPagesRef = useRef<ViewInstance>(null);

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
      onToggleExpanded={(id) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })}
      onOpenImages={noop}
      canBook
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
      <View style={styles.root}>
        <ScrollView horizontal style={styles.picker} contentContainerStyle={styles.pickerRow}>
          {PAGE_STYLES.map((style) => (
            <TouchableOpacity
              key={style.key}
              onPress={() => { window.location.search = `?style=${style.key}`; }}
              style={[styles.chip, style.key === pageStyleKey && styles.chipOn]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, style.key === pageStyleKey && styles.chipTextOn]}>{style.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[styles.page, { height: height - 52 }]}>
          <ProfileHeroBackdrop
            colors={provider.hasCustomGradient ? provider.gradient : [palette.baseTheme.hero, palette.baseTheme.bg]}
            finish={parseThemeKey(provider.profileTheme).finish}
            style={StyleSheet.absoluteFill}
          />
          {palette.veilTheme ? <VeilBackdrop style={StyleSheet.absoluteFill} /> : null}
          <ScrollView style={styles.flex}>
            <ProviderPageHero
              provider={provider}
              palette={palette}
              heroPhotoUris={[]}
              heroPhotoFrames={{}}
              isLinkOnly={false}
              recommendHeart={null}
              bell={{ enabled: false, loading: false, canSave: false }}
              aboutCardRef={aboutCardRef}
              onOpenHeroPhoto={noop}
              onOpenLogo={noop}
              onBookNow={noop}
              onToggleBell={noop}
              onAboutCollapse={noop}
              onGetInTouch={noop}
              onOpenLinkOnlyBooking={noop}
              onRecordStat={noop}
            />
            <ProviderPageSheet
              provider={provider}
              palette={palette}
              isLinkOnly={false}
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
                phone: '',
                whatsapp: '',
                email: '',
                instagram: provider.instagram,
                website: '',
              }}
              reviews={SAMPLE_REVIEWS}
              reviewsLoading={false}
              openingHours={SAMPLE_OPENING_HOURS}
              openingHoursLoading={false}
              workPortfolio={[]}
              venuePortfolio={[]}
              portfolioLoading={false}
              policyPages={[]}
              policyEdges={{}}
              jumpTargets={[]}
              aboutCardRef={aboutCardRef}
              policiesSectionRef={policiesSectionRef}
              servicesSectionRef={servicesSectionRef}
              reviewsSectionRef={reviewsSectionRef}
              policyPagesRef={policyPagesRef}
              onScrollToSection={noop}
              onAboutCollapse={noop}
              onOpenPolicyStory={noop}
              onOpenPolicyImage={noop}
              onOpenReviews={noop}
              onContactLink={noop}
              onPublicContactLink={noop}
              onGetInTouch={noop}
              onOpenImage={noop}
            />
          </ScrollView>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E9E4DE', alignItems: 'center' },
  picker: { flexGrow: 0, alignSelf: 'stretch', backgroundColor: '#FFFFFF' },
  pickerRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1ECE6' },
  chipOn: { backgroundColor: '#4A2C1E' },
  chipText: { fontSize: 13, color: '#4A2C1E' },
  chipTextOn: { color: '#FFFFFF' },
  page: { width: '100%', maxWidth: PAGE_WIDTH, overflow: 'hidden' },
  flex: { flex: 1 },
});
