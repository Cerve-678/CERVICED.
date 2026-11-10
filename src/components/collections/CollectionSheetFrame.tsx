import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';

interface CollectionSheetFrameProps {
  visible: boolean;
  title: string;
  subtitle?: string | undefined;
  onClose: () => void;
  children: React.ReactNode;
}

/** The bottom sheet both collection sheets share: scrim, handle, title. */
export function CollectionSheetFrame({ visible, title, subtitle, onClose, children }: CollectionSheetFrameProps) {
  const { palette: P } = useTheme();
  const bottomInset = useSystemBottomInset();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: P.bg, paddingBottom: bottomInset + 16 }]}>
          <View style={[styles.handle, { backgroundColor: P.border }]} />
          <Text style={[styles.title, { color: P.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: P.sub }]}>{subtitle}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,10,16,0.35)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  title: { fontFamily: 'JosefinSans-Bold', fontSize: 22 },
  subtitle: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 2,
    marginBottom: 14,
  },
});
