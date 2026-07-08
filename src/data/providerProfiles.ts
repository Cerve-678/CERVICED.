// Provider Profile Types
// All actual provider data lives in Supabase — this file is types only.

import { ImageSourcePropType } from 'react-native';

export type ServiceCategory = 'HAIR' | 'NAILS' | 'MUA' | 'LASHES' | 'BROWS' | 'AESTHETICS';

export interface PortfolioItem {
  id: string;
  image: ImageSourcePropType;
  caption: string;
  category: ServiceCategory;
  aspectRatio: number;
  providerId: string;
  tags?: string[] | undefined;
  price?: string | undefined;
  // Embedded provider data — populated from Supabase join
  imageUri?: string;
  providerName?: string;
  providerLogoUri?: string;
  providerSlug?: string;
  providerRating?: number;
  providerReviewCount?: number;
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

// Empty — all data is in Supabase
export const providerProfiles: Record<string, ProviderProfile> = {};
