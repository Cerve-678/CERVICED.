// Provider Profile Data
// This file contains all provider profile information in a data-driven format

import { ImageSourcePropType } from 'react-native';

export type ServiceCategory = 'HAIR' | 'NAILS' | 'MUA' | 'LASHES' | 'BROWS' | 'AESTHETICS';

export interface PortfolioItem {
  id: string;
  image: ImageSourcePropType;
  caption: string;
  category: ServiceCategory;
  aspectRatio: number;
  providerId: string;
  tags?: string[];
  price?: string;
}

export interface Service {
  id: string;
  name: string;
  duration: string;
  price: string;
  description?: string;
}

export interface Review {
  id: string;
  userName: string;
  rating: number;
  date: string;
  comment: string;
  service?: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  service: string;
  logo: any;
  description: string;
  rating: number;
  reviewCount: number;
  location: string;
  yearsExperience: number;
  specialties: string[];
  services: Service[];
  reviews: Review[];
  portfolio: PortfolioItem[];
  availability?: {
    monday?: string[];
    tuesday?: string[];
    wednesday?: string[];
    thursday?: string[];
    friday?: string[];
    saturday?: string[];
    sunday?: string[];
  };
}

export const providerProfiles: Record<string, ProviderProfile> = {
  'rosemay-aesthetics': {
    id: 'rosemay-aesthetics',
    name: 'RoseMay Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/RoseMayAesthetics.png'),
    description: 'Premium aesthetics clinic specializing in dermal fillers, anti-wrinkle treatments, and skin rejuvenation. Our expert practitioners use the latest techniques to help you achieve natural-looking results.',
    rating: 4.9,
    reviewCount: 156,
    location: 'North London',
    yearsExperience: 8,
    specialties: ['Dermal Fillers', 'Anti-Wrinkle Injections', 'Skin Boosters', 'Lip Enhancements'],
    services: [
      {
        id: 'dermal-fillers',
        name: 'Dermal Fillers',
        duration: '45-60 mins',
        price: '£250-£450',
        description: 'Add volume and definition to cheeks, lips, and jawline'
      },
      {
        id: 'anti-wrinkle',
        name: 'Anti-Wrinkle Treatment',
        duration: '30 mins',
        price: '£180-£280',
        description: 'Reduce fine lines and wrinkles for a refreshed appearance'
      },
      {
        id: 'skin-boosters',
        name: 'Skin Boosters',
        duration: '30-45 mins',
        price: '£220-£350',
        description: 'Hydrate and rejuvenate skin from within'
      },
      {
        id: 'lip-enhancement',
        name: 'Lip Enhancement',
        duration: '45 mins',
        price: '£280-£380',
        description: 'Natural-looking lip volume and definition'
      },
    ],
    reviews: [
      {
        id: 'rm-1',
        userName: 'Sarah M.',
        rating: 5,
        date: '2026-01-10',
        comment: 'Amazing results! The team at RoseMay made me feel so comfortable throughout the whole process. My skin looks incredible!',
        service: 'Skin Boosters'
      },
      {
        id: 'rm-2',
        userName: 'Emma L.',
        rating: 5,
        date: '2026-01-05',
        comment: 'Best lip filler experience ever. Natural results and no bruising. Highly recommend!',
        service: 'Lip Enhancement'
      },
      {
        id: 'rm-3',
        userName: 'Jessica K.',
        rating: 4.5,
        date: '2025-12-28',
        comment: 'Very professional service. Great consultation and aftercare advice.',
        service: 'Anti-Wrinkle Treatment'
      },
    ],
    portfolio: [
      {
        id: 'rm-port-1',
        image: require('../../assets/logos/RoseMayAesthetics.png'),
        caption: 'Natural lip enhancement — subtle volume boost',
        category: 'AESTHETICS',
        aspectRatio: 1.25,
        providerId: 'rosemay-aesthetics',
        tags: ['lips', 'filler', 'natural', 'enhancement'],
        price: '£280',
      },
      {
        id: 'rm-port-2',
        image: require('../../assets/logos/RoseMayAesthetics.png'),
        caption: 'Cheek filler — sculpted contour, zero downtime',
        category: 'AESTHETICS',
        aspectRatio: 1.0,
        providerId: 'rosemay-aesthetics',
        tags: ['cheek', 'filler', 'contour', 'sculpted'],
        price: '£350',
      },
      {
        id: 'rm-port-3',
        image: require('../../assets/logos/RoseMayAesthetics.png'),
        caption: 'Glowing skin after skin booster treatment',
        category: 'AESTHETICS',
        aspectRatio: 1.4,
        providerId: 'rosemay-aesthetics',
        tags: ['skin', 'glow', 'booster', 'hydration', 'rejuvenation'],
        price: '£220',
      },
      {
        id: 'rm-port-4',
        image: require('../../assets/logos/RoseMayAesthetics.png'),
        caption: 'Anti-wrinkle results — forehead smoothing',
        category: 'AESTHETICS',
        aspectRatio: 0.85,
        providerId: 'rosemay-aesthetics',
        tags: ['anti-wrinkle', 'forehead', 'smooth', 'youthful'],
        price: '£180',
      },
    ],
  },

  'fillerbyjess': {
    id: 'fillerbyjess',
    name: 'Filler by Jess',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/fillerbyjess.png'),
    description: 'Expert aesthetic practitioner specializing in advanced filler techniques. Jess brings years of experience in facial aesthetics to deliver stunning, natural results tailored to your unique features.',
    rating: 4.7,
    reviewCount: 98,
    location: 'Central London',
    yearsExperience: 6,
    specialties: ['Advanced Lip Fillers', 'Cheek Augmentation', 'Non-Surgical Rhinoplasty', 'Jawline Contouring'],
    services: [
      {
        id: 'advanced-lips',
        name: 'Advanced Lip Filler',
        duration: '60 mins',
        price: '£300-£450',
        description: 'Expert lip enhancement with precise technique'
      },
      {
        id: 'cheek-aug',
        name: 'Cheek Augmentation',
        duration: '45 mins',
        price: '£350-£500',
        description: 'Restore volume and lift to cheeks'
      },
      {
        id: 'non-surgical-rhino',
        name: 'Non-Surgical Rhinoplasty',
        duration: '45 mins',
        price: '£380-£520',
        description: 'Reshape nose without surgery'
      },
      {
        id: 'jawline-contour',
        name: 'Jawline Contouring',
        duration: '45 mins',
        price: '£400-£550',
        description: 'Define and sculpt your jawline'
      },
    ],
    reviews: [
      {
        id: 'fbj-1',
        userName: 'Amy P.',
        rating: 5,
        date: '2026-01-08',
        comment: 'Jess is incredible! My lips look so natural and beautiful. She really listens to what you want.',
        service: 'Advanced Lip Filler'
      },
      {
        id: 'fbj-2',
        userName: 'Katie R.',
        rating: 4.5,
        date: '2026-01-03',
        comment: 'Great experience, very knowledgeable and professional.',
        service: 'Cheek Augmentation'
      },
    ],
    portfolio: [
      {
        id: 'fbj-port-1',
        image: require('../../assets/logos/fillerbyjess.png'),
        caption: 'Russian lip technique — defined cupid\'s bow',
        category: 'AESTHETICS',
        aspectRatio: 1.3,
        providerId: 'fillerbyjess',
        tags: ['lips', 'russian', 'cupids-bow', 'defined'],
        price: '£350',
      },
      {
        id: 'fbj-port-2',
        image: require('../../assets/logos/fillerbyjess.png'),
        caption: 'Non-surgical nose job — balanced profile',
        category: 'AESTHETICS',
        aspectRatio: 0.9,
        providerId: 'fillerbyjess',
        tags: ['nose', 'non-surgical', 'rhinoplasty', 'profile'],
        price: '£400',
      },
      {
        id: 'fbj-port-3',
        image: require('../../assets/logos/fillerbyjess.png'),
        caption: 'Jawline contouring — sharp, defined jaw',
        category: 'AESTHETICS',
        aspectRatio: 1.15,
        providerId: 'fillerbyjess',
        tags: ['jawline', 'contour', 'defined', 'sculpted'],
        price: '£450',
      },
    ],
  },

  'eyebrowdeluxe': {
    id: 'eyebrowdeluxe',
    name: 'Eyebrow Deluxe',
    service: 'BROWS',
    logo: require('../../assets/logos/eyebrowdeluxe.png'),
    description: 'London\'s premier eyebrow studio offering expert shaping, tinting, lamination, and microblading. Transform your brows with our skilled technicians.',
    rating: 4.8,
    reviewCount: 203,
    location: 'East London',
    yearsExperience: 5,
    specialties: ['Microblading', 'Brow Lamination', 'HD Brows', 'Brow Tinting'],
    services: [
      {
        id: 'microblading',
        name: 'Microblading',
        duration: '2-2.5 hours',
        price: '£350-£450',
        description: 'Semi-permanent brow tattoo for natural-looking fullness'
      },
      {
        id: 'brow-lamination',
        name: 'Brow Lamination',
        duration: '45 mins',
        price: '£45-£65',
        description: 'Fluffy, full brows that last 6-8 weeks'
      },
      {
        id: 'hd-brows',
        name: 'HD Brows',
        duration: '45 mins',
        price: '£40-£55',
        description: 'Custom brow shaping and tinting'
      },
      {
        id: 'brow-tint',
        name: 'Brow Tinting',
        duration: '20 mins',
        price: '£18-£25',
        description: 'Define and darken your natural brows'
      },
    ],
    reviews: [
      {
        id: 'ed-1',
        userName: 'Mia T.',
        rating: 5,
        date: '2026-01-12',
        comment: 'Best brow lamination ever! My brows look amazing and last so long.',
        service: 'Brow Lamination'
      },
      {
        id: 'ed-2',
        userName: 'Lily S.',
        rating: 5,
        date: '2026-01-07',
        comment: 'The microblading is perfection! So natural and exactly what I wanted.',
        service: 'Microblading'
      },
      {
        id: 'ed-3',
        userName: 'Zara H.',
        rating: 4.5,
        date: '2025-12-30',
        comment: 'Love my HD brows! Great service and attention to detail.',
        service: 'HD Brows'
      },
    ],
    portfolio: [
      {
        id: 'ed-port-1',
        image: require('../../assets/logos/eyebrowdeluxe.png'),
        caption: 'Fluffy brow lamination — full and feathered',
        category: 'BROWS',
        aspectRatio: 0.85,
        providerId: 'eyebrowdeluxe',
        tags: ['lamination', 'fluffy', 'feathered', 'full'],
        price: '£55',
      },
      {
        id: 'ed-port-2',
        image: require('../../assets/logos/eyebrowdeluxe.png'),
        caption: 'Microblading healed results — hair-stroke perfection',
        category: 'BROWS',
        aspectRatio: 1.35,
        providerId: 'eyebrowdeluxe',
        tags: ['microblading', 'hair-stroke', 'semi-permanent', 'natural'],
        price: '£400',
      },
      {
        id: 'ed-port-3',
        image: require('../../assets/logos/eyebrowdeluxe.png'),
        caption: 'HD brows — sculpted arch with tint',
        category: 'BROWS',
        aspectRatio: 1.1,
        providerId: 'eyebrowdeluxe',
        tags: ['hd-brows', 'sculpted', 'arch', 'tint', 'shaped'],
        price: '£45',
      },
    ],
  },

  'lashesgalore': {
    id: 'lashesgalore',
    name: 'Lashes Galore',
    service: 'LASHES',
    logo: require('../../assets/logos/lashesgalore.png'),
    description: 'Specialist lash studio offering classic, volume, and hybrid lash extensions. Our certified technicians create customized lash looks that enhance your natural beauty.',
    rating: 4.9,
    reviewCount: 287,
    location: 'South London',
    yearsExperience: 7,
    specialties: ['Volume Lashes', 'Mega Volume', 'Hybrid Lashes', 'Lash Lifts'],
    services: [
      {
        id: 'classic-lashes',
        name: 'Classic Lash Extensions',
        duration: '2 hours',
        price: '£80-£120',
        description: 'Natural-looking individual lash extensions'
      },
      {
        id: 'volume-lashes',
        name: 'Volume Lash Extensions',
        duration: '2.5 hours',
        price: '£120-£160',
        description: 'Fuller, more dramatic lash look'
      },
      {
        id: 'mega-volume',
        name: 'Mega Volume Lashes',
        duration: '3 hours',
        price: '£150-£200',
        description: 'Ultra-full, glamorous lash extensions'
      },
      {
        id: 'lash-lift',
        name: 'Lash Lift & Tint',
        duration: '1 hour',
        price: '£50-£70',
        description: 'Curl and darken your natural lashes'
      },
    ],
    reviews: [
      {
        id: 'lg-1',
        userName: 'Sophie B.',
        rating: 5,
        date: '2026-01-11',
        comment: 'My lashes are incredible! They last so long and look so natural. Best lash tech in London!',
        service: 'Volume Lash Extensions'
      },
      {
        id: 'lg-2',
        userName: 'Olivia W.',
        rating: 5,
        date: '2026-01-06',
        comment: 'Amazing mega volume lashes! So full and fluffy. I get compliments every day!',
        service: 'Mega Volume Lashes'
      },
      {
        id: 'lg-3',
        userName: 'Hannah M.',
        rating: 4.5,
        date: '2026-01-02',
        comment: 'Great lash lift! My lashes look so much longer and curled.',
        service: 'Lash Lift & Tint'
      },
    ],
    portfolio: [
      {
        id: 'lg-port-1',
        image: require('../../assets/logos/lashesgalore.png'),
        caption: 'Mega volume set — full glam, wispy tips',
        category: 'LASHES',
        aspectRatio: 1.2,
        providerId: 'lashesgalore',
        tags: ['mega-volume', 'glam', 'wispy', 'full'],
        price: '£180',
      },
      {
        id: 'lg-port-2',
        image: require('../../assets/logos/lashesgalore.png'),
        caption: 'Natural classic lashes — everyday elegance',
        category: 'LASHES',
        aspectRatio: 0.95,
        providerId: 'lashesgalore',
        tags: ['classic', 'natural', 'everyday', 'elegant'],
        price: '£90',
      },
      {
        id: 'lg-port-3',
        image: require('../../assets/logos/lashesgalore.png'),
        caption: 'Lash lift & tint — curled and defined',
        category: 'LASHES',
        aspectRatio: 1.4,
        providerId: 'lashesgalore',
        tags: ['lash-lift', 'tint', 'curled', 'defined', 'natural'],
        price: '£60',
      },
      {
        id: 'lg-port-4',
        image: require('../../assets/logos/lashesgalore.png'),
        caption: 'Hybrid lash set — textured volume',
        category: 'LASHES',
        aspectRatio: 1.05,
        providerId: 'lashesgalore',
        tags: ['hybrid', 'textured', 'volume', 'mixed'],
        price: '£130',
      },
    ],
  },

  'zeenail-artist': {
    id: 'zeenail-artist',
    name: 'Zee Nail Artist',
    service: 'NAILS',
    logo: require('../../assets/logos/ZeeNail Artist.png'),
    description: 'Expert nail artist specializing in bespoke nail art, acrylic extensions, and luxurious manicures. Zee creates stunning nail designs tailored to your style with meticulous attention to detail.',
    rating: 4.8,
    reviewCount: 145,
    location: 'East London',
    yearsExperience: 5,
    specialties: ['Acrylic Extensions', 'Gel & Biab', 'Male Pedicure', 'Nail Art'],
    services: [
      {
        id: 'acrylic-extensions',
        name: 'Acrylic Extensions',
        duration: '2.5 hours',
        price: '£70',
        description: 'Consists of an inspired full set acrylic with professional finish.'
      },
      {
        id: 'freestyle-sets',
        name: 'Freestyle Sets',
        duration: '2.5 hours',
        price: '£70-£90',
        description: 'Freestyle can consist of gems and multiple designs on different nails such as ombre etc.'
      },
      {
        id: 'french-tips',
        name: 'French Tips',
        duration: '2.5 hours',
        price: '£70',
        description: 'Classic French tip sets with any colour accent.'
      },
      {
        id: 'gel-manicure',
        name: 'Gel Manicure',
        duration: '1 hour',
        price: '£80',
        description: 'Long-lasting gel manicure with a glossy finish.'
      },
      {
        id: 'biab-manicure',
        name: 'Biab Manicure',
        duration: '45 mins',
        price: '£35',
        description: 'Builder in a bottle manicure (BIAB) for strength and shine.'
      },
      {
        id: 'hands-only',
        name: 'Hands Only Manicure',
        duration: '1 hour',
        price: '£15',
        description: 'Professional hand care and manicure service.'
      },
      {
        id: 'feet-only',
        name: 'Feet Only Pedicure',
        duration: '1.5 hours',
        price: '£20',
        description: 'Complete foot care and pedicure treatment.'
      },
      {
        id: 'hands-feet-combo',
        name: 'Hands and Feet Combination',
        duration: '2.5 hours',
        price: '£55',
        description: 'Ultimate pampering for hands and feet.'
      },
    ],
    reviews: [
      {
        id: 'zna-1',
        userName: 'Chloe D.',
        rating: 5,
        date: '2026-01-15',
        comment: 'Zee is amazing! My nails have never looked better. She really listens to what you want and creates beautiful designs.',
        service: 'Gel Manicure'
      },
      {
        id: 'zna-2',
        userName: 'Emily R.',
        rating: 5,
        date: '2026-01-12',
        comment: 'Absolutely love my acrylic nails! Zee is so talented and pays attention to every detail.',
        service: 'Acrylic Extensions'
      },
      {
        id: 'zna-3',
        userName: 'Sarah L.',
        rating: 4.5,
        date: '2026-01-08',
        comment: 'Zee is a true artist! My freestyle set is gorgeous and lasts for weeks.',
        service: 'Freestyle Sets'
      },
    ],
    portfolio: [
      {
        id: 'zna-port-1',
        image: require('../../assets/logos/ZeeNail Artist.png'),
        caption: 'Freestyle acrylic set — chrome and gems',
        category: 'NAILS',
        aspectRatio: 1.3,
        providerId: 'zeenail-artist',
        tags: ['acrylic', 'freestyle', 'chrome', 'gems', 'nail-art'],
        price: '£80',
      },
      {
        id: 'zna-port-2',
        image: require('../../assets/logos/ZeeNail Artist.png'),
        caption: 'French tip acrylics — clean and classic',
        category: 'NAILS',
        aspectRatio: 0.85,
        providerId: 'zeenail-artist',
        tags: ['french-tip', 'acrylic', 'classic', 'clean'],
        price: '£70',
      },
      {
        id: 'zna-port-3',
        image: require('../../assets/logos/ZeeNail Artist.png'),
        caption: 'Gel manicure — glossy berry tones',
        category: 'NAILS',
        aspectRatio: 1.15,
        providerId: 'zeenail-artist',
        tags: ['gel', 'manicure', 'glossy', 'berry', 'colour'],
        price: '£80',
      },
      {
        id: 'zna-port-4',
        image: require('../../assets/logos/ZeeNail Artist.png'),
        caption: 'Ombre nail set — pink to white fade',
        category: 'NAILS',
        aspectRatio: 1.45,
        providerId: 'zeenail-artist',
        tags: ['ombre', 'fade', 'pink', 'white', 'gradient'],
        price: '£75',
      },
    ],
  },

  'painted-by-zoe': {
    id: 'painted-by-zoe',
    name: 'Painted by Zoe',
    service: 'MUA',
    logo: require('../../assets/logos/paintedbyZoe.png'),
    description: 'Professional makeup artist specializing in bridal, events, and editorial looks. Zoe creates flawless makeup that enhances your natural beauty and makes you feel confident for any occasion.',
    rating: 4.9,
    reviewCount: 132,
    location: 'West London',
    yearsExperience: 6,
    specialties: ['Bridal Makeup', 'Special Event Makeup', 'Editorial Makeup', 'Makeup Tutorials'],
    services: [
      {
        id: 'bridal-makeup',
        name: 'Bridal Makeup',
        duration: '2.5 hours',
        price: '£150',
        description: 'Complete bridal makeup with trial session included.'
      },
      {
        id: 'special-event-makeup',
        name: 'Special Event Makeup',
        duration: '1.5 hours',
        price: '£80',
        description: 'Glamorous makeup for special occasions and parties.'
      },
      {
        id: 'editorial-makeup',
        name: 'Editorial Makeup',
        duration: '2 hours',
        price: '£120',
        description: 'High-fashion editorial looks for photoshoots.'
      },
      {
        id: 'natural-everyday',
        name: 'Natural Everyday Makeup',
        duration: '1 hour',
        price: '£50',
        description: 'Soft, natural makeup for everyday wear.'
      },
      {
        id: 'makeup-tutorial',
        name: 'Makeup Tutorial',
        duration: '2 hours',
        price: '£100',
        description: 'Learn professional makeup techniques one-on-one.'
      },
      {
        id: 'bridal-trial',
        name: 'Bridal Makeup Trial',
        duration: '1.5 hours',
        price: '£75',
        description: 'Test your bridal look before the big day.'
      },
    ],
    reviews: [
      {
        id: 'pbz-1',
        userName: 'Laura K.',
        rating: 5,
        date: '2026-01-14',
        comment: 'Zoe is incredible! She made me feel so beautiful on my wedding day. Highly recommend!',
        service: 'Bridal Makeup'
      },
      {
        id: 'pbz-2',
        userName: 'Megan T.',
        rating: 5,
        date: '2026-01-10',
        comment: 'Absolutely loved my makeup for the event! Zoe is so talented and professional.',
        service: 'Special Event Makeup'
      },
      {
        id: 'pbz-3',
        userName: 'Jessica H.',
        rating: 4.5,
        date: '2026-01-06',
        comment: 'The makeup tutorial was amazing! Learned so many tips and tricks.',
        service: 'Makeup Tutorial'
      },
    ],
    portfolio: [
      {
        id: 'pbz-port-1',
        image: require('../../assets/logos/paintedbyZoe.png'),
        caption: 'Bridal glam — soft smokey eye with dewy skin',
        category: 'MUA',
        aspectRatio: 1.35,
        providerId: 'painted-by-zoe',
        tags: ['bridal', 'smokey-eye', 'dewy', 'glam', 'wedding'],
        price: '£150',
      },
      {
        id: 'pbz-port-2',
        image: require('../../assets/logos/paintedbyZoe.png'),
        caption: 'Editorial bold lip — high fashion editorial',
        category: 'MUA',
        aspectRatio: 0.9,
        providerId: 'painted-by-zoe',
        tags: ['editorial', 'bold-lip', 'high-fashion', 'photoshoot'],
        price: '£120',
      },
      {
        id: 'pbz-port-3',
        image: require('../../assets/logos/paintedbyZoe.png'),
        caption: 'Natural "no makeup" makeup — flawless base',
        category: 'MUA',
        aspectRatio: 1.2,
        providerId: 'painted-by-zoe',
        tags: ['natural', 'no-makeup', 'flawless', 'everyday', 'base'],
        price: '£50',
      },
      {
        id: 'pbz-port-4',
        image: require('../../assets/logos/paintedbyZoe.png'),
        caption: 'Party glam — glitter cut crease',
        category: 'MUA',
        aspectRatio: 1.0,
        providerId: 'painted-by-zoe',
        tags: ['party', 'glitter', 'cut-crease', 'glam', 'event'],
        price: '£80',
      },
    ],
  },

  'braided-slick': {
    id: 'braided-slick',
    name: 'Braided Slick',
    service: 'HAIR',
    logo: require('../../assets/logos/braided slick.png'),
    description: 'Specialist in braids, cornrows, and protective hairstyles for all hair types. Expert in creating beautiful, long-lasting styles that protect and enhance your natural hair.',
    rating: 5.0,
    reviewCount: 198,
    location: 'North West London',
    yearsExperience: 8,
    specialties: ['Box Braids', 'Knotless Braids', 'Cornrows', 'Protective Styles', 'Kids Braiding'],
    services: [
      {
        id: 'box-braids',
        name: 'Box Braids',
        duration: '4 hours',
        price: '£120',
        description: 'Classic box braids in various sizes and lengths.'
      },
      {
        id: 'knotless-braids',
        name: 'Knotless Braids',
        duration: '5 hours',
        price: '£150',
        description: 'Pain-free knotless braiding technique for comfort.'
      },
      {
        id: 'cornrows',
        name: 'Cornrows',
        duration: '2.5 hours',
        price: '£80',
        description: 'Traditional cornrow styles in creative patterns.'
      },
      {
        id: 'feed-in-braids',
        name: 'Feed-In Braids',
        duration: '3.5 hours',
        price: '£100',
        description: 'Natural-looking feed-in braiding technique.'
      },
      {
        id: 'faux-locs',
        name: 'Faux Locs',
        duration: '4.5 hours',
        price: '£140',
        description: 'Beautiful faux loc installation with natural appearance.'
      },
      {
        id: 'passion-twists',
        name: 'Passion Twists',
        duration: '4 hours',
        price: '£130',
        description: 'Trendy passion twist protective styles.'
      },
      {
        id: 'senegalese-twists',
        name: 'Senegalese Twists',
        duration: '3.5 hours',
        price: '£110',
        description: 'Elegant Senegalese twist hairstyles.'
      },
      {
        id: 'braid-touch-up',
        name: 'Braid Touch-Up',
        duration: '2 hours',
        price: '£60',
        description: 'Refresh and maintain your existing braids.'
      },
      {
        id: 'braid-takedown',
        name: 'Braid Takedown',
        duration: '1.5 hours',
        price: '£40',
        description: 'Gentle and safe braid removal service.'
      },
      {
        id: 'kids-box-braids',
        name: 'Kids Box Braids',
        duration: '2.5 hours',
        price: '£60',
        description: 'Gentle box braids specially designed for children (ages 4-12).'
      },
      {
        id: 'kids-cornrows',
        name: 'Kids Cornrows',
        duration: '1.5 hours',
        price: '£45',
        description: 'Fun and creative cornrow styles for kids with gentle technique.'
      },
      {
        id: 'kids-braids-beads',
        name: 'Kids Braids with Beads',
        duration: '2 hours',
        price: '£55',
        description: 'Colorful braids decorated with beads for a playful look.'
      },
    ],
    reviews: [
      {
        id: 'bs-1',
        userName: 'Keisha M.',
        rating: 5,
        date: '2026-01-13',
        comment: 'Best knotless braids I\'ve ever had! So neat and they lasted 8 weeks. Highly recommend!',
        service: 'Knotless Braids'
      },
      {
        id: 'bs-2',
        userName: 'Nia P.',
        rating: 5,
        date: '2026-01-11',
        comment: 'Amazing! My box braids are perfect. The stylist is so skilled and gentle.',
        service: 'Box Braids'
      },
      {
        id: 'bs-3',
        userName: 'Asha R.',
        rating: 5,
        date: '2026-01-09',
        comment: 'Love my faux locs! They look so natural and professional. Will definitely be back!',
        service: 'Faux Locs'
      },
    ],
    portfolio: [
      {
        id: 'bs-port-1',
        image: require('../../assets/logos/braided slick.png'),
        caption: 'Waist-length knotless braids — sleek and neat',
        category: 'HAIR',
        aspectRatio: 1.5,
        providerId: 'braided-slick',
        tags: ['knotless', 'braids', 'waist-length', 'sleek', 'protective'],
        price: '£150',
      },
      {
        id: 'bs-port-2',
        image: require('../../assets/logos/braided slick.png'),
        caption: 'Butterfly locs — boho style, shoulder length',
        category: 'HAIR',
        aspectRatio: 1.1,
        providerId: 'braided-slick',
        tags: ['butterfly-locs', 'boho', 'locs', 'shoulder-length'],
        price: '£140',
      },
      {
        id: 'bs-port-3',
        image: require('../../assets/logos/braided slick.png'),
        caption: 'Stitch cornrows — geometric pattern design',
        category: 'HAIR',
        aspectRatio: 0.8,
        providerId: 'braided-slick',
        tags: ['cornrows', 'stitch', 'geometric', 'pattern', 'design'],
        price: '£80',
      },
      {
        id: 'bs-port-4',
        image: require('../../assets/logos/braided slick.png'),
        caption: 'Passion twists — soft curly ends',
        category: 'HAIR',
        aspectRatio: 1.25,
        providerId: 'braided-slick',
        tags: ['passion-twists', 'curly', 'soft', 'twists', 'protective'],
        price: '£130',
      },
      {
        id: 'bs-port-5',
        image: require('../../assets/logos/braided slick.png'),
        caption: 'Kids braids with colourful beads',
        category: 'HAIR',
        aspectRatio: 1.0,
        providerId: 'braided-slick',
        tags: ['kids', 'braids', 'beads', 'colourful', 'children'],
        price: '£55',
      },
    ],
  },

  'lash-bae': {
    id: 'lash-bae',
    name: 'Lash Bae',
    service: 'LASHES',
    logo: require('../../assets/logos/LashBae.png'),
    description: 'Expert lash technician specializing in classic, freestyle, volume, and Russian Volume, Hybrid lash extensions. Lash Bae creates stunning lash looks that enhance your natural beauty with precision and care.',
    rating: 4.9,
    reviewCount: 250,
    location: 'Central London',
    yearsExperience: 6,
    specialties: ['Classic Lashes', 'Freestyle Lashes', 'Volume Lashes', 'Russian Volume', 'Hybrid Lashes'],
    services: [
      {
        id: 'classic-lashes',
        name: 'Classic Lash Extensions',
        duration: '2 hours',
        price: '£85-£120',
        description: 'Natural-looking individual lash extensions for everyday wear.'
      },
      {
        id: 'freestyle-lashes',
        name: 'Freestyle Lash Extensions',
        duration: '2.5 hours',
        price: '£120-£160',
        description: 'Customized lash design with varying lengths and curls.'
      },
      {
        id: 'volume-lashes',
        name: 'Volume Lash Extensions',
        duration: '3 hours',
        price: '£150-£200',
        description: 'Dramatic volume lashes for a fuller look.'
      },
      {
        id: 'russian-volume-lashes',
        name: 'Russian Volume Lash Extensions',
        duration: '3.5 hours',
        price: '£180-£230',
        description: 'Lightweight, multi-dimensional lashes for a fluffy effect.'
      },
      {
        id: 'hybrid-lashes',
        name: 'Hybrid Lash Extensions',
        duration: '3 hours',
        price: '£150-£200',
        description: 'A mix of classic and volume techniques for a textured look.'
      }
    ],
    reviews: [
      {
        id: 'lb-1',
        userName: 'Isabella J.',
        rating: 5,
        date: '2026-01-09',
        comment: 'Lash Bae is the best! My lashes look amazing and last for weeks.',
        service: 'Volume Lash Extensions'
      },
      {
        id: 'lb-2',
        userName: 'Charlotte F.',
        rating: 5,
        date: '2026-01-05',
        comment: 'Incredible freestyle lashes! So unique and beautiful.',
        service: 'Freestyle Lash Extensions'
      },
      {
        id: 'lb-3',
        userName: 'Amelia G.',
        rating: 4.5,
        date: '2026-01-02',
        comment: 'Great hybrid lashes! Perfect mix of volume and classic styles.',
        service: 'Hybrid Lash Extensions'
      },
      {
        id: 'lb-4',
        userName: 'Sophia L.',
        rating: 4.8,
        date: '2026-01-01',
        comment: 'Love my classic lashes! They look so natural.',
        service: 'Classic Lash Extensions'
      }
    ],
    portfolio: [
      {
        id: 'lb-port-1',
        image: require('../../assets/logos/LashBae.png'),
        caption: 'Russian volume — dramatic and fluffy',
        category: 'LASHES',
        aspectRatio: 1.3,
        providerId: 'lash-bae',
        tags: ['russian-volume', 'dramatic', 'fluffy', 'full'],
        price: '£200',
      },
      {
        id: 'lb-port-2',
        image: require('../../assets/logos/LashBae.png'),
        caption: 'Wispy hybrid set — natural yet full',
        category: 'LASHES',
        aspectRatio: 0.95,
        providerId: 'lash-bae',
        tags: ['hybrid', 'wispy', 'natural', 'full', 'textured'],
        price: '£160',
      },
      {
        id: 'lb-port-3',
        image: require('../../assets/logos/LashBae.png'),
        caption: 'Cat-eye classic lashes — elongated outer corner',
        category: 'LASHES',
        aspectRatio: 1.15,
        providerId: 'lash-bae',
        tags: ['cat-eye', 'classic', 'elongated', 'outer-corner'],
        price: '£100',
      },
    ],
  },
};

