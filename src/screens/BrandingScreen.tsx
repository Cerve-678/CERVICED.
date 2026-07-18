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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import {
  PROVIDER_THEMES,
  DEFAULT_PROVIDER_THEME,
  SHEET_BG,
  encodeCustomTheme,
  decodeCustomTheme,
  encodeThemeKey,
  parseThemeKey,
} from '../constants/providerThemes';
import ProviderThemePicker, { type ThemeSelection } from '../components/ProviderThemePicker';
import { uploadToStorage } from '../services/providerRegistrationService';

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

// Background gradients are derived from the Colour Theme's backdrop colour
// (saved as [backdrop, sheetColor]) — there is no separate gradient picker.
// All colour-set options and swatches live in components/ProviderThemePicker.

async function uploadBackgroundImage(
  userId: string,
  localUri: string
): Promise<string> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const storagePath = `${userId}/background.${ext}`;
  // fetch(localUri).blob() is unreliable for file:// URIs in React Native
  // ("Network request failed") — uploadToStorage reads via expo-file-system
  // and uploads as bytes instead, same as the provider logo upload.
  return uploadToStorage('provider-backgrounds', storagePath, localUri);
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
  // Colour theme — preset key, or 'custom' with the three colours below
  const [themeChoice, setThemeChoice]         = useState<string>(DEFAULT_PROVIDER_THEME);
  const [customBackdrop, setCustomBackdrop]   = useState('#E3C7CF');
  const [customCard, setCustomCard]           = useState('#F9E9EE');
  const [customAccent, setCustomAccent]       = useState('#D98BA6');
  const [sheetColor, setSheetColor]           = useState(SHEET_BG);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data } = await supabase
          .from('providers')
          .select('id, gradient, accent_color, background_image_url, profile_theme')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setProviderId(data.id);
          if (data.gradient && data.gradient.length >= 2) {
            setGradient(data.gradient as [string, string, ...string[]]);
          }
          if (data.accent_color) setAccentColor(data.accent_color);
          if (data.background_image_url) setBackgroundImage(data.background_image_url);
          const { base, sheet } = parseThemeKey(data.profile_theme);
          setSheetColor(sheet);
          const custom = decodeCustomTheme(base);
          if (custom) {
            setThemeChoice('custom');
            setCustomBackdrop(custom.backdrop);
            setCustomCard(custom.card);
            setCustomAccent(custom.accent);
          } else if (base) {
            setThemeChoice(base);
          }
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
      // The colour set drives everything: accent_color and the hero gradient are
      // both derived from it so the client-facing profile always matches.
      const isCustom = themeChoice === 'custom';
      const preset = PROVIDER_THEMES.find(t => t.key === themeChoice);
      const resolvedAccent = isCustom ? customAccent : preset?.tokens.accent ?? accentColor;
      const resolvedBackdrop = isCustom ? customBackdrop : preset?.tokens.hero ?? SHEET_BG;
      const baseKey = isCustom ? encodeCustomTheme(customBackdrop, customCard, customAccent) : themeChoice;

      const { error } = await supabase
        .from('providers')
        .update({
          gradient: [resolvedBackdrop, sheetColor],
          accent_color: resolvedAccent,
          background_image_url: backgroundImage,
          profile_theme: encodeThemeKey(baseKey, sheetColor),
        })
        .eq('id', providerId);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }, [providerId, accentColor, backgroundImage, themeChoice, customBackdrop, customCard, customAccent, sheetColor, navigation]);

  // Single handler for the shared picker — keeps the live preview in sync
  const handleThemeChange = useCallback((next: ThemeSelection) => {
    setThemeChoice(next.themeChoice);
    setCustomBackdrop(next.customBackdrop);
    setCustomCard(next.customCard);
    setCustomAccent(next.customAccent);
    setSheetColor(next.sheetColor);
    const preset = PROVIDER_THEMES.find(t => t.key === next.themeChoice);
    const accent = next.themeChoice === 'custom' ? next.customAccent : preset?.tokens.accent ?? next.customAccent;
    const backdrop = next.themeChoice === 'custom' ? next.customBackdrop : preset?.tokens.hero ?? next.customBackdrop;
    setAccentColor(accent);
    setGradient([backdrop, next.sheetColor]);
  }, []);

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

          {/* Profile theme — accent + card colour + backdrop sets */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Profile Theme</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Each preset is a matched set of accent, card, and backdrop colours.
              Pick one or tap Custom to build your own.
            </Text>
            <ProviderThemePicker
              value={{ themeChoice, customBackdrop, customCard, customAccent, sheetColor }}
              onChange={handleThemeChange}
              textColor={P.text}
              subColor={P.sub}
              borderColor={P.border}
              sepColor={P.sep}
            />
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

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: accentColor, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
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
