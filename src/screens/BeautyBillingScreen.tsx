import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Icon from '../components/IconLibrary';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

interface SettingsOptionProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  theme: any;
}

const SettingsOption = React.memo(({ icon, title, subtitle, onPress, theme }: SettingsOptionProps) => (
  <TouchableOpacity
    style={[styles.option, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={styles.optionLeft}>
      <Icon name={icon} size={20} color={theme.secondaryText} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionText, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.optionSubText, { color: theme.secondaryText }]}>{subtitle}</Text>
      </View>
    </View>
    <Icon name="chevron-right" size={18} color={theme.secondaryText} style={{ opacity: 0.4 }} />
  </TouchableOpacity>
));

export default function BeautyBillingScreen({ navigation }: any) {
  const { theme: t } = useTheme();

  return (
    <ThemedBackground style={styles.background}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={t.statusBar} translucent />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: t.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: t.text }]}>My Profile</Text>
          <Text style={[styles.subtitle, { color: t.secondaryText }]}>Beauty preferences and payment details</Text>

          {/* Beauty */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Beauty</Text>
            <SettingsOption
              icon="heart"
              title="Beauty Profile"
              subtitle="Hair, skin, interests"
              onPress={() => navigation.navigate('BeautyProfile')}
              theme={t}
            />
          </View>

          {/* Billing */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Billing</Text>
            <SettingsOption
              icon="payment"
              title="Payment Methods"
              subtitle="Cards, Apple Pay"
              onPress={() => navigation.navigate('PaymentMethods')}
              theme={t}
            />
            <SettingsOption
              icon="receipt"
              title="Subscription & Billing"
              subtitle="Plans, invoices"
              onPress={() => navigation.navigate('Subscription')}
              theme={t}
            />
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },

  backBtn: { marginBottom: 24, marginTop: 12 },
  backArrow: { fontSize: 22, fontWeight: '900' },

  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 32, lineHeight: 20 },

  section: {
    marginBottom: 18,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 2,
    textTransform: 'uppercase',
    opacity: 0.55,
  },

  option: {
    padding: 13,
    borderRadius: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 0.5,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  optionText: { fontSize: 15, fontWeight: '600' },
  optionSubText: { fontSize: 12, fontWeight: '400', marginTop: 1 },
});
