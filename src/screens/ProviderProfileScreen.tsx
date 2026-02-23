import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  StyleSheet,
  StatusBar,
  FlatList,
  Dimensions,
  Alert,
  Animated,
  Share,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { StackScreenProps } from '@react-navigation/stack';

// Correct icon imports - using your IconLibrary.tsx
import Icon, { BookmarkIcon, ShareIcon, BellIcon } from '../components/IconLibrary';
import TabIcon from '../components/TabIcon';
import { useCart } from '../contexts/CartContext';

// Import storage from utils
import { storage, STORAGE_KEYS } from '../utils/storage';

// Navigation types
import { HomeStackParamList } from '../navigation/types';

// Theme imports
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

type ProviderProfileScreenProps = StackScreenProps<HomeStackParamList, 'ProviderProfile'>;

const { width: screenWidth } = Dimensions.get('window');

// Fallback icons using text symbols
const HeartIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>♥</Text>
);

const StarIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>★</Text>
);

// Provider interface
interface ProviderData {
  id: string;
  providerName: string;
  providerService: string;
  providerLogo: any;
  location: string;
  rating: number;
  slotsText: string;
  aboutText: string;
  categories: Record<string, ServiceData[]>;
  gradient: [string, string, ...string[]];
}

interface AddOnData {
  id: number;
  name: string;
  price: number;
  description: string;
}

interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  description: string;
  image: any;
  images?: any[]; // Optional array for carousel
  addOns?: AddOnData[]; // Optional per-service add-ons
}

// COMPLETE provider data with all your providers
const getProviderData = (providerId: string): ProviderData => {
  const providers: Record<string, ProviderData> = {
    'styled-by-kathrine': {
      id: 'styled-by-kathrine',
      providerName: 'KATHRINE',
      providerService: 'HAIR',
      providerLogo: require('../../assets/logos/styledbykathrine.png'),
      location: 'North West London',
      rating: 5.0,
      slotsText: 'Slots out every 30th of the month',
      aboutText: `Hey doll! Thank you for visiting KATHRINE's booking page!

By making a booking with me, you accept my terms and conditions.

LOCATION: North West London
DEPOSITS: £20 non-refundable deposit required
PAYMENT: Cash on the day of appointment

Please ensure your hair is clean and detangled before your appointment.`,
      gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
      categories: {
        Installs: [
          {
            id: 1,
            name: 'Pre-bought frontal/closure unit',
            price: 90,
            duration: '2 hours',
            description: 'ONLY APPLIES FOR FACTORY READY MADE WIGS NOT WIGS BY OTHER STYLISTS.',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
          {
            id: 2,
            name: 'Mini frontal (customised closure wig)',
            price: 100,
            duration: '2 hours',
            description:
              'This service includes: customisation of a 4x4 closure or 5x5 mini frontal.',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
          {
            id: 3,
            name: 'Lace frontal unit (wig)',
            price: 110,
            duration: '2.5 hours',
            description:
              'Includes: bleaching of knots, plucking and full customisation, installation, basic styling',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
        ],
        Ponytails: [
          {
            id: 4,
            name: 'High/Mid/Low Ponytail/Bun',
            price: 75,
            duration: '2 hours',
            description: "For ponytail: 1/2 bundles. DM me if you'd like to purchase hair from me.",
            image: require('../../assets/logos/styledbykathrine.png'),
          },
          {
            id: 5,
            name: 'Middle Part Ponytail/Bun',
            price: 75,
            duration: '2 hours',
            description: 'Perfect middle part styling with secure installation.',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
        ],
        'Natural Hair': [
          {
            id: 6,
            name: 'Silk Press',
            price: 60,
            duration: '45 minutes',
            description: 'Professional silk press for smooth, sleek natural hair',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
        ],
        'Sew Ins': [
          {
            id: 7,
            name: 'Sew Ins',
            price: 110,
            duration: '3 hours',
            description: 'Full sew-in installation with professional techniques',
            image: require('../../assets/logos/styledbykathrine.png'),
          },
        ],
      },
    },

    'hair-by-jennifer': {
      id: 'hair-by-jennifer',
      providerName: 'JENNIFER',
      providerService: 'HAIR',
      providerLogo: require('../../assets/logos/hairbyjennifer.png'),
      location: 'Central London',
      rating: 4.9,
      slotsText: 'Slots out every 28th of the month',
      aboutText: `Hey doll! Thank you for visiting JENNIFER's booking page!

Creative hair styling and coloring specialist with years of experience.

LOCATION: Central London
DEPOSITS: £15 non-refundable deposit required
SPECIALITY: Color transformations and cuts`,
      gradient: ['#FF4500', '#FF6347', '#DC143C'],
      categories: {
        'Cut & Style': [
          {
            id: 1,
            name: 'Hair Cut & Style',
            price: 85,
            duration: '1.5 hours',
            description: 'Professional cut and styling with consultation',
            image: require('../../assets/logos/hairbyjennifer.png'),
          },
          {
            id: 2,
            name: 'Trim & Refresh',
            price: 45,
            duration: '45 minutes',
            description: 'Quick trim and style refresh',
            image: require('../../assets/logos/hairbyjennifer.png'),
          },
        ],
        'Color Services': [
          {
            id: 3,
            name: 'Full Color',
            price: 120,
            duration: '3 hours',
            description: 'Complete color transformation with premium products',
            image: require('../../assets/logos/hairbyjennifer.png'),
          },
          {
            id: 4,
            name: 'Highlights',
            price: 100,
            duration: '2.5 hours',
            description: 'Professional highlighting technique',
            image: require('../../assets/logos/hairbyjennifer.png'),
          },
        ],
        Treatments: [
          {
            id: 5,
            name: 'Deep Conditioning',
            price: 35,
            duration: '30 minutes',
            description: 'Intensive moisture therapy for damaged hair',
            image: require('../../assets/logos/hairbyjennifer.png'),
          },
        ],
      },
    },

    'diva-nails': {
      id: 'diva-nails',
      providerName: 'DIVANA',
      providerService: 'NAILS',
      providerLogo: require('../../assets/logos/divanails.png'),
      location: 'South London',
      rating: 5.0,
      slotsText: 'Slots out every 15th of the month',
      aboutText: `Hey doll! Thank you for visiting DIVANA's booking page!

Premium nail art and manicure services with attention to detail.

LOCATION: South London
DEPOSITS: £10 non-refundable deposit required
SPECIALTY: Nail art and gel extensions`,
      gradient: ['#FF69B4', '#FFB6C1', '#FFC1CC'],
      categories: {
        Manicures: [
          {
            id: 1,
            name: 'Classic Manicure',
            price: 25,
            duration: '45 minutes',
            description: 'Traditional manicure with polish',
            image: require('../../assets/logos/divanails.png'),
          },
          {
            id: 2,
            name: 'Gel Manicure',
            price: 45,
            duration: '1 hour',
            description: 'Long-lasting gel manicure with perfect finish',
            image: require('../../assets/logos/divanails.png'),
          },
        ],
        Extensions: [
          {
            id: 3,
            name: 'Gel Extensions',
            price: 55,
            duration: '1.5 hours',
            description: 'Natural looking gel nail extensions',
            image: require('../../assets/logos/divanails.png'),
          },
          {
            id: 4,
            name: 'Acrylic Extensions',
            price: 50,
            duration: '1.5 hours',
            description: 'Durable acrylic nail extensions',
            image: require('../../assets/logos/divanails.png'),
          },
        ],
        'Nail Art': [
          {
            id: 5,
            name: 'Custom Nail Art',
            price: 65,
            duration: '2 hours',
            description: 'Intricate hand-painted designs',
            image: require('../../assets/logos/divanails.png'),
          },
        ],
      },
    },

    'makeup-by-mya': {
      id: 'makeup-by-mya',
      providerName: 'MYA',
      providerService: 'MUA',
      providerLogo: require('../../assets/logos/makeupbymya.png'),
      location: 'East London',
      rating: 4.8,
      slotsText: 'Slots out every 10th of the month',
      aboutText: `Hey doll! Thank you for visiting MYA's booking page!

Professional makeup artist specializing in special events and photography.

LOCATION: East London
DEPOSITS: £20 non-refundable deposit
SPECIALTY: Bridal and event makeup`,
      gradient: ['#E6E6FA', '#DDA0DD', '#DA70D6'],
      categories: {
        'Event Makeup': [
          {
            id: 1,
            name: 'Bridal Makeup',
            price: 120,
            duration: '2 hours',
            description: 'Complete bridal makeup with trial session',
            image: require('../../assets/logos/makeupbymya.png'),
          },
          {
            id: 2,
            name: 'Special Event',
            price: 75,
            duration: '1.5 hours',
            description: 'Professional makeup for special occasions',
            image: require('../../assets/logos/makeupbymya.png'),
          },
        ],
        Photography: [
          {
            id: 3,
            name: 'Photoshoot Makeup',
            price: 85,
            duration: '1.5 hours',
            description: 'Camera-ready makeup for photoshoots',
            image: require('../../assets/logos/makeupbymya.png'),
          },
        ],
      },
    },

    'your-lashed': {
      id: 'your-lashed',
      providerName: 'LASHED',
      providerService: 'LASHES',
      providerLogo: require('../../assets/logos/yourlashed.png'),
      location: 'West London',
      rating: 4.9,
      slotsText: 'Slots out every 12th of the month',
      aboutText: `Hey doll! Thank you for visiting YOUR LASHED booking page!

Expert eyelash extensions and treatments for stunning results.

LOCATION: West London
DEPOSITS: £15 non-refundable deposit
SPECIALTY: Volume lash extensions`,
      gradient: ['#708090', '#778899', '#B0C4DE'],
      categories: {
        'Classic Lashes': [
          {
            id: 1,
            name: 'Classic Full Set',
            price: 55,
            duration: '2 hours',
            description: 'Natural-looking classic lash extensions',
            image: require('../../assets/logos/yourlashed.png'),
          },
          {
            id: 2,
            name: 'Classic Infill',
            price: 35,
            duration: '1 hour',
            description: 'Maintenance for classic lashes',
            image: require('../../assets/logos/yourlashed.png'),
          },
        ],
        'Volume Lashes': [
          {
            id: 3,
            name: 'Volume Full Set',
            price: 75,
            duration: '2.5 hours',
            description: 'Dramatic volume lash extensions',
            image: require('../../assets/logos/yourlashed.png'),
          },
          {
            id: 4,
            name: 'Volume Infill',
            price: 45,
            duration: '1.5 hours',
            description: 'Volume lash maintenance',
            image: require('../../assets/logos/yourlashed.png'),
          },
        ],
        Treatments: [
          {
            id: 5,
            name: 'Lash Lift & Tint',
            price: 40,
            duration: '1 hour',
            description: 'Natural lash enhancement with lift and tint',
            image: require('../../assets/logos/yourlashed.png'),
          },
        ],
      },
    },

    'vikki-laid': {
      id: 'vikki-laid',
      providerName: 'VIKKI',
      providerService: 'HAIR',
      providerLogo: require('../../assets/logos/vikkilaid.png'),
      location: 'North London',
      rating: 4.7,
      slotsText: 'Slots out every 20th of the month',
      aboutText: `Hey doll! Thank you for visiting VIKKI's booking page!

Modern hair styling and cutting techniques with contemporary flair.

LOCATION: North London
DEPOSITS: £18 non-refundable deposit
SPECIALTY: Trendy cuts and styling`,
      gradient: ['#5fd5dcff', '#bd66ff9c', '#33CCCC'],
      categories: {
        'Modern Cuts': [
          {
            id: 1,
            name: 'Trendy Cut & Style',
            price: 70,
            duration: '1.5 hours',
            description: 'Contemporary hair cutting with modern styling',
            image: require('../../assets/logos/vikkilaid.png'),
          },
          {
            id: 2,
            name: 'Bob Cut',
            price: 65,
            duration: '1 hour',
            description: 'Classic and modern bob variations',
            image: require('../../assets/logos/vikkilaid.png'),
          },
        ],
        Styling: [
          {
            id: 3,
            name: 'Blowout',
            price: 35,
            duration: '45 minutes',
            description: 'Professional blowout with heat protection',
            image: require('../../assets/logos/vikkilaid.png'),
          },
        ],
      },
    },

    'kiki-nails': {
      id: 'kiki-nails',
      providerName: 'KIKI',
      providerService: 'NAILS',
      providerLogo: require('../../assets/logos/kikisnails.png'),
      location: 'Central London',
      rating: 4.8,
      slotsText: 'Slots out every 18th of the month',
      aboutText: `Hey doll! Thank you for visiting KIKI's booking page!

Creative nail designs and professional manicure services.

LOCATION: Central London
DEPOSITS: £12 non-refundable deposit
SPECIALTY: Creative nail designs`,
      gradient: ['#1B4332', '#2D5A3D', '#40916C'], // Deep forest green gradient
      categories: {
        'Basic Services': [
          {
            id: 1,
            name: 'Basic Manicure',
            price: 30,
            duration: '45 minutes',
            description: 'Essential nail care with polish',
            image: require('../../assets/logos/kikisnails.png'),
          },
          {
            id: 2,
            name: 'Gel Polish',
            price: 40,
            duration: '1 hour',
            description: 'Long-lasting gel polish application',
            image: require('../../assets/logos/kikisnails.png'),
          },
        ],
        'Creative Designs': [
          {
            id: 3,
            name: 'Artistic Nail Design',
            price: 60,
            duration: '1.5 hours',
            description: 'Unique hand-painted nail art',
            image: require('../../assets/logos/kikisnails.png'),
          },
        ],
      },
    },

    'jana-aesthetics': {
      id: 'jana-aesthetics',
      providerName: 'JANA',
      providerService: 'AESTHETICS',
      providerLogo: require('../../assets/logos/janaaesthetics.png'),
      location: 'West London',
      rating: 4.9,
      slotsText: 'Slots out every 25th of the month',
      aboutText: `Hey doll! Thank you for visiting JANA's booking page!

Professional aesthetics and skincare treatments for radiant skin.

LOCATION: West London
DEPOSITS: £25 non-refundable deposit
SPECIALTY: Anti-aging treatments`,
      gradient: ['#FFE4B5', '#FFDAB9', '#FFB347'], // Jana gets Kiki's old gradient
      categories: {
        'Facial Treatments': [
          {
            id: 1,
            name: 'HydraFacial',
            price: 120,
            duration: '1 hour',
            description: 'Deep cleansing and hydrating facial treatment',
            image: require('../../assets/logos/janaaesthetics.png'),
          },
          {
            id: 2,
            name: 'Anti-Aging Facial',
            price: 95,
            duration: '1.5 hours',
            description: 'Rejuvenating treatment for mature skin',
            image: require('../../assets/logos/janaaesthetics.png'),
          },
        ],
        Injectables: [
          {
            id: 3,
            name: 'Consultation',
            price: 50,
            duration: '30 minutes',
            description: 'Professional aesthetic consultation',
            image: require('../../assets/logos/janaaesthetics.png'),
          },
        ],
      },
    },

    'her-brows': {
      id: 'her-brows',
      providerName: 'HER BROWS',
      providerService: 'BROWS',
      providerLogo: require('../../assets/logos/herbrows.png'),
      location: 'South East London',
      rating: 4.8,
      slotsText: 'Slots out every 14th of the month',
      aboutText: `Hey doll! Thank you for visiting HER BROWS booking page!

Specialist in eyebrow shaping, threading, and microblading.

LOCATION: South East London
DEPOSITS: £15 non-refundable deposit
SPECIALTY: Microblading and brow shaping`,
      gradient: ['#D4A574', '#C8956D', '#B8755A'], // More visible brown-pink gradient
      categories: {
        'Brow Shaping': [
          {
            id: 1,
            name: 'Eyebrow Threading',
            price: 20,
            duration: '30 minutes',
            description: 'Precise eyebrow shaping with threading',
            image: require('../../assets/logos/herbrows.png'),
          },
          {
            id: 2,
            name: 'Brow Wax & Shape',
            price: 25,
            duration: '30 minutes',
            description: 'Professional waxing and shaping',
            image: require('../../assets/logos/herbrows.png'),
          },
        ],
        'Brow Enhancement': [
          {
            id: 3,
            name: 'Brow Tint',
            price: 15,
            duration: '20 minutes',
            description: 'Semi-permanent brow tinting',
            image: require('../../assets/logos/herbrows.png'),
          },
          {
            id: 4,
            name: 'Microblading',
            price: 250,
            duration: '3 hours',
            description: 'Semi-permanent brow tattooing technique',
            image: require('../../assets/logos/herbrows.png'),
          },
        ],
      },
    },
    'rosemay-aesthetics': {
      id: 'rosemay-aesthetics',
      providerName: 'ROSEMAY AESTHETICS',
      providerService: 'AESTHETICS',
      providerLogo: require('../../assets/logos/RoseMayAesthetics.png'),
      location: 'North London',
      rating: 4.9,
      slotsText: 'Book your consultation today',
      aboutText: `Premium aesthetics clinic specializing in dermal fillers, anti-wrinkle treatments, and skin rejuvenation.

LOCATION: North London
DEPOSITS: £50 non-refundable deposit required
PAYMENT: Card or cash accepted

Our expert practitioners use the latest techniques to help you achieve natural-looking results.`,
      gradient: ['#8d59acff', '#c069c4ff', '#aba0a1ff'],
      categories: {
        'Dermal Fillers': [
          { id: 1, name: 'Lip Enhancement', price: 280, duration: '45 mins', description: 'Natural-looking lip volume and definition', image: require('../../assets/logos/RoseMayAesthetics.png') },
          { id: 2, name: 'Cheek Augmentation', price: 350, duration: '45-60 mins', description: 'Add volume and lift to cheeks', image: require('../../assets/logos/RoseMayAesthetics.png') },
          { id: 3, name: 'Jawline Contouring', price: 400, duration: '45-60 mins', description: 'Define and sculpt your jawline', image: require('../../assets/logos/RoseMayAesthetics.png') },
        ],
        'Anti-Wrinkle': [
          { id: 4, name: 'Forehead Lines', price: 180, duration: '30 mins', description: 'Smooth forehead wrinkles', image: require('../../assets/logos/RoseMayAesthetics.png') },
          { id: 5, name: 'Crows Feet', price: 180, duration: '30 mins', description: 'Reduce eye area lines', image: require('../../assets/logos/RoseMayAesthetics.png') },
          { id: 6, name: 'Full Face', price: 350, duration: '45 mins', description: 'Complete facial rejuvenation', image: require('../../assets/logos/RoseMayAesthetics.png') },
        ],
        'Skin Boosters': [
          { id: 7, name: 'Profhilo', price: 220, duration: '30 mins', description: 'Hydrate and firm skin', image: require('../../assets/logos/RoseMayAesthetics.png') },
          { id: 8, name: 'Skin Booster', price: 280, duration: '45 mins', description: 'Deep skin hydration treatment', image: require('../../assets/logos/RoseMayAesthetics.png') },
        ],
      },
    },
    'fillerbyjess': {
      id: 'fillerbyjess',
      providerName: 'FILLER BY JESS',
      providerService: 'AESTHETICS',
      providerLogo: require('../../assets/logos/fillerbyjess.png'),
      location: 'Central London',
      rating: 4.7,
      slotsText: 'Limited slots available',
      aboutText: `Expert aesthetic practitioner specializing in advanced filler techniques.

LOCATION: Central London
DEPOSITS: £60 non-refundable deposit required
PAYMENT: Card payment preferred

Jess brings years of experience in facial aesthetics to deliver stunning, natural results tailored to your unique features.`,
      gradient: ['#413c40ff', '#5e5b55ff', '#e4a8efff'],
      categories: {
        'Lip Treatments': [
          { id: 1, name: 'Advanced Lip Filler', price: 300, duration: '60 mins', description: 'Expert lip enhancement with precise technique', image: require('../../assets/logos/fillerbyjess.png') },
          { id: 2, name: 'Lip Flip', price: 120, duration: '20 mins', description: 'Subtle lip enhancement', image: require('../../assets/logos/fillerbyjess.png') },
        ],
        'Facial Contouring': [
          { id: 3, name: 'Cheek Augmentation', price: 350, duration: '45 mins', description: 'Restore volume and lift to cheeks', image: require('../../assets/logos/fillerbyjess.png') },
          { id: 4, name: 'Non-Surgical Rhinoplasty', price: 380, duration: '45 mins', description: 'Reshape nose without surgery', image: require('../../assets/logos/fillerbyjess.png') },
          { id: 5, name: 'Jawline Contouring', price: 400, duration: '45 mins', description: 'Define and sculpt your jawline', image: require('../../assets/logos/fillerbyjess.png') },
        ],
        'Consultation': [
          { id: 6, name: 'Free Consultation', price: 0, duration: '30 mins', description: 'Discuss your aesthetic goals', image: require('../../assets/logos/fillerbyjess.png') },
        ],
      },
    },
    'eyebrowdeluxe': {
      id: 'eyebrowdeluxe',
      providerName: 'EYEBROW DELUXE',
      providerService: 'BROWS',
      providerLogo: require('../../assets/logos/eyebrowdeluxe.png'),
      location: 'East London',
      rating: 4.8,
      slotsText: 'Same day appointments available',
      aboutText: `London's premier eyebrow studio offering expert shaping, tinting, lamination, and microblading.

LOCATION: East London
DEPOSITS: £30 deposit for microblading
PAYMENT: Cash or card accepted

Transform your brows with our skilled technicians.`,
      gradient: ['#830c53ff', '#f6bbe9ff', '#572862ff'],
      categories: {
        'Brow Services': [
          { id: 1, name: 'Microblading', price: 350, duration: '2-2.5 hours', description: 'Semi-permanent brow tattoo for natural fullness', image: require('../../assets/logos/eyebrowdeluxe.png') },
          { id: 2, name: 'Brow Lamination', price: 45, duration: '45 mins', description: 'Fluffy, full brows that last 6-8 weeks', image: require('../../assets/logos/eyebrowdeluxe.png') },
          { id: 3, name: 'HD Brows', price: 40, duration: '45 mins', description: 'Custom brow shaping and tinting', image: require('../../assets/logos/eyebrowdeluxe.png') },
          { id: 4, name: 'Brow Tinting', price: 18, duration: '20 mins', description: 'Define and darken your natural brows', image: require('../../assets/logos/eyebrowdeluxe.png') },
        ],
        'Combo Packages': [
          { id: 5, name: 'Lamination + Tint', price: 55, duration: '60 mins', description: 'Full brow transformation', image: require('../../assets/logos/eyebrowdeluxe.png') },
          { id: 6, name: 'HD Brows + Tint', price: 50, duration: '60 mins', description: 'Shape and color perfection', image: require('../../assets/logos/eyebrowdeluxe.png') },
        ],
      },
    },
    'lashesgalore': {
      id: 'lashesgalore',
      providerName: 'LASHES GALORE',
      providerService: 'LASHES',
      providerLogo: require('../../assets/logos/lashesgalore.png'),
      location: 'South London',
      rating: 4.9,
      slotsText: 'Booking up fast - reserve your spot',
      aboutText: `Specialist lash studio offering classic, volume, and hybrid lash extensions.

LOCATION: South London
DEPOSITS: £25 non-refundable deposit required
PAYMENT: Cash or card accepted

Our certified technicians create customized lash looks that enhance your natural beauty.`,
      gradient: ['#8ba4e9ff', '#073784ff', '#37106aff'],
      categories: {
        'Lash Extensions': [
          { id: 1, name: 'Classic Lash Extensions', price: 80, duration: '2 hours', description: 'Natural-looking individual lash extensions', image: require('../../assets/logos/lashesgalore.png') },
          { id: 2, name: 'Volume Lash Extensions', price: 120, duration: '2.5 hours', description: 'Fuller, more dramatic lash look', image: require('../../assets/logos/lashesgalore.png') },
          { id: 3, name: 'Mega Volume Lashes', price: 150, duration: '3 hours', description: 'Ultra-full, glamorous lash extensions', image: require('../../assets/logos/lashesgalore.png') },
          { id: 4, name: 'Hybrid Lashes', price: 100, duration: '2.5 hours', description: 'Perfect blend of classic and volume', image: require('../../assets/logos/lashesgalore.png') },
        ],
        'Lash Treatments': [
          { id: 5, name: 'Lash Lift & Tint', price: 50, duration: '1 hour', description: 'Curl and darken your natural lashes', image: require('../../assets/logos/lashesgalore.png') },
          { id: 6, name: 'Lash Removal', price: 20, duration: '30 mins', description: 'Safe lash extension removal', image: require('../../assets/logos/lashesgalore.png') },
        ],
        'Infills': [
          { id: 7, name: '2-Week Infill', price: 45, duration: '1 hour', description: 'Maintain your lash extensions', image: require('../../assets/logos/lashesgalore.png') },
          { id: 8, name: '3-Week Infill', price: 60, duration: '1.5 hours', description: 'Refresh your lash set', image: require('../../assets/logos/lashesgalore.png') },
        ],
      },
    },

    'zeenail-artist': {
      id: 'zeenail-artist',
      providerName: 'ZEE NAIL ARTIST',
      providerService: 'NAILS',
      providerLogo: require('../../assets/logos/ZeeNail Artist.png'),
      location: 'East London',
      rating: 4.8,
      slotsText: 'Slots out every 15th of the month',
      aboutText: `Hey doll! Thank you for visiting ZEE's booking page!

Nail artist specializing in creative nail designs and nail art.

By making a booking with me, you accept my terms and conditions.`,
      gradient: ['#2f0846ff', '#a282d6ff', '#2e0f70ff'] as [string, string, ...string[]],
      categories: {
        'Acrylic Extensions': [
          { id: 1, name: 'Acrylic Extensions', price: 70, duration: '2.5 hours', description: 'Consists of an inspired full set acrylic.', image: require('../../assets/logos/ZeeNail Artist.png') },
          { id: 2, name: 'Freestyle Sets', price: 80, duration: '2.5 hours', description: 'Freestyle can consist of gems and multiple designs on different nails such as ombre etc.', image: require('../../assets/logos/ZeeNail Artist.png') },
          { id: 3, name: 'French Tips', price: 70, duration: '2.5 hours', description: 'Classic French tip sets with any colour accent.', image: require('../../assets/logos/ZeeNail Artist.png') },
        ],
        'Gel & Biab': [
          { id: 4, name: 'Gel Manicure', price: 80, duration: '1 hour', description: 'Long-lasting gel manicure with a glossy finish.', image: require('../../assets/logos/ZeeNail Artist.png') },
          { id: 5, name: 'Biab Manicure', price: 35, duration: '45 mins', description: 'Builder in a bottle manicure (BIAB) for strength and shine.', image: require('../../assets/logos/ZeeNail Artist.png') },
        ],
        'Male Pedicure': [
          { id: 6, name: 'Hands Only Manicure', price: 15, duration: '1 hour', description: 'Professional hand care and manicure service.', image: require('../../assets/logos/ZeeNail Artist.png') },
          { id: 7, name: 'Feet Only Pedicure', price: 20, duration: '1.5 hours', description: 'Complete foot care and pedicure treatment.', image: require('../../assets/logos/ZeeNail Artist.png') },
          { id: 8, name: 'Hands and Feet Combination', price: 55, duration: '2.5 hours', description: 'Full manicure and pedicure package.', image: require('../../assets/logos/ZeeNail Artist.png') },
        ],
        'Combinations': [
          { id: 9, name: 'Hands and Feet Combo', price: 55, duration: '2.5 hours', description: 'Ultimate pampering for hands and feet.', image: require('../../assets/logos/ZeeNail Artist.png') },
        ],
      },
    },

    'painted-by-zoe': {
      id: 'painted-by-zoe',
      providerName: 'PAINTED BY ZOE',
      providerService: 'MUA',
      providerLogo: require('../../assets/logos/paintedbyZoe.png'),
      location: 'West London',
      rating: 4.9,
      slotsText: 'Slots out every 5th of the month',
      aboutText: `Hey doll! Thank you for visiting ZOE's booking page!

Professional makeup artist specializing in bridal, events, and editorial looks.

By making a booking with me, you accept my terms and conditions.`,
      gradient: ['#de981fff', '#e8d950e2', '#a7680bb8'] as [string, string, ...string[]],
      categories: {
        'Makeup Services': [
          { id: 1, name: 'Bridal Makeup', price: 150, duration: '2.5 hours', description: 'Complete bridal makeup with trial', image: require('../../assets/logos/paintedbyZoe.png') },
          { id: 2, name: 'Special Event Makeup', price: 80, duration: '1.5 hours', description: 'Glamorous makeup for special occasions', image: require('../../assets/logos/paintedbyZoe.png') },
          { id: 3, name: 'Editorial Makeup', price: 120, duration: '2 hours', description: 'High-fashion editorial looks', image: require('../../assets/logos/paintedbyZoe.png') },
          { id: 4, name: 'Natural Everyday Makeup', price: 50, duration: '1 hour', description: 'Soft, natural makeup look', image: require('../../assets/logos/paintedbyZoe.png') },
        ],
        'Makeup Lessons': [ 
          { id: 5, name: 'Makeup Tutorial', price: 100, duration: '2 hours', description: 'Learn professional makeup techniques', image: require('../../assets/logos/paintedbyZoe.png') },
          { id: 6, name: 'Bridal Makeup Trial', price: 75, duration: '1.5 hours', description: 'Test your bridal look before the big day', image: require('../../assets/logos/paintedbyZoe.png') },
        ],
      },
    },

    'braided-slick': {
      id: 'braided-slick',
      providerName: 'BRAIDED SLICK',
      providerService: 'HAIR',
      providerLogo: require('../../assets/logos/braided slick.png'),
      location: 'North West London',
      rating: 5.0,
      slotsText: 'Slots out every 20th of the month',
      aboutText: `Hey doll! Thank you for visiting BRAIDED SLICK's booking page!

Specialist in braids, cornrows, and protective hairstyles for all hair types.

By making a booking with me, you accept my terms and conditions.`,
      gradient: ['#8c5c0eff', '#311f00ff', '#6f430eff'] as [string, string, ...string[]],
      categories: {
        'Braids': [
          { id: 1, name: 'Box Braids', price: 120, duration: '4 hours', description: 'Classic box braids in various sizes', image: require('../../assets/logos/braided slick.png') },
          { id: 2, name: 'Knotless Braids', price: 150, duration: '5 hours', description: 'Pain-free knotless braiding technique', image: require('../../assets/logos/braided slick.png') },
          { id: 3, name: 'Cornrows', price: 80, duration: '2.5 hours', description: 'Traditional cornrow styles', image: require('../../assets/logos/braided slick.png') },
          { id: 4, name: 'Feed-In Braids', price: 100, duration: '3.5 hours', description: 'Natural-looking feed-in technique', image: require('../../assets/logos/braided slick.png') },
        ],
        'Protective Styles': [
          { id: 5, name: 'Faux Locs', price: 140, duration: '4.5 hours', description: 'Beautiful faux loc installation', image: require('../../assets/logos/braided slick.png') },
          { id: 6, name: 'Passion Twists', price: 130, duration: '4 hours', description: 'Trendy passion twist styles', image: require('../../assets/logos/braided slick.png') },
          { id: 7, name: 'Senegalese Twists', price: 110, duration: '3.5 hours', description: 'Elegant Senegalese twists', image: require('../../assets/logos/braided slick.png') },
        ],
        'Braid Maintenance': [
          { id: 8, name: 'Braid Touch-Up', price: 60, duration: '2 hours', description: 'Refresh and maintain your braids', image: require('../../assets/logos/braided slick.png') },
          { id: 9, name: 'Braid Takedown', price: 40, duration: '1.5 hours', description: 'Gentle braid removal service', image: require('../../assets/logos/braided slick.png') },
        ],
        'Kids Braiding': [
          { id: 10, name: 'Kids Box Braids', price: 60, duration: '2.5 hours', description: 'Gentle box braids for children (ages 4-12)', image: require('../../assets/logos/braided slick.png') },
          { id: 11, name: 'Kids Cornrows', price: 45, duration: '1.5 hours', description: 'Fun cornrow styles for kids with gentle technique', image: require('../../assets/logos/braided slick.png') },
          { id: 12, name: 'Kids Braids with Beads', price: 55, duration: '2 hours', description: 'Colorful braids with beads for playful look', image: require('../../assets/logos/braided slick.png') },
        ],
      },
    },

    'lash-bae': {
      id: 'lash-bae',
      providerName: 'LASH BAE',
      providerService: 'LASHES',
      providerLogo: require('../../assets/logos/LashBae.png'),
      location: 'Central London',
      rating: 4.9,
      slotsText: 'Slots out every 12th of the month',
      aboutText: `Hey doll! Thank you for visiting LASH BAE's booking page!

Expert lash technician specializing in classic, freestyle, volume, Russian volume, and hybrid lash extensions. Creating stunning lash looks that enhance your natural beauty with precision and care.

LOCATION: Central London

By making a booking with me, you accept my terms and conditions.`,
      gradient: ['#dc8fedb5', '#e0d3e0ff', '#2d2d2d'] as [string, string, ...string[]],
      categories: {
        'Classic Lashes': [
          { id: 1, name: 'Classic Lash Extensions', price: 85, duration: '2 hours', description: 'Natural-looking individual lash extensions for everyday wear.', image: require('../../assets/logos/LashBae.png') },
        ],
        'Freestyle & Volume': [
          { id: 2, name: 'Freestyle Lash Extensions', price: 120, duration: '2.5 hours', description: 'Customized lash design with varying lengths and curls.', image: require('../../assets/logos/LashBae.png') },
          { id: 3, name: 'Volume Lash Extensions', price: 150, duration: '3 hours', description: 'Dramatic volume lashes for a fuller look.', image: require('../../assets/logos/LashBae.png') },
          { id: 4, name: 'Russian Volume Lash Extensions', price: 180, duration: '3.5 hours', description: 'Lightweight, multi-dimensional lashes for a fluffy effect.', image: require('../../assets/logos/LashBae.png') },
        ],
        'Hybrid Lashes': [
          { id: 5, name: 'Hybrid Lash Extensions', price: 150, duration: '3 hours', description: 'A mix of classic and volume techniques for a textured look.', image: require('../../assets/logos/LashBae.png') },
        ],
      },
    },
  };

  return providers[providerId] || providers['styled-by-kathrine']!;
};

// Get service-specific gradient - Memoized
const getServiceGradient = (image: any): [string, string, ...string[]] => {
  const imagePath = image?.toString() || '';
  if (imagePath.includes('hairbyjennifer')) {
    return ['#CC99FF', '#FF99CC'];
  } else if (imagePath.includes('divanails')) {
    return ['#FF69B4', '#FFB6C1'];
  } else if (imagePath.includes('styledbykathrine')) {
    return ['#87CEEB', '#98FB98'];
  } else {
    return ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)'];
  }
};

// Get adaptive accent color based on gradient - Enhanced for better contrast - Memoized
const getAdaptiveAccentColor = (gradient: [string, string, ...string[]]): string => {
  // Extract the dominant color from gradient and ensure visibility
  const primaryColor = gradient[0];

  // Enhanced visibility mapping for different gradients with better contrast
  const colorMap: Record<string, string> = {
    '#FF6B6B': '#C2185B', // Deeper pink for red gradients
    '#FF4500': '#7B1FA2', // Purple for orange gradients
    '#FF69B4': '#6A1B9A', // Deep purple for pink gradients
    '#E6E6FA': '#4A148C', // Deep purple for lavender gradients
    '#708090': '#3F51B5', // Indigo for gray gradients
    '#99FFCC': '#00838F', // Dark cyan for mint gradients
    '#1B4332': '#E91E63', // Pink for Kiki's dark green (better contrast)
    '#FFE4B5': '#E65100', // Dark orange for beige gradients
    '#D4A574': '#8D4E85', // Deep mauve for Her Brows brown-pink gradients
  };

  return colorMap[primaryColor] || '#7B1FA2'; // Default deep purple
};

// Service Image Carousel Component
interface ServiceImageCarouselProps {
  images: any[];
  size?: number;
}

const ServiceImageCarousel: React.FC<ServiceImageCarouselProps> = React.memo(
  ({ images, size = 60 }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback((event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / size);
      setActiveIndex(index);
    }, [size]);

    if (images.length <= 1) {
      // Single image, render normally
      return (
        <Image
          source={images[0]}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      );
    }

    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyExtractor={(_item, index) => `img-${index}`}
          renderItem={({ item }) => (
            <Image
              source={item}
              style={{ width: size, height: size, borderRadius: size / 2 }}
              resizeMode="cover"
            />
          )}
          style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}
          nestedScrollEnabled={true}
        />
        {images.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
            {images.map((_: any, index: number) => (
              <View
                key={index}
                style={{
                  width: activeIndex === index ? 8 : 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: activeIndex === index
                    ? 'rgba(0,0,0,0.7)'
                    : 'rgba(0,0,0,0.25)',
                }}
              />
            ))}
          </View>
        )}
      </View>
    );
  }
);

// Enhanced Tab Component with Animations and Visual Feedback - Properly Typed
interface CategoryTabItemProps {
  category: string;
  isSelected: boolean;
  onPress: () => void;
}

const CategoryTabItem: React.FC<CategoryTabItemProps> = React.memo(
  ({ category, isSelected, onPress }) => {
    const animatedValue = useRef<Animated.Value>(new Animated.Value(0)).current;
    const pressAnimatedValue = useRef<Animated.Value>(new Animated.Value(1)).current;

    React.useEffect(() => {
      Animated.spring(animatedValue, {
        toValue: isSelected ? 1 : 0,
        useNativeDriver: true,
        tension: 150,
        friction: 8,
      }).start();
    }, [isSelected, animatedValue]);

    const handlePressIn = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }, [pressAnimatedValue]);

    const handlePressOut = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
      Haptics.selectionAsync();
      onPress();
    }, [pressAnimatedValue, onPress]);

    const animatedStyle = useMemo(
      () => ({
        transform: [
          {
            translateY: animatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 3],
            }),
          },
          {
            scale: pressAnimatedValue,
          },
        ],
      }),
      [animatedValue, pressAnimatedValue]
    );

    return (
      <TouchableOpacity onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
        <Animated.View style={animatedStyle}>
          <View style={[styles.categoryTab, isSelected && styles.selectedCategoryTab]}>
            <BlurView
              intensity={isSelected ? 20 : 12}
              tint="light"
              style={[styles.categoryTabBlur, isSelected && styles.selectedCategoryTabBlur]}
            >
              <LinearGradient
                colors={
                  isSelected
                    ? ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.2)']
                    : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.tabGradientOverlay}
              />
              <Text style={[styles.categoryTabText, isSelected && styles.selectedCategoryTabText]}>
                {category}
              </Text>
            </BlurView>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  }
);

// Enhanced Action Button Component - Properly Typed
interface ActionButtonProps {
  onPress: () => void;
  style: any;
  textStyle: any;
  children: React.ReactNode;
  intensity?: number;
  isHighlighted?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = React.memo(
  ({ onPress, style, textStyle, children, intensity = 10, isHighlighted = false }) => {
    const pressAnimatedValue = useRef<Animated.Value>(new Animated.Value(1)).current;
    const glowAnimatedValue = useRef<Animated.Value>(new Animated.Value(0)).current;

    const handlePressIn = useCallback(() => {
      Animated.parallel([
        Animated.spring(pressAnimatedValue, {
          toValue: 0.92,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
        Animated.timing(glowAnimatedValue, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }, [pressAnimatedValue, glowAnimatedValue]);

    const handlePressOut = useCallback(() => {
      Animated.parallel([
        Animated.spring(pressAnimatedValue, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
        Animated.timing(glowAnimatedValue, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      onPress();
    }, [pressAnimatedValue, glowAnimatedValue, onPress]);

    const glowStyle = useMemo(
      () => ({
        opacity: glowAnimatedValue,
        transform: [
          {
            scale: glowAnimatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.05],
            }),
          },
        ],
      }),
      [glowAnimatedValue]
    );

    return (
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={style}
      >
        <Animated.View style={{ transform: [{ scale: pressAnimatedValue }] }}>
          {/* Glow effect layer */}
          <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.2)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
            />
          </Animated.View>

          <BlurView intensity={intensity} tint="light" style={styles.actionButtonBlur}>
            {/* Reflective highlight */}
            <LinearGradient
              colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonReflection}
            />
            <Text style={textStyle}>{children}</Text>
          </BlurView>
        </Animated.View>
      </TouchableOpacity>
    );
  }
);

// Success Message Component
interface SuccessMessageProps {
  isVisible: boolean;
  title: string;
  message: string;
  type: 'cart' | 'checkout';
  onClose: () => void;
  onViewCart?: (() => void) | undefined;
  animation: Animated.Value;
  adaptiveAccentColor: string;
}
const SuccessMessage: React.FC<SuccessMessageProps> = React.memo(
  ({ isVisible, title, message, type, onClose, onViewCart, animation, adaptiveAccentColor }) => {
    if (!isVisible) return null;

    const scaleStyle = useMemo(
      () => ({
        transform: [
          {
            scale: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1],
            }),
          },
        ],
        opacity: animation,
      }),
      [animation]
    );

    return (
      <View style={styles.successOverlay}>
        <Animated.View style={[styles.successContainer, scaleStyle]}>
          <BlurView intensity={40} tint="light" style={styles.successBlur}>
            <LinearGradient
              colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
              style={styles.successGradient}
            />

            {/* Success Icon */}
            <View style={[styles.successIcon, { backgroundColor: adaptiveAccentColor }]}>
              <Text style={styles.successIconText}>✓</Text>
            </View>

            {/* Success Content */}
            <Text style={styles.successTitle}>{title}</Text>
            <Text style={styles.successMessage}>{message}</Text>

            {/* Action Buttons */}
            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.successCloseButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.successCloseText}>Continue Shopping</Text>
              </TouchableOpacity>

              {type === 'cart' && onViewCart && (
                <TouchableOpacity
                  style={[styles.successViewCartButton, { backgroundColor: adaptiveAccentColor }]}
                  onPress={onViewCart}
                  activeOpacity={0.8}
                >
                  <Text style={styles.successViewCartText}>View Cart</Text>
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    );
  }
);

// Add-Ons Modal Component
interface AddOnsModalProps {
  isVisible: boolean;
  onClose: () => void;
  service: ServiceData | null;
  onAddToCart: (
    service: ServiceData,
    selectedAddOns: Array<{ id: number; name: string; price: number }>
  ) => void;
  adaptiveAccentColor: string;
}

const AddOnsModal: React.FC<AddOnsModalProps> = React.memo(
  ({ isVisible, onClose, service, onAddToCart, adaptiveAccentColor }) => {
    const [selectedAddOns, setSelectedAddOns] = useState<
      Array<{ id: number; name: string; price: number }>
    >([]);

    // Default add-ons as fallback when provider hasn't set custom ones
    const defaultAddOns = useMemo(
      () => [
        {
          id: 1,
          name: 'Premium Products',
          price: 5,
          description: 'High-quality premium products for enhanced results',
        },
        {
          id: 2,
          name: 'Express Service',
          price: 10,
          description: 'Priority booking with reduced waiting time',
        },
        {
          id: 3,
          name: 'Aftercare Kit',
          price: 8,
          description: 'Complete aftercare package for maintenance',
        },
        {
          id: 4,
          name: 'Deep Conditioning Treatment',
          price: 15,
          description: 'Additional nourishing treatment',
        },
        {
          id: 5,
          name: 'Style Consultation',
          price: 12,
          description: '15-minute styling consultation',
        },
      ],
      []
    );

    // Use service-specific add-ons if provider has configured them, otherwise use defaults
    const availableAddOns = useMemo(
      () => (service?.addOns && service.addOns.length > 0) ? service.addOns : defaultAddOns,
      [service, defaultAddOns]
    );

    const toggleAddOn = useCallback((addOn: { id: number; name: string; price: number }) => {
      setSelectedAddOns(prev => {
        const exists = prev.find(item => item.id === addOn.id);
        if (exists) {
          return prev.filter(item => item.id !== addOn.id);
        } else {
          return [...prev, addOn];
        }
      });
    }, []);

    const totalAddOnsPrice = useMemo(() => {
      return selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
    }, [selectedAddOns]);

    const handleAddToCart = useCallback(() => {
      if (service) {
        onAddToCart(service, selectedAddOns);
        setSelectedAddOns([]); // Reset selections
        onClose();
      }
    }, [service, selectedAddOns, onAddToCart, onClose]);

    const handleSkipAddOns = useCallback(() => {
      if (service) {
        onAddToCart(service, []);
        setSelectedAddOns([]);
        onClose();
      }
    }, [service, onAddToCart, onClose]);

    if (!service) return null;

    return (
      <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="light" style={styles.addOnsModalContainer}>
            <SafeAreaView style={styles.modalSafeArea}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderContent}>
                  <View>
                    <Text style={styles.modalTitle}>Add Extra Services</Text>
                    <Text style={styles.modalSubtitle}>
                      {service.name} • £{service.price}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.modalCloseButton, { backgroundColor: adaptiveAccentColor }]}
                    onPress={onClose}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Add-Ons List */}
              <ScrollView
                style={styles.modalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                {availableAddOns.map(addOn => {
                  const isSelected = selectedAddOns.find(item => item.id === addOn.id);
                  return (
                    <TouchableOpacity
                      key={addOn.id}
                      style={[
                        styles.addOnCard,
                        isSelected && { borderColor: adaptiveAccentColor, borderWidth: 2 },
                      ]}
                      onPress={() => toggleAddOn(addOn)}
                      activeOpacity={0.8}
                    >
                      <BlurView intensity={20} tint="light" style={styles.addOnCardBlur}>
                        <View style={styles.addOnContent}>
                          <View style={styles.addOnInfo}>
                            <Text style={styles.addOnName}>{addOn.name}</Text>
                            <Text style={styles.addOnDescription}>{addOn.description}</Text>
                          </View>
                          <View style={styles.addOnPriceContainer}>
                            <Text style={[styles.addOnPrice, { color: adaptiveAccentColor }]}>
                              +£{addOn.price}
                            </Text>
                            <View
                              style={[
                                styles.addOnCheckbox,
                                isSelected && { backgroundColor: adaptiveAccentColor },
                              ]}
                            >
                              {isSelected && <Text style={styles.addOnCheckmark}>✓</Text>}
                            </View>
                          </View>
                        </View>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Bottom Actions */}
              <View style={styles.addOnsFooter}>
                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Total:</Text>
                  <Text style={[styles.totalPrice, { color: adaptiveAccentColor }]}>
                    £{service.price + totalAddOnsPrice}
                  </Text>
                </View>

                <View style={styles.addOnsButtons}>
                  <TouchableOpacity
                    style={styles.skipButton}
                    onPress={handleSkipAddOns}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.skipButtonText}>Skip Add-ons</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.addToCartButton, { backgroundColor: adaptiveAccentColor }]}
                    onPress={handleAddToCart}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addToCartButtonText}>
                      Add to Cart {selectedAddOns.length > 0 && `(${selectedAddOns.length})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </BlurView>
        </View>
      </Modal>
    );
  }
);

// Reviews Modal Component
interface ReviewsModalProps {
  isVisible: boolean;
  onClose: () => void;
  reviews: Array<{
    id: number;
    name: string;
    rating: number;
    comment: string;
    date: string;
  }>;
  providerName: string;
  adaptiveAccentColor: string;
  providerGradient: [string, string, ...string[]];
}

const ReviewsModal: React.FC<ReviewsModalProps> = React.memo(
  ({ isVisible, onClose, reviews, providerName, adaptiveAccentColor, providerGradient }) => {
    // Extended reviews data for the modal
    const allReviews = useMemo(
      () => [
        ...reviews,
        {
          id: 4,
          name: 'Maya P.',
          rating: 5,
          comment:
            'Absolutely phenomenal service! The attention to detail is incredible and the results exceeded my expectations. Will definitely be returning!',
          date: '3 weeks ago',
        },
        {
          id: 5,
          name: 'Claire W.',
          rating: 4,
          comment:
            'Great experience overall. Professional environment and skilled work. Minor delay but worth the wait.',
          date: '1 month ago',
        },
        {
          id: 6,
          name: 'Zara K.',
          rating: 5,
          comment:
            "Best service I've had in London! The quality is outstanding and the staff is so friendly and accommodating.",
          date: '1 month ago',
        },
        {
          id: 7,
          name: 'Nina L.',
          rating: 5,
          comment:
            'Incredible work! Very professional and the results lasted much longer than expected. Highly recommend!',
          date: '6 weeks ago',
        },
        {
          id: 8,
          name: 'Emma D.',
          rating: 4,
          comment:
            'Really happy with the service. Good value for money and excellent customer care throughout.',
          date: '2 months ago',
        },
      ],
      [reviews]
    );

    const averageRating = useMemo(() => {
      const total = allReviews.reduce((sum, review) => sum + review.rating, 0);
      return (total / allReviews.length).toFixed(1);
    }, [allReviews]);

    return (
      <Modal
        visible={isVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <ImageBackground
          source={require('../../assets/images/background.png')}
          style={styles.modalBackground}
          resizeMode="cover"
        >
          <LinearGradient
            colors={providerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.modalGradient, { opacity: 0.85 }]}
          />

          <SafeAreaView style={styles.modalSafeArea}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <View>
                  <Text style={styles.modalTitle}>All Reviews</Text>
                  <Text style={styles.modalSubtitle}>
                    @{providerName} • {averageRating} ★ ({allReviews.length} reviews)
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: adaptiveAccentColor }]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reviews List */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {allReviews.map(review => (
                <BlurView
                  key={review.id}
                  intensity={20}
                  tint="light"
                  style={styles.modalReviewCard}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.4)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.modalCardHighlight}
                  />
                  <View style={styles.modalReviewHeader}>
                    <Text style={styles.modalReviewerName}>{review.name}</Text>
                    <View style={styles.modalReviewRating}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Text
                          key={star}
                          style={[
                            styles.modalStar,
                            { color: star <= review.rating ? '#FFD700' : 'rgba(0,0,0,0.2)' },
                          ]}
                        >
                          ★
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.modalReviewDate}>{review.date}</Text>
                  </View>
                  <Text style={styles.modalReviewComment}>{review.comment}</Text>
                </BlurView>
              ))}
            </ScrollView>
          </SafeAreaView>
        </ImageBackground>
      </Modal>
    );
  }
);

// Notification Alert Component
interface NotificationAlertProps {
  isVisible: boolean;
  message: string;
  onHide: () => void;
  slideAnimation: Animated.Value;
  isNotificationsEnabled: boolean; // Add this prop
}

const NotificationAlert: React.FC<NotificationAlertProps> = React.memo(
  ({ isVisible, message, onHide, slideAnimation, isNotificationsEnabled }) => {
    if (!isVisible) return null;

    const slideStyle = useMemo(
      () => ({
        transform: [
          {
            translateX: slideAnimation.interpolate({
              inputRange: [0, 100],
              outputRange: [0, screenWidth],
            }),
          },
        ],
      }),
      [slideAnimation]
    );

    // Dynamic colors based on notification state
    const notificationColors = useMemo(() => {
      if (isNotificationsEnabled) {
        return {
          gradient: ['rgba(76, 175, 80, 0.9)', 'rgba(76, 175, 80, 0.7)'], // Green when enabled
          iconColor: '#fff',
          textColor: '#fff',
        };
      } else {
        return {
          gradient: ['rgba(128, 128, 128, 0.9)', 'rgba(100, 100, 100, 0.7)'], // Gray when disabled
          iconColor: '#fff',
          textColor: '#fff',
        };
      }
    }, [isNotificationsEnabled]);

    return (
      <Animated.View style={[styles.notificationAlert, slideStyle]}>
        <BlurView intensity={20} tint="light" style={styles.notificationBlur}>
          <LinearGradient
            colors={notificationColors.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.notificationGradient}
          />
          <View style={styles.notificationContent}>
            <BellIcon size={16} color={notificationColors.iconColor} />
            <Text style={[styles.notificationText, { color: notificationColors.textColor }]}>
              {message}
            </Text>
          </View>
        </BlurView>
      </Animated.View>
    );
  }
);

// Main Component
const ProviderProfileScreen: React.FC<ProviderProfileScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const providerId = route.params?.providerId || 'styled-by-kathrine';
  const provider = useMemo(() => {
    const data = getProviderData(providerId);
    if (!data) {
      console.error('Provider not found:', providerId);
      // Return fallback provider with proper type
      return {
        id: 'styled-by-kathrine',
        providerName: 'KATHRINE',
        providerService: 'HAIR',
        providerLogo: require('../../assets/logos/styledbykathrine.png'),
        location: 'North West London',
        rating: 5.0,
        slotsText: 'Slots out every 30th',
        aboutText: 'Professional hair services',
        gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'] as [string, string, ...string[]],
        categories: {},
      } as ProviderData;
    }
    return data;
  }, [providerId]);

  // ===== CRITICAL: CART CONTEXT INTEGRATION =====
  const { addToCart, totalItems } = useCart();

  // Find this early return (around line 615):
  if (!provider) {
    return (
      <View style={styles.loading}>
        <Text>Provider not found</Text>
      </View>
    );
  }

  // Removed debug logs to prevent infinite render loop
  // console.log('=== PROVIDER PROFILE DEBUG ===');
  // console.log('Received providerId:', providerId);
  // console.log('Found provider:', provider?.providerName);
  // console.log('Current cart items:', totalItems);
  // console.log('===============================');

  const [selectedCategory, setSelectedCategory] = useState(() =>
    provider ? Object.keys(provider.categories)[0] || '' : ''
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showAddOnsModal, setShowAddOnsModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessageData, setSuccessMessageData] = useState<{
    title: string;
    message: string;
    type: 'cart' | 'checkout';
  } | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [notificationMessageType, setNotificationMessageType] = useState<'bell' | 'bookmark'>('bell');

  // Animation references - properly typed and persistent
  const slideRightAnimation = useRef<Animated.Value>(new Animated.Value(100)).current;
  const successAnimation = useRef<Animated.Value>(new Animated.Value(0)).current;

  // Get adaptive accent color for this provider - memoized
  const adaptiveAccentColor = useMemo(
    () => getAdaptiveAccentColor(provider.gradient),
    [provider.gradient]
  );

  // Show notification popup from right
  const showRightNotification = useCallback(() => {
    setShowNotification(true);
    // Reset animation - start from right edge
    slideRightAnimation.setValue(100);

    // Animate notification slide in from right
    Animated.sequence([
      Animated.spring(slideRightAnimation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 8,
      }),
      Animated.delay(2500),
      Animated.timing(slideRightAnimation, {
        toValue: 100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowNotification(false);
    });
  }, [slideRightAnimation]);

  // Notification toggle handler
  const handleNotificationToggle = useCallback(() => {
  console.warn('Bell button pressed');
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const newState = !isNotificationsEnabled;
  setIsNotificationsEnabled(newState);
  setNotificationMessageType('bell'); // SET TO BELL
  showRightNotification();
}, [isNotificationsEnabled, showRightNotification]);

  // Bookmark toggle handler
  // Bookmark toggle handler - FIXED VERSION
  const { isBookmarked: isBookmarkedFn, addBookmark, removeBookmark } = useBookmarkStore();
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);

  // Get real-time bookmark status from store
  const providerIsBookmarked = isBookmarkedFn(providerId);

 const handleBookmarkToggle = useCallback(async () => {
  if (isBookmarkLoading) return;

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setIsBookmarkLoading(true);
  
  try {
    if (providerIsBookmarked) {
      await removeBookmark(providerId);
      if (__DEV__) console.log('Bookmark removed:', providerId);
      setNotificationMessageType('bookmark'); // BOOKMARK MESSAGE TYPE
      
      // Show slide-in message
      setShowNotification(true);
      slideRightAnimation.setValue(100);
      
      Animated.sequence([
        Animated.spring(slideRightAnimation, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }),
        Animated.delay(2000),
        Animated.timing(slideRightAnimation, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowNotification(false);
      });
    } else {
      await addBookmark(providerId);
      if (__DEV__) console.log('Provider bookmarked:', providerId);
      setNotificationMessageType('bookmark'); // BOOKMARK MESSAGE TYPE
      
      // Show slide-in message
      setShowNotification(true);
      slideRightAnimation.setValue(100);
      
      Animated.sequence([
        Animated.spring(slideRightAnimation, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }),
        Animated.delay(2000),
        Animated.timing(slideRightAnimation, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowNotification(false);
      });
    }
  } catch (error) {
    console.error('Bookmark toggle failed:', error);
    Alert.alert('Error', 'Failed to update bookmark');
  } finally {
    setIsBookmarkLoading(false);
  }
}, [providerIsBookmarked, isBookmarkLoading, providerId, addBookmark, removeBookmark, slideRightAnimation]);

  // Share handler with native share options
  const handleShare = useCallback(async () => {
    try {
      const shareOptions = {
        message: `Check out @${provider.providerName} - ${provider.providerService} services in ${provider.location}. Rated ${provider.rating}/5 stars!`,
        title: `${provider.providerName} - ${provider.providerService}`,
        url: `https://app.yourapp.com/provider/${provider.id}`, // Replace with your app URL
      };

      const result = await Share.share(shareOptions);

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          if (__DEV__) console.log('Shared via:', result.activityType);
        } else {
          if (__DEV__) console.log('Shared successfully');
        }
      } else if (result.action === Share.dismissedAction) {
        if (__DEV__) console.log('Share dismissed');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Error', 'Unable to share at this time.');
    }
  }, [provider]);

  // Email handler for Get In Touch button
  const handleGetInTouch = useCallback(async () => {
    const email = `contact@${provider.providerName.toLowerCase().replace(/\s+/g, '')}.com`;
    const subject = `Inquiry about ${provider.providerService} services`;
    const body = `Hi ${provider.providerName},\n\nI'm interested in your ${provider.providerService} services in ${provider.location}. Could you please provide more information about availability and booking?\n\nThank you!`;

    const emailUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const supported = await Linking.canOpenURL(emailUrl);
      if (supported) {
        await Linking.openURL(emailUrl);
      } else {
        Alert.alert(
          'Contact Information',
          `Please contact ${provider.providerName} directly:\n\nEmail: ${email}\nLocation: ${provider.location}`,
          [
            { text: 'Copy Email', onPress: () => { if (__DEV__) console.log('Email copied:', email); } },
            { text: 'OK' },
          ]
        );
      }
    } catch (error) {
      console.error('Error opening email:', error);
      Alert.alert(
        'Contact Information',
        `Please contact ${provider.providerName} directly:\n\nEmail: ${email}\nLocation: ${provider.location}`,
        [{ text: 'OK' }]
      );
    }
  }, [provider]);

  // Configure the navigation header with your gradient and icons
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: isScrolled ? `@${provider.providerName}` : 'Provider Profile',
      headerTitleStyle: {
        fontFamily: 'BakbakOne-Regular',
        fontSize: 18,
        color: '#000',
      },
      headerLeft: () => (
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.navBackText}>←</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={styles.navHeaderActions}>
          <TouchableOpacity
            style={[
              styles.headerActionButton,
              providerIsBookmarked && styles.headerActionButtonActive,
            ]}
            onPress={handleBookmarkToggle}
            activeOpacity={0.7}
            disabled={isBookmarkLoading}
          >
            <BookmarkIcon size={18} color={providerIsBookmarked ? adaptiveAccentColor : '#000'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <ShareIcon size={18} color="#000" />
          </TouchableOpacity>
        </View>
      ),
      headerBackground: () => (
        <View style={styles.headerBackgroundContainer}>
          <LinearGradient
            colors={[
              provider.gradient[0], // Exact match with main gradient start
              provider.gradient[0], // Keep same color for header area
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.navHeaderBackground}
          />
        </View>
      ),
      headerStyle: {
        height: 120, // Increased from default to push the header background down
        borderBottomWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: 'hidden',
      },
    });
  }, [
    navigation,
    provider,
    isScrolled,
    providerIsBookmarked,
    isBookmarkLoading,
    adaptiveAccentColor,
    handleBookmarkToggle,
    handleShare,
  ]);
  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setIsScrolled(offsetY > 100);
  }, []);

  const toggleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsFollowing(!isFollowing);
  }, [isFollowing]);

  // Show success message with animation
  const showSuccessMessageWithAnimation = useCallback(
    (title: string, message: string, type: 'cart' | 'checkout') => {
      setSuccessMessageData({ title, message, type });
      setShowSuccessMessage(true);

      // Animate in
      Animated.spring(successAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 150,
        friction: 8,
      }).start();
    },
    [successAnimation]
  );

  // Hide success message with animation
  const hideSuccessMessage = useCallback(() => {
    Animated.timing(successAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSuccessMessage(false);
      setSuccessMessageData(null);
    });
  }, [successAnimation]);

  /// UPDATED ProviderProfile Cart Handlers - Replace these functions in your ProviderProfileScreen

  // ===== UPDATED CART HANDLERS FOR COMPATIBILITY =====
  const handleQuickBook = useCallback(
    (service: ServiceData) => {
      if (__DEV__) console.log('Quick Book - Redirecting to checkout:', service.name);

      try {
        // Create cart item for immediate checkout
        const cartItem = {
          providerName: provider.providerName,
          providerImage: provider.providerLogo,
          providerService: provider.providerService,
          service: {
            id: service.id,
            name: service.name,
            price: service.price,
            duration: service.duration,
            description: service.description,
            addOns: [],
          },
          quantity: 1,
          selectedOptions: {},
          forceNewInstance: true,
        };

        // Add to cart
        addToCart(cartItem);

        // Show redirecting message and navigate to cart for immediate checkout
        showSuccessMessageWithAnimation(
          'Redirecting to Checkout...',
          `${service.name} added to cart. Taking you to checkout with next available date.`,
          'checkout'
        );

        // Navigate to Cart screen within the same stack
        setTimeout(() => {
          hideSuccessMessage();
          // Navigate to CartMain within the current stack for proper back navigation
          navigation.navigate('CartMain');
        }, 1500);
      } catch (error) {
        console.error('Error in Quick Book:', error);
        Alert.alert('Error', 'Failed to process quick booking. Please try again.');
      }
    },
    [provider, addToCart, showSuccessMessageWithAnimation, hideSuccessMessage, navigation]
  );

  const handleBook = useCallback((service: ServiceData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Regular Book opens add-ons modal first
      setSelectedService(service);
      setShowAddOnsModal(true);
    } catch (error) {
      console.error('Error opening add-ons modal:', error);
      Alert.alert('Error', 'Failed to open booking options. Please try again.');
    }
  }, []);

  const handleAddToCartWithAddOns = useCallback(
    (service: ServiceData, selectedAddOns: Array<{ id: number; name: string; price: number }>) => {
      if (__DEV__) console.log('Book with Add-ons - Adding to cart:', service.name, selectedAddOns);

      try {
        const addOnsTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
        const totalPrice = service.price + addOnsTotal;

        // FIXED: Create cart item with proper structure
        const cartItem = {
          providerName: provider.providerName,
          providerImage: provider.providerLogo,
          providerService: provider.providerService,
          service: {
            id: service.id,
            name: service.name,
            price: service.price,
            duration: service.duration,
            description: service.description,
            // CRITICAL: Add-ons must be in service object for CartContext
            addOns: selectedAddOns,
          },
          quantity: 1,
          selectedOptions: {},
          forceNewInstance: true, // Always create new instance
        };

        // Add to cart context
        addToCart(cartItem);

        // Show success message
        const addOnsText =
          selectedAddOns.length > 0
            ? ` with ${selectedAddOns.length} add-on${selectedAddOns.length > 1 ? 's' : ''}`
            : '';

        showSuccessMessageWithAnimation(
          'Added to Cart!',
          `${service.name}${addOnsText} has been added to your cart. Total: £${totalPrice.toFixed(2)}`,
          'cart'
        );
      } catch (error) {
        console.error('Error adding service with add-ons:', error);
        Alert.alert('Error', 'Failed to add service to cart. Please try again.');
      }
    },
    [provider, addToCart, showSuccessMessageWithAnimation]
  );

  const handleViewCart = useCallback(() => {
    try {
      hideSuccessMessage();
      if (__DEV__) console.log('Navigating to cart tab');

     const parent = navigation.getParent();
    if (parent) {
      parent.navigate('Cart', { screen: 'CartMain' }); // Navigate to Cart tab and CartMain screen
    }
  } catch (error) {
    console.error('Cart navigation error:', error);
    Alert.alert('Navigation Error', 'Unable to navigate to cart');
  }
}, [hideSuccessMessage, navigation]);

  // Mock reviews data - memoized
  const reviews = useMemo(
    () => [
      {
        id: 1,
        name: 'Sarah M.',
        rating: 5,
        comment: 'Amazing work! Professional service and great attention to detail.',
        date: '2 days ago',
      },
      {
        id: 2,
        name: 'Jessica L.',
        rating: 5,
        comment: 'Love the results! Will definitely be booking again.',
        date: '1 week ago',
      },
      {
        id: 3,
        name: 'Amanda K.',
        rating: 4,
        comment: 'Great experience overall. Very satisfied with the service.',
        date: '2 weeks ago',
      },
    ],
    []
  );

  const notificationMessage = useMemo(() => {
  if (notificationMessageType === 'bell') {
    // Get full provider name based on ID
    const fullNames: Record<string, string> = {
      'styled-by-kathrine': 'Styled by Kathrine',
      'hair-by-jennifer': 'Hair by Jennifer',
      'diva-nails': 'Diva Nails',
      'makeup-by-mya': 'Makeup by Mya',
      'your-lashed': 'Your Lashed',
      'vikki-laid': 'Vikki Laid',
      'kiki-nails': 'Kiki Nails',
      'jana-aesthetics': 'Jana Aesthetics',
      'her-brows': 'Her Brows',
      'zeenail-artist': 'Zee Nail Artist',
      'painted-by-zoe': 'Painted by Zoe',
      'braided-slick': 'Braided Slick',
      'lash-bae': 'Lash Bae',
    };
    
    const fullName = fullNames[providerId] || provider.providerName;
    
    return isNotificationsEnabled 
      ? `Notifications enabled for\n${fullName}` 
      : `Notifications disabled for\n${fullName}`;
  } else {
    return providerIsBookmarked 
      ? `Added to your\nproviders list` 
      : `Removed from your\nproviders list`;
  }
}, [notificationMessageType, isNotificationsEnabled, providerIsBookmarked, provider.providerName, providerId]);

  if (!fontsLoaded || !provider) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemedBackground>
        {/* Main gradient that matches header gradient start */}
        <LinearGradient
          colors={provider.gradient} // Full gradient progression for main content
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientOverlay}
        />

        <StatusBar barStyle={theme.statusBar} translucent={true} backgroundColor="transparent" />

        {/* Notification Alert */}
        <NotificationAlert
          isVisible={showNotification}
          message={notificationMessage}
          onHide={() => setShowNotification(false)}
          slideAnimation={slideRightAnimation}
          isNotificationsEnabled={isNotificationsEnabled}
        />

        {/* Success Message */}
        {successMessageData && (
          <SuccessMessage
            isVisible={showSuccessMessage}
            title={successMessageData.title}
            message={successMessageData.message}
            type={successMessageData.type}
            onClose={hideSuccessMessage}
            onViewCart={successMessageData.type === 'cart' ? handleViewCart : undefined}
            animation={successAnimation}
            adaptiveAccentColor={adaptiveAccentColor}
          />
        )}

        {/* Add-Ons Modal */}
        <AddOnsModal
          isVisible={showAddOnsModal}
          onClose={() => setShowAddOnsModal(false)}
          service={selectedService}
          onAddToCart={handleAddToCartWithAddOns}
          adaptiveAccentColor={adaptiveAccentColor}
        />

        {/* Reviews Modal */}
        <ReviewsModal
          isVisible={showReviewsModal}
          onClose={() => setShowReviewsModal(false)}
          reviews={reviews}
          providerName={provider.providerName}
          adaptiveAccentColor={adaptiveAccentColor}
          providerGradient={provider.gradient}
        />

        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            nestedScrollEnabled={true}
          >
            {/* Provider Logo - Bigger */}
            <View style={styles.logoContainer}>
              <View style={styles.logoWrapper}>
                <Image
                  source={provider.providerLogo}
                  style={styles.providerLogo}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                  style={styles.logoGloss}
                />
              </View>
            </View>

            {/* Provider Info */}
            <View style={styles.providerInfoCenter}>
              <Text style={styles.providerNameLarge}>@{provider.providerName}</Text>

              <View style={styles.ratingContainer}>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <StarIcon key={star} size={16} color="#FFD700" />
                  ))}
                </View>
                <Text style={styles.ratingText}>{provider.rating}</Text>
              </View>

              <View style={styles.serviceTag}>
                <BlurView intensity={15} tint="light" style={styles.serviceTagBlur}>
                  <Text style={styles.serviceText}>{provider.providerService}</Text>
                </BlurView>
              </View>

              <Text style={styles.locationText}>📍 {provider.location}</Text>

              {/* Slots Section with Bell Inside */}
              <View style={styles.serviceTag}>
                <BlurView intensity={15} tint="light" style={styles.serviceTagBlur}>
                  <View style={styles.slotsContent}>
                    <Text style={styles.slotsText}>{provider.slotsText}</Text>
                    <TouchableOpacity
                      style={styles.bellButtonInline}
                      onPress={handleNotificationToggle}
                      activeOpacity={0.8}
                    >
                      <BellIcon size={18} color={isNotificationsEnabled ? '#4CAF50' : '#666'} />
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>

              {/* Enhanced Follow Button */}
              <TouchableOpacity
                style={styles.followButton}
                onPress={toggleFollow}
                activeOpacity={0.8}
              >
                <BlurView intensity={12} tint="light" style={styles.followButtonBlur}>
                  <LinearGradient
                    colors={
                      isFollowing
                        ? ['rgba(76, 175, 80, 0.2)', 'rgba(76, 175, 80, 0.05)']
                        : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.followButtonGradient}
                  />
                  <Text
                    style={[styles.followButtonText, isFollowing && styles.followingButtonText]}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* About Section with glass styling */}
            <BlurView intensity={50} tint="light" style={styles.aboutCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.03)'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardShadow}
              />
              <Text style={styles.sectionTitle}>Relevant Information</Text>
              <Text style={styles.aboutText}>
                {showFullAbout ? provider.aboutText : `${provider.aboutText.substring(0, 150)}...`}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFullAbout(!showFullAbout)}
                style={styles.moreButton}
                activeOpacity={0.6}
              >
                <Text style={[styles.moreButtonText, { color: adaptiveAccentColor }]}>
                  {showFullAbout ? 'Show Less' : 'More'}
                </Text>
              </TouchableOpacity>
            </BlurView>

            {/* Services Section */}
            <View style={styles.servicesSection}>
              <Text style={styles.sectionTitleNoCard}>Services</Text>

              {/* Enhanced Category Tabs */}
              <FlatList
                data={Object.keys(provider.categories)}
                renderItem={({ item: category }) => (
                  <CategoryTabItem
                    category={category}
                    isSelected={selectedCategory === category}
                    onPress={() => setSelectedCategory(category)}
                  />
                )}
                keyExtractor={item => item}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryTabs}
                contentContainerStyle={styles.categoryTabsContent}
                nestedScrollEnabled={true}
              />

              {/* Services List with Updated Buttons */}
              <View style={styles.categoryServicesContainer}>
                {provider.categories[selectedCategory]?.map(service => (
                  <View key={service.id} style={styles.serviceItemCard}>
                    <BlurView intensity={50} tint="light" style={styles.serviceCardBlur}>
                      <LinearGradient
                        colors={
                          ['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.cardHighlight}
                      />
                      <View style={styles.serviceItem}>
                        <View style={styles.serviceImageContainer}>
                          {service.images && service.images.length > 1 ? (
                            <ServiceImageCarousel images={service.images} size={60} />
                          ) : (
                            <>
                              <Image
                                source={service.image}
                                style={styles.serviceImage}
                                resizeMode="cover"
                              />
                              <LinearGradient
                                colors={getServiceGradient(service.image)}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={styles.serviceImageOverlay}
                              />
                            </>
                          )}
                        </View>
                        <View style={styles.serviceInfo}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                          <Text style={styles.serviceDescription}>{service.description}</Text>
                          <View style={styles.serviceDetails}>
                            <Text style={styles.serviceDuration}>{service.duration}</Text>
                            <Text style={[styles.servicePrice, { color: adaptiveAccentColor }]}>
                              £{service.price}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.bookButton}
                          onPress={() => handleBook(service)}
                          activeOpacity={0.8}
                        >
                          <BlurView intensity={14} tint="light" style={styles.actionButtonBlur}>
                            <LinearGradient
                              colors={[
                                'rgba(255,255,255,0.4)',
                                'rgba(255,255,255,0.1)',
                                'transparent',
                              ]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.buttonReflection}
                            />
                            <Text style={styles.bookButtonText}>Book</Text>
                          </BlurView>
                        </TouchableOpacity>
                      </View>
                    </BlurView>
                  </View>
                ))}
              </View>
            </View>

            {/* Reviews Section with glass styling */}
            <BlurView intensity={50} tint="light" style={styles.reviewsCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.03)'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardShadow}
              />
              <Text style={styles.sectionTitle}>Reviews</Text>
              {reviews.map(review => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewerName}>{review.name}</Text>
                    <View style={styles.reviewRating}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <TabIcon
                          key={star}
                          name="star"
                          size={12}
                          color={star <= review.rating ? '#FFD700' : 'rgba(0,0,0,0.2)'}
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewDate}>{review.date}</Text>
                  </View>
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.seeAllButton}
                onPress={() => setShowReviewsModal(true)}
                activeOpacity={0.6}
              >
                <Text style={[styles.seeAllText, { color: adaptiveAccentColor }]}>
                  See All Reviews
                </Text>
              </TouchableOpacity>
            </BlurView>

            {/* Contact Information with glass styling */}
            <BlurView intensity={50} tint="light" style={styles.contactCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.03)'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardShadow}
              />
              <Text style={styles.sectionTitle}>Contact Information</Text>
              <Text style={styles.contactText}>Location: {provider.location}</Text>
              <Text style={styles.contactText}>Service: {provider.providerService}</Text>
              <TouchableOpacity
                style={[
                  styles.contactButton,
                  {
                    backgroundColor: adaptiveAccentColor,
                    shadowColor: adaptiveAccentColor,
                  },
                ]}
                onPress={handleGetInTouch}
                activeOpacity={0.8}
              >
                <Text style={styles.contactButtonText}>Get In Touch</Text>
              </TouchableOpacity>
            </BlurView>
          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#F5E6FA',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.85, // Slightly more opaque for better seamless transition
  },
  safeArea: {
    flex: 1,
  },

  // Navigation Header Styles - Seamless Transition
  headerBackgroundContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  navHeaderBackground: {
    flex: 1,
    // Extend to create seamless transition from status bar
    marginTop: -60, // Back to original value
    paddingTop: 60, // Back to original value
    opacity: 1, // Full opacity for seamless blend
  },
  navBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    marginLeft: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  navBackText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  navHeaderActions: {
    flexDirection: 'row',
    gap: 15,
    marginRight: 15,
  },
  headerActionButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerActionButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: 'rgba(0,0,0,0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  // Content Styles
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 115, // Sit above bottom nav pill
    paddingTop: 160, // Adjusted for header height of 120
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5E6FA',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 0,
  },
  logoWrapper: {
    position: 'relative',
    width: 180, // Increased from 140
    height: 180, // Increased from 140
  },
  providerLogo: {
    width: 180, // Increased from 140
    height: 180, // Increased from 140
    borderRadius: 90, // Increased from 70
    borderWidth: 4, // Increased from 3
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 }, // Increased shadow
    shadowOpacity: 0.35, // Increased shadow opacity
    shadowRadius: 16, // Increased shadow radius
    elevation: 10, // Increased elevation
  },
  logoGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 180, // Increased from 140
    height: 180, // Increased from 140
    borderRadius: 90, // Increased from 70
  },
  providerInfoCenter: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  providerNameLarge: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    color: '#000',
    marginBottom: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  stars: {
    flexDirection: 'row',
    gap: 3,
  },
  ratingText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: '#000',
    fontWeight: 'bold',
  },
  serviceTag: {
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
  serviceTagBlur: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Enhanced Slots Content with Inline Bell
  slotsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Inline Bell Button
  bellButtonInline: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },

  // Notification Alert Styles
  notificationAlert: {
    position: 'absolute',
    top: 120,
    right: 5, // Moved even closer to the right edge
    zIndex: 1000,
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: screenWidth * 0.7, // Further reduced width
    minWidth: 200, // Further reduced minimum width
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  notificationBlur: {
    paddingHorizontal: 16, // Reduced padding
    paddingVertical: 12, // Reduced padding
    position: 'relative',
  },
  notificationGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Changed to flex-start for multi-line text
    gap: 10, // Reduced gap
    zIndex: 1,
  },
  notificationText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12, // Reduced from 13
    fontWeight: 'bold',
    flex: 1,
    flexWrap: 'wrap', // Allow text wrapping
    lineHeight: 16, // Reduced line height
    textAlign: 'left', // Ensure proper alignment for multi-line text
  },

  serviceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  locationText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: '#000',
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  slotsText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 2, // Above overlays
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  slotsoutcard: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6
  },


  // Enhanced Follow Button
  followButton: {
    borderRadius: 22,
    overflow: 'hidden',
    marginTop: 5, // Reduced from 10 to close the gap
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  followButtonBlur: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  followButtonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  followButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#000',
    fontWeight: 'bold',
    letterSpacing: 0.3,
    zIndex: 1,
  },
  followingButtonText: {
    color: '#4CAF50',
  },

  // Enhanced 3D Glass Effects
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  cardShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },

  aboutCard: {
    padding: 20,
    borderRadius: 30,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 15,
  },
  aboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    lineHeight: 20,
    marginBottom: 10,
  },
  moreButton: {
    alignSelf: 'flex-start',
  },
  moreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
    // Color will be set dynamically using adaptiveAccentColor
  },

  // Services Section
  servicesSection: {
    marginBottom: 20,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  categoryTabs: {
    marginBottom: 20,
    maxHeight: 60, // Increased to accommodate animation
    paddingHorizontal: 20,
  },
  categoryTabsContent: {
    paddingRight: 20,
    gap: 12,
    paddingVertical: 8, // Add vertical padding to prevent cutoff
  },

  // Enhanced Category Tabs with Better Visual Feedback
  categoryTab: {
    borderRadius: 22,
    overflow: 'hidden',
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedCategoryTab: {
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryTabBlur: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  selectedCategoryTabBlur: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  categoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#000',
    textAlign: 'center',
    fontWeight: '600',
  },
  selectedCategoryTabText: {
    color: '#000',
    fontWeight: 'bold',
    opacity: 0.9,
  },

  categoryServicesContainer: {
    gap: 15,
    paddingHorizontal: 20,
  },
  serviceItemCard: {
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 15,
  },
  serviceCardBlur: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  serviceImageContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginRight: 15,
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  serviceImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  serviceInfo: {
    flex: 1,
    marginRight: 15,
  },
  serviceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    marginBottom: 5,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.85)',
    marginBottom: 8,
  },
  serviceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.8)',
  },
  servicePrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
    // Color will be set dynamically using adaptiveAccentColor
  },

  // Enhanced Action Buttons with Reflective Effects
  actionButtons: {
    flexDirection: 'column',
    gap: 10, // Increased gap since there are only 2 buttons now
    minWidth: 90,
  },
  actionButtonBlur: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  buttonReflection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bookButton: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  bookButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#000',
    fontWeight: 'bold',
    zIndex: 1,
  },
  quickBookButton: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  quickBookButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#000',
    fontWeight: '600',
    opacity: 0.9,
    zIndex: 1,
  },

  // Reviews Section
  reviewsCard: {
    padding: 20,
    borderRadius: 25,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  reviewItem: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reviewerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#000',
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.7)',
    marginLeft: 'auto',
  },
  reviewComment: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: '#000',
    lineHeight: 18,
  },
  seeAllButton: {
    alignItems: 'center',
    paddingTop: 10,
  },
  seeAllText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
    // Color will be set dynamically using adaptiveAccentColor
  },

  // Contact Section
  contactCard: {
    padding: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  contactText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: '#000',
    marginBottom: 8,
  },
  contactButton: {
    paddingVertical: 14,
    paddingHorizontal: 60, // Much wider
    borderRadius: 25,
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 15,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    minWidth: 220, // Wider minimum width
    maxWidth: 280, // Wider maximum width
    // backgroundColor and shadowColor will be set dynamically using adaptiveAccentColor
  },
  contactButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#fff',
  },

  // Reviews Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent dark overlay
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    marginTop: 100, // Start modal below status bar
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  modalBackground: {
    flex: 1,
  },
  modalGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    color: '#000',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: 'rgba(0,0,0,0.85)',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalScrollContent: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  modalReviewCard: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  modalReviewerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
  },
  modalReviewRating: {
    flexDirection: 'row',
    gap: 2,
  },
  modalStar: {
    fontSize: 14,
  },
  modalReviewDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.75)',
    marginLeft: 'auto',
  },
  modalReviewComment: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: '#000',
    lineHeight: 20,
  },

  // Add-Ons Modal Styles
  addOnsModalContainer: {
    flex: 1,
    marginTop: 120, // Start modal below navigation
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: 'hidden',
  },
  addOnCard: {
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  addOnCardBlur: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  addOnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addOnInfo: {
    flex: 1,
    marginRight: 15,
  },
  addOnName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  addOnDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: 'rgba(0,0,0,0.85)',
    lineHeight: 16,
  },
  addOnPriceContainer: {
    alignItems: 'center',
    gap: 8,
  },
  addOnPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addOnCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  addOnCheckmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addOnsFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  totalLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#000',
  },
  totalPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    fontWeight: 'bold',
  },
  addOnsButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  skipButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    fontWeight: 'bold',
  },
  addToCartButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addToCartButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },

  // Success Message Styles
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  successContainer: {
    marginHorizontal: 30,
    borderRadius: 25,
    overflow: 'hidden',
    maxWidth: screenWidth * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 15,
  },
  successBlur: {
    padding: 30,
    alignItems: 'center',
    position: 'relative',
  },
  successGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successIconText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  successTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 16,
    color: '#000',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },
  successButtons: {
    flexDirection: 'row',
    gap: 15,
    width: '100%',
  },
  successCloseButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  successCloseText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#000',
    fontWeight: 'bold',
  },
  successViewCartButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  successViewCartText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ProviderProfileScreen;
