// src/contexts/CartContext.tsx - COMPLETE UPDATED VERSION
import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import { logger } from '../utils/logger';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { getProviderBySlug, getProviderIdByDisplayName } from '../services/databaseService';

/**
 * Resolve a cart item to a real provider UUID: carried providerId → slug lookup
 * → display-name lookup. Returns null only when the provider genuinely can't be
 * found (deleted / renamed / offline). Used to guarantee every cart item is
 * linked to a bookable provider, so checkout never hits "couldn't link provider".
 */
async function resolveCartItemProviderId(p: {
  providerId?: string | undefined;
  providerSlug?: string | undefined;
  providerName: string;
}): Promise<string | null> {
  if (p.providerId) return p.providerId;
  if (p.providerSlug) {
    const bySlug = await getProviderBySlug(p.providerSlug).catch(() => null);
    if (bySlug?.id) return bySlug.id;
  }
  return getProviderIdByDisplayName(p.providerName).catch(() => null);
}
import { calculatePlatformFee } from '../features/cart/platformFee';

// CartItem interface
export interface CartItem {
  id: string;
  providerName: string;
  providerDisplayName?: string;
  providerSlug?: string;
  /** Supabase providers.id (UUID) — the canonical link used when saving bookings */
  providerId?: string;
  /** Promo code to auto-apply in the cart — set when the item was added via
   *  a promotion's "Book Now" button, so the offer isn't silently dropped. */
  initialPromoCode?: string;
  providerImage: any;
  providerService: string;
  serviceName: string;
  serviceDescription: string;
  price: number;
  duration: string;
  quantity: number;
  selectedOptions?: Record<string, any>;
  serviceId: string;
  instanceId?: string;
  addedAt: string;
  serviceInstanceIndex?: number;
  addOns?: {
    id: string | number;
    name: string;
    price: number;
  }[];
  /** Date/time picked on the provider profile before adding to cart. Absent
   *  for items added via other entry points (Explore "Book Now", rebook) —
   *  those still need scheduling in the cart. */
  selectedDate?: string;
  selectedTime?: string;
  /** Freeform notes for the provider (special requests, allergies, etc.) —
   *  set on the provider profile or edited later from the cart. */
  notes?: string;
  /** Pay a deposit rather than the full amount. The actual amount is derived
   *  from the provider's live deposit policy at render/checkout time. */
  isDepositOnly?: boolean;
  /** Set when this item was added as part of one MultiBookingSheet submission
   *  that groups several services from the same provider together — a single
   *  client-generated id shared by every item from that one submission's
   *  "grouped" bucket (services NOT pulled into "Schedule Separately"). Absent
   *  for: items added via any other entry point (Explore, rebook, single-service
   *  BookingSheet), AND for items that WERE in a MultiBookingSheet submission but
   *  were marked "Schedule Separately" there (those are singletons, same as a
   *  standalone add). Scoped to one submission, not "same provider in cart" —
   *  two separate MultiBookingSheet visits for the same provider must not merge.
   *  Purely a client-side/local grouping hint; createBookingsFromCart reads this
   *  to decide which provider-scoped bookings.group_booking_id each item gets. */
  bookingBatchId?: string;
  /** Set when the client ticked "I agree" to the provider's cancellation/
   *  booking policy in BookingSheet/MultiBookingSheet — createBookingsFromCart
   *  writes these straight onto the resulting bookings row (policy_accepted_at/
   *  policy_snapshot). Absent for items added any other way; both sheets gate
   *  their onSubmit on this checkbox already, so a fresh item from either
   *  should always carry it. */
  policyAcceptedAt?: string;
  policySnapshot?: Record<string, unknown>;
}

export interface CartState {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
}

export interface CartContextType {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addToCart: (item: AddToCartParams) => void;
  addServiceInstance: (baseItem: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateCartItem: (itemId: string, updates: CartItemUpdates) => void;
  clearCart: () => void;
  clearProviderItems: (providerName: string) => void;
  getItemsByProvider: () => Record<string, CartItem[]>;
  getServiceInstances: (providerName: string, serviceId: string) => CartItem[];
  getServiceInstanceCount: (providerName: string, serviceId: string) => number;
  getProviderTotal: (providerName: string) => number;
  isItemInCart: (providerName: string, serviceId: string, selectedOptions?: Record<string, any>) => boolean;
  getItemQuantity: (providerName: string, serviceId: string, selectedOptions?: Record<string, any>) => number;
  getTotalServiceInstances: () => number;
  getServiceFee: () => number;
  getFinalTotal: () => number;
  getBookingSummary: () => BookingSummary;
}

export interface AddToCartParams {
  providerName: string;
  providerDisplayName?: string | undefined;
  providerSlug?: string | undefined;
  /** Supabase providers.id (UUID) — pass whenever the caller has it loaded */
  providerId?: string | undefined;
  /** Promo code to auto-apply in the cart (see CartItem.initialPromoCode) */
  initialPromoCode?: string | undefined;
  providerImage: any;
  providerService: string;
  service: {
    id: string | number;
    name: string;
    price: number;
    duration: string;
    description: string;
    instanceId?: string | number;
    addOns?: {
      id: string | number;
      name: string;
      price: number;
    }[];
  };
  quantity?: number;
  selectedOptions?: Record<string, any>;
  forceNewInstance?: boolean;
  /** Date/time picked on the provider profile before adding to cart. */
  selectedDate?: string | undefined;
  selectedTime?: string | undefined;
  notes?: string | undefined;
  isDepositOnly?: boolean | undefined;
  /** See CartItem.bookingBatchId. */
  bookingBatchId?: string | undefined;
  /** See CartItem.policyAcceptedAt / .policySnapshot. */
  policyAcceptedAt?: string | undefined;
  policySnapshot?: Record<string, unknown> | undefined;
}

/** Fields a BookingSheet edit can change on an existing cart item. */
/**
 * Fields the cart can change on an existing item. `bookingBatchId` is
 * included because grouping is mutable from the cart: scheduling several of
 * one provider's services together assigns a shared id, and editing one of
 * them out of that group clears it (passing it explicitly as `undefined`
 * splits the item back into a standalone booking).
 */
export type CartItemUpdates = Partial<
  Pick<CartItem, 'addOns' | 'selectedDate' | 'selectedTime' | 'notes' | 'isDepositOnly' | 'providerId' | 'policyAcceptedAt'>
> & {
  /** Explicitly `| undefined` (not just optional): under
   *  exactOptionalPropertyTypes, clearing the group requires passing the key
   *  with an undefined value, which a plain optional prop would reject. */
  bookingBatchId?: string | undefined;
};

export interface BookingSummary {
  totalProviders: number;
  totalServices: number;
  totalInstances: number;
  providers: Record<string, {
    items: CartItem[];
    serviceGroups: Record<string, {
      serviceName: string;
      instances: CartItem[];
      totalPrice: number;
    }>;
    total: number;
    serviceCount: number;
    instanceCount: number;
  }>;
}

enum CartActionType {
  ADD_ITEM = 'ADD_ITEM',
  REMOVE_ITEM = 'REMOVE_ITEM',
  UPDATE_QUANTITY = 'UPDATE_QUANTITY',
  UPDATE_ITEM = 'UPDATE_ITEM',
  CLEAR_CART = 'CLEAR_CART',
  CLEAR_PROVIDER_ITEMS = 'CLEAR_PROVIDER_ITEMS',
  ADD_SERVICE_INSTANCE = 'ADD_SERVICE_INSTANCE',
  HYDRATE = 'HYDRATE'
}

type CartAction =
  | { type: CartActionType.ADD_ITEM; payload: AddToCartParams }
  | { type: CartActionType.REMOVE_ITEM; payload: { itemId: string } }
  | { type: CartActionType.UPDATE_QUANTITY; payload: { itemId: string; quantity: number } }
  | { type: CartActionType.UPDATE_ITEM; payload: { itemId: string; updates: CartItemUpdates } }
  | { type: CartActionType.CLEAR_CART }
  | { type: CartActionType.CLEAR_PROVIDER_ITEMS; payload: { providerName: string } }
  | { type: CartActionType.ADD_SERVICE_INSTANCE; payload: { baseItem: CartItem } }
  | { type: CartActionType.HYDRATE; payload: { items: CartItem[] } };

const initialState: CartState = {
  items: [],
  totalItems: 0,
  totalPrice: 0
};

const safeGet = (obj: any, path: string, defaultValue: any = null): any => {
  try {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current?.[key] === undefined || current?.[key] === null) {
        return defaultValue;
      }
      current = current[key];
    }
    return current;
  } catch {
    return defaultValue;
  }
};

const generateItemId = (providerName: string, serviceId: string | number, instanceId?: string | number, selectedOptions: Record<string, any> = {}): string => {
  try {
    const optionsStr = Object.entries(selectedOptions)
      .sort()
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const instanceStr = instanceId ? `_inst_${instanceId}` : '';
    return `${providerName}_${serviceId}${instanceStr}_${optionsStr}`;
  } catch {
    return `${providerName}_${serviceId}_${Date.now()}`;
  }
};

const calculateTotals = (items: CartItem[]) => {
  let totalItems = 0;
  let totalPrice = 0;
  
  for (const item of items) {
    const safeQuantity = Number(safeGet(item, 'quantity', 0));
    const basePrice = Number(safeGet(item, 'price', 0));
    const addOnsTotal = (item.addOns || []).reduce((sum, addOn) => {
      return sum + Number(addOn.price || 0);
    }, 0);
    const itemTotalPrice = (basePrice + addOnsTotal) * safeQuantity;
    totalItems += safeQuantity;
    totalPrice += itemTotalPrice;
  }
  
  return { totalItems, totalPrice };
};

const cartReducer = (state: CartState, action: CartAction): CartState => {
  try {
    switch (action.type) {
      case CartActionType.ADD_ITEM: {
        const {
          providerName,
          providerDisplayName,
          providerSlug,
          providerId,
          initialPromoCode,
          providerImage,
          providerService,
          service,
          quantity = 1,
          selectedOptions = {},
          forceNewInstance = false,
          selectedDate,
          selectedTime,
          notes,
          isDepositOnly,
          bookingBatchId,
          policyAcceptedAt,
          policySnapshot
        } = action.payload;

        const instanceId = forceNewInstance || safeGet(service, 'instanceId') ? 
          (safeGet(service, 'instanceId')?.toString() || (Date.now() + Math.random()).toString()) : undefined;
        
        const itemId = generateItemId(providerName, safeGet(service, 'id'), instanceId, selectedOptions);
        const existingItemIndex = state.items.findIndex(item => safeGet(item, 'id') === itemId);

        let newItems: CartItem[];
        if (existingItemIndex >= 0 && !forceNewInstance) {
          newItems = state.items.map((item, index) => 
            index === existingItemIndex 
              ? { ...item, quantity: safeGet(item, 'quantity', 0) + quantity }
              : item
          );
        } else {
          // Count existing instances for numbering
          const existingInstances = state.items.filter(item => 
            safeGet(item, 'providerName') === providerName && 
            safeGet(item, 'serviceId') === safeGet(service, 'id')
          ).length;

          const newItem: CartItem = {
            id: itemId,
            providerName: String(providerName || 'Unknown Provider'),
            ...(providerDisplayName ? { providerDisplayName } : {}),
            ...(providerSlug ? { providerSlug } : {}),
            ...(providerId ? { providerId } : {}),
            ...(initialPromoCode ? { initialPromoCode } : {}),
            providerImage: providerImage || null,
            providerService: String(providerService || 'General'),
            serviceName: String(safeGet(service, 'name', 'Unknown Service')),
            serviceDescription: String(safeGet(service, 'description', '')),
            price: Math.max(0, Number(safeGet(service, 'price', 0))),
            duration: String(safeGet(service, 'duration', '1 hour')),
            quantity: Math.max(1, Number(quantity)),
            selectedOptions: selectedOptions || {},
            serviceId: String(safeGet(service, 'id', '')),
            instanceId: instanceId,
            addedAt: new Date().toISOString(),
            serviceInstanceIndex: existingInstances + 1, // FIXED: Start from 1, increment by existing count
            addOns: safeGet(service, 'addOns', []),
            ...(selectedDate ? { selectedDate } : {}),
            ...(selectedTime ? { selectedTime } : {}),
            ...(notes ? { notes } : {}),
            ...(isDepositOnly ? { isDepositOnly } : {}),
            ...(bookingBatchId ? { bookingBatchId } : {}),
            ...(policyAcceptedAt ? { policyAcceptedAt } : {}),
            ...(policySnapshot ? { policySnapshot } : {})
          };
          newItems = [...state.items, newItem];
        }

        const totals = calculateTotals(newItems);
        return { ...state, items: newItems, ...totals };
      }

      case CartActionType.ADD_SERVICE_INSTANCE: {
        const { baseItem } = action.payload;
        if (!baseItem) return state;
        
        const instanceId = (Date.now() + Math.random()).toString();
        const itemId = generateItemId(
          safeGet(baseItem, 'providerName'), 
          safeGet(baseItem, 'serviceId'), 
          instanceId, 
          safeGet(baseItem, 'selectedOptions', {})
        );

        const existingInstances = state.items.filter(item => 
          safeGet(item, 'providerName') === safeGet(baseItem, 'providerName') && 
          safeGet(item, 'serviceId') === safeGet(baseItem, 'serviceId')
        ).length;

        const newItem: CartItem = {
          ...baseItem,
          id: itemId,
          instanceId: instanceId,
          quantity: 1,
          addedAt: new Date().toISOString(),
          serviceInstanceIndex: existingInstances + 1
        };

        const newItems = [...state.items, newItem];
        const totals = calculateTotals(newItems);
        return { ...state, items: newItems, ...totals };
      }

      case CartActionType.REMOVE_ITEM: {
        const { itemId } = action.payload;
        const newItems = state.items.filter(item => safeGet(item, 'id') !== itemId);
        
        // Renumber instances after removal
        const renumberedItems = newItems.map(item => {
          const sameServiceItems = newItems.filter(otherItem => 
            safeGet(otherItem, 'providerName') === safeGet(item, 'providerName') && 
            safeGet(otherItem, 'serviceId') === safeGet(item, 'serviceId')
          ).sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
          
          const itemIndex = sameServiceItems.findIndex(otherItem => 
            safeGet(otherItem, 'id') === safeGet(item, 'id')
          );
          
          return { ...item, serviceInstanceIndex: itemIndex + 1 };
        });
        
        const totals = calculateTotals(renumberedItems);
        return { ...state, items: renumberedItems, ...totals };
      }

      case CartActionType.UPDATE_QUANTITY: {
        const { itemId, quantity } = action.payload;
        const safeQuantity = Math.max(0, Number(quantity || 0));
        
        if (safeQuantity <= 0) {
          const newItems = state.items.filter(item => safeGet(item, 'id') !== itemId);
          const totals = calculateTotals(newItems);
          return { ...state, items: newItems, ...totals };
        }

        const newItems = state.items.map(item =>
          safeGet(item, 'id') === itemId ? { ...item, quantity: safeQuantity } : item
        );
        const totals = calculateTotals(newItems);
        return { ...state, items: newItems, ...totals };
      }

      case CartActionType.UPDATE_ITEM: {
        const { itemId, updates } = action.payload;
        // Spread, not a merge that skips undefined: callers clear a field by
        // passing it explicitly as undefined (splitting an item out of a
        // group sends bookingBatchId: undefined), and that must overwrite.
        const newItems: CartItem[] = state.items.map(item =>
          safeGet(item, 'id') === itemId ? ({ ...item, ...updates } as CartItem) : item
        );
        const totals = calculateTotals(newItems);
        return { ...state, items: newItems, ...totals };
      }

      case CartActionType.CLEAR_PROVIDER_ITEMS: {
        const { providerName } = action.payload;
        const newItems = state.items.filter(item => 
          safeGet(item, 'providerName') !== providerName
        );
        const totals = calculateTotals(newItems);
        return { ...state, items: newItems, ...totals };
      }

      case CartActionType.CLEAR_CART:
        return initialState;

      case CartActionType.HYDRATE: {
        const totals = calculateTotals(action.payload.items);
        return { ...state, items: action.payload.items, ...totals };
      }

      default:
        return state;
    }
  } catch (error) {
    logger.error('Cart reducer error:', error);
    // Return state unchanged but surface the error via Alert so users know something went wrong
    Alert.alert('Cart Error', 'Something went wrong updating your cart. Please try again.');
    return state;
  }
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const memoizedTotals = useMemo(() => calculateTotals(state.items), [state.items]);

  // Restore any cart left over from before the app was closed/killed. Writes
  // are held off (via hydratedRef) until this finishes, so a fast app launch
  // can't overwrite the stored cart with the empty initialState first.
  const hydratedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getItem<CartItem[]>(STORAGE_KEYS.CART_ITEMS);
        if (stored && stored.length > 0) {
          dispatch({ type: CartActionType.HYDRATE, payload: { items: stored } });
          // State is now populated, so it's safe to allow persistence — and it
          // must be on before the reconcile below, or the repaired/cleaned cart
          // wouldn't be saved and the cleanup (and its notice) would repeat every
          // launch until the user next changed the cart.
          hydratedRef.current = true;

          // Repair or drop any stored item that lost its provider link while the
          // cart sat in storage (provider went offline, was renamed, or the item
          // predates providerId). Items already carrying a providerId are trusted
          // and skipped, so this is a no-op DB call in the common case.
          const needLink = stored.filter(i => !i.providerId);
          if (needLink.length > 0) {
            const removedNames: string[] = [];
            for (const it of needLink) {
              const resolvedId = await resolveCartItemProviderId(it).catch(() => null);
              if (resolvedId) {
                dispatch({ type: CartActionType.UPDATE_ITEM, payload: { itemId: it.id, updates: { providerId: resolvedId } } });
              } else {
                dispatch({ type: CartActionType.REMOVE_ITEM, payload: { itemId: it.id } });
                removedNames.push(it.providerDisplayName ?? it.providerName);
              }
            }
            if (removedNames.length > 0) {
              const names = [...new Set(removedNames)].join(', ');
              Alert.alert(
                'Some items removed',
                `${names} ${removedNames.length > 1 ? 'are' : 'is'} no longer available, so we removed ${removedNames.length > 1 ? 'them' : 'it'} from your cart.`
              );
            }
          }
        }
      } catch (error) {
        logger.error('Failed to restore cart:', error);
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    storage.setItem(STORAGE_KEYS.CART_ITEMS, state.items).catch(error => {
      logger.error('Failed to persist cart:', error);
    });
  }, [state.items]);
  
  const itemsByProvider = useMemo(() => {
    const grouped: Record<string, CartItem[]> = {};
    state.items.forEach(item => {
      const providerName = safeGet(item, 'providerName', 'Unknown Provider');
      if (!grouped[providerName]) {
        grouped[providerName] = [];
      }
      grouped[providerName].push(item);
    });
    
    Object.keys(grouped).forEach(provider => {
      grouped[provider]?.sort((a, b) => {
        const serviceNameA = safeGet(a, 'serviceName', '');
        const serviceNameB = safeGet(b, 'serviceName', '');
        if (serviceNameA !== serviceNameB) {
          return serviceNameA.localeCompare(serviceNameB);
        }
        return (safeGet(a, 'serviceInstanceIndex', 0)) - (safeGet(b, 'serviceInstanceIndex', 0));
      });
    });
    
    return grouped;
  }, [state.items]);

  const addToCart = useCallback((item: AddToCartParams) => {
    // Common path: the caller already has the provider's UUID — add instantly.
    if (item.providerId) {
      dispatch({ type: CartActionType.ADD_ITEM, payload: item });
      return;
    }
    // No providerId yet — resolve to a real provider BEFORE adding, so a cart
    // item can never reach checkout unlinked. If the provider genuinely can't be
    // found, don't add a dead item; tell the user gently instead.
    (async () => {
      const resolvedId = await resolveCartItemProviderId(item).catch(() => null);
      if (resolvedId) {
        dispatch({ type: CartActionType.ADD_ITEM, payload: { ...item, providerId: resolvedId } });
      } else {
        Alert.alert(
          'Provider unavailable',
          `${item.providerDisplayName ?? item.providerName} isn't available to book right now. Please try again from their profile a little later.`
        );
      }
    })();
  }, []);

  const addServiceInstance = useCallback((baseItem: CartItem) => {
    dispatch({ type: CartActionType.ADD_SERVICE_INSTANCE, payload: { baseItem } });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    dispatch({ type: CartActionType.REMOVE_ITEM, payload: { itemId } });
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: CartActionType.UPDATE_QUANTITY, payload: { itemId, quantity } });
  }, []);

  const updateCartItem = useCallback((itemId: string, updates: CartItemUpdates) => {
    dispatch({ type: CartActionType.UPDATE_ITEM, payload: { itemId, updates } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: CartActionType.CLEAR_CART });
  }, []);

  const clearProviderItems = useCallback((providerName: string) => {
    dispatch({ type: CartActionType.CLEAR_PROVIDER_ITEMS, payload: { providerName } });
  }, []);

  const getServiceInstances = useCallback((providerName: string, serviceId: string) => {
    return state.items.filter(item => 
      safeGet(item, 'providerName') === providerName && 
      safeGet(item, 'serviceId') === serviceId
    );
  }, [state.items]);

  const getServiceInstanceCount = useCallback((providerName: string, serviceId: string) => {
    return getServiceInstances(providerName, serviceId).length;
  }, [getServiceInstances]);

  const getProviderTotal = useCallback((providerName: string) => {
    return state.items
      .filter(item => safeGet(item, 'providerName') === providerName)
      .reduce((sum, item) => {
        const basePrice = safeGet(item, 'price', 0);
        const quantity = safeGet(item, 'quantity', 0);
        const addOnsTotal = (item.addOns || []).reduce((addOnSum, addOn) => {
          return addOnSum + Number(addOn.price || 0);
        }, 0);
        return sum + ((basePrice + addOnsTotal) * quantity);
      }, 0);
  }, [state.items]);

  const isItemInCart = useCallback((providerName: string, serviceId: string, selectedOptions: Record<string, any> = {}) => {
    const itemId = generateItemId(providerName, serviceId, undefined, selectedOptions);
    return state.items.some(item => safeGet(item, 'id') === itemId);
  }, [state.items]);

  const getItemQuantity = useCallback((providerName: string, serviceId: string, selectedOptions: Record<string, any> = {}) => {
    return state.items
      .filter(item => 
        safeGet(item, 'providerName') === providerName && 
        safeGet(item, 'serviceId') === serviceId
      )
      .reduce((sum, item) => sum + safeGet(item, 'quantity', 0), 0);
  }, [state.items]);

  const getTotalServiceInstances = useCallback(() => {
    const serviceGroups: Record<string, CartItem[]> = {};
    state.items.forEach(item => {
      const key = `${safeGet(item, 'providerName')}_${safeGet(item, 'serviceId')}`;
      if (!serviceGroups[key]) {
        serviceGroups[key] = [];
      }
      serviceGroups[key].push(item);
    });
    return Object.keys(serviceGroups).length;
  }, [state.items]);

  const getServiceFee = useCallback(() => {
    return calculatePlatformFee(memoizedTotals.totalPrice);
  }, [memoizedTotals.totalPrice]);

  const getFinalTotal = useCallback(() => {
    return memoizedTotals.totalPrice + getServiceFee();
  }, [memoizedTotals.totalPrice, getServiceFee]);

  const getBookingSummary = useCallback((): BookingSummary => {
    const summary: BookingSummary = {
      totalProviders: Object.keys(itemsByProvider).length,
      totalServices: memoizedTotals.totalItems,
      totalInstances: getTotalServiceInstances(),
      providers: {}
    };

    Object.entries(itemsByProvider).forEach(([providerName, items]) => {
      const serviceGroups: Record<string, {
        serviceName: string;
        instances: CartItem[];
        totalPrice: number;
      }> = {};
      
      items.forEach(item => {
        const serviceId = safeGet(item, 'serviceId');
        if (!serviceGroups[serviceId]) {
          serviceGroups[serviceId] = {
            serviceName: safeGet(item, 'serviceName', 'Unknown Service'),
            instances: [],
            totalPrice: 0
          };
        }
        serviceGroups[serviceId].instances.push(item);
        
        const basePrice = safeGet(item, 'price', 0);
        const quantity = safeGet(item, 'quantity', 0);
        const addOnsTotal = (item.addOns || []).reduce((sum, addOn) => {
          return sum + Number(addOn.price || 0);
        }, 0);
        serviceGroups[serviceId].totalPrice += (basePrice + addOnsTotal) * quantity;
      });

      summary.providers[providerName] = {
        items,
        serviceGroups,
        total: getProviderTotal(providerName),
        serviceCount: Object.keys(serviceGroups).length,
        instanceCount: items.length
      };
    });

    return summary;
  }, [itemsByProvider, memoizedTotals.totalItems, getTotalServiceInstances, getProviderTotal]);

  const contextValue = useMemo((): CartContextType => ({
    items: state.items,
    totalItems: memoizedTotals.totalItems,
    totalPrice: memoizedTotals.totalPrice,
    addToCart,
    addServiceInstance,
    removeFromCart,
    updateQuantity,
    updateCartItem,
    clearCart,
    clearProviderItems,
    getItemsByProvider: () => itemsByProvider,
    getServiceInstances,
    getServiceInstanceCount,
    getProviderTotal,
    isItemInCart,
    getItemQuantity,
    getTotalServiceInstances,
    getServiceFee,
    getFinalTotal,
    getBookingSummary
  }), [
    state.items,
    memoizedTotals,
    itemsByProvider,
    addToCart,
    addServiceInstance,
    removeFromCart,
    updateQuantity,
    updateCartItem,
    clearCart,
    clearProviderItems,
    getServiceInstances,
    getServiceInstanceCount,
    getProviderTotal,
    isItemInCart,
    getItemQuantity,
    getTotalServiceInstances,
    getServiceFee,
    getFinalTotal,
    getBookingSummary
  ]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
