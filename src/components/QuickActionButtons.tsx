// src/components/QuickActionButtons.tsx - UPDATED to match your existing component
import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';

interface Service {
  id: string | number;
  name: string;
  price: number;
  duration: string;
  description: string;
  imageId?: string; // For new system
  image?: any; // For backward compatibility
}

interface QuickActionButtonsProps {
  service: Service;
  providerName: string;
  providerImage: any;
  providerService: string;
  onQuickBook: (service: Service) => void;
  onAddOns: (service: Service) => void;
  style?: any;
}

export const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({
  service,
  providerName,
  providerImage,
  providerService,
  onQuickBook,
  onAddOns,
  style
}) => {
  const [bookPressed, setBookPressed] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));

  // SAFETY CHECK: Ensure service exists and has required properties
  if (!service || !service.id || !service.name) {
    if (__DEV__) console.log('Service is missing required properties:', service);
    return null;
  }

  const handleQuickBook = () => {
    // Visual feedback with animation
    setBookPressed(true);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => setBookPressed(false), 1000);
    });

    try {
      onQuickBook(service);
    } catch (error) {
      console.error('Quick book error:', error);
    }
  };

  const handleAddOns = () => {
    try {
      onAddOns(service);
    } catch (error) {
      console.error('Add-ons error:', error);
    }
  };

  return (
    <View style={[styles.quickActionsContainer, style]}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[styles.quickBookButton, bookPressed && styles.quickBookPressed]}
          onPress={handleQuickBook}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Quick book ${service.name}`}
        >
          <BlurView intensity={40} tint="dark" style={styles.quickBookBlur}>
            <Text style={[styles.quickBookText, bookPressed && styles.quickBookTextPressed]}>
              {bookPressed ? 'ADDED!' : 'Quick Book'}
            </Text>
          </BlurView>
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity
        style={styles.addOnsButton}
        onPress={handleAddOns}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View add-ons for ${service.name}`}
      >
        <BlurView intensity={30} tint="light" style={styles.addOnsBlur}>
          <Text style={styles.addOnsText}>Add-ons</Text>
        </BlurView>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  quickActionsContainer: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  quickBookButton: {
    borderRadius: 18,
    overflow: 'hidden',
    minWidth: 80,
  },
  quickBookPressed: {
    backgroundColor: 'rgba(218, 112, 214, 0.3)',
    borderWidth: 2,
    borderColor: '#DA70D6',
  },
  quickBookBlur: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  quickBookText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  quickBookTextPressed: {
    color: '#DA70D6',
  },
  addOnsButton: {
    borderRadius: 15,
    overflow: 'hidden',
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  addOnsBlur: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addOnsText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#000',
    textAlign: 'center',
  },
});

export default QuickActionButtons;