import React, { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { getUserBasicInfo, updateUserNamePhone, updateUserDob } from '../services/databaseService';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const CP_DARK = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', ice: '#FFFFFF', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(255,255,255,0.08)',
};
const CP_LIGHT = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', ice: '#FFFFFF', text: '#1C1A18',
  sub: '#8A8680', border: 'rgba(0,0,0,0.08)',
};

export default function ProviderAccountInfoScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  const { updateUser } = useAuth();

  const [userId, setUserId]         = useState<string | null>(null);
  const [authEmail, setAuthEmail]   = useState('');
  const [name, setName]             = useState('');
  const [phone, setPhone]           = useState('');
  const [dob, setDob]               = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        setAuthEmail(user.email ?? '');
        const data = await getUserBasicInfo(user.id);
        if (data) {
          setName(data.name ?? '');
          setPhone(data.phone ?? '');
          setDob(data.dob ?? '');
        }
        if (providerData) {
          setBusinessName(providerData.display_name ?? '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Full name is required'); return; }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (userId) {
        await Promise.all([
          updateUserNamePhone(userId, name.trim(), phone.trim() || ''),
          updateUserDob(userId, dob.trim() || null),
        ]);
        // Refresh in-memory user so Settings displayName updates immediately
        await updateUser({ name: name.trim(), phone: phone.trim() });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not save changes', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = [styles.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }];
  const labelStyle = [styles.label, { color: C.sub }];

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <Text style={[styles.headerTitle, { color: C.text }]}>Account Info</Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: C.surface }]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Business Name */}
            {!!businessName && (
              <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.cardTitle, { color: C.text }]}>Business Name</Text>
                <Text style={[styles.cardSub, { color: C.sub }]}>Your public provider name. Edit in My Profile.</Text>
                <View style={[styles.lockedRow, { backgroundColor: C.card, borderColor: C.border, marginTop: 10 }]}>
                  <Text style={[styles.lockedText, { color: C.text }]}>{businessName}</Text>
                  <Ionicons name="storefront-outline" size={14} color={C.sub} />
                </View>
              </View>
            )}

            {/* Personal Details */}
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Personal Details</Text>
              <Text style={[styles.cardSub, { color: C.sub }]}>Your sign-up details. Never shown publicly.</Text>

              <Text style={labelStyle}>FULL NAME</Text>
              <TextInput
                style={inputStyle}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor={C.sub}
                autoCapitalize="words"
              />

              <Text style={[labelStyle, { marginTop: 14 }]}>PHONE</Text>
              <TextInput
                style={inputStyle}
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 07700 900000"
                placeholderTextColor={C.sub}
                keyboardType="phone-pad"
              />

              <Text style={[labelStyle, { marginTop: 14 }]}>DATE OF BIRTH</Text>
              <TextInput
                style={inputStyle}
                value={dob}
                onChangeText={setDob}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={C.sub}
              />
            </View>

            {/* Login Email */}
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Login Email</Text>
              <Text style={[styles.cardSub, { color: C.sub }]}>Your account sign-in email. To change this, contact support.</Text>
              <View style={[styles.lockedRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.lockedText, { color: C.text }]}>{authEmail}</Text>
                <Ionicons name="lock-closed-outline" size={14} color={C.sub} />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: C.accent }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={C.ice} size="small" />
                : <Text style={[styles.saveTxt, { color: C.ice }]}>Save Changes</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 },

  card:      { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardSub:   { fontSize: 12, lineHeight: 17, marginBottom: 16 },

  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },

  lockedRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 13, opacity: 0.7 },
  lockedText: { flex: 1, fontSize: 15 },

  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6, marginBottom: 8 },
  saveTxt: { fontSize: 15, fontWeight: '700' },
});
