// OffersScreen.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  Animated,
  ListRenderItem,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';
import { HomeStackParamList } from '../navigation/types';
import { getActivePromotions } from '../services/databaseService';
import type { DbPromotionWithProvider } from '../types/database';

// ── Design tokens ─────────────────────────────────────────────────────────────
interface Offer {
  id: string;
  title: string;
  description: string;
  discount: string;
  validUntil: string;
  providerName: string;
  logo: any;
  service?: string;
}

function mapPromotion(p: DbPromotionWithProvider): Offer {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    discount: p.discount_text ?? (p.discount_percent ? `${p.discount_percent}% OFF` : p.discount_amount ? `£${p.discount_amount} OFF` : 'OFFER'),
    validUntil: p.valid_until,
    providerName: p.providers?.display_name ?? 'Provider',
    logo: p.providers?.logo_url ? { uri: p.providers.logo_url } : null,
    ...(p.service_category ? { service: p.service_category.toUpperCase() } : {}),
  };
}

const TABS = ['ALL', 'HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS'];

// ── Offer Card ────────────────────────────────────────────────────────────────
interface OfferCardProps { offer: Offer; index: number; P: AppTheme }

const OfferCard = React.memo<OfferCardProps>(({ offer, index, P }) => {
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
      >
        {/* Discount badge */}
        <View style={[styles.discountBadge, { backgroundColor: P.accent }]}>
          <Text style={[styles.discountText, { color: P.ice }]}>{offer.discount}</Text>
        </View>

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
  const insets = useSafeAreaInsets();


  const [rawPromotions, setRawPromotions] = useState<DbPromotionWithProvider[]>([]);
  const [selectedTab, setSelectedTab]     = useState('ALL');
  const [refreshing, setRefreshing]       = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
    if (selectedTab === 'ALL') return allOffers;
    return allOffers.filter(o => o.service === selectedTab);
  }, [allOffers, selectedTab]);

  const renderCard: ListRenderItem<Offer> = useCallback(({ item, index }) => (
    <OfferCard offer={item} index={index} P={P} />
  ), [P]);


  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: P.sep }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: P.surface, borderColor: P.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: P.text }]}>OFFERS</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: P.sep }]}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map(tab => {
          const active = selectedTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTab(tab);
              }}
              style={[styles.tab, { backgroundColor: active ? P.accent : P.surface, borderColor: active ? P.accent : P.border }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, { color: active ? P.ice : P.sub, fontWeight: active ? '700' : '500' }]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Count row */}
      <View style={[styles.countRow, { borderBottomColor: P.sep }]}>
        <Text style={[styles.countText, { color: P.sub }]}>
          {filteredOffers.length} {filteredOffers.length === 1 ? 'offer' : 'offers'}
        </Text>
      </View>

      {/* Offers list */}
      <FlatList
        data={filteredOffers}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 18, fontWeight: '500', marginTop: -1 },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    letterSpacing: 1.5,
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
  tab: {
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // Count row
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
  },

  // List
  listContent: { paddingTop: 8, paddingBottom: 110, paddingHorizontal: 16 },

  // Card
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
  discountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    zIndex: 1,
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
    paddingRight: 56,
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
