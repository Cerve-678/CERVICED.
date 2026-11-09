import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { SafeAreaView } from '../../components/SafeArea';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  isDarkColor,
  PROVIDER_THEMES,
  DEFAULT_PROVIDER_THEME,
  SHEET_BG,
  encodeCustomTheme,
  decodeCustomTheme,
  encodeThemeKey,
  parseThemeKey,
  DEFAULT_HERO_FINISH,
  HERO_FINISHES,
  LINK_ONLY_HERO_FINISHES,
  LINK_ONLY_THEMES,
  type HeroFinish,
} from '../../constants/providerThemes';
import ProviderThemePicker, { type ThemeSelection } from '../../components/ProviderThemePicker';
import ProfileHeroBackdrop from '../../components/ProfileHeroBackdrop';
import ProviderFontPicker from '../../components/ProviderFontPicker';
import { DEFAULT_PROVIDER_FONT, LINK_ONLY_FONTS, resolveProviderFontFamily, resolveProviderFontScale } from '../../constants/providerFonts';
import { getCachedProviderData, uploadToStorage, patchCachedProviderBranding } from '../../services/providerRegistrationService';
import { getMyProviderBranding, updateProviderBranding } from '../../services/databaseService';
import { toUserMessage } from '../../utils/userFacingError';
import { FullCervicedLockedSheet } from '../../features/providers/FullCervicedLockedSheet';
import { ImageCropModal } from '../../components/ImageCropModal';
import { coloursFromPhoto } from '../../features/provider-registration/photoColours';
import { logger } from '../../utils/logger';

const LIGHT = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#5C4033', text: '#000000', sub: '#7E6667',
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
  const url = await uploadToStorage('provider-backgrounds', storagePath, localUri);
  // The storage path is deterministic (one background.<ext> per provider,
  // upserted in place), so a new photo lands at the SAME public URL as the old
  // one. expo-image and the CDN both cache by URL, so clients would keep
  // showing the previous photo. Append a version query so each save produces a
  // distinct URL that forces a refetch — Supabase ignores unknown query params
  // when serving the object but caches by the full URL.
  return `${url}?v=${Date.now()}`;
}

export default function BrandingScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const { user, myBookingMode } = useAuth();
  const P = isDarkMode ? DARK : LIGHT;
  // Link-only pros get a smaller set; the rest shows locked (see
  // LINK_ONLY_THEMES).
  const limited = myBookingMode === 'external';

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);

  const [gradient, setGradient]           = useState<[string, string, ...string[]]>(['#EDE8E2', '#C4A8AE', (isDarkMode ? '#AF9197' : '#5C4033')]);
  const [accentColor, setAccentColor]     = useState((isDarkMode ? '#AF9197' : '#5C4033'));
  // Colour theme — preset key, or 'custom' with the three colours below
  const [themeChoice, setThemeChoice]         = useState<string>(DEFAULT_PROVIDER_THEME);
  const [customBackdrop, setCustomBackdrop]   = useState('#E3C7CF');
  const [customCard, setCustomCard]           = useState('#F9E9EE');
  const [customAccent, setCustomAccent]       = useState('#D98BA6');
  const [sheetColor, setSheetColor]           = useState(SHEET_BG);
  const [heroFinish, setHeroFinish]           = useState<HeroFinish>(DEFAULT_HERO_FINISH);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage]   = useState(false);
  const [brandFont, setBrandFont]             = useState<string>(DEFAULT_PROVIDER_FONT);
  const [lockedOpen, setLockedOpen]           = useState(false);
  const [imageToCrop, setImageToCrop]         = useState<string | null>(null);
  // Custom → "From your photos": colours found in the logo and background
  // photo, plus any photo chosen just for its colours.
  const [logoUrl, setLogoUrl]                 = useState<string | null>(null);
  const [photoColours, setPhotoColours]       = useState<string[]>([]);
  const [photoColoursLoading, setPhotoColoursLoading] = useState(false);
  const photoColoursFor = useRef<string | null>(null);
  // The colour square and hue bar take a vertical drag, so the page stops
  // scrolling while a finger is on them.
  const [colourDragging, setColourDragging]   = useState(false);

  useEffect(() => {
    let active = true;
    // Show the last saved appearance immediately. The authoritative branding
    // row still refreshes below, but opening this editor should not be held up
    // by an auth lookup plus a provider query.
    if (user?.id) {
      void getCachedProviderData(user.id).then(cached => {
        if (!cached || !active) return;
        setUserId(user.id);
        setGradient(cached.gradient);
        setAccentColor(cached.accentColor);
        setBackgroundImage(cached.backgroundImage);
        setLogoUrl(cached.logo);
        setBrandFont((cached as { brandFont?: string }).brandFont ?? DEFAULT_PROVIDER_FONT);
        const { base, sheet, finish } = parseThemeKey(cached.profileTheme);
        setSheetColor(sheet);
        setHeroFinish(finish);
        const custom = decodeCustomTheme(base);
        if (custom) {
          setThemeChoice('custom');
          setCustomBackdrop(custom.backdrop);
          setCustomCard(custom.card);
          setCustomAccent(custom.accent);
        } else if (base) setThemeChoice(base);
        setLoading(false);
      }).catch(() => {});
    }
    (async () => {
      try {
        const data = await getMyProviderBranding(user?.id);

        if (data) {
          setUserId(data.userId);
          setProviderId(data.id);
          if (data.gradient && data.gradient.length >= 2) {
            setGradient(data.gradient as [string, string, ...string[]]);
          }
          if (data.accent_color) setAccentColor(data.accent_color);
          if (data.background_image_url) setBackgroundImage(data.background_image_url);
          if (data.logo_url) setLogoUrl(data.logo_url);
          if (data.brand_font) setBrandFont(data.brand_font);
          const { base, sheet, finish } = parseThemeKey(data.profile_theme);
          setSheetColor(sheet);
          setHeroFinish(finish);
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
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const pickImage = useCallback(async () => {
    if (!userId) { Alert.alert('Not signed in'); return; }
    // Avoid asking the native permission service again once access is already
    // granted. That extra hop delayed the picker even for returning providers.
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted) permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to set a background image.');
      return;
    }
    // No allowsEditing: iOS's editor ignores `aspect` and only crops to a
    // square, which cut most of a portrait photo away. ImageCropModal starts
    // on the whole photo instead, so leaving it alone keeps the full image.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setImageToCrop(result.assets[0].uri);
  }, [userId]);

  // Read colours out of the logo and background photo the first time Custom
  // is open, and again only if either photo changes. Nothing is fetched for a
  // provider who never opens Custom.
  useEffect(() => {
    if (themeChoice !== 'custom' || limited) return;
    const sources = [logoUrl, backgroundImage].filter((u): u is string => !!u);
    const key = sources.join('|');
    if (sources.length === 0 || photoColoursFor.current === key) return;
    photoColoursFor.current = key;
    let active = true;
    setPhotoColoursLoading(true);
    void Promise.allSettled(sources.map(uri => coloursFromPhoto(uri, 5))).then(results => {
      if (!active) return;
      const found: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') found.push(...result.value);
        else logger.warn('[Branding] could not read colours from a photo:', result.reason);
      }
      setPhotoColours([...new Set(found)].slice(0, 8));
      setPhotoColoursLoading(false);
    });
    return () => { active = false; };
  }, [themeChoice, limited, logoUrl, backgroundImage]);

  // Any photo from the library, used only for its colours (nothing uploads).
  const chooseColourPhoto = useCallback(async () => {
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted) permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to take colours from a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoColoursLoading(true);
    try {
      const found = await coloursFromPhoto(result.assets[0].uri, 6);
      // The chosen photo's colours lead; the logo/background ones follow.
      setPhotoColours(existing => [...new Set([...found, ...existing])].slice(0, 10));
    } catch (e) {
      logger.warn('[Branding] could not read colours from the chosen photo:', e);
      Alert.alert('Couldn\u2019t read that photo', 'Try a different photo, or pick a colour on the square below.');
    } finally {
      setPhotoColoursLoading(false);
    }
  }, []);

  const handleImageCropped = useCallback(async (localUri: string) => {
    setImageToCrop(null);
    if (!userId) return;
    const previousImage = backgroundImage;
    // The provider chose this image already; show it now, rather than making
    // the preview wait for the storage upload to finish.
    setBackgroundImage(localUri);
    setUploadingImage(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const url = await uploadBackgroundImage(userId, localUri);
      setBackgroundImage(url);
    } catch (e: any) {
      setBackgroundImage(previousImage);
      Alert.alert('Upload failed', toUserMessage(e, 'Could not upload that image. Please try again.', 'BrandingScreen.upload'));
    } finally {
      setUploadingImage(false);
    }
  }, [userId, backgroundImage]);

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
      // Presets with a genuine two-tone gradient (Sunset, Aurora, etc.) keep their
      // own colour-to-colour blend; everything else falls back to backdrop→sheet.
      const resolvedGradient: [string, string] = isCustom
        ? [customBackdrop, sheetColor]
        : preset?.tokens.gradient ?? [preset?.tokens.hero ?? SHEET_BG, sheetColor];
      const baseKey = isCustom ? encodeCustomTheme(customBackdrop, customCard, customAccent) : themeChoice;

      const resolvedProfileTheme = encodeThemeKey(baseKey, sheetColor, heroFinish);

      await updateProviderBranding(providerId, {
        gradient: resolvedGradient,
        accent_color: resolvedAccent,
        background_image_url: backgroundImage,
        profile_theme: resolvedProfileTheme,
        brand_font: brandFont,
      });

      // Keep My Profile's render cache in step with the DB so returning to it
      // doesn't flash the previous colours/photo for a frame before the live
      // row loads. Best-effort — the save already succeeded regardless.
      if (userId) {
        await patchCachedProviderBranding(userId, {
          gradient: resolvedGradient,
          accentColor: resolvedAccent,
          backgroundImage,
          profileTheme: resolvedProfileTheme,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Save failed', toUserMessage(e, 'Could not save your changes.', 'BrandingScreen.save'));
    } finally {
      setSaving(false);
    }
  }, [providerId, userId, accentColor, backgroundImage, themeChoice, customBackdrop, customCard, customAccent, sheetColor, heroFinish, brandFont, navigation]);

  // Both stacks that open Branding for a link-only pro (Home, Settings) have
  // the Full CERVICED experience page.
  const showLocked = useCallback(() => setLockedOpen(true), []);

  // Single handler for the shared picker — keeps the live preview in sync
  const handleThemeChange = useCallback((next: ThemeSelection) => {
    setThemeChoice(next.themeChoice);
    setCustomBackdrop(next.customBackdrop);
    setCustomCard(next.customCard);
    setCustomAccent(next.customAccent);
    setSheetColor(next.sheetColor);
    const preset = PROVIDER_THEMES.find(t => t.key === next.themeChoice);
    const accent = next.themeChoice === 'custom' ? next.customAccent : preset?.tokens.accent ?? next.customAccent;
    const isCustom = next.themeChoice === 'custom';
    const resolvedGradient: [string, string] = isCustom
      ? [next.customBackdrop, next.sheetColor]
      : preset?.tokens.gradient ?? [preset?.tokens.hero ?? next.customBackdrop, next.sheetColor];
    setAccentColor(accent);
    setGradient(resolvedGradient);
  }, []);

  // The preview's words follow the backdrop's lead colour, so pale sets like
  // Oat Milk read in ink rather than shadowed white.
  const previewOnLight = !backgroundImage && !isDarkColor(gradient[0]);
  const previewInk = previewOnLight ? '#26201E' : '#FFFFFF';
  const accentInk = isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740';

  if (loading) {
    return (
      <View style={[styles.centred, { backgroundColor: P.bg }]}>
        <ActivityIndicator color={P.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.bg, { backgroundColor: P.bg }]}>
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ImageCropModal
        uri={imageToCrop}
        accent={P.accent}
        onAccent={isDarkColor(P.accent) ? '#FFFFFF' : '#1A1815'}
        onCancel={() => setImageToCrop(null)}
        onDone={handleImageCropped}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} scrollEnabled={!colourDragging}>

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
                <Image source={{ uri: backgroundImage }} style={styles.previewBg} resizeMode="cover" fadeDuration={0} />
                <LinearGradient
                  colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.35)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <ProfileHeroBackdrop colors={gradient} finish={heroFinish} style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.previewContent}>
              <View style={[styles.previewAccentChip, { backgroundColor: accentColor }]}>
                <Text style={[styles.previewAccentLabel, { color: accentInk }]}>ACCENT</Text>
              </View>
              <Text style={[styles.previewName, { fontFamily: resolveProviderFontFamily(brandFont), fontSize: 20 * resolveProviderFontScale(brandFont), color: previewInk }, !previewOnLight && styles.previewShadow]}>Your Profile</Text>
              <Text style={[styles.previewSub, { color: previewInk, opacity: 0.75 }]}>Background preview</Text>
            </View>
          </View>

          {/* Profile theme — accent + card colour + backdrop sets */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Profile Theme</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Each set pairs two backdrop colours with an accent that suits them.
              Swipe through the collections, or tap Custom to build your own.
            </Text>
            <ProviderThemePicker
              value={{ themeChoice, customBackdrop, customCard, customAccent, sheetColor }}
              onChange={handleThemeChange}
              textColor={P.text}
              subColor={P.sub}
              borderColor={P.border}
              sepColor={P.sep}
              unlockedThemes={limited ? LINK_ONLY_THEMES : undefined}
              onLockedPress={showLocked}
              photoColours={photoColours}
              photoColoursLoading={photoColoursLoading}
              onChoosePhoto={chooseColourPhoto}
              onColourDraggingChange={setColourDragging}
            />
          </View>

          {/* Hero finish — how the two backdrop colours are drawn */}
          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Hero Finish</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              {backgroundImage
                ? 'Your background photo is showing instead. Remove it to use a finish.'
                : 'How your two backdrop colours sit behind the top of your profile.'}
            </Text>
            <View style={styles.finishRow}>
              {HERO_FINISHES.map(f => {
                const selected = heroFinish === f.key;
                const locked = limited && !LINK_ONLY_HERO_FINISHES.includes(f.key);
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.finishOption, locked && styles.finishLocked]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      if (locked) showLocked();
                      else setHeroFinish(f.key);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${f.name}: ${f.description}${locked ? ', locked' : ''}`}
                  >
                    <View style={[styles.finishSwatch, { borderColor: selected ? P.text : P.border }, selected && styles.finishSwatchOn]}>
                      <ProfileHeroBackdrop colors={gradient} finish={f.key} style={StyleSheet.absoluteFill} />
                      {locked && (
                        <View style={styles.finishLock}>
                          <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.finishName, { color: selected ? P.text : P.sub }]}>{f.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Business Name Font</Text>
            <Text style={[styles.sectionSub, { color: P.sub }]}>Choose how your business name appears on your public profile.</Text>
            <ProviderFontPicker
              value={brandFont}
              onChange={setBrandFont}
              accentColor={accentColor}
              textColor={P.text}
              subColor={P.sub}
              borderColor={P.border}
              cardColor={P.surface}
              unlockedFonts={limited ? LINK_ONLY_FONTS : undefined}
              onLockedPress={showLocked}
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
                <Image source={{ uri: backgroundImage }} style={styles.imageThumb} resizeMode="cover" fadeDuration={0} />
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
                    <ActivityIndicator color={isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740'} size="small" />
                  ) : (
                    <Text style={[styles.imageBtnText, { color: isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740' }]}>{backgroundImage ? 'Change' : 'Choose Image'}</Text>
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
            disabled={saving || uploadingImage}
          >
            {saving ? (
              <ActivityIndicator color={isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740'} />
            ) : (
              <Text style={[styles.saveBtnText, { color: isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740' }]}>Save Changes</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>

      <FullCervicedLockedSheet
        visible={lockedOpen}
        title="Unlock the rest of your branding"
        note="You can use the App, Blush, Grey and Charcoal colours, the Classic, Chunky & Rounded, Smooth & Rounded and Bakbak fonts, and the Blend finish now."
        onClose={() => setLockedOpen(false)}
        onSeeMore={() => navigation.navigate('FullCervicedFeatures')}
      />
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
  subtitle:  { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 13, marginBottom: 28, opacity: 0.8 },

  previewWrapper: {
    height: 180,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 28,
    justifyContent: 'flex-end',
  },
  previewBg: {
    ...StyleSheet.absoluteFill,
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
  },
  previewShadow: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
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
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 16,
    opacity: 0.8,
  },

  finishRow: { flexDirection: 'row', gap: 10 },
  finishOption: { flex: 1, alignItems: 'center', gap: 6 },
  finishSwatch: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  finishSwatchOn: { borderWidth: 2.5 },
  finishLocked: { opacity: 0.55 },
  finishLock: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  finishName: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 11 },

  imageRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  imageThumb:  { width: 80, height: 80, borderRadius: 12 },
  imagePlaceholder: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  imagePlaceholderText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 10, textAlign: 'center' },
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
    minHeight: 52,
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
