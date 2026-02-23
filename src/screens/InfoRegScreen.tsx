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
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { StackScreenProps } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Icon imports
import { BellIcon } from '../components/IconLibrary';

// Theme imports
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

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
interface ProviderRegistrationData {
  providerName: string;
  providerService: string;
  customServiceType: string; // For when OTHER is selected
  location: string;
  aboutText: string;
  slotsText: string;
  gradient: [string, string, ...string[]];
  accentColor: string; // User-selected accent color
  logo: string | null;
  categories: Record<string, ServiceData[]>;
}

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
  description: string;
  images: string[]; // Array of images for carousel
  addOns: AddOnData[]; // Optional add-ons for this service
}

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
  const [name, setName] = useState(service?.name || '');
  const [price, setPrice] = useState(service?.price?.toString() || '');
  const [duration, setDuration] = useState(service?.duration || '');
  const [description, setDescription] = useState(service?.description || '');
  const [images, setImages] = useState<string[]>(service?.images || []);
  const [addOns, setAddOns] = useState<AddOnData[]>(service?.addOns || []);
  const [newAddOnName, setNewAddOnName] = useState('');
  const [newAddOnPrice, setNewAddOnPrice] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset state when service changes
  React.useEffect(() => {
    setName(service?.name || '');
    setPrice(service?.price?.toString() || '');
    setDuration(service?.duration || '');
    setDescription(service?.description || '');
    setImages(service?.images || []);
    setAddOns(service?.addOns || []);
  }, [service]);

  const handleAddImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleAddAddOn = () => {
    if (!newAddOnName.trim() || !newAddOnPrice.trim()) {
      Alert.alert('Missing Information', 'Please enter add-on name and price.');
      return;
    }
    const newAddOn: AddOnData = {
      id: Date.now(),
      name: newAddOnName.trim(),
      price: parseFloat(newAddOnPrice) || 0,
    };
    setAddOns([...addOns, newAddOn]);
    setNewAddOnName('');
    setNewAddOnPrice('');
    Keyboard.dismiss();
  };

  const handleRemoveAddOn = (id: number) => {
    setAddOns(addOns.filter(a => a.id !== id));
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
      description: description.trim(),
      images: images,
      addOns: addOns,
    });
    onClose();
  };

  const handleInputFocus = () => {
    // Scroll to bottom when focusing on inputs at the bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

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
              {/* Service Images Carousel */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Images</Text>
                <ServiceImageCarousel
                  images={images}
                  onAddImage={handleAddImage}
                  onRemoveImage={handleRemoveImage}
                  size={100}
                />
                <Text style={styles.inputHint}>Add multiple images to showcase your service</Text>
              </View>

              {/* Service Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Name *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Classic Lash Extensions"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                  />
                </BlurView>
              </View>

              {/* Price */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Price (£) *</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={price}
                    onChangeText={setPrice}
                    placeholder="e.g., 55"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    keyboardType="numeric"
                  />
                </BlurView>
              </View>

              {/* Duration */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlur}>
                  <TextInput
                    style={styles.textInput}
                    value={duration}
                    onChangeText={setDuration}
                    placeholder="e.g., 2 hours"
                    placeholderTextColor="rgba(0,0,0,0.4)"
                  />
                </BlurView>
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <BlurView intensity={15} tint="light" style={styles.inputBlurMultiline}>
                  <TextInput
                    style={[styles.textInput, styles.textInputMultiline]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe your service..."
                    placeholderTextColor="rgba(0,0,0,0.4)"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    onFocus={handleInputFocus}
                  />
                </BlurView>
              </View>

              {/* Add-Ons Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Add-Ons (Optional)</Text>
                <Text style={styles.inputHint}>Add optional extras clients can add to this service</Text>

                {/* Existing Add-Ons */}
                {addOns.length > 0 && (
                  <View style={styles.addOnsContainer}>
                    {addOns.map((addOn) => (
                      <View key={addOn.id} style={styles.addOnItem}>
                        <View style={styles.addOnInfo}>
                          <Text style={styles.addOnName}>{addOn.name}</Text>
                          <Text style={styles.addOnPrice}>+£{addOn.price}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.removeAddOnButton}
                          onPress={() => handleRemoveAddOn(addOn.id)}
                        >
                          <Text style={styles.removeAddOnText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Add New Add-On */}
                <View style={styles.addAddOnRow}>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnNameInput]}>
                    <TextInput
                      style={styles.textInput}
                      value={newAddOnName}
                      onChangeText={setNewAddOnName}
                      placeholder="Add-on name"
                      placeholderTextColor="rgba(0,0,0,0.4)"
                      onFocus={handleInputFocus}
                    />
                  </BlurView>
                  <BlurView intensity={15} tint="light" style={[styles.inputBlur, styles.addOnPriceInput]}>
                    <TextInput
                      style={styles.textInput}
                      value={newAddOnPrice}
                      onChangeText={setNewAddOnPrice}
                      placeholder="£"
                      placeholderTextColor="rgba(0,0,0,0.4)"
                      keyboardType="numeric"
                      onFocus={handleInputFocus}
                    />
                  </BlurView>
                  <TouchableOpacity style={styles.addAddOnButton} onPress={handleAddAddOn}>
                    <Text style={styles.addAddOnButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Save Button */}
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
  onTransfer: (providerId: string) => void;
  onSkip: () => void;
}

const TransferDataModal: React.FC<TransferDataModalProps> = ({
  visible,
  onClose,
  onTransfer,
  onSkip,
}) => {
  const [providerId, setProviderId] = useState('');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={40} tint="light" style={styles.transferModal}>
          <LinearGradient
            colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
            style={styles.transferGradient}
          />
          <Text style={styles.transferTitle}>Transfer Existing Data?</Text>
          <Text style={styles.transferSubtitle}>
            Do you already have services listed elsewhere? We can help transfer your data.
          </Text>

          <BlurView intensity={15} tint="light" style={styles.inputBlur}>
            <TextInput
              style={styles.textInput}
              value={providerId}
              onChangeText={setProviderId}
              placeholder="Enter your existing provider ID or URL"
              placeholderTextColor="rgba(0,0,0,0.4)"
            />
          </BlurView>

          <View style={styles.transferButtons}>
            <TouchableOpacity
              style={styles.transferButton}
              onPress={() => {
                if (providerId.trim()) {
                  onTransfer(providerId.trim());
                } else {
                  Alert.alert('Missing ID', 'Please enter a provider ID or URL to transfer data.');
                }
              }}
            >
              <Text style={styles.transferButtonText}>Transfer Data</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipButtonText}>Start Fresh</Text>
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

// Preview Modal - Matches ProviderProfileScreen design exactly
interface PreviewModalProps {
  visible: boolean;
  onClose: () => void;
  providerData: ProviderRegistrationData;
  accentColor: string;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  onClose,
  providerData,
  accentColor,
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

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={providerData.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.previewContainer}
      >
        <SafeAreaView style={styles.previewSafeArea} edges={['top', 'bottom']}>
          {/* Preview Header with back button */}
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewBackButton} onPress={onClose}>
              <Text style={styles.previewBackText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.previewHeaderTitle}>Provider Profile</Text>
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
              <Text style={styles.previewProviderNameLarge}>
                @{providerData.providerName || 'YourBusinessName'}
              </Text>

              {/* Rating */}
              <View style={styles.previewRatingContainer}>
                <View style={styles.previewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Text key={star} style={styles.previewStar}>★</Text>
                  ))}
                </View>
                <Text style={styles.previewRatingText}>{mockRating}</Text>
              </View>

              {/* Service Tag with blur */}
              <View style={styles.previewServiceTag}>
                <BlurView intensity={15} tint="light" style={styles.previewServiceTagBlur}>
                  <Text style={styles.previewServiceTagText}>
                    {providerData.providerService === 'OTHER'
                      ? providerData.customServiceType || 'SERVICE'
                      : providerData.providerService}
                  </Text>
                </BlurView>
              </View>

              <Text style={styles.previewLocationText}>
                📍 {providerData.location || 'Your Location'}
              </Text>

              {/* Slots with Bell */}
              <View style={styles.previewServiceTag}>
                <BlurView intensity={15} tint="light" style={styles.previewServiceTagBlur}>
                  <View style={styles.previewSlotsContent}>
                    <Text style={styles.previewSlotsText}>
                      {providerData.slotsText || 'Booking info here'}
                    </Text>
                    <View style={styles.previewBellButton}>
                      <BellIcon size={16} color="#000" />
                    </View>
                  </View>
                </BlurView>
              </View>

              {/* Follow Button */}
              <TouchableOpacity style={styles.previewFollowButton} activeOpacity={0.8}>
                <BlurView intensity={12} tint="light" style={styles.previewFollowButtonBlur}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.previewFollowButtonGradient}
                  />
                  <Text style={styles.previewFollowButtonText}>Follow</Text>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* About Section with glass styling */}
            <BlurView intensity={50} tint="light" style={styles.previewAboutCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.previewCardHighlight}
              />
              <Text style={styles.previewSectionTitle}>Relevant Information</Text>
              <Text style={styles.previewAboutText}>
                {showFullAbout
                  ? providerData.aboutText || 'Your business description will appear here...'
                  : `${(providerData.aboutText || 'Your business description will appear here...').substring(0, 150)}...`}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFullAbout(!showFullAbout)}
                style={styles.previewMoreButton}
              >
                <Text style={[styles.previewMoreButtonText, { color: accentColor }]}>
                  {showFullAbout ? 'Show Less' : 'More'}
                </Text>
              </TouchableOpacity>
            </BlurView>

            {/* Services Section */}
            {categoryNames.length > 0 && (
              <View style={styles.previewServicesSection}>
                <Text style={styles.previewSectionTitleNoCard}>Services</Text>

                {/* Category Tabs */}
                <FlatList
                  data={categoryNames}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.previewCategoryTabs}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.previewCategoryTab,
                        selectedPreviewCategory === item && styles.previewSelectedCategoryTab,
                      ]}
                      onPress={() => setSelectedPreviewCategory(item)}
                    >
                      <BlurView
                        intensity={selectedPreviewCategory === item ? 20 : 12}
                        tint="light"
                        style={[
                          styles.previewCategoryTabBlur,
                          selectedPreviewCategory === item && styles.previewSelectedCategoryTabBlur,
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewCategoryTabText,
                            selectedPreviewCategory === item && styles.previewSelectedCategoryTabText,
                          ]}
                        >
                          {item}
                        </Text>
                      </BlurView>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.previewCategoryTabsContent}
                />

                {/* Services List */}
                <View style={styles.previewCategoryServicesContainer}>
                  {providerData.categories[selectedPreviewCategory]?.map((service) => (
                    <View key={service.id} style={styles.previewServiceItemCard}>
                      <BlurView intensity={50} tint="light" style={styles.previewServiceCardBlur}>
                        <LinearGradient
                          colors={['rgba(255,255,255,0.3)', 'transparent']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.previewCardHighlight}
                        />
                        <View style={styles.previewServiceItemRow}>
                          {/* Service Image */}
                          <View style={styles.previewServiceImageContainer}>
                            {service.images && service.images.length > 0 ? (
                              <Image
                                source={{ uri: service.images[0] }}
                                style={styles.previewServiceImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={styles.previewServiceImagePlaceholder}>
                                <Text style={styles.previewServiceImagePlaceholderText}>📷</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.previewServiceItemInfo}>
                            <Text style={styles.previewServiceItemName}>{service.name}</Text>
                            <Text style={styles.previewServiceItemDesc} numberOfLines={2}>
                              {service.description}
                            </Text>
                            <View style={styles.previewServiceItemDetails}>
                              <Text style={styles.previewServiceItemDuration}>{service.duration}</Text>
                              <Text style={[styles.previewServiceItemPrice, { color: accentColor }]}>
                                £{service.price}
                              </Text>
                            </View>
                          </View>

                          {/* Book Button */}
                          <TouchableOpacity style={styles.previewBookButton} activeOpacity={0.8}>
                            <BlurView intensity={14} tint="light" style={styles.previewBookButtonBlur}>
                              <Text style={styles.previewBookButtonText}>Book</Text>
                            </BlurView>
                          </TouchableOpacity>
                        </View>

                        {/* Add-ons preview */}
                        {service.addOns && service.addOns.length > 0 && (
                          <View style={styles.previewServiceAddOns}>
                            <Text style={styles.previewAddOnsLabel}>Add-ons available:</Text>
                            {service.addOns.map((addOn) => (
                              <View key={addOn.id} style={styles.previewAddOnRow}>
                                <Text style={styles.previewAddOnName}>+ {addOn.name}</Text>
                                <Text style={[styles.previewAddOnPrice, { color: accentColor }]}>
                                  +£{addOn.price}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </BlurView>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Contact Section */}
            <BlurView intensity={50} tint="light" style={styles.previewContactCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.previewCardHighlight}
              />
              <Text style={styles.previewSectionTitle}>Contact Information</Text>
              <Text style={styles.previewContactText}>
                Location: {providerData.location || 'Your Location'}
              </Text>
              <Text style={styles.previewContactText}>
                Service: {providerData.providerService === 'OTHER'
                  ? providerData.customServiceType || 'Service'
                  : providerData.providerService}
              </Text>
              <TouchableOpacity
                style={[styles.previewContactButton, { backgroundColor: accentColor }]}
                activeOpacity={0.8}
              >
                <Text style={styles.previewContactButtonText}>Get In Touch</Text>
              </TouchableOpacity>
            </BlurView>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
};

// Main Component
const InfoRegScreen: React.FC<InfoRegScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
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
        y: Math.max(0, scrollTo - 250), // Scroll to position with more padding for keyboard
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
    logo: null,
    categories: {},
  });

  // Load saved provider data on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const stored = await AsyncStorage.getItem('@provider_reg_data');
        if (stored) {
          const parsed = JSON.parse(stored) as ProviderRegistrationData;
          setProviderData(parsed);
          setShowTransferModal(false); // Skip transfer modal if data already exists
        }
      } catch (e) {
        console.error('Error loading provider data:', e);
      }
    };
    loadSavedData();
  }, []);

  // Modal states
  const [showGradientPicker, setShowGradientPicker] = useState(false);
  const [showAccentColorPicker, setShowAccentColorPicker] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(true);
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProviderData({ ...providerData, logo: result.assets[0].uri });
    }
  };

  // Handle data transfer
  const handleTransferData = useCallback((providerId: string) => {
    // In a real app, this would fetch data from the API
    Alert.alert(
      'Transfer Started',
      `We're fetching your data from ${providerId}. This may take a moment.`,
      [{ text: 'OK', onPress: () => setShowTransferModal(false) }]
    );
    // Simulate transfer - in real app, fetch from API
    // For now, just close the modal
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
  const handleSubmit = useCallback(async () => {
    if (!providerData.providerName.trim()) {
      Alert.alert('Missing Information', 'Please enter your business name.');
      return;
    }
    if (!providerData.location.trim()) {
      Alert.alert('Missing Information', 'Please enter your location.');
      return;
    }
    if (Object.keys(providerData.categories).length === 0) {
      Alert.alert('Missing Services', 'Please add at least one service category.');
      return;
    }

    // Save to AsyncStorage for persistence
    try {
      await AsyncStorage.setItem('@provider_reg_data', JSON.stringify(providerData));
      Alert.alert(
        'Profile Saved!',
        'Your provider profile has been updated successfully.',
        [{ text: 'OK' }]
      );
    } catch (e) {
      console.error('Error saving provider data:', e);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  }, [providerData]);

  // Get adaptive accent color - now uses user-selected accent color
  const adaptiveAccentColor = useMemo(() => {
    return providerData.accentColor;
  }, [providerData.accentColor]);

  const categoryNames = Object.keys(providerData.categories);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
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

        {/* Gradient Picker Modal */}
        <GradientPickerModal
          visible={showGradientPicker}
          onClose={() => setShowGradientPicker(false)}
          onSelect={(colors) => setProviderData({ ...providerData, gradient: colors })}
          currentGradient={providerData.gradient}
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

        {/* Accent Color Picker Modal */}
        <AccentColorPickerModal
          visible={showAccentColorPicker}
          onClose={() => setShowAccentColorPicker(false)}
          onSelect={(color) => setProviderData({ ...providerData, accentColor: color })}
          currentColor={providerData.accentColor}
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
            <Text style={styles.headerTitle}>Provider Registration</Text>
            <View style={{ width: 40 }} />
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
                    <Text style={styles.logoPlaceholderIcon}>📷</Text>
                    <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                  </View>
                )}
                <View style={styles.logoEditBadge}>
                  <Text style={styles.logoEditIcon}>✎</Text>
                </View>
              </TouchableOpacity>
            </View>

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

            {/* Gradient Picker */}
            <BlurView intensity={50} tint="light" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>Profile Theme</Text>
              <Text style={styles.sectionSubtitle}>
                Choose a gradient and accent color for your brand
              </Text>

              {/* Gradient Selector */}
              <Text style={styles.inputLabel}>Background Gradient</Text>
              <TouchableOpacity
                style={styles.gradientSelector}
                onPress={() => setShowGradientPicker(true)}
              >
                <LinearGradient
                  colors={providerData.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientPreviewLarge}
                />
                <Text style={styles.gradientSelectorText}>Tap to change gradient</Text>
              </TouchableOpacity>

              {/* Accent Color Selector */}
              <View style={{ marginTop: 15 }}>
                <Text style={styles.inputLabel}>Accent Color</Text>
                <TouchableOpacity
                  style={styles.gradientSelector}
                  onPress={() => setShowAccentColorPicker(true)}
                >
                  <View style={[styles.accentColorPreview, { backgroundColor: providerData.accentColor }]} />
                  <Text style={styles.gradientSelectorText}>Tap to change accent color</Text>
                </TouchableOpacity>
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
                    keyExtractor={(item) => item}
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

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: adaptiveAccentColor }]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitButtonText}>Submit for Review</Text>
            </TouchableOpacity>

            {/* Preview Button */}
            <TouchableOpacity
              style={styles.previewButton}
              onPress={() => setShowPreviewModal(true)}
            >
              <Text style={[styles.previewButtonText, { color: adaptiveAccentColor }]}>
                Preview Profile
              </Text>
            </TouchableOpacity>
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

  // Submit Button
  submitButton: {
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: '#fff',
  },
  previewButton: {
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  previewButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
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
    backgroundColor: '#7B1FA2',
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
    backgroundColor: '#7B1FA2',
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
    color: '#000',
  },
  previewHeaderTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    color: '#000',
    marginBottom: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Rating
  previewRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  previewStars: {
    flexDirection: 'row',
    gap: 3,
  },
  previewStar: {
    fontSize: 16,
    color: '#FFD700',
  },
  previewRatingText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: '#000',
    fontWeight: 'bold',
  },
  // Service Tag
  previewServiceTag: {
    borderRadius: 25,
    marginBottom: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  previewServiceTagBlur: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  previewServiceTagText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
  },
  previewLocationText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    marginBottom: 15,
  },
  // Slots with Bell
  previewSlotsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewSlotsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: '#000',
  },
  previewBellButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  // Follow Button
  previewFollowButton: {
    borderRadius: 25,
    overflow: 'hidden',
    marginTop: 5,
  },
  previewFollowButtonBlur: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  previewFollowButtonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewFollowButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
  },
  // About Card
  previewAboutCard: {
    padding: 20,
    borderRadius: 25,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  previewCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  previewSectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 10,
  },
  previewSectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 15,
  },
  previewAboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    lineHeight: 20,
  },
  previewMoreButton: {
    marginTop: 10,
  },
  previewMoreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  previewSelectedCategoryTab: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  previewCategoryTabBlur: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  previewSelectedCategoryTabBlur: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  previewCategoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
  },
  previewSelectedCategoryTabText: {
    color: '#000',
  },
  previewCategoryServicesContainer: {
    gap: 12,
  },
  previewServiceItemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  previewServiceCardBlur: {
    flex: 1,
  },
  previewServiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  previewServiceImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  previewServiceImage: {
    width: 60,
    height: 60,
  },
  previewServiceImagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  previewServiceImagePlaceholderText: {
    fontSize: 24,
  },
  previewServiceItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  previewServiceItemName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  previewServiceItemDesc: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 6,
  },
  previewServiceItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewServiceItemDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0,0,0,0.5)',
  },
  previewServiceItemPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Book Button
  previewBookButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewBookButtonBlur: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  previewBookButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#000',
  },
  // Add-ons in preview
  previewServiceAddOns: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    marginTop: 8,
    paddingTop: 8,
  },
  previewAddOnsLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
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
    color: 'rgba(0,0,0,0.6)',
  },
  previewAddOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  // Contact Card
  previewContactCard: {
    padding: 20,
    borderRadius: 25,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  previewContactText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    marginBottom: 8,
  },
  previewContactButton: {
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  previewContactButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
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
    backgroundColor: '#7B1FA2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddOnButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },

});

export default InfoRegScreen;
