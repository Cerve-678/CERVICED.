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
import { FLOATING_TAB_BAR_CLEARANCE } from './IslandPillTabBar';
import { useTheme } from '../contexts/ThemeContext';

// This file used to carry its own palette — a plum/maroon ground (#2A1820,
// #5B1E32) with MINT text (#B7E1DA) — hardcoded, and read by ten provider
// screens. It matched nothing else in the product and, being fixed, drew a
// dark plum sheet over a cream screen in light mode. It now reads the app
// palette through useTheme, exactly as AppDialog (its client-side twin)
// already did; the two files are deliberately near-identical in shape so the
// next change to one is obvious to make in the other.
//
// Colours are threaded in as props rather than read by useTheme inside each
// component, because Toast and ConfirmDialog are module-level functions that
// StyleSheet.create's static styles are built against — same split AppDialog
// uses: layout stays static, colour goes inline.

// Semantic colours that are not in the palette because they mean the same
// thing in every theme.
const WARN = '#E8A87C';
const ERR  = '#E06070';

// DESIGN_SYSTEM.md: two fonts only. This file set neither, so every string in
// it fell back to the OS font while the screen behind it used BakbakOne/Jura.
const FONT_HEAD = 'BakbakOne-Regular';
const FONT_BODY = 'Jura-VariableFont_wght';

// ─── Toast ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

type ToastProps = ToastState & {
  isDarkMode: boolean;
  text: string;
  border: string;
};

function Toast({ message, type, visible, isDarkMode, text, border }: ToastProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start();
  }, [anim, visible]);

  const iconName: keyof typeof Ionicons.glyphMap =
    type === 'success' ? 'checkmark-circle'
    : type === 'error' ? 'alert-circle'
    : type === 'warning' ? 'warning'
    : 'information-circle';

  const iconColor =
    type === 'success' ? text
    : type === 'error' ? ERR
    : type === 'warning' ? WARN
    : text;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastSt.wrap,
        {
          borderColor: border,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      {/* Translucent, not palette.card — the fill sits ON the BlurView above
          it, and a solid one would make the blur invisible. Same two values
          AppDialog's toast uses. */}
      <View
        style={[
          toastSt.inner,
          { backgroundColor: isDarkMode ? 'rgba(37,34,32,0.88)' : 'rgba(255,255,255,0.9)' },
        ]}
      >
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={[toastSt.text, { color: text }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const toastSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    // FLOATING_TAB_BAR_CLEARANCE, not a plain safe-area inset — every screen
    // using this toast sits under IslandPillTabBar's floating pill (it's the
    // Tab.Navigator's `tabBar`, rendered over every nested stack screen), so
    // a bare 36px let the pill overlap/obscure the confirmation.
    bottom: FLOATING_TAB_BAR_CLEARANCE,
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  text: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '600', flex: 1 },
});

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

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
  title, message, buttons, visible, onDismiss,
  isDarkMode, accent, onAccent, text, sub, card, border,
}: ConfirmState & {
  onDismiss: () => void;
  isDarkMode: boolean;
  accent: string;
  onAccent: string;
  text: string;
  sub: string;
  card: string;
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
  }, [anim, visible]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onDismiss}>
      <TouchableOpacity style={dlgSt.backdrop} activeOpacity={1} onPress={onDismiss} />
      <Animated.View
        style={[
          dlgSt.sheet,
          {
            borderColor: border,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <BlurView intensity={70} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[dlgSt.content, { backgroundColor: card }]}>
          <View style={[dlgSt.handle, { backgroundColor: border }]} />
          <Text style={[dlgSt.title, { color: text }]}>{title}</Text>
          {!!message && <Text style={[dlgSt.message, { color: sub }]}>{message}</Text>}
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
                    !isCancel && !isDestructive && [dlgSt.btnDefault, { backgroundColor: accent }],
                  ]}
                  onPress={() => { btn.onPress?.(); onDismiss(); }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      dlgSt.btnText,
                      isCancel && [dlgSt.btnTextCancel, { color: sub }],
                      isDestructive && dlgSt.btnTextDestructive,
                      !isCancel && !isDestructive && { color: onAccent },
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 0.5,
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
    fontFamily: FONT_HEAD,
    fontSize: 17,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    fontFamily: FONT_BODY,
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
  btnDefault: {
    borderWidth: 0.5,
    // Transparent, not a light tint: the fill underneath is the accent, and a
    // pale hairline over it is the same hairline in both themes.
    borderColor: 'rgba(255,255,255,0.19)',
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 0.5,
  },
  btnDestructive: {
    backgroundColor: 'rgba(224,96,112,0.2)',
    borderWidth: 0.5,
    borderColor: ERR + '50',
  },
  btnText: {
    fontFamily: FONT_HEAD,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  btnTextCancel: {
    fontFamily: FONT_BODY,
    fontWeight: '600',
  },
  btnTextDestructive: {
    color: ERR,
  },
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProviderDialog() {
  // palette follows the active hat, so a provider gets the provider palette
  // and the light/dark choice they actually made — the two things the old
  // hardcoded plum ignored.
  const { palette, isDarkMode } = useTheme();
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

  const dismissConfirm = useCallback(() => {
    setConfirm(prev => ({ ...prev, visible: false }));
  }, []);

  const DialogHost = useCallback(() => (
    <>
      <ConfirmDialog
        {...confirm}
        onDismiss={dismissConfirm}
        isDarkMode={isDarkMode}
        accent={palette.accent}
        onAccent={palette.onAccent}
        text={palette.text}
        sub={palette.sub}
        card={palette.card}
        border={palette.border}
      />
      <Toast
        {...toast}
        isDarkMode={isDarkMode}
        text={palette.text}
        border={palette.border}
      />
    </>
  ), [toast, confirm, dismissConfirm, isDarkMode, palette]);

  return { showToast, showConfirm, DialogHost };
}
