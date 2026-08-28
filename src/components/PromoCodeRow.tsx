// Provider-scoped promo code entry — one code applies to every service from
// that provider. Used by BookingSheet's add flow (local validate-only
// preview, carried into the cart as CartItem.initialPromoCode). Every colour
// is passed in by the caller, derived from its own backdrop — nothing here
// reads the app's light/dark theme.
import React, { memo, useCallback, useRef, useState } from 'react';
import { Animated, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { DbPromotion } from '../types/database';

interface PromoCodeRowProps {
  providerKey: string;
  appliedPromo?: DbPromotion;
  discount: number;
  onApply: (providerKey: string, code: string) => Promise<string | null>;
  onRemove: (providerKey: string) => void;
  borderColor: string;
  surfaceColor: string;
  textColor: string;
  subColor: string;
  accentColor: string;
}

export const PromoCodeRow: React.FC<PromoCodeRowProps> = memo(
  function PromoCodeRow({ providerKey, appliedPromo, discount, onApply, onRemove, borderColor, surfaceColor, textColor, subColor, accentColor }) {
    const [promoInput, setPromoInput] = useState('');
    const [promoApplying, setPromoApplying] = useState(false);
    const [promoError, setPromoError] = useState<string | null>(null);

    // Fired on every rejected Apply, not driven off the error string changing:
    // typing the same wrong code twice is two rejections, and the second one
    // has to be as visible as the first or the button reads as dead.
    const shake = useRef(new Animated.Value(0)).current;
    const runShake = useCallback(() => {
      shake.setValue(0);
      Animated.sequence(
        [-6, 6, -4, 4, 0].map(toValue =>
          Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
        ),
      ).start();
    }, [shake]);

    const handleApplyPromoPress = useCallback(async () => {
      if (!promoInput.trim() || promoApplying) return;
      setPromoApplying(true);
      setPromoError(null);
      const error = await onApply(providerKey, promoInput);
      setPromoApplying(false);
      if (error) {
        setPromoError(error);
        runShake();
      } else {
        setPromoInput('');
      }
    }, [promoInput, promoApplying, onApply, providerKey, runShake]);

    return (
      <View style={styles.container}>
        {appliedPromo ? (
          <View style={[styles.appliedRow, { borderColor, backgroundColor: surfaceColor }]}>
            <Text style={[styles.appliedCode, { color: accentColor }]}>
              {appliedPromo.promo_code?.toUpperCase()}
            </Text>
            <Text style={[styles.appliedTitle, { color: subColor }]} numberOfLines={1}>
              {appliedPromo.title}
            </Text>
            <Text style={styles.appliedDiscount}>−£{discount.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => onRemove(providerKey)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // The whole row moves, not just the field: the Apply button is what
          // was pressed, so shaking the field alone reads as the two being
          // unrelated.
          <Animated.View style={[styles.inputRow, { transform: [{ translateX: shake }] }]}>
            <TextInput
              // #F44336 is the app's error colour (DESIGN_SYSTEM.md) — the same
              // red the cart outlines a flagged booking with, so a rejected code
              // and a broken booking speak one language. Width goes up with it,
              // since a hairline border can't carry a colour change on its own.
              style={[
                styles.input,
                { borderColor, color: textColor, backgroundColor: surfaceColor },
                promoError ? styles.inputInvalid : null,
              ]}
              placeholder="Promo code for this provider"
              placeholderTextColor={subColor}
              value={promoInput}
              onChangeText={t => { setPromoInput(t); setPromoError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: promoInput.trim() ? accentColor : surfaceColor }]}
              onPress={handleApplyPromoPress}
              disabled={!promoInput.trim() || promoApplying}
              activeOpacity={0.8}
            >
              {promoApplying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.applyText, { color: promoInput.trim() ? '#fff' : subColor }]}>Apply</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}
        {promoError && <Text style={styles.errorText}>{promoError}</Text>}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: { marginTop: 4, marginBottom: 12 },
  appliedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  appliedCode: { fontSize: 12, fontWeight: '700' },
  appliedTitle: { flex: 1, fontSize: 11 },
  appliedDiscount: { fontSize: 12, fontWeight: '700', color: '#30D158' },
  removeText: { fontSize: 11, fontWeight: '600', color: '#FF6868' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
  },
  inputInvalid: { borderColor: '#F44336', borderWidth: 1.5 },
  applyButton: { borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  applyText: { fontSize: 12, fontWeight: '700' },
  errorText: { fontSize: 11, color: '#F44336', fontWeight: '600', marginTop: 6 },
});
