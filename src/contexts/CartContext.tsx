// src/contexts/CartContext.tsx - COMPLETE UPDATED VERSION
import React, { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from 'react';

// CartItem interface
export interface CartItem {
  id: string;
  providerName: string;
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
  addOns?: Array<{
    id: number;
    name: string;
    price: number;
  }>;
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
  providerImage: any;
  providerService: string;
  service: {
    id: string | number;
    name: string;
    price: number;
    duration: string;
    description: string;
    instanceId?: string | number;
    addOns?: Array<{
      id: number;
      name: string;
      price: number;
    }>;
  };
  quantity?: number;
  selectedOptions?: Record<string, any>;
  forceNewInstance?: boolean;
}

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
  CLEAR_CART = 'CLEAR_CART',
  CLEAR_PROVIDER_ITEMS = 'CLEAR_PROVIDER_ITEMS',
  ADD_SERVICE_INSTANCE = 'ADD_SERVICE_INSTANCE'
}

type CartAction = 
  | { type: CartActionType.ADD_ITEM; payload: AddToCartParams }
  | { type: CartActionType.REMOVE_ITEM; payload: { itemId: string } }
  | { type: CartActionType.UPDATE_QUANTITY; payload: { itemId: string; quantity: number } }
  | { type: CartActionType.CLEAR_CART }
  | { type: CartActionType.CLEAR_PROVIDER_ITEMS; payload: { providerName: string } }
  | { type: CartActionType.ADD_SERVICE_INSTANCE; payload: { baseItem: CartItem } };

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
  } catch (error) {
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
  } catch (error) {
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
          providerImage, 
          providerService, 
          service, 
          quantity = 1,
          selectedOptions = {},
          forceNewInstance = false
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
            addOns: safeGet(service, 'addOns', [])
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

      default:
        return state;
    }
  } catch (error) {
    console.error('Cart reducer error:', error);
    // Return state unchanged but surface the error via Alert so users know something went wrong
    const { Alert } = require('react-native');
    Alert.alert('Cart Error', 'Something went wrong updating your cart. Please try again.');
    return state;
  }
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const memoizedTotals = useMemo(() => calculateTotals(state.items), [state.items]);
  
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
    dispatch({ type: CartActionType.ADD_ITEM, payload: item });
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
    return Math.max(memoizedTotals.totalPrice * 0.05, 2);
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