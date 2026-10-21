import React, { useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTranslation } from '../../i18n';

function ExpandableSection({ title, children, theme }: { title: string; children: React.ReactNode; theme: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.policyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }}
        activeOpacity={0.8}
        style={styles.policyHeader}
      >
        <Text style={[styles.policyTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.chevron, { color: theme.secondaryText }]}>{open ? '−' : '+'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.policyBody}>{children}</View>}
    </View>
  );
}

export default function AboutScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.text }]}>{t('shared.about.title')}</Text>

        {/* Mission */}
        <View style={[styles.card, {
          backgroundColor: P.accentDim,
          borderColor: P.border,
        }]}>
          <Text style={[styles.cardLabel, { color: theme.accent }]}>{t('shared.about.mission.label')}</Text>
          <Text style={[styles.mission, { color: theme.text }]}>
            {t('shared.about.mission.body')}
          </Text>
        </View>

        {/* Vision */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.accent }]}>{t('shared.about.vision.label')}</Text>
          <Text style={[styles.body, { color: theme.secondaryText }]}>
            {t('shared.about.vision.body')}
          </Text>
        </View>

        {/* App info */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.accent }]}>{t('shared.about.appInfo.label')}</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoKey, { color: theme.secondaryText }]}>{t('shared.about.appInfo.version')}</Text>
            <Text style={[styles.infoVal, { color: theme.text }]}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoKey, { color: theme.secondaryText }]}>{t('shared.about.appInfo.build')}</Text>
            <Text style={[styles.infoVal, { color: theme.text }]}>2026.1</Text>
          </View>
        </View>

        {/* Privacy & Legal */}
        <Text style={[styles.section, { color: theme.accent }]}>{t('shared.about.privacyLegal.label')}</Text>

        <ExpandableSection title={t('shared.about.privacy.title')} theme={theme}>
          <Text style={[styles.policyText, { color: theme.secondaryText }]}>
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.collect.title')}{'\n'}</Text>
            {t('shared.about.privacy.collect.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.use.title')}{'\n'}</Text>
            {t('shared.about.privacy.use.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.share.title')}{'\n'}</Text>
            {t('shared.about.privacy.share.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.payments.title')}{'\n'}</Text>
            {t('shared.about.privacy.payments.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.rights.title')}{'\n'}</Text>
            {t('shared.about.privacy.rights.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.privacy.retention.title')}{'\n'}</Text>
            {t('shared.about.privacy.retention.body')}
          </Text>
        </ExpandableSection>

        <ExpandableSection title={t('shared.about.cookies.title')} theme={theme}>
          <Text style={[styles.policyText, { color: theme.secondaryText }]}>
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.cookies.what.title')}{'\n'}</Text>
            {t('shared.about.cookies.what.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.cookies.use.title')}{'\n'}</Text>
            <Text style={{ color: theme.text }}>{t('shared.about.cookies.essential.label')}</Text>{t('shared.about.cookies.essential.body')}{'\n\n'}
            <Text style={{ color: theme.text }}>{t('shared.about.cookies.preference.label')}</Text>{t('shared.about.cookies.preference.body')}{'\n\n'}
            <Text style={{ color: theme.text }}>{t('shared.about.cookies.analytics.label')}</Text>{t('shared.about.cookies.analytics.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.cookies.managing.title')}{'\n'}</Text>
            {t('shared.about.cookies.managing.body')}{'\n\n'}
            <Text style={[styles.policySubhead, { color: theme.text }]}>{t('shared.about.cookies.thirdParty.title')}{'\n'}</Text>
            {t('shared.about.cookies.thirdParty.body')}
          </Text>
        </ExpandableSection>

        <Text style={[styles.footer, { color: theme.secondaryText }]}>
          {t('shared.about.footer')}
        </Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 24 },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 18, marginBottom: 16, gap: 10 },
  cardLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 2 },
  mission: { fontSize: 15, lineHeight: 23, fontStyle: 'italic' },
  body: { fontSize: 14, lineHeight: 21 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoKey: { fontSize: 13 },
  infoVal: { fontSize: 13, fontWeight: '600' },
  section: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  policyCard: { borderRadius: 14, borderWidth: 0.5, marginBottom: 10, overflow: 'hidden' },
  policyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  policyTitle: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 20, fontWeight: '300' },
  policyBody: { paddingHorizontal: 16, paddingBottom: 16 },
  policyText: { fontSize: 13, lineHeight: 20 },
  policySubhead: { fontWeight: '700', fontSize: 13 },
  footer: { fontSize: 12, textAlign: 'center', marginTop: 28 },
});
