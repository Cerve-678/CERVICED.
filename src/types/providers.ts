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
  // Card source in the mixed Explore feed — absent/'portfolio' for a client-work
  // photo, 'provider' for a provider cover-photo card, 'service' for a service
  // photo card. Same shape either way so PortfolioCard/ImageDetailModal don't
  // need to branch on it.
  kind?: 'portfolio' | 'provider' | 'service';
  // Real services.id UUID — only present when kind === 'service'. Lets
  // "Book Now" jump straight to that exact service's booking modal instead
  // of just the provider's profile.
  serviceId?: string;
  // The service's own name (e.g. "Gel Manicure") — only present when
  // kind === 'service'. Shown alongside `caption` (the service's
  // description there, not its name) so the modal can display both rather
  // than one having to stand in for the other.
  serviceName?: string;
  // Full ordered photo set for this service (only present when
  // kind === 'service') — `image` is just images[0] repeated per card so
  // each photo is independently favouritable in the Explore feed, but the
  // detail modal needs the whole set to render its own swipeable carousel
  // instead of showing only the single photo that was tapped.
  images?: ImageSourcePropType[];
  // Real stored aspect ratio for each entry in `images`, same order — only
  // present when kind === 'service'. `aspectRatio` above describes THIS
  // card's one photo; the detail modal needs the whole set's ratios to pick
  // a single carousel height, because sizing the box from the tapped photo
  // alone made the same service open at a different height depending on
  // which of its photos you came in through.
  imageAspectRatios?: number[];
  // The provider's own framing choice per entry in `images`, same order —
  // 'cover' fills and may crop, 'contain' shows the whole photo. Only present
  // when kind === 'service'; a portfolio photo has no such control, so the
  // modal falls back to deciding for itself there.
  imageFits?: ('cover' | 'contain')[];
  // True only for kind === 'provider' cards backed by an unclaimed/scraped
  // provider row (is_claimed = false) — see getDiscoverUnclaimedProviders.
  // Card UI must show an "Unclaimed" badge and route to the claim flow
  // instead of a normal profile/booking view.
  isUnclaimed?: boolean;
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
