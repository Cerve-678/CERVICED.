import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const { width: SW } = Dimensions.get('window');

const LIGHT = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', text: '#000000', sub: '#7E6667',
  border: 'rgba(126,102,103,0.14)', sep: 'rgba(126,102,103,0.08)',
};
const DARK = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667',
  border: 'rgba(126,102,103,0.18)', sep: 'rgba(126,102,103,0.10)',
};

const GRADIENT_PRESETS: Array<{ name: string; colors: [string, string, ...string[]] }> = [
  { name: 'App Default', colors: ['#EDE8E2', '#C4A8AE', '#AF9197'] },
  { name: 'Sunset',      colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
  { name: 'Rose Gold',   colors: ['#FF69B4', '#FFB6C1', '#FFC1CC'] },
  { name: 'Ocean',       colors: ['#5fd5dcff', '#bd66ff9c', '#33CCCC'] },
  { name: 'Purple Haze', colors: ['#8d59acff', '#c069c4ff', '#aba0a1ff'] },
  { name: 'Forest',      colors: ['#1B4332', '#2D5A3D', '#40916C'] },
  { name: 'Warm Nude',   colors: ['#FFE4B5', '#FFDAB9', '#FFB347'] },
  { name: 'Deep Pink',   colors: ['#830c53ff', '#f6bbe9ff', '#572862ff'] },
  { name: 'Royal Blue',  colors: ['#8ba4e9ff', '#073784ff', '#37106aff'] },
  { name: 'Lavender',    colors: ['#E6E6FA', '#DDA0DD', '#DA70D6'] },
  { name: 'Mocha',       colors: ['#8c5c0eff', '#311f00ff', '#6f430eff'] },
  { name: 'Lash Bae',    colors: ['#dc8fedb5', '#e0d3e0ff', '#2d2d2d'] },
  { name: 'Midnight',    colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Cherry',      colors: ['#EB3349', '#F45C43', '#FF6B6B'] },
  { name: 'Peach',       colors: ['#FFD89B', '#FFCC99', '#FF9966'] },
  { name: 'Mint',        colors: ['#00B09B', '#96C93D', '#A8E6CF'] },
  { name: 'Blush',       colors: ['#FFECD2', '#FCB69F', '#FF8A80'] },
  { name: 'Cosmic',      colors: ['#C33764', '#1D2671', '#0F0C29'] },
  { name: 'Honey',       colors: ['#F7971E', '#FFD200', '#FFE066'] },
  { name: 'Grape',       colors: ['#5B247A', '#1BCEDF', '#7B4397'] },
  { name: 'Slate',       colors: ['#4B6CB7', '#182848', '#2C3E50'] },
  { name: 'Rosewood',    colors: ['#D4145A', '#FBB03B', '#ED4264'] },
  { name: 'Ice',         colors: ['#74EBD5', '#ACB6E5', '#E0EAFC'] },
];

const ACCENT_COLORS = [
  { name: 'Berry',       color: '#C2185B' },
  { name: 'Purple',      color: '#7B1FA2' },
  { name: 'Deep Purple', color: '#4A148C' },
  { name: 'Indigo',      color: '#303F9F' },
  { name: 'Blue',        color: '#1565C0' },
  { name: 'Teal',        color: '#00838F' },
  { name: 'Green',       color: '#2E7D32' },
  { name: 'Orange',      color: '#E65100' },
  { name: 'Brown',       color: '#4E342E' },
  { name: 'Rose',        color: '#AD1457' },
  { name: 'Coral',       color: '#FF5722' },
  { name: 'Gold',        color: '#FF8F00' },
];

async function uploadBackgroundImage(
  userId: string,
  localUri: string
): Promise<string> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const storagePath = `${userId}/background.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error } = await supabase.storage
    .from('provider-backgrounds')
    .upload(storagePath, bytes, { contentType, upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('provider-backgrounds')
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

export default function BrandingScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);

  const [gradient, setGradient]           = useState<[string, string, ...string[]]>(['#EDE8E2', '#C4A8AE', '#AF9197']);
  const [accentColor, setAccentColor]     = useState('#AF9197');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage]   = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data } = await supabase
          .from('providers')
          .select('id, gradient, accent_color, background_image_url')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setProviderId(data.id);
          if (data.gradient && data.gradient.length >= 2) {
            setGradient(data.gradient as [string, string, ...string[]]);
          }
          if (data.accent_color) setAccentColor(data.accent_color);
          if (data.background_image_url) setBackgroundImage(data.background_image_url);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to set a background image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    if (!userId) { Alert.alert('Not signed in'); return; }

    setUploadingImage(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const url = await uploadBackgroundImage(userId, result.assets[0].uri);
      setBackgroundImage(url);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingImage(false);
    }
  }, [userId]);

  const removeImage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBackgroundImage(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!providerId) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { error } = await supabase
        .from('providers')
        .update({
          gradient,
          accent_color: accentColor,
          background_image_url: backgroundImage,
        })
        .eq('id', providerId);

      if (error) throw error;

      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setSaved(false), 2200);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }, [providerId, gradient, accentColor, backgroundImage]);

  if (loading) {
    return (
      <View style={[styles.centred, { backgroundColor: P.bg }]}>
        <ActivityIndicator color={P.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.bg, { backgroundColor: P.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.text }]}>Branding & Style</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>
            Customise how your profile looks to clients
          </Text>

          {/* Live preview */}
          <View style={styles.previewWrapper}>
            {backgroundImage ? (
              <>
                <Image source={{ uri: backgroundImage }} style={styles.previewBg} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.35)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.previewContent}>
              <View style={[styles.previewAccentChip, { backgroundColor: accentColor }]}>
                <Text style={styles.previewAccentLabel}>ACCENT</Text>
              </View>
              <Text style={styles.previewName}>Your Profile</Text>
              <Text style={styles.previewSub}>Background preview</Text>
            </View>
          </View>

          {/* Background image */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Background Image</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              A photo background overrides the gradient. Clients see it behind your profile.
            </Text>
            <View style={styles.imageRow}>
              {backgroundImage ? (
                <Image source={{ uri: backgroundImage }} style={styles.imageThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.imagePlaceholder, { backgroundColor: P.surface, borderColor: P.border }]}>
                  <Text style={[styles.imagePlaceholderText, { color: P.sub }]}>No image set</Text>
                </View>
              )}
              <View style={styles.imageActions}>
                <TouchableOpacity
                  style={[styles.imageBtn, { backgroundColor: accentColor }]}
                  onPress={pickImage}
                  activeOpacity={0.8}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.imageBtnText}>{backgroundImage ? 'Change' : 'Choose Image'}</Text>
                  )}
                </TouchableOpacity>
                {backgroundImage && (
                  <TouchableOpacity
                    style={[styles.imageBtn, styles.imageBtnRemove, { borderColor: P.border }]}
                    onPress={removeImage}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.imageBtnText, { color: P.sub }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Gradient picker */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Background Gradient</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Used when no background image is set.
            </Text>
            <View style={styles.gradientGrid}>
              {GRADIENT_PRESETS.map((preset) => {
                const isSelected = JSON.stringify(preset.colors) === JSON.stringify(gradient);
                return (
                  <TouchableOpacity
                    key={preset.name}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setGradient(preset.colors);
                    }}
                    activeOpacity={0.8}
                    style={[styles.gradientOption, isSelected && { borderColor: accentColor, borderWidth: 2.5 }]}
                  >
                    <LinearGradient
                      colors={preset.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.gradientSwatch}
                    />
                    <Text style={[styles.gradientName, { color: P.sub }]} numberOfLines={1}>{preset.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Accent color picker */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Accent Colour</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Used for buttons, prices, and highlights on your profile.
            </Text>
            <View style={styles.accentGrid}>
              {ACCENT_COLORS.map((item) => {
                const isSelected = accentColor === item.color;
                return (
                  <TouchableOpacity
                    key={item.color}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setAccentColor(item.color);
                    }}
                    activeOpacity={0.8}
                    style={[styles.accentOption, isSelected && { borderColor: item.color, borderWidth: 2.5 }]}
                  >
                    <View style={[styles.accentSwatch, { backgroundColor: item.color }]} />
                    <Text style={[styles.accentName, { color: P.sub }]} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: saved ? '#2E7D32' : accentColor, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Changes'}</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg:      { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:  { paddingHorizontal: 20, paddingBottom: 48 },

  backBtn:   { marginTop: 12, marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title:     { fontFamily: 'BakbakOne-Regular', fontSize: 26, marginBottom: 6 },
  subtitle:  { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, marginBottom: 28, opacity: 0.8 },

  previewWrapper: {
    height: 180,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 28,
    justifyContent: 'flex-end',
  },
  previewBg: {
    ...StyleSheet.absoluteFillObject,
  },
  previewContent: {
    padding: 18,
  },
  previewAccentChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  previewAccentLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    color: '#fff',
    letterSpacing: 1.2,
  },
  previewName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  section: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 4,
  },
  sectionSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    marginBottom: 16,
    opacity: 0.8,
  },

  imageRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  imageThumb:  { width: 80, height: 80, borderRadius: 12 },
  imagePlaceholder: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  imagePlaceholderText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, textAlign: 'center' },
  imageActions: { flex: 1, gap: 8 },
  imageBtn: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, alignItems: 'center',
  },
  imageBtnRemove: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  imageBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#fff',
  },

  gradientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gradientOption: {
    width: (SW - 40 - 18 * 2 - 10 * 3) / 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 4,
  },
  gradientSwatch: {
    width: '100%',
    height: 52,
    borderRadius: 8,
    marginBottom: 4,
  },
  gradientName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    textAlign: 'center',
  },

  accentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  accentOption: {
    width: (SW - 40 - 18 * 2 - 10 * 3) / 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingBottom: 4,
    paddingTop: 4,
  },
  accentSwatch: {
    width: 36, height: 36,
    borderRadius: 18,
    marginBottom: 4,
  },
  accentName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    textAlign: 'center',
  },

  saveBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  saveBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.5,
  },
});
