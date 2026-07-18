import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

// ─── Toast ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

function Toast({ message, type, visible, isDarkMode, accent, text }: ToastState & {
  isDarkMode: boolean;
  accent: string;
  text: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start();
  }, [visible]);

  const iconName: keyof typeof Ionicons.glyphMap =
    type === 'success' ? 'checkmark-circle'
    : type === 'error' ? 'alert-circle'
    : type === 'warning' ? 'warning'
    : 'information-circle';

  const iconColor = type === 'error' ? '#E06070' : type === 'warning' ? '#E8A87C' : accent;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastSt.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[toastSt.inner, { backgroundColor: isDarkMode ? 'rgba(37,34,32,0.88)' : 'rgba(255,255,255,0.9)' }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={[toastSt.text, { color: text }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const toastSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 36,
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(126,102,103,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  text: { fontSize: 14, fontWeight: '600', flex: 1 },
});

// ─── Confirm / Alert Dialog ────────────────────────────────────────────────────

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface ConfirmState {
  title: string;
  message?: string;
  buttons: DialogButton[];
  visible: boolean;
}

function ConfirmDialog({
  title, message, buttons, visible, onDismiss, isDarkMode, accent, text, secondaryText, cardBackground, border,
}: ConfirmState & {
  onDismiss: () => void;
  isDarkMode: boolean;
  accent: string;
  text: string;
  secondaryText: string;
  cardBackground: string;
  border: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <TouchableOpacity style={dlgSt.backdrop} activeOpacity={1} onPress={onDismiss} />
      <Animated.View
        style={[
          dlgSt.sheet,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <BlurView intensity={70} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[dlgSt.content, { backgroundColor: cardBackground }]}>
          <View style={[dlgSt.handle, { backgroundColor: border }]} />
          <Text style={[dlgSt.title, { color: text }]}>{title}</Text>
          {!!message && <Text style={[dlgSt.message, { color: secondaryText }]}>{message}</Text>}
          <View style={dlgSt.btnRow}>
            {buttons.map((btn, i) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    dlgSt.btn,
                    isCancel && [dlgSt.btnCancel, { borderColor: border }],
                    isDestructive && dlgSt.btnDestructive,
                    !isCancel && !isDestructive && { backgroundColor: accent },
                  ]}
                  onPress={() => { btn.onPress?.(); onDismiss(); }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      dlgSt.btnText,
                      isCancel && [dlgSt.btnTextCancel, { color: secondaryText }],
                      isDestructive && dlgSt.btnTextDestructive,
                      !isCancel && !isDestructive && { color: '#fff' },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const dlgSt = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  btnRow: {
    gap: 10,
    marginTop: 4,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: 'rgba(126,102,103,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnDestructive: {
    backgroundColor: 'rgba(224,96,112,0.18)',
    borderWidth: 0.5,
    borderColor: '#E0607050',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnTextCancel: {
    fontWeight: '600',
  },
  btnTextDestructive: {
    color: '#E06070',
  },
});

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Client-facing equivalent of useProviderDialog (src/components/ProviderDialog.tsx).
// Themed via the app's light/dark ThemeContext instead of the provider side's
// fixed palette, since clients shouldn't see provider branding.

export function useAppDialog() {
  const { theme, isDarkMode } = useTheme();
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });
  const [confirm, setConfirm] = useState<ConfirmState>({ title: '', message: '', buttons: [], visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  }, []);

  const showConfirm = useCallback((title: string, message: string | undefined, buttons: DialogButton[]) => {
    setConfirm({ title, ...(message !== undefined ? { message } : {}), buttons, visible: true });
  }, []);

  /** Drop-in replacement for a single-button Alert.alert(title, message) */
  const showAlert = useCallback((title: string, message?: string) => {
    setConfirm({ title, ...(message !== undefined ? { message } : {}), buttons: [{ text: 'OK' }], visible: true });
  }, []);

  const dismissConfirm = useCallback(() => {
    setConfirm(prev => ({ ...prev, visible: false }));
  }, []);

  const DialogHost = useCallback(() => (
    <>
      <ConfirmDialog
        {...confirm}
        onDismiss={dismissConfirm}
        isDarkMode={isDarkMode}
        accent={theme.accent}
        text={theme.text}
        secondaryText={theme.secondaryText}
        cardBackground={theme.cardBackground}
        border={theme.border}
      />
      <Toast {...toast} isDarkMode={isDarkMode} accent={theme.accent} text={theme.text} />
    </>
  ), [toast, confirm, dismissConfirm, isDarkMode, theme]);

  return { showToast, showAlert, showConfirm, DialogHost };
}
