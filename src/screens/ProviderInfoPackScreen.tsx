import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  FlatList,
  Animated,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ProviderAccountStackParamList } from '../navigation/types';
import { useProviderDialog } from '../components/ProviderDialog';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<ProviderAccountStackParamList, 'InfoPacks'>;

const LIGHT_P = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197',
  ice: '#FFFFFF', text: '#000000', sub: '#7E6667',
  border: 'rgba(126,102,103,0.14)', iconBg: 'rgba(175,145,151,0.12)',
};
const DARK_P = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197',
  ice: '#FFFFFF', text: '#F0ECE7', sub: '#7E6667',
  border: 'rgba(126,102,103,0.18)', iconBg: 'rgba(175,145,151,0.10)',
};

interface InfoPack {
  id: string;
  title: string;
  service: string;
  content: string;
  createdAt: string;
}


const SERVICE_COLORS: Record<string, { bg: string; text: string; dbg: string }> = {
  HAIR:       { bg: '#FFF0F6', text: '#C2185B', dbg: '#3D0F24' },
  NAILS:      { bg: '#F3E5F5', text: '#7B1FA2', dbg: '#2A0A35' },
  LASHES:     { bg: '#EDE7F6', text: '#512DA8', dbg: '#1C1040' },
  BROWS:      { bg: '#E8EAF6', text: '#3949AB', dbg: '#10153D' },
  MUA:        { bg: '#FCE4EC', text: '#AD1457', dbg: '#380919' },
  AESTHETICS: { bg: '#E0F7FA', text: '#00838F', dbg: '#002B30' },
  GENERAL:    { bg: '#F3F4F6', text: '#6B7280', dbg: '#1F2937' },
};

function serviceColor(s: string) {
  return SERVICE_COLORS[s.toUpperCase()] ?? SERVICE_COLORS['GENERAL']!;
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Pack Card ────────────────────────────────────────────────────────────────

function PackCard({
  pack, dark, P, index, onSend, onDelete,
}: {
  pack: InfoPack; dark: boolean; P: typeof LIGHT_P; index: number;
  onSend: () => void; onDelete: () => void;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    const delay = Math.min(index * 60, 300);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const sc = serviceColor(pack.service);
  const pillBg = dark ? sc.dbg : sc.bg;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[pc.card, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={pc.cardTop}>
          <View style={[pc.servicePill, { backgroundColor: pillBg }]}>
            <Text style={[pc.servicePillText, { color: sc.text }]}>{pack.service}</Text>
          </View>
          <Text style={[pc.date, { color: P.sub }]}>{fmtDate(pack.createdAt)}</Text>
        </View>
        <Text style={[pc.title, { color: P.text }]} numberOfLines={1}>{pack.title}</Text>
        <Text style={[pc.preview, { color: P.sub }]} numberOfLines={2}>{pack.content}</Text>
        <View style={[pc.actions, { borderTopColor: P.border }]}>
          <TouchableOpacity
            style={[pc.actionBtn, { backgroundColor: dark ? 'rgba(255,59,48,0.10)' : 'rgba(255,59,48,0.07)' }]}
            onPress={onDelete} activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={14} color="#FF453A" />
            <Text style={[pc.actionText, { color: '#FF453A' }]}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pc.actionBtn, { flex: 1, backgroundColor: P.iconBg }]}
            onPress={onSend} activeOpacity={0.75}
          >
            <Ionicons name="send-outline" size={14} color={P.accent} />
            <Text style={[pc.actionText, { color: P.accent }]}>Send to client</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const pc = StyleSheet.create({
  card:            { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12, overflow: 'hidden' },
  cardTop:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, marginBottom: 8 },
  servicePill:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  servicePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  date:            { fontSize: 11 },
  title:           { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 16, marginBottom: 6 },
  preview:         { fontSize: 13, lineHeight: 19, paddingHorizontal: 16, marginBottom: 14 },
  actions:         { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, paddingHorizontal: 16 },
  actionText:      { fontSize: 13, fontWeight: '600' },
});

// ─── Send sheet ───────────────────────────────────────────────────────────────

function SendSheet({
  pack, visible, dark, P, onClose,
}: {
  pack: InfoPack | null; visible: boolean; dark: boolean;
  P: typeof LIGHT_P; onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
      ]).start(() => { setEmail(''); setPhone(''); });
    }
  }, [visible]);

  if (!visible && !pack) return null;

  const handleEmail = () => {
    if (!pack || !email.trim()) return;
    const sub2   = encodeURIComponent(`Info Pack: ${pack.title}`);
    const body   = encodeURIComponent(`Hi,\n\n${pack.title}\n\n${pack.content}\n\nThank you for your booking.`);
    Linking.openURL(`mailto:${email.trim()}?subject=${sub2}&body=${body}`);
  };

  const handleSMS = () => {
    if (!pack || !phone.trim()) return;
    const body = encodeURIComponent(`${pack.title}\n\n${pack.content}`);
    const url  = Platform.OS === 'ios' ? `sms:${phone.trim()}&body=${body}` : `sms:${phone.trim()}?body=${body}`;
    Linking.openURL(url);
  };

  return (
    <Animated.View style={[ss.overlay, { opacity: fadeAnim }]} pointerEvents={visible ? 'auto' : 'none'}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[ss.sheet, { backgroundColor: P.card, borderColor: P.border, transform: [{ translateY: slideAnim }] }]}>
          <View style={[ss.handle, { backgroundColor: P.border }]} />
          <Text style={[ss.title, { color: P.text }]}>Send Info Pack</Text>
          {pack && <Text style={[ss.packName, { color: P.sub }]} numberOfLines={1}>{pack.title}</Text>}
          <View style={[ss.inputWrap, { backgroundColor: P.iconBg, borderColor: P.border }]}>
            <Ionicons name="mail-outline" size={16} color={P.sub} />
            <TextInput style={[ss.input, { color: P.text }]} placeholder="Client email" placeholderTextColor={P.sub} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={[ss.inputWrap, { backgroundColor: P.iconBg, borderColor: P.border }]}>
            <Ionicons name="call-outline" size={16} color={P.sub} />
            <TextInput style={[ss.input, { color: P.text }]} placeholder="Client phone" placeholderTextColor={P.sub} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>
          <View style={ss.btnRow}>
            <TouchableOpacity style={[ss.btn, { backgroundColor: P.iconBg }]} activeOpacity={0.78} onPress={handleEmail}>
              <Ionicons name="mail-outline" size={16} color={P.accent} />
              <Text style={[ss.btnText, { color: P.accent }]}>Send via Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ss.btn, { backgroundColor: dark ? 'rgba(48,209,88,0.15)' : 'rgba(48,209,88,0.10)' }]} activeOpacity={0.78} onPress={handleSMS}>
              <Ionicons name="chatbubble-outline" size={16} color="#30D158" />
              <Text style={[ss.btnText, { color: '#30D158' }]}>Send via SMS</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  overlay:  { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)', zIndex: 10 },
  sheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:    { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 },
  packName: { fontSize: 13, marginBottom: 20 },
  inputWrap:{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  input:    { flex: 1, fontSize: 14 },
  btnRow:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  btnText:  { fontSize: 14, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderInfoPackScreen({ navigation }: Props) {
  const { isDarkMode: dark } = useTheme();
  const { user } = useAuth();
  const { showToast, DialogHost } = useProviderDialog();
  const P = dark ? DARK_P : LIGHT_P;

  const [view,       setView]       = useState<'list' | 'create'>('list');
  const [title,      setTitle]      = useState('');
  const [service,    setService]    = useState('');
  const [content,    setContent]    = useState('');
  const [packs,      setPacks]      = useState<InfoPack[]>([]);
  const [sending,    setSending]    = useState<InfoPack | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);

  const resetForm = useCallback(() => { setTitle(''); setService(''); setContent(''); }, []);

  // Load packs from Supabase on mount
  useEffect(() => {
    if (!user?.id) { setIsLoading(false); return; }
    supabase
      .from('info_packs')
      .select('*')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.warn('[InfoPacks] fetch error:', error.message); }
        else setPacks((data ?? []).map(r => ({
          id: r.id,
          title: r.title,
          service: r.service ?? 'GENERAL',
          content: r.content,
          createdAt: (r.created_at as string).split('T')[0]!,
        })));
        setIsLoading(false);
      });
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !content.trim()) { showToast('Please add a title and content.', 'warning'); return; }
    if (!user?.id) return;
    const serviceVal = service.trim().toUpperCase() || 'GENERAL';
    const { data, error } = await supabase
      .from('info_packs')
      .insert({ provider_id: user.id, title: title.trim(), service: serviceVal, content: content.trim() })
      .select()
      .single();
    if (error) { showToast('Could not save info pack.', 'error'); return; }
    const newPack: InfoPack = {
      id: data.id,
      title: data.title,
      service: data.service ?? 'GENERAL',
      content: data.content,
      createdAt: (data.created_at as string).split('T')[0]!,
    };
    setPacks(prev => [newPack, ...prev]);
    resetForm();
    setView('list');
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [title, service, content, user?.id, resetForm, showToast]);

  const handleDelete = useCallback(async (id: string) => {
    setPacks(prev => prev.filter(p => p.id !== id));
    await Promise.resolve(supabase.from('info_packs').delete().eq('id', id)).catch(() => {});
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerY    = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(headerY,    { toValue: 0, tension: 90, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ───────────────────────────────────────── */}
        <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateY: headerY }] }]}>
          <TouchableOpacity
            onPress={() => { if (view === 'create') { resetForm(); setView('list'); } else navigation.goBack(); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
          >
            <Ionicons name={view === 'create' ? 'close' : 'chevron-back'} size={18} color={P.text} />
          </TouchableOpacity>

          <Text style={[s.screenTitle, { color: P.text }]}>
            {view === 'list' ? 'Info Packs' : 'New Pack'}
          </Text>

          {view === 'list' ? (
            <TouchableOpacity onPress={() => setView('create')} style={[s.newBtn, { backgroundColor: P.accent }]} activeOpacity={0.82}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.newBtnText}>New</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSave} style={[s.newBtn, { backgroundColor: '#30D158' }]} activeOpacity={0.82}>
              <Text style={s.newBtnText}>Save</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── List ─────────────────────────────────────────── */}
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={P.accent} />
          </View>
        ) : view === 'list' ? (
          <FlatList
            data={packs}
            keyExtractor={p => p.id}
            contentContainerStyle={[s.listContent, packs.length === 0 && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <PackCard
                pack={item} dark={dark} P={P} index={index}
                onSend={() => setSending(item)}
                onDelete={() => handleDelete(item.id)}
              />
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                  <Ionicons name="document-text-outline" size={36} color={P.sub} />
                </View>
                <Text style={[s.emptyTitle, { color: P.text }]}>No info packs yet</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>Create aftercare guides, prep tips, and more to send clients instantly</Text>
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: P.accent }]} onPress={() => setView('create')} activeOpacity={0.85}>
                  <Text style={s.emptyBtnText}>Create first pack</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ) : (
          /* ── Create form ──────────────────────────────── */
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: P.sub }]}>TITLE</Text>
              <View style={[s.inputWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                <TextInput style={[s.input, { color: P.text }]} placeholder="e.g. Lash Aftercare Guide" placeholderTextColor={P.sub} value={title} onChangeText={setTitle} maxLength={80} />
              </View>

              <Text style={[s.fieldLabel, { color: P.sub }]}>SERVICE</Text>
              <View style={[s.inputWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                <TextInput style={[s.input, { color: P.text }]} placeholder="Hair, Nails, Lashes, MUA…" placeholderTextColor={P.sub} value={service} onChangeText={setService} maxLength={30} />
              </View>

              <Text style={[s.fieldLabel, { color: P.sub }]}>CONTENT</Text>
              <View style={[s.inputWrap, s.textAreaWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                <TextInput style={[s.input, s.textArea, { color: P.text }]} placeholder={'Aftercare instructions, prep tips, what to expect…'} placeholderTextColor={P.sub} value={content} onChangeText={setContent} multiline textAlignVertical="top" />
              </View>

              <TouchableOpacity style={[s.saveBtn, { backgroundColor: P.accent }]} onPress={handleSave} activeOpacity={0.85}>
                <Text style={s.saveBtnText}>Save Info Pack</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>

      <SendSheet
        pack={sending} visible={!!sending} dark={dark} P={P}
        onClose={() => setSending(null)}
      />
      <DialogHost />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  newBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 },

  fieldLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap:   { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  textAreaWrap:{ alignItems: 'flex-start', paddingVertical: 14 },
  input:       { flex: 1, fontSize: 15 },
  textArea:    { minHeight: 140, lineHeight: 22 },

  formContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 20 },
  saveBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingTop: 40 },
  emptyIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySub:    { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22 },
  emptyBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
