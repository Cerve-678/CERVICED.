import React from 'react';
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
import Icon from '../../components/IconLibrary';

export default function PaymentMethodsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={styles.bg}>
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
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Payment Methods</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          Pay securely when you book
        </Text>

        {/* Payment details are entered only in Stripe’s secure sheet. */}
        <View style={[styles.comingSoon, {
          backgroundColor: P.accentDim,
          borderColor: 'transparent',
        }]}>
          <Icon name="payment" size={40} color={P.accentText} />
          <Text style={[styles.comingSoonTitle, { color: P.text }]}>Secure checkout</Text>
          <Text style={[styles.comingSoonSub, { color: P.sub }]}>
            Choose your services and appointment time, then enter your card details at checkout. Supported wallet options appear automatically on your device.
          </Text>
        </View>

        <View style={[styles.infoRow, { backgroundColor: P.card, borderColor: P.border }]}>
          <Icon name="lock" size={18} color={P.accentText} />
          <Text style={[styles.infoText, { color: P.sub }]}>
            Stripe handles your card details securely. Cerviced does not store your full card number.
          </Text>
        </View>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 32, lineHeight: 20 },
  comingSoon: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  comingSoonTitle: { fontSize: 22, letterSpacing: 1 },
  comingSoonSub: {
    
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
  },
  infoText: { fontSize: 12, flex: 1, lineHeight: 18 },
});
