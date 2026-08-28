/**
 * Edit one service — name, price, duration, description.
 *
 * Deliberately narrow. The fuller service editor in InfoRegScreen still owns
 * safety flags, tags, buffers, add-ons and photos; this is the set a provider
 * changes week to week, opened from the My Services manager without reposting
 * their whole catalogue.
 *
 * Themed from the provider's own palette (passed in), like every other card on
 * that screen, rather than the app's light/dark tokens.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { MyServiceDraft } from '../../services/databaseService';

export interface ServiceEditorPalette {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export interface ServiceEditorValue {
  name: string;
  price: string;
  duration: string;
  description: string;
}

/** What a service row looks like coming in. Strings, because that's what the
 *  inputs hold — the numeric parse happens once, on save. */
export function toEditorValue(service: {
  name: string;
  price: number;
  duration_minutes: number;
  description: string | null;
}): ServiceEditorValue {
  return {
    name: service.name,
    price: String(service.price ?? ''),
    duration: String(service.duration_minutes ?? ''),
    description: service.description ?? '',
  };
}

export const EMPTY_SERVICE_VALUE: ServiceEditorValue = {
  name: '',
  price: '',
  duration: '',
  description: '',
};

/** Null when the value is usable; otherwise the reason, phrased for the
 *  provider rather than for the column that would reject it. */
function validateServiceValue(value: ServiceEditorValue): string | null {
  if (!value.name.trim()) return 'Give the service a name.';
  const price = Number(value.price);
  if (!Number.isFinite(price) || price < 0) return 'Enter a price, or 0 if it varies.';
  const duration = Number(value.duration);
  // A zero-length service is what made bookings look like they occupied no
  // time at all and never clash with anything — see the schedule-issues work.
  if (!Number.isInteger(duration) || duration <= 0) {
    return 'Enter how many minutes it takes.';
  }
  return null;
}

function toDraft(value: ServiceEditorValue): MyServiceDraft {
  return {
    name: value.name.trim(),
    price: Number(value.price),
    durationMinutes: Number(value.duration),
    description: value.description.trim() || null,
  };
}

export default function ServiceEditorSheet({
  visible,
  initial,
  categoryName,
  isNew,
  saving,
  palette,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: ServiceEditorValue;
  categoryName: string;
  isNew: boolean;
  saving: boolean;
  palette: ServiceEditorPalette;
  onSave: (draft: MyServiceDraft) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<ServiceEditorValue>(initial);
  const [error, setError] = useState<string | null>(null);

  // Reseed every time the sheet opens. Without this the second service you
  // tapped would open showing the first one's values.
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
    }
  }, [visible, initial]);

  const handleSave = useCallback(() => {
    const problem = validateServiceValue(value);
    if (problem) {
      setError(problem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setError(null);
    onSave(toDraft(value));
  }, [value, onSave]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { backgroundColor: palette.bg }]}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: palette.sub }]}>
                {categoryName.toUpperCase()}
              </Text>
              <Text style={[styles.title, { color: palette.text }]}>
                {isNew ? 'New service' : 'Edit service'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={palette.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
            <Text style={[styles.label, { color: palette.sub }]}>NAME</Text>
            <TextInput
              value={value.name}
              onChangeText={name => setValue(v => ({ ...v, name }))}
              placeholder="e.g. Gel Overlay"
              placeholderTextColor={palette.sub}
              style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
            />

            <View style={styles.pairRow}>
              <View style={styles.pairItem}>
                <Text style={[styles.label, { color: palette.sub }]}>PRICE (£)</Text>
                <TextInput
                  value={value.price}
                  onChangeText={price => setValue(v => ({ ...v, price }))}
                  keyboardType="decimal-pad"
                  placeholder="35"
                  placeholderTextColor={palette.sub}
                  style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
                />
              </View>
              <View style={styles.pairItem}>
                <Text style={[styles.label, { color: palette.sub }]}>MINUTES</Text>
                <TextInput
                  value={value.duration}
                  onChangeText={duration => setValue(v => ({ ...v, duration }))}
                  keyboardType="number-pad"
                  placeholder="45"
                  placeholderTextColor={palette.sub}
                  style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: palette.sub }]}>DESCRIPTION</Text>
            <TextInput
              value={value.description}
              onChangeText={description => setValue(v => ({ ...v, description }))}
              placeholder="What's included, what to expect"
              placeholderTextColor={palette.sub}
              multiline
              style={[
                styles.input,
                styles.inputMultiline,
                { color: palette.text, backgroundColor: palette.card, borderColor: palette.border },
              ]}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={[styles.footnote, { color: palette.sub }]}>
              Photos, add-ons and safety details are edited with the rest of your
              profile.
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: palette.accent, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving…' : isNew ? 'Add service' : 'Save changes'}
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(126,102,103,0.35)',
    marginTop: 10,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
  },
  body: {
    flexGrow: 0,
  },
  label: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  pairRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pairItem: {
    flex: 1,
  },
  error: {
    color: '#FF453A',
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 12,
  },
  footnote: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 16,
  },
  saveButton: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  saveButtonText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#FFFFFF',
    fontSize: 15,
  },
});
