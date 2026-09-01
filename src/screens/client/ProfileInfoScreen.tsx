// src/screens/ProfileInfoScreen.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import AddressPicker from '../../components/AddressPicker';
import AreaPicker from '../../components/AreaPicker';
import { updateUserDob } from '../../services/databaseService';
import { dateToYMD, formatShortDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import { BOTTOM_SAFE_GAP } from '../../utils/bottomSafeGap';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';

// Must be at least 16 to have an account (see validateDob in utils/validation.ts) —
// encoded as the picker's maximumDate so the UI can't select an invalid date at all.
const MAX_DOB = new Date();
MAX_DOB.setFullYear(MAX_DOB.getFullYear() - 16);
const MIN_DOB = new Date(1900, 0, 1);

export default function ProfileInfoScreen({ navigation, route }: any) {
  const { user, updateUser, deleteClientProfile } = useAuth();
  const { theme, isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  // users.dob is a Postgres `date` column — stored/loaded as an ISO
  // "YYYY-MM-DD" string, parsed to a Date only for the picker/display.
  const [dob, setDob] = useState<Date | null>(user?.dob ? new Date(user.dob) : null);
  // Where a mobile provider travels to. Lives here rather than being typed
  // into the checkout sheet so it's entered once, through the same geocoded
  // AddressPicker providers use, instead of as free text under time pressure
  // at the point of paying.
  const [clientAddress, setClientAddress] = useState(user?.clientAddress ?? '');
  const [clientArea, setClientArea] = useState(user?.clientArea ?? '');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const inputStyle = [
    styles.input,
    {
      color: P.text,
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderColor: P.border,
    },
  ];

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await Promise.all([
        updateUser({ name: name.trim(), phone: phone.trim(), clientAddress: clientAddress.trim() || null, clientArea: clientArea.trim() || null }),
        user?.id ? updateUserDob(user.id, dob ? dateToYMD(dob) : null) : Promise.resolve(),
      ]);
    } catch {
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Error', 'Couldn\'t save your changes. Please try again.');
      return;
    }
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Checkout sends the client here to set an address mid-booking, and
    // passes the tab it came from. Saving hops straight back to it, where the
    // cart is still mounted and reopens Confirm Your Details — goBack() would
    // land on ProfileMain and strand them a tab away from the checkout they
    // were in the middle of.
    const returnToTab: string | undefined = route?.params?.returnToTab;
    if (returnToTab) navigation.getParent()?.navigate(returnToTab);
    else navigation.goBack();
  };

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // A dual-role account still has `accountType === 'provider'` even while
    // browsing in client mode — this button only ever removes the client
    // side, so the copy (and what actually happens) differs accordingly.
    const isDualRole = user?.accountType === 'provider';
    Alert.alert(
      'Delete Account',
      isDualRole
        ? 'This removes your client profile, bookings and messages as a customer. Your provider/business account is not affected and you\'ll remain signed in.'
        : 'You\'ll be signed out immediately and your account will be permanently deleted in 30 days. Log back in before then to reactivate it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteClientProfile();
              // Success: if this was the user's only hat, AuthContext clears
              // the session and the navigator switches to the auth screens,
              // unmounting this component. Otherwise it drops them into
              // provider mode and this screen unmounts the same way.
            } catch (err: any) {
              setDeletingAccount(false);
              Alert.alert('Account not deleted', toUserMessage(err, 'Your account is still here — please try again.', 'ProfileInfoScreen.deleteProfile'));
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardDismissView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: P.text }]}>Account</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>Update your personal details</Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>EMAIL</Text>
            <View
              style={[
                inputStyle,
                styles.lockedRow,
                { borderColor: P.border },
              ]}
            >
              <Text style={[styles.lockedText, { color: P.text }]}>{user?.email}</Text>
            </View>
            <Text style={[styles.emailHint, { color: P.sub }]}>Your account sign-in email. To change this, contact support.</Text>
          </View>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>YOUR NAME</Text>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="Sarah Johnson"
              placeholderTextColor={P.sub}
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>PHONE NUMBER</Text>
            <TextInput
              style={inputStyle}
              value={phone}
              onChangeText={setPhone}
              placeholder="+44 7700 900000"
              placeholderTextColor={P.sub}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>

          {/* Your address — used only when a mobile provider travels to you.
              Geocoded through AddressPicker rather than typed free-text, so
              what's stored is a real, resolvable address. */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>YOUR ADDRESS</Text>
            <AddressPicker
              value={clientAddress}
              onChange={selection => setClientAddress(selection.address)}
              accentColor={P.accent}
            />
            <Text style={[styles.emailHint, { color: P.sub }]}>
              Only shared with a provider who travels to you, and only once your booking is confirmed.
            </Text>
          </View>

          {/* Your area — the coarse half of the same question the address asks.
              A mobile provider sees this the moment a request arrives, so they
              can judge the travel before accepting; the street address above
              stays hidden until they do. Kept as its own field rather than
              derived from the address, because most addresses people type
              carry no postcode to derive it from. */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>YOUR AREA</Text>
            <AreaPicker
              value={clientArea}
              onChange={setClientArea}
              accentColor={P.accent}
            />
            <Text style={[styles.emailHint, { color: P.sub }]}>
              Shared with a provider who travels to you as soon as they get your request, so they can check the distance before accepting.
            </Text>
          </View>

          {/* Date of birth */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>DATE OF BIRTH</Text>
            <TouchableOpacity
              style={[inputStyle, styles.dobRow]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowDobPicker(true); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dobText, { color: dob ? P.text : P.sub }]}>
                {dob ? formatShortDate(dob) : 'DD/MM/YYYY'}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={P.sub} />
            </TouchableOpacity>
          </View>

          {/* Android's native dialog renders as an OS overlay with no wrapper
              needed. iOS's inline "default" picker doesn't — it renders into
              the surrounding layout in place, so it needs the modal sheet
              wrapper (matches RescheduleScreen/ProviderClienteleScreen). */}
          {showDobPicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={dob ?? MAX_DOB}
              mode="date"
              display="default"
              maximumDate={MAX_DOB}
              minimumDate={MIN_DOB}
              onChange={(_, date) => {
                setShowDobPicker(false);
                if (date) setDob(date);
              }}
            />
          )}
          {showDobPicker && Platform.OS === 'ios' && (
            <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" visible onRequestClose={() => setShowDobPicker(false)}>
              <View style={styles.pickerModalWrap}>
                <TouchableOpacity style={styles.pickerDismiss} activeOpacity={1} onPress={() => setShowDobPicker(false)} />
                <View style={[styles.pickerSheet, { backgroundColor: P.card }]}>
                  <View style={[styles.pickerHeader, { borderBottomColor: P.border }]}>
                    <Text style={[styles.pickerHeaderLabel, { color: P.text }]}>Date of Birth</Text>
                    <TouchableOpacity onPress={() => setShowDobPicker(false)}>
                      <Text style={[styles.pickerDoneLabel, { color: P.accent }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={dob ?? MAX_DOB}
                    mode="date"
                    display="spinner"
                    maximumDate={MAX_DOB}
                    minimumDate={MIN_DOB}
                    themeVariant={isDarkMode ? 'dark' : 'light'}
                    textColor={P.text}
                    style={{ width: '100%' }}
                    onChange={(_, date) => { if (date) setDob(date); }}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: P.accent }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={P.onAccent} />
              : <Text style={[styles.saveBtnText, { color: P.onAccent }]}>SAVE CHANGES</Text>
            }
          </TouchableOpacity>

          {/* Delete account */}
          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.7}
          >
            {deletingAccount
              ? <ActivityIndicator color="#c0392b" />
              : <Text style={styles.deleteAccountText}>Delete Account</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardDismissView>
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
  fieldGroup: { marginBottom: 20 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  emailHint: { fontSize: 11, marginTop: 6, opacity: 0.6 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center', opacity: 0.7 },
  lockedText: { flex: 1, fontSize: 15 },
  dobRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dobText: { fontSize: 15 },
  pickerModalWrap: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: BOTTOM_SAFE_GAP },
  pickerDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 20 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerHeaderLabel: { fontSize: 15, fontWeight: '600' },
  pickerDoneLabel: { fontSize: 15, fontWeight: '700' },
  saveBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: 1, color: '#fff' },
  deleteAccountBtn: { alignSelf: 'center', marginTop: 20, paddingVertical: 10, paddingHorizontal: 16 },
  deleteAccountText: { fontSize: 13, fontWeight: '600', color: '#c0392b' },
});
