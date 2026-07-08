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

const C = {
  bg:      '#2A1820',
  surface: '#3D2230',
  card:    '#46293A',
  accent:  '#5B1E32',
  ice:     '#B7E1DA',
  warn:    '#E8A87C',
  err:     '#E06070',
  sub:     'rgba(183,225,218,0.55)',
  border:  'rgba(183,225,218,0.14)',
};

// ─── Toast ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastProps extends ToastState {}

function Toast({ message, type, visible }: ToastProps) {
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

  const iconColor =
    type === 'success' ? C.ice
    : type === 'error' ? C.err
    : type === 'warning' ? C.warn
    : C.ice;

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
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={toastSt.inner}>
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={toastSt.text}>{message}</Text>
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
    borderWidth: 0.5,
    borderColor: C.border,
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
    backgroundColor: 'rgba(46,26,40,0.85)',
  },
  text: { color: C.ice, fontSize: 14, fontWeight: '600', flex: 1 },
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

function ConfirmDialog({ title, message, buttons, visible, onDismiss }: ConfirmState & { onDismiss: () => void }) {
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
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={dlgSt.content}>
          <View style={dlgSt.handle} />
          <Text style={dlgSt.title}>{title}</Text>
          {!!message && <Text style={dlgSt.message}>{message}</Text>}
          <View style={dlgSt.btnRow}>
            {buttons.map((btn, i) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    dlgSt.btn,
                    isCancel && dlgSt.btnCancel,
                    isDestructive && dlgSt.btnDestructive,
                    !isCancel && !isDestructive && dlgSt.btnDefault,
                  ]}
                  onPress={() => { btn.onPress?.(); onDismiss(); }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      dlgSt.btnText,
                      isCancel && dlgSt.btnTextCancel,
                      isDestructive && dlgSt.btnTextDestructive,
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
    borderColor: C.border,
  },
  content: {
    backgroundColor: 'rgba(46,26,40,0.9)',
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    color: C.ice,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    color: C.sub,
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
    backgroundColor: C.accent,
    borderWidth: 0.5,
    borderColor: C.ice + '30',
  },
  btnCancel: {
    backgroundColor: 'rgba(183,225,218,0.08)',
    borderWidth: 0.5,
    borderColor: C.border,
  },
  btnDestructive: {
    backgroundColor: 'rgba(224,96,112,0.2)',
    borderWidth: 0.5,
    borderColor: C.err + '50',
  },
  btnText: {
    color: C.ice,
    fontSize: 15,
    fontWeight: '700',
  },
  btnTextCancel: {
    color: C.sub,
    fontWeight: '600',
  },
  btnTextDestructive: {
    color: C.err,
  },
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProviderDialog() {
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
      <ConfirmDialog {...confirm} onDismiss={dismissConfirm} />
      <Toast {...toast} />
    </>
  ), [toast, confirm, dismissConfirm]);

  return { showToast, showConfirm, DialogHost };
}
