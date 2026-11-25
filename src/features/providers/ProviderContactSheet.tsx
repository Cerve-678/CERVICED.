/**
 * The sheet of ways to reach a provider. The app opens it from Get In Touch on
 * your own profile (where in-app chat isn't possible); the website opens it
 * from Get In Touch for every visitor. Themed with the provider's own palette.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ProviderContactOption } from './contactOptions';
import { readableSheet } from '../../constants/readableWidth';

export interface ProviderContactSheetColors {
  surface: string;
  card: string;
  border: string;
  text: string;
  sub: string;
}

export function ProviderContactSheet({
  visible,
  onClose,
  title,
  subtitle,
  emptyText,
  options,
  onPick,
  note,
  colors,
  maxWidth,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  /** Shown instead of the list when there's nothing to offer. */
  emptyText: string;
  options: readonly ProviderContactOption[];
  onPick: (option: ProviderContactOption) => void;
  /** A line under the list, e.g. what happened after a tap. */
  note?: string | null;
  colors: ProviderContactSheetColors;
  /** The website caps the page at a phone's width; the sheet matches it. */
  maxWidth?: number;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }, maxWidth ? { width: '100%', maxWidth, alignSelf: 'center' } : null]}
          onPress={e => e.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.sub, { color: colors.sub }]}>{subtitle}</Text>

          {options.length === 0 ? (
            <Text style={[styles.empty, { color: colors.sub }]}>{emptyText}</Text>
          ) : (
            <View style={styles.list}>
              {options.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.75}
                  onPress={() => onPick(option)}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label}, ${option.detail}`}
                >
                  <View style={[styles.optionIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name={option.icon} size={17} color={colors.text} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.optionDetail, { color: colors.sub }]} numberOfLines={1}>
                      {option.detail}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.sub} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {note ? <Text style={[styles.note, { color: colors.sub }]}>{note}</Text> : null}

          <TouchableOpacity
            style={[styles.close, { borderColor: colors.border }]}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Text style={[styles.closeText, { color: colors.text }]}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: { ...readableSheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 4,
  },
  sub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  empty: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  list: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 14,
  },
  optionDetail: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    marginTop: 1,
  },
  note: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  close: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
