// OffersScreen.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
  StatusBar,
  Animated,
  ListRenderItem,
  Platform,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';
import TabIcon from '../components/TabIcon';
import SlidingCategoryTabs from '../components/SlidingCategoryTabs';
import { HomeStackParamList } from '../navigation/types';
import { getActivePromotions } from '../services/databaseService';
import type { DbPromotionWithProvider } from '../types/database';

// ── Design tokens ─────────────────────────────────────────────────────────────
interface Offer {
  id: string;
  title: string;
  description: string;
  discount: string;
  discountPercent: number | null;
  discountAmount: number | null;
  validUntil: string;
  createdAt: string;
  providerName: string;
  providerSlug: string | null;
  logo: any;
  service?: string;
}

function mapPromotion(p: DbPromotionWithProvider): Offer {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    discount: p.discount_text ?? (p.discount_percent ? `${p.discount_percent}% OFF` : p.discount_amount ? `£${p.discount_amount} OFF` : 'OFFER'),
    discountPercent: p.discount_percent ?? null,
    discountAmount: p.discount_amount ?? null,
    validUntil: p.valid_until,
    createdAt: p.created_at,
    providerName: p.providers?.display_name ?? 'Provider',
    providerSlug: p.providers?.slug ?? null,
    logo: p.providers?.logo_url ? { uri: p.providers.logo_url } : null,
    ...(p.service_category ? { service: p.service_category.toUpperCase() } : {}),
  };
}

const TABS = ['ALL', 'HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS'];

// Fixed (not theme-tinted) — matches SearchScreen's active-tab treatment so
// the two screens' category pills read as the same control.
const ACTIVE_TAB_COLOR = '#000000';

type SortKey = 'newest' | 'expiring' | 'discount';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'expiring', label: 'Expiring Soon' },
  { value: 'discount', label: 'Biggest Discount' },
];

// ── Offer Card — back to the original horizontal list row (logo left, info
// right, discount badge overlaid top-right) now wired up to actually do
// something on tap: navigates to the offer's provider profile. ─────────────
interface OfferCardProps { offer: Offer; index: number; P: AppTheme; onPress: () => void }

const OfferCard = React.memo<OfferCardProps>(({ offer, index, P, onPress }) => {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const expDate = (() => {
    try {
      return new Date(offer.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  })();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}
        activeOpacity={0.82}
        onPress={onPress}
        disabled={!offer.providerSlug}
      >
        {/* Provider logo */}
        {offer.logo ? (
          <Image source={offer.logo} style={styles.logo} resizeMode="cover" />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: P.surface }]}>
            <Text style={[styles.logoPlaceholderText, { color: P.sub }]}>
              {offer.providerName.charAt(0)}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          {/* In normal flow (not floating over the text below it) so a long
              custom label — discount_text is free text, not just "20% OFF"
              — pushes the rest of the card down instead of covering it. */}
          <View style={[styles.discountBadge, { backgroundColor: P.accent }]}>
            <Text style={[styles.discountText, { color: P.ice }]} numberOfLines={1}>{offer.discount}</Text>
          </View>
          <Text style={[styles.providerName, { color: P.sub }]} numberOfLines={1}>
            {offer.providerName}
          </Text>
          <Text style={[styles.title, { color: P.text }]} numberOfLines={2}>
            {offer.title}
          </Text>
          {offer.description ? (
            <Text style={[styles.description, { color: P.sub }]} numberOfLines={2}>
              {offer.description}
            </Text>
          ) : null}
          <View style={styles.footer}>
            {offer.service ? (
              <View style={[styles.servicePill, { backgroundColor: `${P.accent}18`, borderColor: `${P.accent}40` }]}>
                <Text style={[styles.servicePillText, { color: P.accent }]}>{offer.service}</Text>
              </View>
            ) : null}
            {expDate ? (
              <Text style={[styles.expiry, { color: P.sub }]}>Exp {expDate}</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});
OfferCard.displayName = 'OfferCard';

// ── Main Screen ───────────────────────────────────────────────────────────────
type Props = NativeStackScreenProps<HomeStackParamList, 'Offers'>;

export default function OffersScreen({ navigation }: Props) {
  const { isDarkMode, palette: P } = useTheme();

  const [rawPromotions, setRawPromotions] = useState<DbPromotionWithProvider[]>([]);
  const [selectedTab, setSelectedTab]     = useState('ALL');
  const [refreshing, setRefreshing]       = useState(false);
  const [sortBy, setSortBy]               = useState<SortKey>('newest');
  const [sortModalVisible, setSortModalVisible] = useState(false);

  const load = useCallback(() => {
    return getActivePromotions()
      .then(data => setRawPromotions(data))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const allOffers = useMemo(() => rawPromotions.map(mapPromotion), [rawPromotions]);

  const filteredOffers = useMemo(() => {
    const byTab = selectedTab === 'ALL' ? allOffers : allOffers.filter(o => o.service === selectedTab);
    const sorted = [...byTab];
    if (sortBy === 'expiring') {
      sorted.sort((a, b) => new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime());
    } else if (sortBy === 'discount') {
      // Percent and flat-£ discounts aren't really comparable on one scale —
      // this is a rough ordering (percent value, else amount value), not a
      // claim that "30% off" beats "£20 off" for any given service price.
      sorted.sort((a, b) => (b.discountPercent ?? b.discountAmount ?? 0) - (a.discountPercent ?? a.discountAmount ?? 0));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [allOffers, selectedTab, sortBy]);

  const goToProvider = useCallback((offer: Offer) => {
    if (!offer.providerSlug) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('ProviderProfile', { providerId: offer.providerSlug, source: 'offers' });
  }, [navigation]);

  const renderCard: ListRenderItem<Offer> = useCallback(({ item, index }) => (
    <OfferCard offer={item} index={index} P={P} onPress={() => goToProvider(item)} />
  ), [P, goToProvider]);

  const sortActive = sortBy !== 'newest';

  // ── Real native header — matches SearchScreen's pattern (the actual
  // React Navigation header, not a custom View standing in for one) plus a
  // single filters button on the right, badge-lit when a non-default sort
  // is active. No search bar here — Offers has nothing to type a query into.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: false,
      headerBackVisible: true,
      headerTitle: 'OFFERS',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.text },
      headerStyle: { backgroundColor: P.bg },
      headerShadowVisible: false,
      headerTintColor: P.accent,
      headerBackButtonDisplayMode: 'minimal',
      headerRight: () => (
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSortModalVisible(true);
          }}
          activeOpacity={0.6}
        >
          <TabIcon name="sliders" size={17} color={sortActive ? P.accent : P.sub} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, P, sortActive]);

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Category tabs — same frosted-glass pill used on a provider's own
          profile for their service categories, so this reads as the same
          control rather than a different design. A black capsule slides
          behind the selected pill on every tap. */}
      <View style={[styles.tabsScroll, { borderBottomColor: P.sep }]}>
        <SlidingCategoryTabs
          categories={TABS}
          selected={selectedTab}
          onSelect={(tab) => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedTab(tab);
          }}
          surfaceColor={P.surface}
          borderColor={P.border}
          textColor={P.text}
          isDarkMode={isDarkMode}
          activeColor={ACTIVE_TAB_COLOR}
          contentContainerStyle={styles.tabsContent}
        />
      </View>

      {/* Offers list — single column */}
      <FlatList
        data={filteredOffers}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View style={styles.listHeaderBar}>
            <Text style={[styles.countText, { color: P.sub }]}>
              {filteredOffers.length} {filteredOffers.length === 1 ? 'offer' : 'offers'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        bounces
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={P.accent} colors={[P.accent]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: P.text }]}>No offers right now</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Check back soon for new promotions</Text>
          </View>
        }
      />

      {/* Sort picker — a single filters button in the header opens this,
          rather than an anchored popover (a native headerRight button's
          on-screen position isn't something React Navigation exposes to
          measure against, so a centered sheet is the robust option here). */}
      <Modal visible={sortModalVisible} transparent animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
        <TouchableOpacity
          style={styles.sortBackdrop}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={[styles.sortSheet, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sortSheetTitle, { color: P.text }]}>Sort Offers</Text>
            {SORT_OPTIONS.map(opt => {
              const active = sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.sortRow}
                  onPress={() => {
                    setSortBy(opt.value);
                    setSortModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortRowText, { color: P.text, fontWeight: active ? '700' : '400' }]}>
                    {opt.label}
                  </Text>
                  {active && <Text style={[styles.sortCheck, { color: P.accent }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header filters button — bare icon, no circular background (the sliders
  // icon already has its own round toggle-knobs; wrapping it in a circle
  // too just doubled up on circles). Active state is the icon's own color.
  filterBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },

  // Tabs
  tabsScroll: {
    maxHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },

  // List header (result count)
  listHeaderBar: {
    paddingVertical: 10,
  },
  countText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
  },

  // List
  listContent: { paddingTop: 8, paddingBottom: 110, paddingHorizontal: 16 },

  // Offer card — horizontal row: logo left, info right, discount badge
  // overlaid top-right (original list layout)
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  // In normal flow, above the provider name — not absolutely positioned
  // over the card, so there's no max length past which a long custom label
  // starts overlapping text underneath it.
  discountBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  discountText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 14,
    flexShrink: 0,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 26,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  providerName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  description: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  servicePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  servicePillText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  expiry: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.7,
  },

  // Sort sheet
  sortBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortSheet: {
    width: 260,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sortSheetTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sortRowText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
  },
  sortCheck: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
  },
  emptySub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
  },
});
