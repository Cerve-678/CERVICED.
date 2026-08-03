// src/screens/ProfileInfoScreen.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';

export default function ProfileInfoScreen({ navigation }: any) {
  const { user, updateUser, deleteClientProfile } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    },
  ];

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await updateUser({ name: name.trim(), phone: phone.trim() });
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    navigation.goBack();
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
              Alert.alert('Error', err?.message || 'Could not delete your account. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: theme.text }]}>Profile Info</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>Update your personal details</Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.secondaryText }]}>EMAIL</Text>
            <View
              style={[
                inputStyle,
                styles.lockedRow,
                { borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' },
              ]}
            >
              <Text style={[styles.lockedText, { color: theme.text }]}>{user?.email}</Text>
            </View>
            <Text style={[styles.emailHint, { color: theme.secondaryText }]}>Your account sign-in email. To change this, contact support.</Text>
          </View>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.secondaryText }]}>YOUR NAME</Text>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="Sarah Johnson"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.secondaryText }]}>PHONE NUMBER</Text>
            <TextInput
              style={inputStyle}
              value={phone}
              onChangeText={setPhone}
              placeholder="+44 7700 900000"
              placeholderTextColor={theme.secondaryText}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: (isDarkMode ? '#AF9197' : '#5C4033') }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
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
      </KeyboardAvoidingView>
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
