import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface NativeGlassPillTabBarProps extends BottomTabBarProps {}

const NativeGlassPillTabBar: React.FC<NativeGlassPillTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.container}>
      {/* Outer glass container with shadow */}
      <View style={styles.glassPillContainer}>
        {/* Multi-layer blur for depth */}
        <BlurView intensity={100} tint="light" style={styles.blurLayer}>
          {/* Inner frosted layer */}
          <View style={styles.frostLayer}>
            <View style={styles.tabBar}>
              {state.routes.map((route, index) => {
                const descriptor = descriptors[route.key];
                if (!descriptor) return null;

                const { options } = descriptor;
                const label =
                  options.tabBarLabel !== undefined
                    ? options.tabBarLabel
                    : options.title !== undefined
                    ? options.title
                    : route.name;

                const isFocused = state.index === index;

                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                    if (Platform.OS === 'ios') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }
                };

                const onLongPress = () => {
                  navigation.emit({
                    type: 'tabLongPress',
                    target: route.key,
                  });
                };

                return (
                  <TouchableOpacity
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    accessibilityLabel={`${typeof label === 'string' ? label : route.name} tab`}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    style={styles.tabButton}
                    activeOpacity={0.6}
                  >
                    {/* Glass background for active tab */}
                    {isFocused && (
                      <BlurView intensity={50} tint="light" style={styles.activeGlassBackground}>
                        <View style={styles.activeGlassOverlay} />
                      </BlurView>
                    )}

                    <View style={styles.iconContainer}>
                      {options.tabBarIcon &&
                        options.tabBarIcon({
                          focused: isFocused,
                          color: isFocused ? '#007AFF' : '#8E8E93',
                          size: 28,
                        })}
                    </View>
                    <Text
                      style={[
                        styles.label,
                        { color: isFocused ? '#007AFF' : '#8E8E93' },
                      ]}
                      numberOfLines={1}
                    >
                      {typeof label === 'string' ? label : route.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  glassPillContainer: {
    width: '100%',
    maxWidth: 450,
    borderRadius: 32,
    // iOS shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 8,
        },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  blurLayer: {
    borderRadius: 32,
    overflow: 'hidden',
    // Glass border effect - lighter on top, darker on bottom
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    // Android fallback background (BlurView doesn't work well on Android)
    ...Platform.select({
      android: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
      },
    }),
  },
  frostLayer: {
    // Semi-transparent white overlay for frosted effect
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
    borderRadius: 32,
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  activeGlassBackground: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'ios' ? 0.5 : 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    // Android shadow for active state
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  activeGlassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    zIndex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.08,
    textAlign: 'center',
    zIndex: 1,
  },
});

export default NativeGlassPillTabBar;
