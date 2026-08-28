// src/components/AddOnPickerModal.tsx
// Popup for choosing a single service's add-ons — shown the moment a client
// checks a service (with add-ons) into a multi-service selection on
// ProviderProfileScreen, and reused inside MultiBookingSheet as the way to
// edit an already-made pick without leaving the sheet. Multi-select inside,
// "Done" commits the picks. Same overlay/sheet sizing as BookingSheet and
// MultiBookingSheet (flex: 1, marginTop: 100) so every booking-flow modal
// reads as the same size of thing, not a small popup among full sheets.
//
// `asOverlay` controls whether this wraps itself in a native RN <Modal> or
// renders as a plain absolutely-positioned View. React Native doesn't
// reliably support one Modal opening on top of another (same issue as the
// image viewer / "All Services" sheet elsewhere in this app — see
// ProviderProfileScreen's renderServiceCategoryBlock comment) — on Android
// especially, the second Modal can render behind or eat no touches at all.
// MultiBookingSheet is always already inside its own open Modal, so it
// always passes asOverlay. ProviderProfileScreen's own call site isn't
// nested (or closes the "All Services" sheet first via onBeforeAction), so
// it renders as a real Modal.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { isDarkColor } from '../constants/providerThemes';

export interface AddOnPickerAddOn {
  id: string | number;
  name: string;
  price: number;
  description?: string;
}

export interface AddOnPickerResult {
  id: string | number;
  name: string;
  price: number;
}

interface AddOnPickerModalProps {
  visible: boolean;
  serviceName: string;
  addOns: AddOnPickerAddOn[];
  /** Already-chosen add-ons for this service, if reopening an edit. */
  initialSelected: AddOnPickerResult[];
  accentColor: string;
  tokens: { text: string; sub: string; border: string; surface: string; bg: string };
  onDone: (selected: AddOnPickerResult[]) => void;
  /** Render as a plain overlay View instead of a native Modal — required
   *  whenever the caller is already inside its own open Modal (see file
   *  header comment). Defaults to false (a real Modal), the right choice
   *  for a top-level call site. */
  asOverlay?: boolean;
}

export const AddOnPickerModal: React.FC<AddOnPickerModalProps> = ({
  visible,
  serviceName,
  addOns,
  initialSelected,
  accentColor,
  tokens,
  onDone,
  asOverlay = false,
}) => {
  const [selected, setSelected] = useState<AddOnPickerResult[]>(initialSelected);
  // Text/icons on a solid accentColor fill (close button, checkmark, Done
  // button) can't assume white — a pale accent (e.g. client dark-mode
  // blue-grey #E5ECF4) makes hardcoded white text unreadable. Same fix as
  // BookingSheet/MultiBookingSheet's onAccentColor.
  const onAccentColor = isDarkColor(accentColor) ? '#fff' : '#1B2740';

  // Re-seed every time the popup opens for a (possibly different) service —
  // it's a fresh instance's worth of state per open, not a persistent editor.
  useEffect(() => {
    if (visible) setSelected(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, serviceName]);

  const toggle = (addOn: AddOnPickerAddOn) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(prev => {
      const exists = prev.some(a => a.id === addOn.id);
      return exists
        ? prev.filter(a => a.id !== addOn.id)
        : [...prev, { id: addOn.id, name: addOn.name, price: addOn.price }];
    });
  };

  const total = selected.reduce((sum, a) => sum + a.price, 0);

  const content = (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { backgroundColor: tokens.bg }]}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.header, { borderBottomColor: tokens.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: tokens.text }]} numberOfLines={1}>Add-ons</Text>
              <Text style={[styles.headerSubtitle, { color: tokens.sub }]} numberOfLines={1}>{serviceName}</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: accentColor }]}
              onPress={() => onDone(selected)}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeButtonText, { color: onAccentColor }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {addOns.map(addOn => {
              const isSelected = selected.some(a => a.id === addOn.id);
              return (
                <TouchableOpacity
                  key={addOn.id}
                  style={[
                    styles.addOnCard,
                    { borderColor: isSelected ? accentColor : tokens.border, backgroundColor: tokens.surface },
                    isSelected && { borderWidth: 2 },
                  ]}
                  onPress={() => toggle(addOn)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addOnName, { color: tokens.text }]}>{addOn.name}</Text>
                    {!!addOn.description && (
                      <Text style={[styles.addOnDescription, { color: tokens.sub }]}>{addOn.description}</Text>
                    )}
                  </View>
                  <Text style={[styles.addOnPrice, { color: accentColor }]}>+£{addOn.price}</Text>
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: tokens.border },
                      isSelected && { backgroundColor: accentColor, borderColor: accentColor },
                    ]}
                  >
                    {isSelected && <Text style={[styles.checkmark, { color: onAccentColor }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: tokens.border, backgroundColor: tokens.bg }]}>
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: accentColor }]}
              onPress={() => onDone(selected)}
              activeOpacity={0.8}
            >
              <Text style={[styles.doneButtonText, { color: onAccentColor }]}>
                {selected.length > 0 ? `Done • +£${total.toFixed(2)}` : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );

  if (asOverlay) {
    if (!visible) return null;
    return <View style={StyleSheet.absoluteFillObject}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onDone(selected)}>
      {content}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { flex: 1, marginTop: 100, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  headerSubtitle: { fontSize: 13, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 15, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20 },
  bodyContent: { paddingTop: 16, paddingBottom: 24 },
  addOnCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10,
  },
  addOnName: { fontSize: 14, fontWeight: '600' },
  addOnDescription: { fontSize: 12, marginTop: 2 },
  addOnPrice: { fontSize: 13, fontWeight: '700', marginRight: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 12, fontWeight: '700' },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  doneButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  doneButtonText: { fontSize: 15, fontWeight: '700' },
});
