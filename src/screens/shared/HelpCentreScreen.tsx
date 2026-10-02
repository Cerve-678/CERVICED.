import React, { useState } from 'react';
import {
  ActionSheetIOS,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import { ThemedBackground } from '../../components/ThemedBackground';
import Icon from '../../components/IconLibrary';
import { supportMailtoUrl } from '../../constants/support';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

// FAQ copy lives in the i18n catalog; this list just names the question/answer
// keys. Two answers (cancel, payment) are legal/payment copy and are HELD IN
// ENGLISH by the i18n DO_NOT_TRANSLATE guard even when another language is
// active — see src/i18n/translate.ts.
const FAQ_KEYS: ReadonlyArray<{ q: TranslationKey; a: TranslationKey }> = [
  { q: 'helpCentre.faq.book.q', a: 'helpCentre.faq.book.a' },
  { q: 'helpCentre.faq.cancel.q', a: 'helpCentre.faq.cancel.a' },
  { q: 'helpCentre.faq.becca.q', a: 'helpCentre.faq.becca.a' },
  { q: 'helpCentre.faq.points.q', a: 'helpCentre.faq.points.a' },
  { q: 'helpCentre.faq.payment.q', a: 'helpCentre.faq.payment.a' },
];

function FAQItem({ q, a, P }: { q: string; a: string; P: AppTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.faqItem, { backgroundColor: P.card, borderColor: P.border }]}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }}
      activeOpacity={0.8}
    >
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQ, { color: P.text }]}>{q}</Text>
        <Icon name={open ? 'expand-less' : 'expand-more'} size={20} color={P.sub} />
      </View>
      {open && <Text style={[styles.faqA, { color: P.sub }]}>{a}</Text>}
    </TouchableOpacity>
  );
}

function handleContactSupport() {
  Haptics.selectionAsync().catch(() => {});
  Linking.openURL(supportMailtoUrl());
}

interface MoreAction { label: string; run: () => void; }

// Every option here routes somewhere real: Contact Support opens a mail
// composer to the support address, and the other three navigate to screens
// that exist in both navigators HelpCentre is registered in (client
// ProfileNavigator and provider ProviderAccountNavigator), so it works from
// either hat. No dead entries.
function buildMoreActions(
  navigation: { navigate: (screen: string) => void },
  t: (key: TranslationKey) => string,
): MoreAction[] {
  return [
    { label: t('helpCentre.action.contact'), run: handleContactSupport },
    { label: t('helpCentre.action.report'), run: () => navigation.navigate('ReportProblem') },
    // Held in English (legal reference) by the i18n do-not-translate guard.
    { label: t('helpCentre.action.terms'), run: () => navigation.navigate('Terms') },
    { label: t('helpCentre.action.about'), run: () => navigation.navigate('About') },
  ];
}

export default function HelpCentreScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const actions = buildMoreActions(navigation, t);

  // iOS: the native action sheet handles any number of options. Android's
  // Alert.alert silently caps at 3 buttons, so with four options + Cancel some
  // would vanish — and DESIGN_SYSTEM.md says not to use the OS Alert anyway.
  // So Android gets a small themed in-component menu instead.
  const openMore = () => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map(a => a.label), t('common.cancel')], cancelButtonIndex: actions.length },
        (idx) => { if (idx < actions.length) actions[idx]?.run(); },
      );
    } else {
      setMoreOpen(true);
    }
  };

  const runAction = (action: MoreAction) => {
    Haptics.selectionAsync().catch(() => {});
    setMoreOpen(false);
    action.run();
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={openMore}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={P.sub} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: P.text }]}>{t('helpCentre.title')}</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          {t('helpCentre.subtitle')}
        </Text>

        <Text style={[styles.section, { color: P.accentText }]}>{t('helpCentre.section.faqs')}</Text>
        {FAQ_KEYS.map(item => (
          <FAQItem key={item.q} q={t(item.q)} a={t(item.a)} P={P} />
        ))}
      </ScrollView>

      {/* Android "more options" menu — a themed bottom sheet rather than the
          OS Alert, so all four options are reachable (Alert caps at 3). */}
      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMoreOpen(false)}
      >
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMoreOpen(false)}>
          <View style={[styles.menuCard, { backgroundColor: P.surfaceRaised, borderColor: P.border }]}>
            {actions.map((action, i) => (
              <TouchableOpacity
                key={action.label}
                style={[styles.menuRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: P.sep }]}
                onPress={() => runAction(action)}
                activeOpacity={0.7}
              >
                <Text style={[styles.menuRowText, { color: P.text }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.menuRow, styles.menuCancel, { borderTopWidth: 0.5, borderTopColor: P.sep }]}
              onPress={() => setMoreOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuRowText, { color: P.sub }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: {},
  backArrow: { fontSize: 22, fontWeight: '900' },
  moreBtn: { padding: 4 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  section: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  faqItem: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 10,
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqQ: { fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 8 },
  faqA: { fontSize: 13, lineHeight: 19, marginTop: 10 },

  // Android "more options" themed menu
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)', padding: 16, paddingBottom: 32 },
  menuCard: { borderRadius: 20, borderWidth: 0.5, overflow: 'hidden' },
  menuRow: { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  menuRowText: { fontSize: 15, fontWeight: '600' },
  menuCancel: {},
});
