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

const LIGHT = {
  bg:      '#F5F1EC',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  section: 'rgba(255,255,255,0.04)',
};
const DARK = {
  bg:      '#1A1815',
  card:    '#252220',
  accent:  '#AF9197',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  section: 'rgba(255,255,255,0.04)',
};

interface OptionProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  P: typeof LIGHT;
}

const SettingsOption = React.memo(({ icon, title, subtitle, onPress, P }: OptionProps) => (
  <TouchableOpacity
    style={[styles.option, { backgroundColor: P.card, borderColor: P.border }]}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={styles.optionLeft}>
      <Icon name={icon} size={20} color={P.sub} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionText, { color: P.text }]}>{title}</Text>
        <Text style={[styles.optionSubText, { color: P.sub }]}>{subtitle}</Text>
      </View>
    </View>
    <Icon name="chevron-right" size={18} color={P.sub} style={{ opacity: 0.4 }} />
  </TouchableOpacity>
));

export default function BusinessProfileScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;

  return (
    <View style={[styles.background, { backgroundColor: P.bg }]}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: P.text }]}>Business Profile</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>Manage how your business appears on Cerviced</Text>

          {/* Profile */}
          <View style={[styles.section, { backgroundColor: P.section }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Profile</Text>
            <SettingsOption
              icon="storefront"
              title="Edit Profile"
              subtitle="Services, portfolio, pricing & location"
              onPress={() => navigation.navigate('EditProfile')}
              P={P}
            />
            <SettingsOption
              icon="palette"
              title="Branding & Style"
              subtitle="Background image, gradient & accent colour"
              onPress={() => navigation.navigate('Branding')}
              P={P}
            />
          </View>

          {/* Business Details */}
          <View style={[styles.section, { backgroundColor: P.section }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Business Details</Text>
            <SettingsOption
              icon="badge"
              title="Business Details"
              subtitle="Business name, Instagram, website, contact"
              onPress={() => navigation.navigate('BusinessDetails')}
              P={P}
            />
            <SettingsOption
              icon="chat-bubble-outline"
              title="Communications"
              subtitle="Messaging & notification preferences"
              onPress={() => navigation.navigate('Communications')}
              P={P}
            />
            <SettingsOption
              icon="auto-awesome"
              title="Automations & Preferences"
              subtitle="Reminders, business rules & booking automation"
              onPress={() => navigation.navigate('Automations')}
              P={P}
            />
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
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
