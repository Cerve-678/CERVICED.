// src/services/bookingService.ts - COMPLETE FIXED VERSION
import { CartItem } from '../contexts/CartContext';
import { AppointmentData } from '../contexts/BookingContext';

function getFullProviderName(shortName: string): string {
  const nameMap: Record<string, string> = {
    JENNIFER: 'Hair by Jennifer',
    'Hair by Jennifer': 'Hair by Jennifer',
    KATHRINE: 'Styled by Kathrine',
    'Styled by Kathrine': 'Styled by Kathrine',
    DIVANA: 'Diva Nails',
    'Diva Nails': 'Diva Nails',
    JANA: 'Jana Aesthetics',
    'Jana Aesthetics': 'Jana Aesthetics',
    'HER BROWS': 'Her Brows',
    'Her Brows': 'Her Brows',
    KIKI: "Kiki's Nails",
    "Kiki's Nails": "Kiki's Nails",
    'Kiki Nails': "Kiki's Nails",
    MYA: 'Makeup by Mya',
    'Makeup by Mya': 'Makeup by Mya',
    VIKKI: 'Vikki Laid',
    'Vikki Laid': 'Vikki Laid',
    LASHED: 'Your Lashed',
    'Your Lashed': 'Your Lashed',
    'ROSEMAY AESTHETICS': 'RoseMay Aesthetics',
    'RoseMay Aesthetics': 'RoseMay Aesthetics',
    ROSEMAY: 'RoseMay Aesthetics',
    'FILLER BY JESS': 'Filler by Jess',
    'Filler by Jess': 'Filler by Jess',
    JESS: 'Filler by Jess',
    'EYEBROW DELUXE': 'Eyebrow Deluxe',
    'Eyebrow Deluxe': 'Eyebrow Deluxe',
    EYEBROW: 'Eyebrow Deluxe',
    'LASHES GALORE': 'Lashes Galore',
    'Lashes Galore': 'Lashes Galore',
    GALORE: 'Lashes Galore',
    'ZEE NAIL ARTIST': 'Zee Nail Artist',
    'Zee Nail Artist': 'Zee Nail Artist',
    ZEE: 'Zee Nail Artist',
    'PAINTED BY ZOE': 'Painted by Zoe',
    'Painted by Zoe': 'Painted by Zoe',
    ZOE: 'Painted by Zoe',
    'BRAIDED SLICK': 'Braided Slick',
    'Braided Slick': 'Braided Slick',
    BRAIDED: 'Braided Slick',
    'LASH BAE': 'Lash Bae',
    'Lash Bae': 'Lash Bae',
    LASHBAE: 'Lash Bae',
    BAE: 'Lash Bae',
    SLICKED: 'Slicked by Jennifer',
    'Slicked by Jennifer': 'Slicked by Jennifer',
  };
  return nameMap[shortName] || shortName;
}

// Provider location data
export const PROVIDER_LOCATIONS: Record<string, {
  address: string;
  coordinates: { latitude: number; longitude: number };
  phone: string;
}> = {
  'Hair by Jennifer': {
    address: '9642 Little Santa Monica Blvd, Beverly Hills, CA 90210',
    coordinates: { latitude: 34.0736, longitude: -118.4004 },
    phone: '(310) 555-0123',
  },
  'Styled by Kathrine': {
    address: '8743 Melrose Ave, West Hollywood, CA 90069',
    coordinates: { latitude: 34.0901, longitude: -118.3617 },
    phone: '(323) 555-0456',
  },
  'Diva Nails': {
    address: '1234 Main St, Santa Monica, CA 90401',
    coordinates: { latitude: 34.0195, longitude: -118.4912 },
    phone: '(310) 555-0789',
  },
  'Jana Aesthetics': {
    address: '6801 Hollywood Blvd, Hollywood, CA 90028',
    coordinates: { latitude: 34.1016, longitude: -118.3416 },
    phone: '(323) 555-0321',
  },
  'Her Brows': {
    address: '5555 Sunset Blvd, Los Angeles, CA 90028',
    coordinates: { latitude: 34.098, longitude: -118.3287 },
    phone: '(323) 555-0654',
  },
  "Kiki's Nails": {
    address: '7890 Rodeo Dr, Beverly Hills, CA 90210',
    coordinates: { latitude: 34.0673, longitude: -118.4004 },
    phone: '(310) 555-0987',
  },
  'Makeup by Mya': {
    address: '3333 Wilshire Blvd, Los Angeles, CA 90010',
    coordinates: { latitude: 34.0621, longitude: -118.3087 },
    phone: '(213) 555-0432',
  },
  'Vikki Laid': {
    address: '4444 Ventura Blvd, Sherman Oaks, CA 91423',
    coordinates: { latitude: 34.1508, longitude: -118.4517 },
    phone: '(818) 555-0765',
  },
  'Your Lashed': {
    address: '2222 Venice Blvd, Los Angeles, CA 90006',
    coordinates: { latitude: 34.0423, longitude: -118.3087 },
    phone: '(323) 555-0198',
  },
  'RoseMay Aesthetics': {
    address: '5678 Beverly Blvd, Los Angeles, CA 90036',
    coordinates: { latitude: 34.0759, longitude: -118.3414 },
    phone: '(323) 555-0876',
  },
  'Filler by Jess': {
    address: '9876 Santa Monica Blvd, West Hollywood, CA 90069',
    coordinates: { latitude: 34.0902, longitude: -118.3817 },
    phone: '(310) 555-0543',
  },
  'Eyebrow Deluxe': {
    address: '1111 Fairfax Ave, Los Angeles, CA 90046',
    coordinates: { latitude: 34.0898, longitude: -118.3609 },
    phone: '(323) 555-0234',
  },
  'Lashes Galore': {
    address: '3456 Highland Ave, Los Angeles, CA 90028',
    coordinates: { latitude: 34.1018, longitude: -118.3387 },
    phone: '(323) 555-0678',
  },
  'Zee Nail Artist': {
    address: '7890 Sunset Blvd, Los Angeles, CA 90046',
    coordinates: { latitude: 34.0978, longitude: -118.3617 },
    phone: '(323) 555-0912',
  },
  'Painted by Zoe': {
    address: '2468 La Brea Ave, Los Angeles, CA 90046',
    coordinates: { latitude: 34.0887, longitude: -118.3437 },
    phone: '(323) 555-0345',
  },
  'Braided Slick': {
    address: '1357 Crenshaw Blvd, Los Angeles, CA 90019',
    coordinates: { latitude: 34.0489, longitude: -118.3356 },
    phone: '(323) 555-0789',
  },
  'Lash Bae': {
    address: '5432 Melrose Ave, Los Angeles, CA 90038',
    coordinates: { latitude: 34.0834, longitude: -118.3256 },
    phone: '(323) 555-0456',
  },
  'Slicked by Jennifer': {
    address: '8765 West 3rd St, Los Angeles, CA 90048',
    coordinates: { latitude: 34.0712, longitude: -118.3745 },
    phone: '(310) 555-0321',
  },
};

export interface ServiceBookingData {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean;
}

export interface PaymentInfo {
  method: 'card' | 'paypal' | 'apple' | 'google';
  amount: number;
  isDeposit: boolean;
  depositPercentage?: number;
}

// Service charge constants - SINGLE SOURCE OF TRUTH
export const SERVICE_CHARGE_RATE = 0.05; // 5%
export const SERVICE_CHARGE_MINIMUM = 2.00; // £2 minimum
export const DEPOSIT_PERCENTAGE = 20; // 20% deposit

/**
 * Calculate service charge for a given subtotal
 * Uses 5% of subtotal or £2 minimum, whichever is higher
 */
export const calculateServiceCharge = (subtotal: number): number => {
  return Math.max(subtotal * SERVICE_CHARGE_RATE, SERVICE_CHARGE_MINIMUM);
};

/**
 * Calculate per-item service charge when multiple items share the total fee
 * Distributes the cart-level service charge proportionally by item price
 */
export const calculatePerItemServiceCharge = (
  itemSubtotal: number,
  cartSubtotal: number,
  totalServiceCharge: number
): number => {
  if (cartSubtotal === 0) return 0;
  // Proportional distribution based on item's share of cart
  const proportion = itemSubtotal / cartSubtotal;
  return Math.round(totalServiceCharge * proportion * 100) / 100;
};

export class BookingService {
  /**
   * Validate all bookings have required scheduling info
   */
  static validateBookings(
    cartItems: CartItem[],
    bookings: Record<string, ServiceBookingData>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    cartItems.forEach(item => {
      const booking = bookings[item.id];

      if (!booking?.selectedDate) {
        errors.push(`${item.serviceName} needs a date`);
      }

      if (!booking?.selectedTime) {
        errors.push(`${item.serviceName} needs a time`);
      }

      // Validate date format
      if (booking?.selectedDate) {
        const date = new Date(booking.selectedDate);
        if (isNaN(date.getTime())) {
          errors.push(`Invalid date for ${item.serviceName}`);
        }
      }

      // Validate time format (HH:mm)
      if (booking?.selectedTime) {
        const time = booking.selectedTime;
        const is24Hour = /^\d{1,2}:\d{2}$/.test(time);
        const is12Hour = /^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/i.test(time);

        if (!is24Hour && !is12Hour) {
          errors.push(`Invalid time format for ${item.serviceName}`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create appointment data from cart items and bookings
   * Uses real provider locations from PROVIDER_LOCATIONS
   * INCLUDES DEPOSIT CALCULATION
   *
   * PAYMENT LOGIC FOR MULTIPLE BOOKINGS:
   * 1. Each item has its own subtotal (base price + add-ons)
   * 2. Service charge is calculated on the CART TOTAL, then distributed proportionally
   * 3. Each item can independently choose full payment or deposit (20%)
   * 4. All items are paid in ONE checkout transaction
   */
  static createAppointmentData(
    items: CartItem[],
    bookings: Record<string, ServiceBookingData>,
    customerInfo: { name: string; email: string; phone: string }
  ): AppointmentData[] {
    if (__DEV__) console.log('Creating appointment data for', items.length, 'items');

    // Step 1: Calculate cart-level totals for service charge distribution
    const cartSubtotal = items.reduce((total, item) => {
      const basePrice = Number(item.price) || 0;
      const addOnsTotal = (item.addOns || []).reduce((sum: number, addOn: any) => {
        return sum + (Number(addOn.price) || 0);
      }, 0);
      return total + basePrice + addOnsTotal;
    }, 0);

    // Service charge calculated on entire cart (5% or £2 min)
    const totalServiceCharge = calculateServiceCharge(cartSubtotal);

    if (__DEV__) console.log('Cart totals:', {
      cartSubtotal,
      totalServiceCharge,
      itemCount: items.length
    });

    // Step 2: Create appointment data for each item with proportional service charge
    return items.map(item => {
      const booking = bookings[item.id];

      if (!booking) {
        console.error('Missing booking for:', item.serviceName);
        throw new Error(`Missing booking data for ${item.serviceName}`);
      }

      if (__DEV__) console.log('Processing:', item.serviceName);

      // Calculate item subtotal (base price + add-ons)
      const basePrice = Number(item.price) || 0;
      const addOnsTotal = (item.addOns || []).reduce((sum: number, addOn: any) => {
        return sum + (Number(addOn.price) || 0);
      }, 0);
      const itemSubtotal = basePrice + addOnsTotal;

      // Proportional service charge for this item
      const itemServiceCharge = calculatePerItemServiceCharge(
        itemSubtotal,
        cartSubtotal,
        totalServiceCharge
      );

      const totalWithServiceCharge = itemSubtotal + itemServiceCharge;

      // Determine payment type and amounts
      let paymentType: 'full' | 'deposit';
      let amountPaid: number;
      let depositAmount: number;
      let remainingBalance: number;

      if (booking.isDepositOnly) {
        // Deposit payment (20% of total including service charge)
        paymentType = 'deposit';
        depositAmount = this.calculateDeposit(totalWithServiceCharge, DEPOSIT_PERCENTAGE);
        amountPaid = depositAmount;
        remainingBalance = Math.round((totalWithServiceCharge - depositAmount) * 100) / 100;
      } else {
        // Full payment
        paymentType = 'full';
        amountPaid = totalWithServiceCharge;
        depositAmount = 0;
        remainingBalance = 0;
      }

      if (__DEV__) console.log(`Payment calculation for ${item.serviceName}:`, {
        basePrice,
        addOnsTotal,
        itemSubtotal,
        itemServiceCharge,
        totalWithServiceCharge,
        paymentType,
        amountPaid,
        depositAmount,
        remainingBalance
      });

      // Get provider location
      const fullProviderName = getFullProviderName(item.providerName);
      const providerLocation = PROVIDER_LOCATIONS[fullProviderName];

      const address = providerLocation?.address || 'Address will be confirmed by provider';
      const coordinates = providerLocation?.coordinates || { latitude: 34.0522, longitude: -118.2437 };
      const phone = providerLocation?.phone || 'Phone will be confirmed by provider';

      const appointmentData: AppointmentData = {
        cartItemId: item.id,
        date: booking.selectedDate,
        time: booking.selectedTime,
        address,
        coordinates,
        phone,
        notes: booking.notes || '',
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        paymentType,
        amountPaid,
        depositAmount,
        remainingBalance,
        serviceCharge: itemServiceCharge,
      };

      if (__DEV__) console.log('Created appointment data:', {
        service: item.serviceName,
        paymentType: appointmentData.paymentType,
        amountPaid: appointmentData.amountPaid,
        serviceCharge: appointmentData.serviceCharge
      });

      return appointmentData;
    });
  }

  /**
   * Calculate deposit amount (default 20%)
   */
  static calculateDeposit(totalAmount: number, percentage: number = DEPOSIT_PERCENTAGE): number {
    return Math.round((totalAmount * percentage) / 100 * 100) / 100;
  }

  /**
   * Calculate remaining balance after deposit
   */
  static calculateRemainingBalance(totalAmount: number, percentage: number = DEPOSIT_PERCENTAGE): number {
    const deposit = this.calculateDeposit(totalAmount, percentage);
    return Math.round((totalAmount - deposit) * 100) / 100;
  }

  /**
   * Get payment summary
   */
  static getPaymentSummary(
    totalAmount: number,
    isDeposit: boolean,
    depositPercentage: number = 20
  ): {
    amountDue: number;
    remainingBalance: number;
    depositAmount: number;
    paymentType: 'full' | 'deposit';
  } {
    if (isDeposit) {
      const depositAmount = this.calculateDeposit(totalAmount, depositPercentage);
      return {
        amountDue: depositAmount,
        remainingBalance: this.calculateRemainingBalance(totalAmount, depositPercentage),
        depositAmount,
        paymentType: 'deposit',
      };
    }

    return {
      amountDue: totalAmount,
      remainingBalance: 0,
      depositAmount: 0,
      paymentType: 'full',
    };
  }

  /**
   * Format booking summary for confirmation
   */
  static formatBookingSummary(
    cartItems: CartItem[],
    bookings: Record<string, ServiceBookingData>
  ): string {
    const summary = cartItems.map(item => {
      const booking = bookings[item.id];
      
      if (!booking) {
        return `• ${item.serviceName} - Not scheduled`;
      }
      
      const date = new Date(booking.selectedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      return `• ${item.serviceName} - ${date} at ${booking.selectedTime}`;
    });

    return summary.join('\n');
  }
}