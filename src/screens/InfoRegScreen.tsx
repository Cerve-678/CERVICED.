import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  StatusBar,
  FlatList,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputFocusEventData,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { StackScreenProps } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
// Icon imports
import { BellIcon } from '../components/IconLibrary';
import { Ionicons } from '@expo/vector-icons';

// Theme imports
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

// Auth
import { useAuth } from '../contexts/AuthContext';

// Supabase registration service
import { saveProviderToSupabase, loadProviderFromSupabase, saveProviderPolicies, loadProviderPolicies, uploadToStorage } from '../services/providerRegistrationService';
import type { ProviderRegistrationData } from '../services/providerRegistrationService';
import { transferFromAcuity } from '../services/acuityTransferService';
import { supabase } from '../lib/supabase';
import { getProviderPortfolio, addPortfolioItem, deletePortfolioItem } from '../services/databaseService';
import type { DbPortfolioItem } from '../types/database';

import {
  resolveProviderTheme,
  withAlpha,
  isDarkColor,
} from '../constants/providerThemes';

// Navigation types
import { ProfileStackParamList } from '../navigation/types';

type InfoRegScreenProps = StackScreenProps<ProfileStackParamList, 'ProfileMain'>;

const { width: screenWidth } = Dimensions.get('window');

// Service categories (removed BARBER and SKINCARE)
const SERVICE_CATEGORIES = [
  'HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'
];

// Accent color options
const ACCENT_COLORS = [
  { name: 'Berry', color: '#C2185B' },
  { name: 'Purple', color: '#7B1FA2' },
  { name: 'Deep Purple', color: '#4A148C' },
  { name: 'Indigo', color: '#303F9F' },
  { name: 'Blue', color: '#1565C0' },
  { name: 'Teal', color: '#00838F' },
  { name: 'Green', color: '#2E7D32' },
  { name: 'Orange', color: '#E65100' },
  { name: 'Brown', color: '#4E342E' },
  { name: 'Rose', color: '#AD1457' },
  { name: 'Coral', color: '#FF5722' },
  { name: 'Gold', color: '#FF8F00' },
];

// Predefined gradient options - expanded with more themes
const GRADIENT_PRESETS: Array<{ name: string; colors: [string, string, ...string[]] }> = [
  { name: 'App Default', colors: ['#EDE8E2', '#C4A8AE', '#AF9197'] },
  { name: 'Sunset', colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
  { name: 'Rose Gold', colors: ['#FF69B4', '#FFB6C1', '#FFC1CC'] },
  { name: 'Ocean', colors: ['#5fd5dcff', '#bd66ff9c', '#33CCCC'] },
  { name: 'Purple Haze', colors: ['#8d59acff', '#c069c4ff', '#aba0a1ff'] },
  { name: 'Forest', colors: ['#1B4332', '#2D5A3D', '#40916C'] },
  { name: 'Warm Nude', colors: ['#FFE4B5', '#FFDAB9', '#FFB347'] },
  { name: 'Deep Pink', colors: ['#830c53ff', '#f6bbe9ff', '#572862ff'] },
  { name: 'Royal Blue', colors: ['#8ba4e9ff', '#073784ff', '#37106aff'] },
  { name: 'Lavender', colors: ['#E6E6FA', '#DDA0DD', '#DA70D6'] },
  { name: 'Mocha', colors: ['#8c5c0eff', '#311f00ff', '#6f430eff'] },
  { name: 'Lash Bae', colors: ['#dc8fedb5', '#e0d3e0ff', '#2d2d2d'] },
  // New themes
  { name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Cherry', colors: ['#EB3349', '#F45C43', '#FF6B6B'] },
  { name: 'Peach', colors: ['#FFD89B', '#FFCC99', '#FF9966'] },
  { name: 'Mint', colors: ['#00B09B', '#96C93D', '#A8E6CF'] },
  { name: 'Blush', colors: ['#FFECD2', '#FCB69F', '#FF8A80'] },
  { name: 'Cosmic', colors: ['#C33764', '#1D2671', '#0F0C29'] },
  { name: 'Honey', colors: ['#F7971E', '#FFD200', '#FFE066'] },
  { name: 'Grape', colors: ['#5B247A', '#1BCEDF', '#7B4397'] },
  { name: 'Slate', colors: ['#4B6CB7', '#182848', '#2C3E50'] },
  { name: 'Rosewood', colors: ['#D4145A', '#FBB03B', '#ED4264'] },
  { name: 'Ice', colors: ['#74EBD5', '#ACB6E5', '#E0EAFC'] },
  { name: 'Ember', colors: ['#FF416C', '#FF4B2B', '#F5AF19'] },
  { name: 'Custom', colors: ['#FFFFFF', '#EEEEEE', '#DDDDDD'] },
];

// Provider data interface for registration
// ProviderRegistrationData now comes from providerRegistrationService — kept
// as a single source of truth so fields (like profileTheme) never drift out
// of sync between the two.

// ─── Policy types ────────────────────────────────────────────────────────────
type CancelNotice     = 'none' | '24h' | '48h' | '72h';
type CancelPenalty    = 'none' | 'deposit' | 'full';
type RescheduleNotice = 'same_day' | '24h' | '48h' | '72h';
type MaxReschedules   = '1' | '2' | 'unlimited';
type DepositType      = 'percent' | 'fixed';
type NoShowAction     = 'none' | 'warn' | 'charge_deposit' | 'charge_full';

interface ProviderPolicies {
  cancelNotice:     CancelNotice;
  cancelPenalty:    CancelPenalty;
  cancelNote:       string;
  rescheduleNotice: RescheduleNotice;
  maxReschedules:   MaxReschedules;
  rescheduleNote:   string;
  depositRequired:  boolean;
  depositType:      DepositType;
  depositAmount:    string;
  depositNote:      string;
  noShowAction:     NoShowAction;
  noShowNote:       string;
  /** Optional instructions stamped onto every new booking (e.g. "please
   *  arrive 10 minutes early") — shown to clients in their booking details */
  bookingInstructions: string;
}

const DEFAULT_POLICIES: ProviderPolicies = {
  cancelNotice:     '24h',
  cancelPenalty:    'none',
  cancelNote:       '',
  rescheduleNotice: '24h',
  maxReschedules:   '1',
  rescheduleNote:   '',
  depositRequired:  false,
  depositType:      'percent',
  depositAmount:    '',
  depositNote:      '',
  noShowAction:     'none',
  noShowNote:       '',
  bookingInstructions: '',
};

// Add-on interface
interface AddOnData {
  id: number;
  name: string;
  price: number;
}

interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  // Blank = no override. before defaults to 0; after inherits the provider's global buffer.
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: string[];
  addOns: AddOnData[];
  // Discoverability tags
  tags: string[];
  techniqueTags: string[];
  outcomeTags: string[];
  occasionTags: string[];
  trendNames: string[];
  // Safety
  isPregnancySafe: boolean;
  patchTestRequired: boolean;
  minAge: number | null;
  contraindications: string[];
  aftercareNotes: string;
  serviceType: 'treatment' | 'enhancement' | 'maintenance' | 'restorative' | 'consultation' | '';
}

// ─── Tag presets per context ─────────────────────────────────────────────────

const STYLE_TAGS = ['natural', 'glam', 'editorial', 'classic', 'boho', 'edgy', 'soft-girl', 'baddie', 'minimalist', 'bold'];

const OCCASION_TAGS = ['bridal', 'everyday', 'date-night', 'prom', 'photoshoot', 'festival', 'birthday', 'event', 'party'];

const TECHNIQUE_TAGS_BY_CATEGORY: { [key: string]: string[] } = {
  HAIR:       ['balayage', 'highlights', 'ombre', 'keratin', 'relaxer', 'braids', 'locs', 'twists', 'extensions', 'colour'],
  NAILS:      ['gel', 'acrylic', 'biab', 'nail-art', 'french', 'ombre', 'chrome', 'dip-powder', 'gel-x'],
  LASHES:     ['classic', 'hybrid', 'volume', 'mega-volume', 'lash-lift', 'lash-tint', 'russian', 'wispy'],
  BROWS:      ['microblading', 'powder-brow', 'combo-brow', 'lamination', 'tinting', 'hd-brows', 'threading', 'waxing'],
  MUA:        ['airbrush', 'full-glam', 'editorial', 'natural', 'bridal', 'sfx', 'cut-crease', 'dewy'],
  AESTHETICS: ['microneedling', 'chemical-peel', 'dermaplaning', 'hifu', 'filler', 'botox', 'laser', 'hydrafacial', 'mesotherapy', 'prp'],
  OTHER:      [],
};

const OUTCOME_TAGS_BY_CATEGORY: { [key: string]: string[] } = {
  HAIR:       ['volume', 'length', 'shine', 'grey-coverage', 'protection', 'growth', 'smoothness', 'definition'],
  NAILS:      ['length', 'art', 'colour', 'strength', 'natural-look', 'durability'],
  LASHES:     ['volume', 'length', 'definition', 'lift', 'curl', 'dramatic'],
  BROWS:      ['definition', 'shape', 'fullness', 'natural', 'bold', 'arched'],
  MUA:        ['glow', 'coverage', 'definition', 'lifted', 'natural-look', 'dramatic', 'longevity'],
  AESTHETICS: ['glow', 'firmness', 'smoothness', 'rejuvenation', 'definition', 'hydration', 'reduction', 'lifting'],
  OTHER:      ['results', 'enhancement', 'maintenance'],
};

const TREND_SUGGESTIONS = ['glazed-donut', 'clean-girl', 'mob-wife', 'coquette', 'soap-brows', 'butterfly-lashes', 'old-money', 'cherry-cola', 'strawberry-girl'];

const AESTHETICS_CATEGORIES = ['AESTHETICS'];
const isAestheticsService = (cat: string) => AESTHETICS_CATEGORIES.includes(cat.toUpperCase());

// Service Image Carousel Component
interface ServiceImageCarouselProps {
  images: string[];
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  size?: number;
}

const ServiceImageCarousel: React.FC<ServiceImageCarouselProps> = ({
  images,
  onAddImage,
  onRemoveImage,
  size = 80,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / size);
    setActiveIndex(index);
  }, [size]);

  return (
    <View style={styles.carouselContainer}>
      <FlatList
        ref={flatListRef}
        data={[...images, 'add']}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item}-${index}`}
        getItemLayout={(_data, index) => ({ length: size, offset: size * index, index })}
        renderItem={({ item, index }) => {
          if (item === 'add') {
            return (
              <TouchableOpacity
                style={[styles.addImageButton, { width: size, height: size }]}
                onPress={onAddImage}
                activeOpacity={0.7}
              >
                <Text style={styles.addImageIcon}>+</Text>
                <Text style={styles.addImageText}>Add</Text>
              </TouchableOpacity>
            );
          }
          return (
            <View style={[styles.carouselImageContainer, { width: size, height: size }]}>
              <Image
                source={{ uri: item }}
                style={[styles.carouselImage, { width: size, height: size }]}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => onRemoveImage(index)}
              >
                <Text style={styles.removeImageIcon}>×</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={styles.carouselContent}
      />
      {images.length > 0 && (
        <View style={styles.carouselDots}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.carouselDot,
                activeIndex === index && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// Gradient Picker Modal
interface GradientPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (colors: [string, string, ...string[]]) => void;
  currentGradient: [string, string, ...string[]];
}

const GradientPickerModal: React.FC<GradientPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  currentGradient,
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.gradientPickerModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Your Gradient</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.gradientGrid}>
                {GRADIENT_PRESETS.map((preset, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.gradientOption,
                      JSON.stringify(preset.colors) === JSON.stringify(currentGradient) &&
                        styles.gradientOptionSelected,
                    ]}
                    onPress={() => {
                      onSelect(preset.colors);
                      onClose();
                    }}
                  >
                    <LinearGradient
                      colors={preset.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.gradientPreview}
                    />
                    <Text style={styles.gradientName}>{preset.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </BlurView>
      </View>
    </Modal>
  );
};

// ─── Reusable chip-select row ─────────────────────────────────────────────────
interface ChipSelectProps {
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  accentColor?: string;
}
const ChipSelect: React.FC<ChipSelectProps> = ({ options, selected, onToggle, accentColor = '#9C27B0' }) => (
  <View style={styles.chipGrid}>
    {options.map(opt => {
      const active = selected.includes(opt);
      return (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
          onPress={() => onToggle(opt)}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// Add/Edit Service Modal
interface ServiceModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (service: ServiceData) => void;
  service?: ServiceData | null;
  categoryName: string;
}

const ServiceModal: React.FC<ServiceModalProps> = ({
  visible,
  onClose,
  onSave,
  service,
  categoryName,
}) => {
  const catKey = categoryName.toUpperCase();
  const isAesthetics = isAestheticsService(catKey);
  const techniquOptions: string[] = TECHNIQUE_TAGS_BY_CATEGORY[catKey] ?? TECHNIQUE_TAGS_BY_CATEGORY['OTHER'] ?? [];
  const outcomeOptions: string[] = OUTCOME_TAGS_BY_CATEGORY[catKey] ?? OUTCOME_TAGS_BY_CATEGORY['OTHER'] ?? [];

  const [name, setName] = useState(service?.name || '');
  const [price, setPrice] = useState(service?.price?.toString() || '');
  const [duration, setDuration] = useState(service?.duration || '');
  const [bufferBefore, setBufferBefore] = useState(service?.bufferBeforeMins?.toString() || '');
  const [bufferAfter, setBufferAfter] = useState(service?.bufferAfterMins?.toString() || '');
  const [description, setDescription] = useState(service?.description || '');
  const [images, setImages] = useState<string[]>(service?.images || []);
  const [addOns, setAddOns] = useState<AddOnData[]>(service?.addOns || []);
  const [newAddOnName, setNewAddOnName] = useState('');
  const [newAddOnPrice, setNewAddOnPrice] = useState('');
  // Tag state
  const [selectedTags, setSelectedTags] = useState<string[]>(service?.tags || []);
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>(service?.techniqueTags || []);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>(service?.outcomeTags || []);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>(service?.occasionTags || []);
  const [trendNames, setTrendNames] = useState<string[]>(service?.trendNames || []);
  const [trendInput, setTrendInput] = useState('');
  const [serviceType, setServiceType] = useState<ServiceData['serviceType']>(service?.serviceType || '');
  // Safety state
  const [isPregnancySafe, setIsPregnancySafe] = useState(service?.isPregnancySafe ?? false);
  const [patchTestRequired, setPatchTestRequired] = useState(service?.patchTestRequired ?? false);
  const [minAge, setMinAge] = useState(service?.minAge?.toString() || '');
  const [contraindications, setContraindications] = useState<string[]>(service?.contraindications || []);
  const [contraindicationInput, setContraindicationInput] = useState('');
  const [aftercareNotes, setAftercareNotes] = useState(service?.aftercareNotes || '');

  const scrollViewRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    setName(service?.name || '');
    setPrice(service?.price?.toString() || '');
    setDuration(service?.duration || '');
    setBufferBefore(service?.bufferBeforeMins?.toString() || '');
    setBufferAfter(service?.bufferAfterMins?.toString() || '');
    setDescription(service?.description || '');
    setImages(service?.images || []);
    setAddOns(service?.addOns || []);
    setSelectedTags(service?.tags || []);
    setSelectedTechniques(service?.techniqueTags || []);
    setSelectedOutcomes(service?.outcomeTags || []);
    setSelectedOccasions(service?.occasionTags || []);
    setTrendNames(service?.trendNames || []);
    setTrendInput('');
    setServiceType(service?.serviceType || '');
    setIsPregnancySafe(service?.isPregnancySafe ?? false);
    setPatchTestRequired(service?.patchTestRequired ?? false);
    setMinAge(service?.minAge?.toString() || '');
    setContraindications(service?.contraindications || []);
    setContraindicationInput('');
    setAftercareNotes(service?.aftercareNotes || '');
  }, [service]);

  const toggleTag = (arr: string[], setArr: (v: string[]) => void) => (tag: string) =>
    setArr(arr.includes(tag) ? arr.filter(t => t !== tag) : [...arr, tag]);

  const handleAddImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setImages([...images, result.assets[0].uri]);
  };

  const handleRemoveImage = (index: number) => setImages(images.filter((_, i) => i !== index));

  const handleAddAddOn = () => {
    if (!newAddOnName.trim() || !newAddOnPrice.trim()) {
      Alert.alert('Missing Information', 'Please enter add-on name and price.');
      return;
    }
    setAddOns([...addOns, { id: Date.now(), name: newAddOnName.trim(), price: parseFloat(newAddOnPrice) || 0 }]);
    setNewAddOnName('');
    setNewAddOnPrice('');
    Keyboard.dismiss();
  };

  const handleRemoveAddOn = (id: number) => setAddOns(addOns.filter(a => a.id !== id));

  const handleAddTrend = () => {
    const t = trendInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !trendNames.includes(t)) setTrendNames([...trendNames, t]);
    setTrendInput('');
  };

  const handleAddContraindication = () => {
    const c = contraindicationInput.trim();
    if (c && !contraindications.includes(c)) setContraindications([...contraindications, c]);
    setContraindicationInput('');
  };

  const handleSave = () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('Missing Information', 'Please enter a service name and price.');
      return;
    }
    onSave({
      id: service?.id || Date.now(),
      name: name.trim(),
      price: parseFloat(price) || 0,
      duration: duration.trim() || '1 hour',
      bufferBeforeMins: bufferBefore.trim() ? parseInt(bufferBefore, 10) || 0 : null,
      bufferAfterMins: bufferAfter.trim() ? parseInt(bufferAfter, 10) || 0 : null,
      description: description.trim(),
      images,
      addOns,
      tags: selectedTags,
      techniqueTags: selectedTechniques,
      outcomeTags: selectedOutcomes,
      occasionTags: selectedOccasions,
      trendNames,
      isPregnancySafe,
      patchTestRequired,
      minAge: minAge ? parseInt(minAge, 10) : null,
      contraindications,
      aftercareNotes: aftercareNotes.trim(),
      serviceType,
    });
    onClose();
  };

  const handleInputFocus = () => {
    setTimeout(() => { scrollViewRef.current?.scrollToEnd({ animated: true }); }, 300);
  };

  const SERVICE_TYPES: { value: ServiceData['serviceType']; label: string }[] = [
    { value: 'treatment',    label: 'Treatment' },
    { value: 'enhancement',  label: 'Enhancement' },
    { value: 'maintenance',  label: 'Maintenance' },
    { value: 'restorative',  label: 'Restorative' },
    { value: 'consultation', label: 'Consultation' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <BlurView intensity={30} tint="light" style={styles.serviceModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {service ? 'Edit Service' : `Add ${categoryName} Service`}
              </Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {/* Service Images */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Images</Text>
                <ServiceImageCarousel images={images} onAddImage={handleAddImage} onRemoveImage={handleRemoveImage} size={100} />
                <Text style={styles.inputHint}>Add multiple images to showcase your service</Text>
              </View>

              {/* Service Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Name *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder="e.g., Classic Lash Extensions" placeholderTextColor="rgba(0,0,0,0.4)" />
                </BlurView>
              </View>

              {/* Price */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Price (£) *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput style={styles.textInput} value={price} onChangeText={setPrice} placeholder="e.g., 55" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" />
                </BlurView>
              </View>

              {/* Duration */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput style={styles.textInput} value={duration} onChangeText={setDuration} placeholder="e.g., 2 hours" placeholderTextColor="rgba(0,0,0,0.4)" />
                </BlurView>
              </View>

              {/* Buffer time before/after — overrides the account-wide default from Automations */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Buffer Time (optional)</Text>
                <Text style={styles.inputHint}>Blocks extra minutes around this service so back-to-back bookings can't crowd it. Leave blank to use your account default.</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputHint, { marginBottom: 4 }]}>Before</Text>
                    <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                      <TextInput style={styles.textInput} value={bufferBefore} onChangeText={setBufferBefore} placeholder="0" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" />
                    </BlurView>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputHint, { marginBottom: 4 }]}>After</Text>
                    <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                      <TextInput style={styles.textInput} value={bufferAfter} onChangeText={setBufferAfter} placeholder="Default" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" />
                    </BlurView>
                  </View>
                </View>
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlurMultiline}>
                  <TextInput style={[styles.textInput, styles.textInputMultiline]} value={description} onChangeText={setDescription} placeholder="Describe your service..." placeholderTextColor="rgba(0,0,0,0.4)" multiline numberOfLines={4} textAlignVertical="top" onFocus={handleInputFocus} />
                </BlurView>
              </View>

              {/* ── Service Type ─────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Type</Text>
                <Text style={styles.inputHint}>Helps clients understand what kind of service this is</Text>
                <View style={styles.chipGrid}>
                  {SERVICE_TYPES.map(({ value, label }) => {
                    const active = serviceType === value;
                    return (
                      <TouchableOpacity key={value} style={[styles.chip, active && styles.chipActive]} onPress={() => setServiceType(active ? '' : value)}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Style Tags ───────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Style / Vibe</Text>
                <Text style={styles.inputHint}>How would you describe this service's aesthetic?</Text>
                <ChipSelect options={STYLE_TAGS} selected={selectedTags} onToggle={toggleTag(selectedTags, setSelectedTags)} />
              </View>

              {/* ── Occasion Tags ────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Best For (Occasion)</Text>
                <Text style={styles.inputHint}>When would a client typically book this?</Text>
                <ChipSelect options={OCCASION_TAGS} selected={selectedOccasions} onToggle={toggleTag(selectedOccasions, setSelectedOccasions)} />
              </View>

              {/* ── Technique Tags ───────────────────────────────────── */}
              {techniquOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Techniques Used</Text>
                  <Text style={styles.inputHint}>Select every technique this service involves</Text>
                  <ChipSelect options={techniquOptions} selected={selectedTechniques} onToggle={toggleTag(selectedTechniques, setSelectedTechniques)} />
                </View>
              )}

              {/* ── Outcome Tags ─────────────────────────────────────── */}
              {outcomeOptions.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Results / Outcomes</Text>
                  <Text style={styles.inputHint}>What will the client achieve with this service?</Text>
                  <ChipSelect options={outcomeOptions} selected={selectedOutcomes} onToggle={toggleTag(selectedOutcomes, setSelectedOutcomes)} />
                </View>
              )}

              {/* ── Trend Names ──────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Trend Names (Optional)</Text>
                <Text style={styles.inputHint}>Add viral or trend names clients search for (e.g. glazed-donut, soap-brows)</Text>
                {trendNames.length > 0 && (
                  <View style={styles.chipGrid}>
                    {trendNames.map(t => (
                      <TouchableOpacity key={t} style={[styles.chip, styles.chipActive]} onPress={() => setTrendNames(trendNames.filter(x => x !== t))}>
                        <Text style={styles.chipTextActive}>{t} ×</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, { flex: 1 }]}>
                    <TextInput style={styles.textInput} value={trendInput} onChangeText={setTrendInput} placeholder="e.g. glazed-donut" placeholderTextColor="rgba(0,0,0,0.4)" onSubmitEditing={handleAddTrend} returnKeyType="done" />
                  </BlurView>
                  <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddTrend}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipGrid}>
                  {TREND_SUGGESTIONS.filter(t => !trendNames.includes(t)).map(t => (
                    <TouchableOpacity key={t} style={styles.chip} onPress={() => setTrendNames([...trendNames, t])}>
                      <Text style={styles.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* ── Aesthetics Safety Section (AESTHETICS only) ──────── */}
              {isAesthetics && (
                <View style={[styles.inputGroup, styles.safetyCard]}>
                  <Text style={styles.safetySectionTitle}>Treatment Safety</Text>
                  <Text style={styles.inputHint}>Required for aesthetic treatments — helps clients book safely</Text>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Patch Test Required</Text>
                      <Text style={styles.toggleHint}>Client must be patch tested before this treatment</Text>
                    </View>
                    <Switch value={patchTestRequired} onValueChange={setPatchTestRequired} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Pregnancy Safe</Text>
                      <Text style={styles.toggleHint}>This treatment is safe during pregnancy</Text>
                    </View>
                    <Switch value={isPregnancySafe} onValueChange={setIsPregnancySafe} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Minimum Age</Text>
                    <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                      <TextInput style={styles.textInput} value={minAge} onChangeText={setMinAge} placeholder="e.g. 18" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={handleInputFocus} />
                    </BlurView>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Contraindications</Text>
                    <Text style={styles.inputHint}>Conditions that prevent this treatment (e.g. active acne, blood thinners)</Text>
                    {contraindications.length > 0 && (
                      <View style={styles.chipGrid}>
                        {contraindications.map(c => (
                          <TouchableOpacity key={c} style={[styles.chip, styles.chipWarning]} onPress={() => setContraindications(contraindications.filter(x => x !== c))}>
                            <Text style={styles.chipTextActive}>{c} ×</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <View style={styles.addAddOnRow}>
                      <BlurView intensity={15} tint="light" style={[styles.inputBlur, { flex: 1 }]}>
                        <TextInput style={styles.textInput} value={contraindicationInput} onChangeText={setContraindicationInput} placeholder="e.g. active eczema" placeholderTextColor="rgba(0,0,0,0.4)" onSubmitEditing={handleAddContraindication} returnKeyType="done" onFocus={handleInputFocus} />
                      </BlurView>
                      <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddContraindication}>
                        <Text style={styles.addAddOnButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Pregnancy safe toggle (non-aesthetics) ───────────── */}
              {!isAesthetics && (
                <View style={styles.inputGroup}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Pregnancy Safe</Text>
                      <Text style={styles.toggleHint}>This service is safe during pregnancy</Text>
                    </View>
                    <Switch value={isPregnancySafe} onValueChange={setIsPregnancySafe} trackColor={{ false: 'rgba(0,0,0,0.1)', true: '#9C27B0' }} thumbColor="#fff" />
                  </View>
                </View>
              )}

              {/* ── Aftercare Notes ──────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Aftercare Notes (Optional)</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlurMultiline}>
                  <TextInput style={[styles.textInput, styles.textInputMultiline]} value={aftercareNotes} onChangeText={setAftercareNotes} placeholder="e.g. Avoid water for 24 hours, no oil-based products..." placeholderTextColor="rgba(0,0,0,0.4)" multiline numberOfLines={3} textAlignVertical="top" onFocus={handleInputFocus} />
                </BlurView>
              </View>

              {/* ── Add-Ons ──────────────────────────────────────────── */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Add-Ons (Optional)</Text>
                <Text style={styles.inputHint}>Optional extras clients can add to this service</Text>
                {addOns.length > 0 && (
                  <View style={styles.addOnsContainer}>
                    {addOns.map((addOn) => (
                      <View key={addOn.id} style={styles.addOnItem}>
                        <View style={styles.addOnInfo}>
                          <Text style={styles.addOnName}>{addOn.name}</Text>
                          <Text style={styles.addOnPrice}>+£{addOn.price}</Text>
                        </View>
                        <TouchableOpacity style={styles.removeAddOnButton} onPress={() => handleRemoveAddOn(addOn.id)}>
                          <Text style={styles.removeAddOnText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.addAddOnRow}>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnNameInput]}>
                    <TextInput style={styles.textInput} value={newAddOnName} onChangeText={setNewAddOnName} placeholder="Add-on name" placeholderTextColor="rgba(0,0,0,0.4)" onFocus={handleInputFocus} />
                  </BlurView>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnPriceInput]}>
                    <TextInput style={styles.textInput} value={newAddOnPrice} onChangeText={setNewAddOnPrice} placeholder="£" placeholderTextColor="rgba(0,0,0,0.4)" keyboardType="numeric" onFocus={handleInputFocus} />
                  </BlurView>
                  <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddAddOn}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Service</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Add Category Modal
interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ visible, onClose, onAdd }) => {
  const [categoryName, setCategoryName] = useState('');

  const handleAdd = () => {
    if (!categoryName.trim()) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    onAdd(categoryName.trim());
    setCategoryName('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.smallModal}>
          <Text style={styles.smallModalTitle}>Add Service Category</Text>
          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="e.g., Braids, Treatments"
              placeholderTextColor="rgba(0,0,0,0.4)"
              autoFocus
            />
          </BlurView>
          <View style={styles.smallModalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleAdd}>
              <Text style={styles.saveButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

// Transfer Data Modal
interface TransferDataModalProps {
  visible: boolean;
  onClose: () => void;
  onTransfer: (url: string) => Promise<void>;
  onSkip: () => void;
}

const TransferDataModal: React.FC<TransferDataModalProps> = ({
  visible,
  onClose,
  onTransfer,
  onSkip,
}) => {
  const [acuityUrl, setAcuityUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const handleTransferPress = async () => {
    const trimmed = acuityUrl.trim();
    if (!trimmed) {
      setErrorMsg('Please paste your Acuity Scheduling link first.');
      return;
    }
    if (!trimmed.startsWith('http')) {
      setErrorMsg('Please paste the full URL starting with https://');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    setStatusMsg('Fetching your Acuity page…');
    try {
      setStatusMsg('Reading your services…');
      await onTransfer(trimmed);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Something went wrong. Please try again.');
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={40} tint="light" style={styles.transferModal}>
          <LinearGradient
            colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
            style={styles.transferGradient}
          />
          <Text style={styles.transferTitle}>Import from Acuity</Text>
          <Text style={styles.transferSubtitle}>
            Paste your Acuity Scheduling link and we'll automatically import your services, prices, and business info.
          </Text>

          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={acuityUrl}
              onChangeText={(text) => { setAcuityUrl(text); setErrorMsg(''); }}
              placeholder="https://acuityscheduling.com/schedule.php?owner=…"
              placeholderTextColor="rgba(0,0,0,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isLoading}
            />
          </BlurView>

          {errorMsg ? (
            <Text style={styles.transferError}>{errorMsg}</Text>
          ) : null}

          {isLoading ? (
            <View style={styles.transferLoadingRow}>
              <ActivityIndicator size="small" color="#AF9197" />
              <Text style={styles.transferLoadingText}>{statusMsg}</Text>
            </View>
          ) : null}

          <View style={styles.transferButtons}>
            <TouchableOpacity
              style={[styles.transferButton, isLoading && { opacity: 0.5 }]}
              onPress={handleTransferPress}
              disabled={isLoading}
            >
              <Text style={styles.transferButtonText}>
                {isLoading ? 'Importing…' : 'Import My Profile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} disabled={isLoading}>
              <Text style={styles.skipButtonText}>Start Fresh Instead</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

// Accent Color Picker Modal
interface AccentColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (color: string) => void;
  currentColor: string;
}

const AccentColorPickerModal: React.FC<AccentColorPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  currentColor,
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={30} tint="light" style={styles.accentPickerModal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Accent Color</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.accentPickerSubtitle}>
                This color will be used for buttons and highlights
              </Text>
              <View style={styles.accentColorGrid}>
                {ACCENT_COLORS.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.accentColorOption,
                      currentColor === item.color && styles.accentColorOptionSelected,
                    ]}
                    onPress={() => {
                      onSelect(item.color);
                      onClose();
                    }}
                  >
                    <View style={[styles.accentColorSwatch, { backgroundColor: item.color }]} />
                    <Text style={styles.accentColorName}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </BlurView>
      </View>
    </Modal>
  );
};

// Edit Category Modal
interface EditCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (oldName: string, newName: string) => void;
  categoryName: string;
}

const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  visible,
  onClose,
  onSave,
  categoryName,
}) => {
  const [newName, setNewName] = useState(categoryName);

  React.useEffect(() => {
    setNewName(categoryName);
  }, [categoryName]);

  const handleSave = () => {
    if (!newName.trim()) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    onSave(categoryName, newName.trim());
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <BlurView intensity={30} tint="light" style={styles.smallModal}>
          <Text style={styles.smallModalTitle}>Edit Category Name</Text>
          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Category name"
              placeholderTextColor="rgba(0,0,0,0.4)"
              autoFocus
            />
          </BlurView>
          <View style={styles.smallModalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Preview Modal — mirrors the live ProviderProfileScreen: same theme resolution,
// typography, and section set (including Portfolio), so what a provider sees
// here is what a client actually sees. Rebuilt whenever that screen changes.
interface PreviewModalProps {
  visible: boolean;
  onClose: () => void;
  providerData: ProviderRegistrationData;
  accentColor: string;
  portfolio: DbPortfolioItem[];
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  onClose,
  providerData,
  accentColor,
  portfolio,
}) => {
  const categoryNames = Object.keys(providerData.categories);
  const [selectedPreviewCategory, setSelectedPreviewCategory] = useState<string>(
    categoryNames[0] || ''
  );
  const [showFullAbout, setShowFullAbout] = useState(false);

  // Update selected category when categories change
  React.useEffect(() => {
    if (categoryNames.length > 0 && !categoryNames.includes(selectedPreviewCategory)) {
      setSelectedPreviewCategory(categoryNames[0] || '');
    }
  }, [categoryNames, selectedPreviewCategory]);

  // Mock rating for preview
  const mockRating = 5.0;
  const PP = resolveProviderTheme(providerData.profileTheme);
  const cardBg = withAlpha(PP.card, PP.isDark ? 0.5 : 0.9);
  // Some backdrops (Cream, Sky, Blush…) are pale — white hero text needs to
  // flip to dark there, matching ProviderProfileScreen's contrast logic.
  const heroIsDark = isDarkColor(providerData.gradient[0] ?? PP.hero);
  const heroText = heroIsDark ? '#fff' : '#26201E';
  const heroSub = heroIsDark ? 'rgba(255,255,255,0.96)' : 'rgba(38,32,30,0.78)';
  const heroShadow = heroIsDark
    ? { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }
    : undefined;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={[styles.previewContainer, { backgroundColor: PP.bg }]}>
        <LinearGradient
          colors={[providerData.gradient[0] ?? PP.hero, PP.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.previewHeroImage}
        />
        <SafeAreaView style={styles.previewSafeArea} edges={['top', 'bottom']}>
          {/* Preview Header with back button */}
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewBackButton} onPress={onClose}>
              <Text style={styles.previewBackText}>←</Text>
            </TouchableOpacity>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>PREVIEW</Text>
            </View>
          </View>

          <ScrollView
            style={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.previewScrollContentContainer}
          >
            {/* Logo - Bigger with gloss effect like ProviderProfileScreen */}
            <View style={styles.previewLogoContainer}>
              <View style={styles.previewLogoWrapper}>
                {providerData.logo ? (
                  <Image
                    source={{ uri: providerData.logo }}
                    style={styles.previewProviderLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.previewLogoPlaceholder}>
                    <Text style={styles.previewLogoPlaceholderText}>Logo</Text>
                  </View>
                )}
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'transparent']}
                  style={styles.previewLogoGloss}
                />
              </View>
            </View>

            {/* Provider Info - Centered like ProviderProfileScreen */}
            <View style={styles.previewProviderInfoCenter}>
              <Text style={[styles.previewProviderNameLarge, { color: heroText }, heroShadow]}>
                {providerData.providerName || 'Your Business Name'}
              </Text>

              <Text style={[styles.previewMetaText, { color: heroSub }, heroShadow]}>
                {(providerData.providerService === 'OTHER'
                  ? providerData.customServiceType || 'SERVICE'
                  : providerData.providerService
                ).toUpperCase()}
                {providerData.location ? ` · ${providerData.location.toUpperCase()}` : ''}
              </Text>

              {/* Rating */}
              <View style={styles.previewRatingContainer}>
                <View style={styles.previewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Text key={star} style={styles.previewStar}>★</Text>
                  ))}
                </View>
                <Text style={[styles.previewRatingText, { color: heroText }, heroShadow]}>{mockRating}</Text>
              </View>

              {providerData.yearsExperience ? (
                <Text style={[styles.previewYearsText, { color: heroSub }, heroShadow]}>{providerData.yearsExperience} years experience</Text>
              ) : null}

              {/* Slots with Bell */}
              <View style={[styles.previewSlotsPill, { backgroundColor: cardBg, borderColor: PP.border }]}>
                <Text style={[styles.previewSlotsText, { color: PP.sub }]}>
                  {providerData.slotsText || 'Booking info here'}
                </Text>
                <BellIcon size={16} color={PP.sub} />
              </View>
            </View>

            {/* About Section */}
            <View style={[styles.previewCard, { backgroundColor: cardBg, borderColor: PP.border }]}>
              <Text style={[styles.previewSectionTitle, { color: PP.text }]}>Relevant Information</Text>
              <Text style={[styles.previewAboutText, { color: PP.sub }]}>
                {showFullAbout
                  ? providerData.aboutText || 'Your business description will appear here...'
                  : `${(providerData.aboutText || 'Your business description will appear here...').substring(0, 150)}...`}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFullAbout(!showFullAbout)}
                style={styles.previewMoreButton}
              >
                <Text style={[styles.previewMoreButtonText, { color: PP.text }]}>
                  {showFullAbout ? 'Show Less' : 'More'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Services Section */}
            {categoryNames.length > 0 && (
              <View style={styles.previewServicesSection}>
                <Text style={[styles.previewSectionTitleNoCard, { color: PP.text }]}>Services</Text>

                {/* Category Tabs */}
                <FlatList
                  data={categoryNames}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.previewCategoryTabs}
                  keyExtractor={(item, index) => `preview-cat-${item}-${index}`}
                  renderItem={({ item }) => {
                    const selected = selectedPreviewCategory === item;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.previewCategoryTab,
                          { borderColor: selected ? 'transparent' : PP.border, backgroundColor: selected ? accentColor : cardBg },
                        ]}
                        onPress={() => setSelectedPreviewCategory(item)}
                      >
                        <Text style={[styles.previewCategoryTabText, { color: selected ? '#fff' : PP.text }]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                  contentContainerStyle={styles.previewCategoryTabsContent}
                />

                {/* Services List */}
                <View style={styles.previewCategoryServicesContainer}>
                  {providerData.categories[selectedPreviewCategory]?.map((service) => (
                    <View key={service.id} style={[styles.previewServiceItemCard, { backgroundColor: cardBg, borderColor: PP.border }]}>
                      <View style={styles.previewServiceItemRow}>
                        {/* Service Image — accent-tinted initial when no photo, so
                            description text starts at the same x on every card */}
                        {service.images && service.images.length > 0 ? (
                          <Image
                            source={{ uri: service.images[0] }}
                            style={styles.previewServiceImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.previewServiceImagePlaceholder, { backgroundColor: accentColor + '1C' }]}>
                            <Text style={[styles.previewServiceImagePlaceholderText, { color: accentColor }]}>
                              {(service.name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View style={styles.previewServiceItemInfo}>
                          <Text style={[styles.previewServiceItemName, { color: PP.text }]}>{service.name}</Text>
                          <Text style={[styles.previewServiceItemDesc, { color: PP.sub }]} numberOfLines={2}>
                            {service.description}
                          </Text>
                          <View style={styles.previewServiceItemDetails}>
                            <Text style={[styles.previewServiceItemDuration, { color: PP.sub }]}>{service.duration}</Text>
                            <Text style={[styles.previewServiceItemPrice, { color: PP.text }]}>
                              £{service.price}
                            </Text>
                          </View>
                        </View>

                        {/* Book Button */}
                        <View style={[styles.previewBookButton, { backgroundColor: accentColor }]}>
                          <Text style={styles.previewBookButtonText}>Book</Text>
                        </View>
                      </View>

                      {/* Add-ons preview */}
                      {service.addOns && service.addOns.length > 0 && (
                        <View style={[styles.previewServiceAddOns, { borderTopColor: PP.border }]}>
                          <Text style={[styles.previewAddOnsLabel, { color: PP.sub }]}>Add-ons available:</Text>
                          {service.addOns.map((addOn) => (
                            <View key={addOn.id} style={styles.previewAddOnRow}>
                              <Text style={[styles.previewAddOnName, { color: PP.sub }]}>+ {addOn.name}</Text>
                              <Text style={[styles.previewAddOnPrice, { color: accentColor }]}>
                                +£{addOn.price}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Contact Section */}
            <View style={[styles.previewCard, { backgroundColor: cardBg, borderColor: PP.border }]}>
              <Text style={[styles.previewSectionTitle, { color: PP.text }]}>Contact</Text>
              {providerData.location ? (
                <View style={[styles.previewContactRow, { borderBottomColor: PP.border }]}>
                  <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Location</Text>
                  <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>{providerData.location}</Text>
                </View>
              ) : null}
              {providerData.phone ? (
                <View style={[styles.previewContactRow, { borderBottomColor: PP.border }]}>
                  <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Phone</Text>
                  <Text style={[styles.previewContactValue, { color: PP.text }]}>{providerData.phone}</Text>
                </View>
              ) : null}
              {providerData.email ? (
                <View style={[styles.previewContactRow, { borderBottomColor: PP.border }]}>
                  <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Email</Text>
                  <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>{providerData.email}</Text>
                </View>
              ) : null}
              {providerData.instagram ? (
                <View style={[styles.previewContactRow, { borderBottomColor: PP.border }]}>
                  <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Instagram</Text>
                  <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>@{providerData.instagram}</Text>
                </View>
              ) : null}
              {providerData.website ? (
                <View style={styles.previewContactRow}>
                  <Text style={[styles.previewContactLabel, { color: PP.sub }]}>Website</Text>
                  <Text style={[styles.previewContactValue, { color: PP.text }]} numberOfLines={1}>{providerData.website}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.previewContactButton, { backgroundColor: accentColor }]}
                activeOpacity={0.8}
              >
                <Text style={styles.previewContactButtonText}>Get In Touch</Text>
              </TouchableOpacity>
            </View>

            {/* Portfolio Section — bottom, matching ProviderProfileScreen */}
            {portfolio.length > 0 && (
              <View style={styles.previewPortfolioSection}>
                <Text style={[styles.previewSectionTitleNoCard, { color: PP.text }]}>Portfolio</Text>
                <View style={styles.previewPortfolioGrid}>
                  {portfolio.map(item => (
                    <Image key={item.id} source={{ uri: item.image_url }} style={styles.previewPortfolioTile} />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

// Main Component
const InfoRegScreen: React.FC<InfoRegScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
    'Prata-Regular': require('../../assets/fonts/Prata-Regular.ttf'),
  });

  // Ref for main scrollview to enable auto-scroll to focused inputs
  const mainScrollViewRef = useRef<ScrollView>(null);

  // Track input positions for auto-scroll
  const inputPositions = useRef<Record<string, number>>({});

  // Handle input focus - auto-scroll to show the input
  const handleInputFocus = useCallback((inputName: string, yPosition?: number) => {
    if (yPosition !== undefined) {
      inputPositions.current[inputName] = yPosition;
    }
    const scrollTo = inputPositions.current[inputName] || 0;
    setTimeout(() => {
      mainScrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollTo - 250),
        animated: true,
      });
    }, 300);
  }, []);

  // Form state
  const [providerData, setProviderData] = useState<ProviderRegistrationData>({
    providerName: '',
    providerService: 'HAIR',
    customServiceType: '',
    location: '',
    aboutText: '',
    slotsText: 'Slots out every 15th of the month',
    gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    accentColor: '#7B1FA2',
    profileTheme: 'app',
    logo: null,
    categories: {},
    phone: '',
    email: '',
    instagram: '',
    website: '',
    yearsExperience: '',
    businessType: '',
    fullAddress: '',
    addressReleasePolicy: 'on_confirmation',
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'policies'>('profile');
  const [policies, setPolicies] = useState<ProviderPolicies>(DEFAULT_POLICIES);

  // True until the existing-provider fetch settles — without this the form
  // renders with empty defaults ('Provider Registration', blank fields, the
  // 'app' theme) for a beat before the real saved data pops in, which reads
  // as a glitch. Gated in the render below, same as the other profile screens.
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);

  // Load existing provider data and policies from Supabase/AsyncStorage on mount
  useEffect(() => {
    if (!user?.id) { setIsLoadingProvider(false); return; }
    loadProviderFromSupabase(user.id)
      .then(data => {
        if (data) {
          setProviderData(data);
          setIsEditMode(true);
          const firstCat = Object.keys(data.categories)[0];
          if (firstCat) setSelectedCategory(firstCat);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingProvider(false));
    // Load saved policies from Supabase (source of truth), falling back to
    // the local cache inside loadProviderPolicies. Merge over defaults so
    // fields added later (e.g. bookingInstructions) are never undefined.
    loadProviderPolicies(user.id)
      .then(saved => { if (saved) setPolicies({ ...DEFAULT_POLICIES, ...(saved as Partial<ProviderPolicies>) }); })
      .catch(() => {});
  }, [user?.id]);

  // ── Portfolio (client work gallery shown on the public profile) ───────────
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<DbPortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioUploading, setPortfolioUploading] = useState(false);

  useEffect(() => {
    if (!user?.id) { setPortfolioLoading(false); return; }
    supabase.from('providers').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.id) setProviderDbId(data.id);
        else setPortfolioLoading(false); // no provider row yet — nothing to fetch
      });
  }, [user?.id, isEditMode]);

  useEffect(() => {
    if (!providerDbId) return;
    // getProviderPortfolio depends on providerDbId resolving first (a second
    // async hop after the main provider-data load), so it can still lag a
    // moment behind the loading gate above — track it separately so the
    // Portfolio card shows a spinner instead of a bare "no photos yet" flash.
    setPortfolioLoading(true);
    getProviderPortfolio(providerDbId)
      .then(setPortfolioItems)
      .catch(() => {})
      .finally(() => setPortfolioLoading(false));
  }, [providerDbId]);

  const handleAddPortfolioImages = useCallback(async () => {
    if (!user?.id || !providerDbId) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    // Show each picked photo immediately using its local URI — upload happens
    // in the background, so selection never looks like it did nothing even on
    // a slow connection. Each temp entry is swapped for the real DB row (or
    // removed with an error) independently, so one failure in a multi-select
    // batch no longer silently drops the rest.
    const pending = result.assets.map((asset, i) => ({
      tempId: `temp-${Date.now()}-${i}`,
      asset,
    }));
    setPortfolioItems(prev => [
      ...pending.map(({ tempId, asset }): DbPortfolioItem => ({
        id: tempId,
        provider_id: providerDbId,
        service_id: null,
        image_url: asset.uri,
        caption: null,
        category: null,
        tags: null,
        price: null,
        aspect_ratio: asset.width && asset.height ? asset.width / asset.height : 1,
        is_featured: false,
        created_at: new Date().toISOString(),
        vibe_tags: null,
        occasion_tags: null,
        trend_names: null,
        hair_type_shown: null,
        skin_tone_shown: null,
      })),
      ...prev,
    ]);

    setPortfolioUploading(true);
    await Promise.all(pending.map(async ({ tempId, asset }) => {
      try {
        const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // fetch(localUri).blob() is unreliable for file:// URIs in React
        // Native ("Network request failed") — read via expo-file-system and
        // upload as bytes instead, same as the provider logo upload.
        const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
        const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
        const item = await addPortfolioItem(providerDbId, publicUrl, ratio);
        setPortfolioItems(prev => prev.map(p => (p.id === tempId ? item : p)));
      } catch (e: any) {
        setPortfolioItems(prev => prev.filter(p => p.id !== tempId));
        Alert.alert('Upload failed', e?.message ?? 'Could not upload one of the images.');
      }
    }));
    setPortfolioUploading(false);
  }, [user?.id, providerDbId]);

  const handleRemovePortfolioItem = useCallback(async (item: DbPortfolioItem) => {
    // Still-uploading optimistic entries have a local id and were never
    // persisted — just drop them locally, no DB/storage row exists yet.
    if (item.id.startsWith('temp-')) {
      setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
      return;
    }
    try {
      await deletePortfolioItem(item.id);
      setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
      // Best-effort storage cleanup — the row is the source of truth
      const marker = '/portfolio/';
      const idx = item.image_url.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(item.image_url.slice(idx + marker.length));
        try { await supabase.storage.from('portfolio').remove([path]); } catch { /* ignore */ }
      }
    } catch {
      Alert.alert('Error', 'Could not remove photo.');
    }
  }, []);

  // Modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [currentCategory, setCurrentCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Handle logo selection
  const handleSelectLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    const asset = result.assets?.[0];
    if (!result.canceled && asset) {
      setProviderData(prev => ({ ...prev, logo: asset.uri }));
    }
  };

  // Handle data transfer from Acuity Scheduling URL
  const handleTransferData = useCallback(async (url: string) => {
    const extracted = await transferFromAcuity(url);
    // Preserve any existing contact fields not covered by Acuity import
    setProviderData(prev => ({ ...prev, ...extracted }));
    const firstCat = Object.keys(extracted.categories)[0];
    if (firstCat) setSelectedCategory(firstCat);
    setShowTransferModal(false);
    Alert.alert(
      'Import Complete!',
      `We found ${Object.values(extracted.categories).flat().length} services from your Acuity profile. Review and save when ready.`
    );
  }, []);

  // Add service category
  const handleAddCategory = useCallback((name: string) => {
    setProviderData(prev => ({
      ...prev,
      categories: { ...prev.categories, [name]: [] },
    }));
    setSelectedCategory(name);
  }, []);

  // Delete category
  const handleDeleteCategory = useCallback((name: string) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${name}" and all its services?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setProviderData(prev => {
              const newCategories = { ...prev.categories };
              delete newCategories[name];
              return { ...prev, categories: newCategories };
            });
            if (selectedCategory === name) {
              const remaining = Object.keys(providerData.categories).filter(c => c !== name);
              setSelectedCategory(remaining[0] || '');
            }
          },
        },
      ]
    );
  }, [providerData.categories, selectedCategory]);

  // Rename category
  const handleRenameCategory = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;

    setProviderData(prev => {
      const newCategories: Record<string, ServiceData[]> = {};
      Object.keys(prev.categories).forEach(key => {
        if (key === oldName) {
          newCategories[newName.trim()] = prev.categories[key] || [];
        } else {
          newCategories[key] = prev.categories[key] || [];
        }
      });
      return { ...prev, categories: newCategories };
    });

    if (selectedCategory === oldName) {
      setSelectedCategory(newName.trim());
    }
    setShowEditCategoryModal(false);
    setEditingCategory('');
  }, [selectedCategory]);

  // Add/Edit service
  const handleSaveService = useCallback((service: ServiceData) => {
    setProviderData(prev => {
      const categoryServices = prev.categories[currentCategory] || [];
      const existingIndex = categoryServices.findIndex(s => s.id === service.id);

      let updatedServices;
      if (existingIndex >= 0) {
        // Update existing
        updatedServices = [...categoryServices];
        updatedServices[existingIndex] = service;
      } else {
        // Add new
        updatedServices = [...categoryServices, service];
      }

      return {
        ...prev,
        categories: {
          ...prev.categories,
          [currentCategory]: updatedServices,
        },
      };
    });
    setEditingService(null);
  }, [currentCategory]);

  // Delete service
  const handleDeleteService = useCallback((categoryName: string, serviceId: number) => {
    Alert.alert(
      'Delete Service',
      'Are you sure you want to delete this service?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setProviderData(prev => ({
              ...prev,
              categories: {
                ...prev.categories,
                [categoryName]: prev.categories[categoryName]?.filter(s => s.id !== serviceId) || [],
              },
            }));
          },
        },
      ]
    );
  }, []);

  // Submit registration
  const setPolicy = useCallback(<K extends keyof ProviderPolicies>(key: K, value: ProviderPolicies[K]) => {
    setPolicies(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!providerData.providerName.trim()) {
      Alert.alert('Missing Information', 'Please enter your business name.');
      return;
    }
    if (!providerData.location.trim()) {
      Alert.alert('Missing Information', 'Please enter your location.');
      return;
    }
    // A category can exist as an empty tab (added but never filled in) — check
    // actual service count, not just category-key count, or a provider can
    // submit with zero real services while this check silently passes.
    const totalServiceCount = Object.values(providerData.categories)
      .reduce((sum, services) => sum + services.length, 0);
    if (totalServiceCount === 0) {
      Alert.alert('Missing Services', 'Please add at least one service before saving.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not Logged In', 'Please log in to save your profile.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveProviderToSupabase(user.id, providerData);
      await saveProviderPolicies(user.id, policies as unknown as Record<string, unknown>);
      Alert.alert(
        'Profile Saved!',
        'Your provider profile has been saved successfully.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      console.error('Error saving provider profile:', e);
      Alert.alert('Error', 'Couldn\'t save your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [providerData, user, policies]);

  // Get adaptive accent color - now uses user-selected accent color
  const adaptiveAccentColor = useMemo(() => {
    return providerData.accentColor;
  }, [providerData.accentColor]);

  const categoryNames = Object.keys(providerData.categories);

  if (!fontsLoaded || isLoadingProvider) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#AF9197" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemedBackground>
        <LinearGradient
          colors={providerData.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientOverlay}
        />

        <StatusBar barStyle={theme.statusBar} translucent backgroundColor="transparent" />

        {/* Transfer Data Modal */}
        <TransferDataModal
          visible={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransferData}
          onSkip={() => setShowTransferModal(false)}
        />

        {/* Add Category Modal */}
        <AddCategoryModal
          visible={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          onAdd={handleAddCategory}
        />

        {/* Add/Edit Service Modal */}
        <ServiceModal
          visible={showServiceModal}
          onClose={() => {
            setShowServiceModal(false);
            setEditingService(null);
          }}
          onSave={handleSaveService}
          service={editingService}
          categoryName={currentCategory}
        />

        {/* Edit Category Modal */}
        <EditCategoryModal
          visible={showEditCategoryModal}
          onClose={() => {
            setShowEditCategoryModal(false);
            setEditingCategory('');
          }}
          onSave={handleRenameCategory}
          categoryName={editingCategory}
        />

        {/* Preview Modal */}
        <PreviewModal
          visible={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          providerData={providerData}
          accentColor={adaptiveAccentColor}
          portfolio={portfolioItems}
        />

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isEditMode ? 'Edit Profile' : 'Provider Registration'}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => setShowPreviewModal(true)}
              >
                <Ionicons name="eye-outline" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerIconButton, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Ionicons name="checkmark" size={22} color="#000" />}
              </TouchableOpacity>
            </View>
          </View>

            <ScrollView
              ref={mainScrollViewRef}
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={true}
            >
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <TouchableOpacity
                style={styles.logoContainer}
                onPress={handleSelectLogo}
                activeOpacity={0.8}
              >
                {providerData.logo ? (
                  <Image
                    source={{ uri: providerData.logo }}
                    style={styles.providerLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="camera-outline" size={28} color="#a342c3" />
                    <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                  </View>
                )}
                <View style={styles.logoEditBadge}>
                  <Ionicons name="pencil-outline" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Tab switcher */}
            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'profile' && { backgroundColor: adaptiveAccentColor }]}
                onPress={() => setActiveTab('profile')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, activeTab === 'profile' && styles.tabBtnTextActive]}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'policies' && { backgroundColor: adaptiveAccentColor }]}
                onPress={() => setActiveTab('policies')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, activeTab === 'policies' && styles.tabBtnTextActive]}>Policies</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'profile' && (<>

            {/* Business Name */}
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['businessName'] = e.nativeEvent.layout.y; }}
              >
                <Text style={styles.inputLabel}>Business Name *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.providerName}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, providerName: text })
                    }
                    placeholder="Enter your business name"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onFocus={() => handleInputFocus('businessName')}
                  />
                </BlurView>
              </View>

              {/* Service Category */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Type *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.serviceCategoryScroll}
                >
                  {SERVICE_CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.serviceCategoryChip,
                        providerData.providerService === category &&
                          styles.serviceCategoryChipSelected,
                      ]}
                      onPress={() =>
                        setProviderData({ ...providerData, providerService: category })
                      }
                    >
                      <Text
                        style={[
                          styles.serviceCategoryText,
                          providerData.providerService === category &&
                            styles.serviceCategoryTextSelected,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {/* Custom Service Type Input when OTHER is selected */}
                {providerData.providerService === 'OTHER' && (
                  <View
                    style={styles.customServiceInput}
                    onLayout={(e) => { inputPositions.current['customService'] = e.nativeEvent.layout.y + 150; }}
                  >
                    <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                      <TextInput
                        style={styles.textInput}
                        value={providerData.customServiceType}
                        onChangeText={(text) =>
                          setProviderData({ ...providerData, customServiceType: text })
                        }
                        placeholder="What service do you provide?"
                        placeholderTextColor="rgba(0,0,0,0.4)"
                        autoFocus
                        onFocus={() => handleInputFocus('customService')}
                      />
                    </BlurView>
                  </View>
                )}
              </View>

              {/* Location */}
              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['location'] = e.nativeEvent.layout.y + 200; }}
              >
                <Text style={styles.inputLabel}>Location *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.location}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, location: text })
                    }
                    placeholder="e.g., North West London"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onFocus={() => handleInputFocus('location')}
                  />
                </BlurView>
              </View>
            </BlurView>

            {/* About Section */}
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>About Your Business</Text>
              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['about'] = e.nativeEvent.layout.y + 500; }}
              >
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlurMultiline}>
                  <TextInput
                    style={[styles.textInput, styles.textInputMultiline]}
                    value={providerData.aboutText}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, aboutText: text })
                    }
                    placeholder="Tell clients about your services, policies, deposit requirements..."
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    onFocus={() => handleInputFocus('about')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['slots'] = e.nativeEvent.layout.y + 600; }}
              >
                <Text style={styles.inputLabel}>Availability Message</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.slotsText}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, slotsText: text })
                    }
                    placeholder="e.g., Slots out every 15th of the month"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    onFocus={() => handleInputFocus('slots')}
                  />
                </BlurView>
              </View>
            </BlurView>

            {/* Portfolio — client work gallery shown on your public profile */}
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Text style={styles.sectionSubtitle}>
                Photos of your work, shown on your public profile in a two-column gallery.
              </Text>

              {portfolioLoading ? (
                <View style={styles.portfolioLoadingRow}>
                  <ActivityIndicator color="#AF9197" />
                </View>
              ) : (
                <View style={styles.portfolioGrid}>
                  {portfolioItems.map(item => (
                    <View key={item.id} style={styles.portfolioThumbWrap}>
                      <Image source={{ uri: item.image_url }} style={styles.portfolioThumb} />
                      <TouchableOpacity
                        style={styles.portfolioRemoveBtn}
                        onPress={() => handleRemovePortfolioItem(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.portfolioRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.portfolioAddTile}
                    onPress={handleAddPortfolioImages}
                    activeOpacity={0.8}
                    disabled={portfolioUploading || !providerDbId}
                  >
                    {portfolioUploading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.portfolioAddPlus}>+</Text>
                        <Text style={styles.portfolioAddText}>Add Photos</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {!providerDbId && !portfolioLoading && (
                <Text style={styles.inputHint}>Save your profile once before adding portfolio photos.</Text>
              )}
            </BlurView>

            {/* Contact Information */}
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>Contact Information</Text>
              <Text style={styles.sectionSubtitle}>
                What clients see on your public profile
              </Text>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['phone'] = e.nativeEvent.layout.y + 700; }}
              >
                <Text style={styles.inputLabel}>Phone Number</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.phone}
                    onChangeText={(text) => setProviderData({ ...providerData, phone: text })}
                    placeholder="+44 7XXX XXXXXX"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="phone-pad"
                    onFocus={() => handleInputFocus('phone')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['contactEmail'] = e.nativeEvent.layout.y + 750; }}
              >
                <Text style={styles.inputLabel}>Contact Email</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.email}
                    onChangeText={(text) => setProviderData({ ...providerData, email: text })}
                    placeholder="bookings@yourbusiness.com"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('contactEmail')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['instagram'] = e.nativeEvent.layout.y + 800; }}
              >
                <Text style={styles.inputLabel}>Instagram Handle</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.instagram}
                    onChangeText={(text) =>
                      setProviderData({ ...providerData, instagram: text.replace(/^@/, '') })
                    }
                    placeholder="yourbusiness"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('instagram')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['website'] = e.nativeEvent.layout.y + 850; }}
              >
                <Text style={styles.inputLabel}>Website</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.website}
                    onChangeText={(text) => setProviderData({ ...providerData, website: text })}
                    placeholder="https://yourbusiness.com"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleInputFocus('website')}
                  />
                </BlurView>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(e) => { inputPositions.current['experience'] = e.nativeEvent.layout.y + 900; }}
              >
                <Text style={styles.inputLabel}>Years of Experience</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={providerData.yearsExperience}
                    onChangeText={(text) => setProviderData({ ...providerData, yearsExperience: text.replace(/[^0-9]/g, '') })}
                    placeholder="e.g., 5"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('experience')}
                  />
                </BlurView>
              </View>
            </BlurView>

            {/* Services Section */}
            <View style={styles.servicesSection}>
              <View style={styles.servicesSectionHeader}>
                <Text style={styles.sectionTitleNoCard}>Your Services</Text>
                <TouchableOpacity
                  style={[styles.addCategoryButton, { backgroundColor: adaptiveAccentColor }]}
                  onPress={() => setShowCategoryModal(true)}
                >
                  <Text style={styles.addCategoryText}>+ Add Category</Text>
                </TouchableOpacity>
              </View>

              {categoryNames.length === 0 ? (
                <BlurView intensity={50} tint="light" style={styles.emptyServicesCard}>
                  <Text style={styles.emptyServicesText}>
                    Add service categories (e.g., "Classic Lashes", "Volume Lashes") and then add
                    your services to each category.
                  </Text>
                </BlurView>
              ) : (
                <>
                  {/* Category Tabs */}
                  <FlatList
                    data={categoryNames}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryTabs}
                    keyExtractor={(item, index) => `cat-${item}-${index}`}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.categoryTab,
                          selectedCategory === item && styles.selectedCategoryTab,
                        ]}
                        onPress={() => setSelectedCategory(item)}
                        onLongPress={() => {
                          Alert.alert(
                            'Edit Category',
                            `What would you like to do with "${item}"?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Rename',
                                onPress: () => {
                                  setEditingCategory(item);
                                  setShowEditCategoryModal(true);
                                },
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => handleDeleteCategory(item),
                              },
                            ]
                          );
                        }}
                      >
                        <BlurView
                          intensity={selectedCategory === item ? 20 : 12}
                          tint="light"
                          style={[
                            styles.categoryTabBlur,
                            selectedCategory === item && styles.selectedCategoryTabBlur,
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryTabText,
                              selectedCategory === item && styles.selectedCategoryTabText,
                            ]}
                          >
                            {item}
                          </Text>
                        </BlurView>
                      </TouchableOpacity>
                    )}
                    contentContainerStyle={styles.categoryTabsContent}
                  />

                  {/* Services in Selected Category */}
                  {selectedCategory && (
                    <View style={styles.categoryServicesContainer}>
                      {providerData.categories[selectedCategory]?.map((service) => (
                        <View key={service.id} style={styles.serviceItemCard}>
                          <BlurView intensity={50} tint="light" style={styles.serviceCardBlur}>
                            <LinearGradient
                              colors={['rgba(255,255,255,0.3)', 'transparent']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={styles.cardHighlight}
                            />
                            <View style={styles.serviceItem}>
                              {/* Service Image Carousel */}
                              <View style={styles.serviceImageContainer}>
                                {service.images.length > 0 ? (
                                  <FlatList
                                    data={service.images}
                                    horizontal
                                    pagingEnabled
                                    showsHorizontalScrollIndicator={false}
                                    keyExtractor={(_, index) => index.toString()}
                                    renderItem={({ item }) => (
                                      <Image
                                        source={{ uri: item }}
                                        style={styles.serviceImage}
                                        resizeMode="cover"
                                      />
                                    )}
                                  />
                                ) : (
                                  <View style={styles.serviceImagePlaceholder}>
                                    <Text style={styles.serviceImagePlaceholderText}>📷</Text>
                                  </View>
                                )}
                                {service.images.length > 1 && (
                                  <View style={styles.imageCountBadge}>
                                    <Text style={styles.imageCountText}>
                                      {service.images.length}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              <View style={styles.serviceInfo}>
                                <Text style={styles.serviceName}>{service.name}</Text>
                                <Text style={styles.serviceDescription} numberOfLines={2}>
                                  {service.description}
                                </Text>
                                <View style={styles.serviceDetails}>
                                  <Text style={styles.serviceDuration}>{service.duration}</Text>
                                  <Text
                                    style={[
                                      styles.servicePrice,
                                      { color: adaptiveAccentColor },
                                    ]}
                                  >
                                    £{service.price}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.serviceActions}>
                                <TouchableOpacity
                                  style={styles.editServiceButton}
                                  onPress={() => {
                                    setCurrentCategory(selectedCategory);
                                    setEditingService(service);
                                    setShowServiceModal(true);
                                  }}
                                >
                                  <Text style={styles.editServiceText}>✎</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.deleteServiceButton}
                                  onPress={() =>
                                    handleDeleteService(selectedCategory, service.id)
                                  }
                                >
                                  <Text style={styles.deleteServiceText}>×</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </BlurView>
                        </View>
                      ))}

                      {/* Add Service Button */}
                      <TouchableOpacity
                        style={styles.addServiceButton}
                        onPress={() => {
                          setCurrentCategory(selectedCategory);
                          setEditingService(null);
                          setShowServiceModal(true);
                        }}
                      >
                        <BlurView intensity={30} tint="light" style={styles.addServiceBlur}>
                          <Text style={[styles.addServiceText, { color: adaptiveAccentColor }]}>
                            + Add Service to {selectedCategory}
                          </Text>
                        </BlurView>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>

            </>)}

            {activeTab === 'policies' && (
              <BlurView intensity={50} tint="light" style={styles.policiesCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={styles.cardHighlight}
                />

                {/* Cancellation */}
                <Text style={styles.policySectionTitle}>Cancellation</Text>
                <Text style={styles.policyLabel}>NOTICE REQUIRED</Text>
                <View style={styles.pillRow}>
                  {(['none', '24h', '48h', '72h'] as CancelNotice[]).map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.policyPill, policies.cancelNotice === opt && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('cancelNotice', opt)}
                    >
                      <Text style={[styles.policyPillText, policies.cancelNotice === opt && { color: '#fff' }]}>
                        {opt === 'none' ? 'None' : opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.policyLabel, { marginTop: 12 }]}>IF CANCELLED LATE</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'none' as CancelPenalty,    l: 'No penalty' },
                    { v: 'deposit' as CancelPenalty, l: 'Deposit kept' },
                    { v: 'full' as CancelPenalty,    l: 'Full charge' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.cancelPenalty === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('cancelPenalty', v)}
                    >
                      <Text style={[styles.policyPillText, policies.cancelPenalty === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (e.g. cancellations via message only)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.cancelNote}
                  onChangeText={v => setPolicy('cancelNote', v)}
                />

                <View style={styles.policySep} />

                {/* Rescheduling */}
                <Text style={styles.policySectionTitle}>Rescheduling</Text>
                <Text style={styles.policyLabel}>NOTICE REQUIRED</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'same_day' as RescheduleNotice, l: 'Same day' },
                    { v: '24h' as RescheduleNotice,      l: '24h' },
                    { v: '48h' as RescheduleNotice,      l: '48h' },
                    { v: '72h' as RescheduleNotice,      l: '72h' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.rescheduleNotice === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('rescheduleNotice', v)}
                    >
                      <Text style={[styles.policyPillText, policies.rescheduleNotice === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.policyLabel, { marginTop: 12 }]}>MAX RESCHEDULES PER BOOKING</Text>
                <View style={styles.pillRow}>
                  {(['1', '2', 'unlimited'] as MaxReschedules[]).map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.policyPill, policies.maxReschedules === opt && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('maxReschedules', opt)}
                    >
                      <Text style={[styles.policyPillText, policies.maxReschedules === opt && { color: '#fff' }]}>
                        {opt === 'unlimited' ? 'Unlimited' : opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (optional)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.rescheduleNote}
                  onChangeText={v => setPolicy('rescheduleNote', v)}
                />

                <View style={styles.policySep} />

                {/* Deposit */}
                <Text style={styles.policySectionTitle}>Deposit</Text>
                <View style={styles.depositHeader}>
                  <Text style={styles.policyLabel}>REQUIRE DEPOSIT</Text>
                  <Switch
                    value={policies.depositRequired}
                    onValueChange={v => setPolicy('depositRequired', v)}
                    trackColor={{ false: 'rgba(0,0,0,0.12)', true: adaptiveAccentColor }}
                    thumbColor="#fff"
                  />
                </View>
                {policies.depositRequired && (
                  <>
                    <View style={styles.depositRow}>
                      <View style={styles.pillRow}>
                        {(['percent', 'fixed'] as DepositType[]).map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.policyPill, policies.depositType === opt && { backgroundColor: adaptiveAccentColor }]}
                            onPress={() => setPolicy('depositType', opt)}
                          >
                            <Text style={[styles.policyPillText, policies.depositType === opt && { color: '#fff' }]}>
                              {opt === 'percent' ? '%' : '£'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.depositInput}
                        placeholder={policies.depositType === 'percent' ? 'e.g. 20' : 'e.g. 25'}
                        placeholderTextColor="rgba(0,0,0,0.3)"
                        value={policies.depositAmount}
                        onChangeText={v => setPolicy('depositAmount', v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <TextInput
                      style={styles.policyNote}
                      placeholder="Note (optional)"
                      placeholderTextColor="rgba(0,0,0,0.3)"
                      value={policies.depositNote}
                      onChangeText={v => setPolicy('depositNote', v)}
                    />
                  </>
                )}

                <View style={styles.policySep} />

                {/* No-show */}
                <Text style={styles.policySectionTitle}>No-show</Text>
                <Text style={styles.policyLabel}>ACTION</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'none' as NoShowAction,           l: 'No action' },
                    { v: 'warn' as NoShowAction,           l: 'Warn client' },
                    { v: 'charge_deposit' as NoShowAction, l: 'Charge deposit' },
                    { v: 'charge_full' as NoShowAction,    l: 'Charge in full' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, policies.noShowAction === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setPolicy('noShowAction', v)}
                    >
                      <Text style={[styles.policyPillText, policies.noShowAction === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.policyNote}
                  placeholder="Note (optional)"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.noShowNote}
                  onChangeText={v => setPolicy('noShowNote', v)}
                />

                <View style={styles.policySep} />

                {/* Booking instructions — stamped onto every new booking */}
                <Text style={styles.policySectionTitle}>Booking Instructions</Text>
                <Text style={styles.policyLabel}>SHOWN TO CLIENTS ON EVERY BOOKING (OPTIONAL)</Text>
                <TextInput
                  style={styles.policyNote}
                  placeholder='e.g. "Please arrive 10 minutes early", parking info…'
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={policies.bookingInstructions}
                  onChangeText={v => setPolicy('bookingInstructions', v)}
                  multiline
                />

                {/* ── Business Setup ── */}
                <View style={styles.policySep} />
                <Text style={styles.policySectionTitle}>Business Setup</Text>
                <Text style={styles.policyLabel}>TYPE</Text>
                <View style={styles.pillRow}>
                  {([
                    { v: 'salon'     as const, l: 'Salon' },
                    { v: 'studio'    as const, l: 'Studio' },
                    { v: 'home_based'as const, l: 'Home Based' },
                    { v: 'mobile'    as const, l: 'Mobile' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.policyPill, providerData.businessType === v && { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => setProviderData(prev => ({ ...prev, businessType: v }))}
                    >
                      <Text style={[styles.policyPillText, providerData.businessType === v && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {providerData.businessType !== 'mobile' && (
                  <>
                    <Text style={[styles.policyLabel, { marginTop: 14 }]}>FULL ADDRESS</Text>
                    <Text style={styles.addressHint}>
                      {providerData.businessType === 'home_based'
                        ? 'Shared with clients only when you release it — never shown publicly.'
                        : 'Your business address. Shown to clients once booking is confirmed.'}
                    </Text>
                    <TextInput
                      style={styles.policyNote}
                      placeholder="e.g. 42 Oak Street, London, N1 2AB"
                      placeholderTextColor="rgba(0,0,0,0.3)"
                      value={providerData.fullAddress}
                      onChangeText={v => setProviderData(prev => ({ ...prev, fullAddress: v }))}
                      multiline
                    />

                    <Text style={[styles.policyLabel, { marginTop: 14 }]}>ADDRESS RELEASE</Text>
                    <View style={styles.pillRow}>
                      {([
                        { v: 'always'           as const, l: 'Always visible',  show: providerData.businessType === 'salon' || providerData.businessType === 'studio' },
                        { v: 'on_confirmation'  as const, l: 'On confirmation', show: true },
                        { v: 'day_before'       as const, l: '24h before',      show: providerData.businessType === 'home_based' },
                        { v: 'two_days_before'  as const, l: '48h before',      show: providerData.businessType === 'home_based' },
                        { v: 'three_days_before'as const, l: '72h before',      show: providerData.businessType === 'home_based' },
                        { v: 'five_days_before' as const, l: '5 days before',   show: providerData.businessType === 'home_based' },
                        { v: 'week_before'      as const, l: '1 week before',   show: providerData.businessType === 'home_based' },
                        { v: 'manual'           as const, l: 'Manual release',  show: providerData.businessType === 'home_based' },
                      ]).filter(o => o.show).map(({ v, l }) => (
                        <TouchableOpacity
                          key={v}
                          style={[styles.policyPill, providerData.addressReleasePolicy === v && { backgroundColor: adaptiveAccentColor }]}
                          onPress={() => setProviderData(prev => ({ ...prev, addressReleasePolicy: v }))}
                        >
                          <Text style={[styles.policyPillText, providerData.addressReleasePolicy === v && { color: '#fff' }]}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {({
                      always:           'Your address is always visible to booked clients.',
                      on_confirmation:  'Address is shared automatically when the booking is confirmed.',
                      day_before:       'Address is automatically shared 24 hours before the appointment.',
                      two_days_before:  'Address is automatically shared 48 hours before the appointment.',
                      three_days_before: 'Address is automatically shared 72 hours before the appointment.',
                      five_days_before:  'Address is automatically shared 5 days before the appointment.',
                      week_before:       'Address is automatically shared 1 week before the appointment.',
                      manual:           'You control when each client receives your address from the booking detail page.',
                    } as Record<string, string>)[providerData.addressReleasePolicy] ? (
                      <Text style={styles.addressHint}>
                        {(({
                          always:           'Your address is always visible to booked clients.',
                          on_confirmation:  'Address is shared automatically when the booking is confirmed.',
                          day_before:       'Address is automatically shared 24 hours before the appointment.',
                          two_days_before:  'Address is automatically shared 48 hours before the appointment.',
                          three_days_before:'Address is automatically shared 72 hours before the appointment.',
                          week_before:      'Address is automatically shared 1 week before the appointment.',
                          manual:           'You control when each client receives your address from the booking detail page.',
                        } as Record<string, string>)[providerData.addressReleasePolicy])}
                      </Text>
                    ) : null}
                  </>
                )}

                {providerData.businessType === 'mobile' && (
                  <Text style={styles.addressHint}>
                    You travel to your clients — no fixed address is shared. Make sure your location text describes your service area.
                  </Text>
                )}
              </BlurView>
            )}

          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5E6FA',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.85,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  backButtonText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: '#000',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Logo Section
  logoSection: {
    alignItems: 'center',
    marginBottom: 25,
  },
  logoContainer: {
    position: 'relative',
  },
  providerLogo: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  logoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 5,
  },
  logoPlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.6)',
  },
  logoEditBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  logoEditIcon: {
    fontSize: 16,
  },

  // Cards
  card: {
    padding: 20,
    borderRadius: 25,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },

  // Portfolio manager
  portfolioLoadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  portfolioThumbWrap: {
    position: 'relative',
    width: 84,
    height: 84,
  },
  portfolioThumb: {
    width: 84,
    height: 84,
    borderRadius: 14,
  },
  portfolioRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioRemoveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  portfolioAddTile: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioAddPlus: {
    fontSize: 22,
    color: 'rgba(0,0,0,0.5)',
    fontWeight: '300',
    lineHeight: 24,
  },
  portfolioAddText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },

  // Section Titles
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 15,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
  },

  // Input Groups
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#000',
    marginBottom: 8,
  },
  inputHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
  },
  inputBlur: {
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  inputBlurMultiline: {
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  textInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    color: '#000',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textInputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },

  // Service Categories
  serviceCategoryScroll: {
    flexGrow: 0,
  },
  serviceCategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  serviceCategoryChipSelected: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderColor: 'rgba(0,0,0,0.3)',
  },
  serviceCategoryText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
  },
  serviceCategoryTextSelected: {
    color: '#000',
  },

  // Gradient Selector
  gradientSelector: {
    alignItems: 'center',
  },
  gradientPreviewLarge: {
    width: '100%',
    height: 60,
    borderRadius: 15,
    marginBottom: 10,
  },
  gradientSelectorText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
  },

  // Services Section
  servicesSection: {
    marginBottom: 20,
  },
  servicesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  addCategoryButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addCategoryText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#fff',
  },
  emptyServicesCard: {
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  emptyServicesText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Category Tabs
  categoryTabs: {
    marginBottom: 15,
    maxHeight: 50,
  },
  categoryTabsContent: {
    paddingRight: 20,
    gap: 10,
  },
  categoryTab: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  selectedCategoryTab: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  categoryTabBlur: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  selectedCategoryTabBlur: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  categoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
  },
  selectedCategoryTabText: {
    color: '#000',
  },

  // Service Cards
  categoryServicesContainer: {
    gap: 12,
  },
  serviceItemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  serviceCardBlur: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  serviceImageContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  serviceImage: {
    width: 60,
    height: 60,
  },
  serviceImagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  serviceImagePlaceholderText: {
    fontSize: 24,
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageCountText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#fff',
  },
  serviceInfo: {
    flex: 1,
    marginRight: 10,
  },
  serviceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 6,
  },
  serviceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0,0,0,0.5)',
  },
  servicePrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  serviceActions: {
    gap: 8,
  },
  editServiceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editServiceText: {
    fontSize: 14,
  },
  deleteServiceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,100,100,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteServiceText: {
    fontSize: 18,
    color: '#c00',
    fontWeight: 'bold',
  },
  addServiceButton: {
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.2)',
  },
  addServiceBlur: {
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addServiceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    color: '#000',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 15,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },

  // Gradient Picker Modal
  gradientPickerModal: {
    flex: 1,
    marginTop: 100,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  gradientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    paddingBottom: 40,
  },
  gradientOption: {
    width: (screenWidth - 75) / 3,
    alignItems: 'center',
    padding: 10,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gradientOptionSelected: {
    borderColor: '#000',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gradientPreview: {
    width: '100%',
    height: 50,
    borderRadius: 10,
    marginBottom: 8,
  },
  gradientName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#000',
    textAlign: 'center',
  },

  // Service Modal
  serviceModal: {
    flex: 1,
    marginTop: 80,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },

  // Small Modal (Add Category Modal)
  smallModal: {
    marginHorizontal: 30,
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: 25,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  smallModalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 20,
    textAlign: 'center',
  },
  smallModalButtons: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
  },

  // Transfer Modal
  transferModal: {
    marginHorizontal: 25,
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: 30,
    borderRadius: 25,
    overflow: 'hidden',
  },
  transferGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  transferTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    color: '#000',
    textAlign: 'center',
    marginBottom: 10,
  },
  transferSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
  transferButtons: {
    gap: 12,
    marginTop: 20,
  },
  transferButton: {
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#AF9197',
    alignItems: 'center',
  },
  transferButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  skipButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
  },
  transferError: {
    fontSize: 13,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  transferLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  transferLoadingText: {
    fontSize: 13,
    color: '#AF9197',
    fontStyle: 'italic',
  },

  // Buttons
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  cancelButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#AF9197',
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
  },

  // Carousel
  carouselContainer: {
    alignItems: 'center',
  },
  carouselContent: {
    gap: 10,
  },
  carouselImageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
  },
  carouselImage: {
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addImageButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  addImageIcon: {
    fontSize: 24,
    color: 'rgba(0,0,0,0.5)',
  },
  addImageText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  carouselDotActive: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // Accent Color Picker Modal
  accentPickerModal: {
    flex: 1,
    marginTop: 150,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  accentPickerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    marginBottom: 20,
  },
  accentColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  accentColorOption: {
    width: (screenWidth - 90) / 4,
    alignItems: 'center',
    padding: 10,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accentColorOptionSelected: {
    borderColor: '#000',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  accentColorSwatch: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  accentColorName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: '#000',
    textAlign: 'center',
  },

  // Preview Modal - Matches ProviderProfileScreen exactly
  previewContainer: {
    flex: 1,
  },
  previewSafeArea: {
    flex: 1,
  },
  previewHeroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginTop: 50,
  },
  previewBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
  },
  previewBackText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
  },
  previewBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#fff',
    letterSpacing: 1,
  },
  previewScrollContent: {
    flex: 1,
  },
  previewScrollContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  // Logo - Bigger like ProviderProfileScreen
  previewLogoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewLogoWrapper: {
    position: 'relative',
    width: 180,
    height: 180,
  },
  previewProviderLogo: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  previewLogoPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  previewLogoPlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: 'rgba(0,0,0,0.5)',
  },
  previewLogoGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  // Provider Info - Centered
  previewProviderInfoCenter: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  previewProviderNameLarge: {
    fontFamily: 'Prata-Regular',
    fontSize: 26,
    marginBottom: 4,
    textAlign: 'center',
  },
  previewMetaText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  // Rating
  previewRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 8,
  },
  previewStars: {
    flexDirection: 'row',
    gap: 3,
  },
  previewStar: {
    fontSize: 12,
    color: '#FFD700',
  },
  previewRatingText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 4,
  },
  previewYearsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  // Slots with Bell
  previewSlotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  previewSlotsText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  // Generic frosted card — About / Contact
  previewCard: {
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewSectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  previewSectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  previewAboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  previewMoreButton: {
    alignSelf: 'flex-start',
  },
  previewMoreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Services Section
  previewServicesSection: {
    marginBottom: 20,
  },
  previewCategoryTabs: {
    marginBottom: 15,
    maxHeight: 50,
  },
  previewCategoryTabsContent: {
    gap: 10,
  },
  previewCategoryTab: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  previewCategoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    fontWeight: '600',
  },
  previewCategoryServicesContainer: {
    gap: 12,
  },
  previewServiceItemCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
  previewServiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewServiceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  previewServiceImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  previewServiceImagePlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
  },
  previewServiceItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  previewServiceItemName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 4,
  },
  previewServiceItemDesc: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 6,
  },
  previewServiceItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewServiceItemDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
  },
  previewServiceItemPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Book Button
  previewBookButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewBookButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Add-ons in preview
  previewServiceAddOns: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  previewAddOnsLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    marginBottom: 4,
  },
  previewAddOnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  previewAddOnName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
  },
  previewAddOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  // Contact rows — matches ProviderProfileScreen's contactRow layout
  previewContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewContactLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
  },
  previewContactValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    paddingLeft: 16,
  },
  previewContactButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  previewContactButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#fff',
  },
  // Portfolio — simple two-column grid (the real screen's masonry is a nice-to-have;
  // uniform tiles convey the look accurately without duplicating that algorithm)
  previewPortfolioSection: {
    marginBottom: 20,
  },
  previewPortfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewPortfolioTile: {
    width: (screenWidth - 40 - 12) / 2,
    height: (screenWidth - 40 - 12) / 2,
    borderRadius: 18,
  },

  // Custom Service Type Input
  customServiceInput: {
    marginTop: 10,
  },

  // Accent Color Preview
  accentColorPreview: {
    width: '100%',
    height: 60,
    borderRadius: 15,
    marginBottom: 10,
  },

  // Category Edit Hint
  categoryEditHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    color: 'rgba(0,0,0,0.4)',
    marginTop: 2,
  },

  // Add-Ons Styles
  addOnsContainer: {
    marginTop: 10,
    marginBottom: 15,
    gap: 8,
  },
  addOnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  addOnInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    marginRight: 10,
  },
  addOnName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    flex: 1,
  },
  addOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#7B1FA2',
  },
  removeAddOnButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,100,100,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAddOnText: {
    fontSize: 16,
    color: '#c00',
    fontWeight: 'bold',
  },
  addAddOnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  addOnNameInput: {
    flex: 2,
  },
  addOnPriceInput: {
    flex: 1,
  },
  addAddOnButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#AF9197',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddOnButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },

  // ── Chip select ──
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  chipActive: {
    backgroundColor: 'rgba(218,112,214,0.2)',
    borderColor: 'rgba(218,112,214,0.4)',
  },
  chipWarning: {
    backgroundColor: '#FF6868',
    borderColor: '#FF6868',
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.65)',
    fontWeight: '500',
  },
  chipTextActive: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },

  // ── Safety card (Aesthetics) ──
  safetyCard: {
    backgroundColor: 'rgba(156,39,176,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(156,39,176,0.18)',
    padding: 16,
    gap: 12,
  },
  safetySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6A1B9A',
    marginBottom: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.75)',
  },
  toggleHint: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.45)',
    marginTop: 1,
  },

  // ── Tab switcher ──
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  tabBtnTextActive: {
    color: '#fff',
  },

  // ── Policies tab ──
  policiesCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
  },
  policySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.75)',
    marginBottom: 10,
  },
  policyLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: 'rgba(0,0,0,0.4)',
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 4,
  },
  policyPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  policyPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.55)',
  },
  policyNote: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: 'rgba(0,0,0,0.7)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  policySep: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 18,
  },
  depositHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  depositInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  savePoliciesBtn: {
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  savePoliciesBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  addressHint: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.45)',
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 17,
  },

});

export default InfoRegScreen;
