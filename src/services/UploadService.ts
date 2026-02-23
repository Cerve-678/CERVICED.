// src/services/UploadService.ts - Future provider registration
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

// Provider type definition
export interface Provider {
  id: string;
  name: string;
  service: string;
  logoImageId: string;
  backgroundImageId: string;
  location: string;
  rating: number;
  slotsText: string;
  aboutText: string;
  gradientColors: string[];
  isGradientEnabled: boolean;
  categories: Record<string, any[]>;
  workingHours?: WorkingHours;
  contactInfo?: ContactInfo;
}

export interface ProviderRegistrationData {
  businessName: string;
  serviceType: 'HAIR' | 'NAILS' | 'LASHES' | 'BEAUTY' | 'MASSAGE';
  logo: string; // base64 or URI
  backgroundImage?: string;
  location: string;
  description: string;
  services: NewServiceData[];
  workingHours: WorkingHours;
  contactInfo: ContactInfo;
}

export interface NewServiceData {
  name: string;
  description: string;
  price: number;
  duration: string;
  category: string;
  image?: string;
}

export interface WorkingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breaks?: { start: string; end: string }[];
}

export interface ContactInfo {
  email: string;
  phone: string;
  instagram?: string;
  website?: string;
}

// Fixed return types
export interface UploadResponse {
  success: boolean;
  providerId?: string;
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ImageResult {
  uri: string;
  base64?: string;
}

class UploadService {
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

  /**
   * Request camera/gallery permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  /**
   * Pick and validate image from gallery
   */
  async pickImage(): Promise<ImageResult | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Camera/Gallery permission required');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square for logos
        quality: 0.8,
        base64: true
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      const image = result.assets[0];
      
      // Validate image
      const validation = await this.validateImage(image.uri);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      return {
        uri: image.uri,
        ...(image.base64 && { base64: image.base64 })
      };
    } catch (error) {
      console.error('Image picker failed:', error);
      throw error;
    }
  }

  /**
   * Validate image file
   */
  private async validateImage(uri: string): Promise<ValidationResult> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        return { isValid: false, error: 'File does not exist' };
      }

      if (fileInfo.size && fileInfo.size > this.MAX_IMAGE_SIZE) {
        return { isValid: false, error: 'Image too large (max 5MB)' };
      }

      const extension = uri.split('.').pop()?.toLowerCase();
      if (!extension || !this.ALLOWED_FORMATS.includes(extension)) {
        return { isValid: false, error: 'Invalid image format' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Validation failed' };
    }
  }

  /**
   * Upload provider registration data
   */
  async submitProviderRegistration(data: ProviderRegistrationData): Promise<UploadResponse> {
    try {
      // Validate required fields
      const validation = this.validateRegistrationData(data);
      if (!validation.isValid) {
        return { success: false, error: validation.error ?? 'Validation failed' };
      }

      // In production, upload to your backend API
      const response = await this.uploadToCloudStorage(data);
      
      if (response.success && response.providerId) {
        // Save to local provider data service for immediate use
        await this.saveToLocalDatabase(data, response.providerId);
        
        return { 
          success: true, 
          providerId: response.providerId 
        };
      } else {
        return { 
          success: false, 
          error: response.error || 'Upload failed' 
        };
      }
    } catch (error) {
      console.error('Provider registration failed:', error);
      return { 
        success: false, 
        error: 'Registration failed. Please try again.' 
      };
    }
  }

  /**
   * Validate registration data
   */
  private validateRegistrationData(data: ProviderRegistrationData): ValidationResult {
    if (!data.businessName?.trim()) {
      return { isValid: false, error: 'Business name is required' };
    }

    if (!data.serviceType) {
      return { isValid: false, error: 'Service type is required' };
    }

    if (!data.logo) {
      return { isValid: false, error: 'Logo is required' };
    }

    if (!data.location?.trim()) {
      return { isValid: false, error: 'Location is required' };
    }

    if (!data.contactInfo?.email?.includes('@')) {
      return { isValid: false, error: 'Valid email is required' };
    }

    if (!data.services || data.services.length === 0) {
      return { isValid: false, error: 'At least one service is required' };
    }

    // Validate each service
    for (const service of data.services) {
      if (!service.name?.trim()) {
        return { isValid: false, error: 'All services must have a name' };
      }
      if (!service.price || service.price <= 0) {
        return { isValid: false, error: 'All services must have a valid price' };
      }
    }

    return { isValid: true };
  }

  /**
   * Upload to cloud storage (implement your backend API here)
   */
  private async uploadToCloudStorage(data: ProviderRegistrationData): Promise<UploadResponse> {
    try {
      // PRODUCTION: Replace with your actual API endpoint
      const API_ENDPOINT = 'https://your-api.com/providers/register';
      
      const formData = new FormData();
      formData.append('businessName', data.businessName);
      formData.append('serviceType', data.serviceType);
      formData.append('location', data.location);
      formData.append('description', data.description);
      formData.append('contactInfo', JSON.stringify(data.contactInfo));
      formData.append('services', JSON.stringify(data.services));
      formData.append('workingHours', JSON.stringify(data.workingHours));

      // Upload logo
      if (data.logo) {
        formData.append('logo', {
          uri: data.logo,
          type: 'image/jpeg',
          name: 'logo.jpg'
        } as any);
      }

      // Upload background image if provided
      if (data.backgroundImage) {
        formData.append('backgroundImage', {
          uri: data.backgroundImage,
          type: 'image/jpeg',
          name: 'background.jpg'
        } as any);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for uploads

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Don't set Content-Type manually for FormData - the browser/RN sets it with the correct boundary
      });

      clearTimeout(timeoutId);

      let result: any;
      try {
        result = await response.json();
      } catch (parseError) {
        return {
          success: false,
          error: 'Invalid response from server',
        };
      }

      if (response.ok && result?.providerId) {
        return {
          success: true,
          providerId: result.providerId
        };
      } else {
        return {
          success: false,
          error: result?.message || `Server error (${response.status})`
        };
      }
    } catch (error) {
      console.error('Cloud upload failed:', error);
      return { 
        success: false, 
        error: 'Network error. Please check your connection.' 
      };
    }
  }

  /**
   * Save to local database for immediate access
   */
  private async saveToLocalDatabase(data: ProviderRegistrationData, providerId: string): Promise<void> {
    try {
      // Add to provider data service
      const newProvider: Provider = {
        id: providerId,
        name: data.businessName,
        service: data.serviceType,
        logoImageId: `provider_${providerId}`,
        backgroundImageId: data.backgroundImage ? `background_${providerId}` : 'background_default',
        location: data.location,
        rating: 5.0, // New providers start with 5.0
        slotsText: 'Accepting new bookings',
        aboutText: data.description,
        gradientColors: this.generateGradientColors(data.serviceType),
        isGradientEnabled: true,
        categories: this.formatServicesForProvider(data.services),
        workingHours: data.workingHours,
        contactInfo: data.contactInfo
      };

      // In production, add to your provider data service
      // providerDataService.addProvider(newProvider);

      if (__DEV__) console.log('Provider saved locally:', newProvider);
    } catch (error) {
      console.error('Local save failed:', error);
      // Don't throw - this is not critical for registration success
    }
  }

  /**
   * Generate gradient colors based on service type
   */
  private generateGradientColors(serviceType: string): string[] {
    const gradients: Record<string, string[]> = {
      'HAIR': ['#FF6B6B', '#4ECDC4', '#45B7D1'],
      'NAILS': ['#E6E6FA', '#D8BFD8', '#9932CC'],
      'LASHES': ['#FFB6C1', '#FFC0CB', '#FF69B4'],
      'BEAUTY': ['#FFD700', '#FFA500', '#FF6347'],
      'MASSAGE': ['#98D8C8', '#5DADE2', '#3498DB']
    };

    return gradients[serviceType] || ['#ADD8E6', '#4682B4', '#191970'];
  }

  /**
   * Format services for provider data structure
   */
  private formatServicesForProvider(services: NewServiceData[]): Record<string, any[]> {
    const categories: Record<string, any[]> = {};

    services.forEach((service, index) => {
      const category = service.category || 'General';
      
      if (!categories[category]) {
        categories[category] = [];
      }

      categories[category].push({
        id: `service_${index + 1}`,
        name: service.name,
        price: service.price,
        duration: service.duration,
        description: service.description,
        imageId: service.image ? `service_custom_${index}` : 'placeholder_service',
        category: category
      });
    });

    return categories;
  }

  /**
   * Generate unique provider ID
   */
  generateProviderId(businessName: string): string {
    const timestamp = Date.now();
    const cleanName = businessName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .substring(0, 10);
    
    return `${cleanName}_${timestamp}`;
  }
}

// Export singleton instance
export const uploadService = new UploadService();

// Hook for React components
export const useUploadService = () => {
  return {
    pickImage: () => uploadService.pickImage(),
    submitRegistration: (data: ProviderRegistrationData) => uploadService.submitProviderRegistration(data),
    requestPermissions: () => uploadService.requestPermissions(),
    generateProviderId: (name: string) => uploadService.generateProviderId(name)
  };
};