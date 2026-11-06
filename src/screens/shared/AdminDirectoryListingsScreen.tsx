import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { addAdminDirectoryListingPortfolio, deleteAdminDirectoryListing, deleteAdminDirectoryListingPortfolio, getAdminDirectoryListingPortfolio, getAdminDirectoryListings, saveAdminDirectoryListing, setAdminDirectoryListingVisibility, type AdminDirectoryListing, type AdminDirectoryPortfolioItem } from '../../services/databaseService';
import { uploadToStorage } from '../../services/providerRegistrationService';
import { LogoCardFramer } from '../../features/provider-registration/LogoCardFramer';
import type { LogoCardFrame, LogoCardSlot, LogoFraming } from '../../types/database';

const CATEGORIES = ['HAIR', 'NAILS', 'MUA', 'AESTHETICS', 'BROWS', 'LASHES'];

export default function AdminDirectoryListingsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AdminDirectoryListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AdminDirectoryListing | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('HAIR');
  const [location, setLocation] = useState('');
  const [bookingLink, setBookingLink] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoFraming, setLogoFraming] = useState<LogoFraming | null>(null);
  const [framingSlot, setFramingSlot] = useState<LogoCardSlot | null>(null);
  const [logoImageRatio, setLogoImageRatio] = useState(1);
  const [portfolio, setPortfolio] = useState<AdminDirectoryPortfolioItem[]>([]);
  const [portfolioUploading, setPortfolioUploading] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getAdminDirectoryListings()); }
    catch { Alert.alert('Could not load listings', 'Check your admin access and try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setEditing(null); setName(''); setCategory('HAIR'); setLocation(''); setBookingLink(''); setInstagram(''); setWebsite(''); setLogoUri(null); setLogoFraming(null); setPortfolio([]);
  };
  const beginEdit = (item: AdminDirectoryListing) => {
    setEditing(item); setName(item.display_name); setCategory(item.service_category); setLocation(item.location_text ?? '');
    setBookingLink(item.external_booking_url); setInstagram(item.instagram ?? ''); setWebsite(item.website ?? ''); setLogoUri(item.logo_url); setLogoFraming(item.logo_framing);
    void getAdminDirectoryListingPortfolio(item.id).then(setPortfolio).catch(() => Alert.alert('Could not load portfolio', 'Please try again.'));
  };
  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Allow photo library access to add a logo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!result.canceled) { setLogoUri(result.assets[0]?.uri ?? null); setLogoFraming(null); }
  };
  const frameLogo = (slot: LogoCardSlot) => {
    if (!logoUri) return;
    Image.getSize(logoUri, (width, height) => { setLogoImageRatio(width > 0 && height > 0 ? width / height : 1); setFramingSlot(slot); }, () => { setLogoImageRatio(1); setFramingSlot(slot); });
  };
  const onLogoFramed = (slot: LogoCardSlot, frame: LogoCardFrame) => {
    setLogoFraming(prev => ({ ...(prev ?? {}), imageRatio: logoImageRatio, [slot]: frame })); setFramingSlot(null);
  };
  const save = async () => {
    if (!name.trim() || !bookingLink.trim()) { Alert.alert('Add the name and booking link', 'Both are needed to publish this provider.'); return; }
    setSaving(true);
    try {
      let logoUrl: string | null | undefined = undefined;
      if (logoUri && !logoUri.startsWith('http')) {
        if (!user?.id) throw new Error('Sign in again before uploading a logo.');
        const ext = logoUri.split('.').pop()?.split('?')[0] || 'jpg';
        logoUrl = await uploadToStorage('provider-logos', `${user.id}/directory/${Date.now()}.${ext}`, logoUri);
      } else if (!editing) logoUrl = logoUri;
      await saveAdminDirectoryListing({ id: editing?.id, displayName: name, serviceCategory: category, locationText: location, externalBookingUrl: bookingLink, logoUrl, instagram, website, logoFraming });
      reset(); await load(); Alert.alert('Saved', 'This provider is now visible to clients in the app.');
    } catch (error) { Alert.alert('Could not save listing', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };
  const toggleVisibility = async (item: AdminDirectoryListing) => {
    try { await setAdminDirectoryListingVisibility(item.id, !item.is_active); await load(); }
    catch { Alert.alert('Could not update listing', 'Please try again.'); }
  };
  const addPortfolio = async () => {
    if (!editing || !user?.id) { Alert.alert('Save first', 'Save the listing before adding portfolio images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    setPortfolioUploading(true);
    try {
      await Promise.all(result.assets.map(async asset => {
        const ext = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
        const url = await uploadToStorage('portfolio', `${user.id}/directory/${editing.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, asset.uri);
        await addAdminDirectoryListingPortfolio(editing.id, url, asset.width && asset.height ? asset.width / asset.height : 1);
      }));
      setPortfolio(await getAdminDirectoryListingPortfolio(editing.id));
    } catch (error) { Alert.alert('Could not add photo', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setPortfolioUploading(false); }
  };
  const removePortfolio = (item: AdminDirectoryPortfolioItem) => Alert.alert('Remove image?', 'This removes it from the public provider profile.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void deleteAdminDirectoryListingPortfolio(item.id).then(() => setPortfolio(prev => prev.filter(p => p.id !== item.id))).catch(() => Alert.alert('Could not remove image', 'Please try again.')) }]);
  const removeListing = () => {
    if (!editing) return;
    Alert.alert('Remove listing?', 'This permanently removes the provider listing and its portfolio from CERVICED.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteAdminDirectoryListing(editing.id).then(async () => { reset(); await load(); }).catch(() => Alert.alert('Could not remove listing', 'Please try again.')) },
    ]);
  };

  const card = { backgroundColor: P.card, borderColor: P.border };
  return <ThemedBackground style={{ flex: 1 }}>
    <StatusBar barStyle={theme.statusBar} />
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 36 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={P.accent} />}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back"><Text style={[styles.backText, { color: P.text }]}>←</Text></TouchableOpacity>
      <Text style={[styles.title, { color: P.text }]}>DIRECTORY LISTINGS</Text>
      <Text style={[styles.sub, { color: P.sub }]}>Add businesses with their logo and booking link. Clients see a normal provider profile and can book on the provider’s own page.</Text>
      <View style={[styles.form, card]}>
        <Text style={[styles.label, { color: P.sub }]}>{editing ? 'EDIT LISTING' : 'NEW LISTING'}</Text>
        <TouchableOpacity onPress={() => void pickLogo()} style={[styles.logo, { borderColor: P.border }]} accessibilityRole="button" accessibilityLabel="Choose logo">
          {logoUri ? <Image source={{ uri: logoUri }} style={styles.logoImage} /> : <Ionicons name="image-outline" size={30} color={P.sub} />}
          <Text style={[styles.logoText, { color: P.accentText }]}>Add logo</Text>
        </TouchableOpacity>
        {logoUri && <View style={styles.frameRow}><TouchableOpacity onPress={() => frameLogo('small')}><Text style={{ color: P.accentText, fontWeight: '700' }}>Frame small card</Text></TouchableOpacity><TouchableOpacity onPress={() => frameLogo('large')}><Text style={{ color: P.accentText, fontWeight: '700' }}>Frame large card</Text></TouchableOpacity></View>}
        <Field P={P} placeholder="Business name" value={name} onChangeText={setName} />
        <Text style={[styles.label, { color: P.sub }]}>CATEGORY</Text>
        <View style={styles.categories}>{CATEGORIES.map(c => <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.category, { borderColor: P.border, backgroundColor: category === c ? P.accent : P.card }]}><Text style={{ color: category === c ? P.onAccent : P.text, fontSize: 11, fontWeight: '700' }}>{c}</Text></TouchableOpacity>)}</View>
        <Field P={P} placeholder="Location, e.g. Brixton, London" value={location} onChangeText={setLocation} />
        <Field P={P} placeholder="Booking link (https://...)" value={bookingLink} onChangeText={setBookingLink} autoCapitalize="none" keyboardType="url" />
        <Field P={P} placeholder="Instagram (optional)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
        <Field P={P} placeholder="Website (optional)" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />
        <View style={styles.actions}><TouchableOpacity disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: P.accent }]}><Text style={{ color: P.onAccent, fontWeight: '800' }}>{saving ? 'SAVING…' : editing ? 'SAVE CHANGES' : 'PUBLISH LISTING'}</Text></TouchableOpacity>{editing && <TouchableOpacity onPress={reset} style={styles.cancel}><Text style={{ color: P.accentText, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>}</View>
        {editing && <TouchableOpacity onPress={removeListing} style={styles.deleteButton}><Text style={styles.deleteText}>Remove listing permanently</Text></TouchableOpacity>}
      </View>
      {editing && <View style={[styles.form, card]}><Text style={[styles.label, { color: P.sub }]}>PORTFOLIO</Text><Text style={[styles.sub, { color: P.sub }]}>These photos appear on the provider’s public directory profile.</Text><View style={styles.portfolioGrid}>{portfolio.map(item => <TouchableOpacity key={item.id} onPress={() => removePortfolio(item)} style={styles.portfolioTile}><Image source={{ uri: item.image_url }} style={styles.portfolioImage} /><View style={styles.remove}><Text style={{ color: '#fff', fontWeight: '800' }}>×</Text></View></TouchableOpacity>)}<TouchableOpacity onPress={() => void addPortfolio()} disabled={portfolioUploading} style={[styles.portfolioAdd, { borderColor: P.border }]}>{portfolioUploading ? <ActivityIndicator color={P.accent} /> : <><Ionicons name="add" size={28} color={P.accentText} /><Text style={{ color: P.accentText, fontWeight: '700' }}>Add photos</Text></>}</TouchableOpacity></View></View>}
      <Text style={[styles.label, { color: P.sub, marginTop: 18 }]}>YOUR LISTINGS</Text>
      {loading ? <ActivityIndicator color={P.accent} style={{ margin: 28 }} /> : items.map(item => <View key={item.id} style={[styles.row, card]}><TouchableOpacity onPress={() => beginEdit(item)} style={styles.rowMain}><View style={[styles.thumb, { backgroundColor: P.sep }]}>{item.logo_url ? <Image source={{ uri: item.logo_url }} style={styles.thumbImage} /> : <Ionicons name="storefront-outline" size={20} color={P.sub} />}</View><View style={{ flex: 1 }}><Text style={[styles.name, { color: P.text }]}>{item.display_name}</Text><Text style={[styles.sub, { color: P.sub }]}>{item.is_active ? (item.location_text || item.service_category) : 'Hidden from clients'}</Text></View><Ionicons name="chevron-forward" size={18} color={P.sub} /></TouchableOpacity><TouchableOpacity onPress={() => void toggleVisibility(item)} style={[styles.visibility, { borderColor: P.border }]}><Text style={{ color: P.accentText, fontWeight: '700' }}>{item.is_active ? 'Hide' : 'Show'}</Text></TouchableOpacity></View>)}
      {!loading && items.length === 0 && <Text style={[styles.sub, { color: P.sub, textAlign: 'center', marginTop: 20 }]}>No directory listings yet.</Text>}
    </ScrollView>
    <LogoCardFramer slot={framingSlot} uri={logoUri} imageRatio={logoImageRatio} initial={framingSlot ? logoFraming?.[framingSlot] : undefined} onDone={onLogoFramed} onCancel={() => setFramingSlot(null)} palette={{ bg: P.bg, card: P.card, text: P.text, sub: P.sub, accent: P.accent, onAccent: P.onAccent }} />
  </ThemedBackground>;
}

function Field({ P, ...props }: any) { return <TextInput {...props} placeholderTextColor={P.sub} style={[styles.input, { color: P.text, borderColor: P.border }]} />; }
const styles = StyleSheet.create({ back: { width: 44, height: 40, justifyContent: 'center' }, backText: { fontSize: 25 }, title: { fontFamily: 'BakbakOne-Regular', fontSize: 27, letterSpacing: 1 }, sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 }, form: { marginTop: 16, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 10 }, label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, logo: { width: 104, height: 104, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 4 }, logoImage: { width: '100%', height: '100%', position: 'absolute' }, logoText: { fontWeight: '700' }, frameRow: { flexDirection: 'row', justifyContent: 'space-around' }, input: { minHeight: 47, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, category: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 }, save: { flex: 1, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, cancel: { padding: 10 }, deleteButton: { alignSelf: 'center', padding: 8 }, deleteText: { color: '#C0392B', fontWeight: '700', fontSize: 12 }, row: { marginTop: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, gap: 8 }, rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 }, visibility: { alignSelf: 'flex-end', borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 }, thumb: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, thumbImage: { width: '100%', height: '100%' }, name: { fontWeight: '700', fontSize: 15 }, portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, portfolioTile: { width: 84, height: 84, borderRadius: 9, overflow: 'hidden' }, portfolioImage: { width: '100%', height: '100%' }, remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#111A', alignItems: 'center', justifyContent: 'center' }, portfolioAdd: { width: 84, height: 84, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 2 } });
