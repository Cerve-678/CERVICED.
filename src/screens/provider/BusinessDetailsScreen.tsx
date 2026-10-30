/**
 * Business Details — hub.
 *
 * Replaces the former single 671-line ProviderBusinessEmailScreen (a name that
 * described only one of its ten cards). That screen mixed business identity,
 * practice details, credentials, accessibility and location into one scroll;
 * it's now focused sub-screens, each owning its own save:
 *
 *   BusinessInfoScreen      — name, links, emails, external booking, → T&Cs
 *   ServicesPricingScreen   — specialties, clientele, pricing, style
 *   AboutYouScreen          — credentials, patch test, cities covered, access
 *   SchedulingScreen        — availability, booking rules, → working hours
 *   PoliciesScreen          — cancellations, reschedules, no-shows,
 *                             refund policy, booking instructions
 *
 * Scheduling and Payments came later than the original three: availability had
 * spread across ServicesPricing, Automations and the calendar, and payment
 * settings across ServicesPricing and Automations. Payments now lives directly under Business Profile.
 * Policies came later still, moved out of InfoRegScreen's one-shot editor.
 * Payments (payment types, deposits and payouts) used to live here too; it
 * moved up to Business Profile alongside Automations & Preferences so getting
 * paid isn't buried a level down. It's still the same PaymentsScreen.
 *
 * Shared form primitives live in src/features/business-details/.
 */
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { useBusinessPalette, type Palette } from '../../features/business-details/BusinessDetailsKit';

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  C: Palette;
}

const NavRow = React.memo(({ icon, title, subtitle, onPress, C }: RowProps) => (
  <TouchableOpacity
    style={[st.row, { backgroundColor: C.card, borderColor: C.border }]}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={[st.iconWrap, { backgroundColor: C.accent + '18' }]}>
      <Ionicons name={icon} size={18} color={C.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[st.rowTitle, { color: C.text }]}>{title}</Text>
      <Text style={[st.rowSub, { color: C.sub }]}>{subtitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={C.sub} style={{ opacity: 0.5 }} />
  </TouchableOpacity>
));
NavRow.displayName = 'NavRow';

export default function BusinessDetailsScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const { t } = useTranslation();
  const C = useBusinessPalette();

  return (
    <View style={[st.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={[st.header, { borderBottomColor: C.border }]}>
          <Text style={[st.headerTitle, { color: C.text }]}>{t('providerProfile.businessDetails.title')}</Text>
          <TouchableOpacity
            style={[st.closeBtn, { backgroundColor: C.surface }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.5}
          >
            <Ionicons name="close" size={22} color={C.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[st.intro, { color: C.sub }]}>
            {t('providerProfile.businessDetails.intro')}
          </Text>

          <NavRow
            icon="storefront-outline"
            title={t('providerProfile.businessDetails.info.title')}
            subtitle={t('providerProfile.businessDetails.info.sub')}
            onPress={() => navigation.navigate('BusinessInfo')}
            C={C}
          />
          <NavRow
            icon="pricetags-outline"
            title={t('providerProfile.businessDetails.services.title')}
            subtitle={t('providerProfile.businessDetails.services.sub')}
            onPress={() => navigation.navigate('ServicesPricing')}
            C={C}
          />
          <NavRow
            icon="document-text-outline"
            title={t('providerProfile.businessDetails.policies.title')}
            subtitle={t('providerProfile.businessDetails.policies.sub')}
            onPress={() => navigation.navigate('Policies')}
            C={C}
          />
          <NavRow
            icon="shield-checkmark-outline"
            title={t('providerProfile.businessDetails.about.title')}
            subtitle={t('providerProfile.businessDetails.about.sub')}
            onPress={() => navigation.navigate('AboutYou')}
            C={C}
          />
          <NavRow
            icon="calendar-outline"
            title={t('providerProfile.businessDetails.scheduling.title')}
            subtitle={t('providerProfile.businessDetails.scheduling.sub')}
            onPress={() => navigation.navigate('Scheduling')}
            C={C}
          />

          <Text style={[st.footnote, { color: C.sub }]}>
            {t('providerProfile.businessDetails.footnote')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 22, letterSpacing: 0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  intro:  { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 13, lineHeight: 19, marginBottom: 18, paddingHorizontal: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.3 },
  rowSub:   { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 12, marginTop: 2, lineHeight: 16 },

  // No extra opacity here — that was fading an already-muted C.sub color
  // twice over, which is exactly the "too faint" info-text problem.
  footnote: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 12, lineHeight: 17, marginTop: 14, paddingHorizontal: 2 },
});
