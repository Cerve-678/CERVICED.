import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

interface AdaptiveTabBarProps extends BottomTabBarProps {}
const AdaptiveTabBar: React.FC<AdaptiveTabBarProps> = (props) => {
  if (Platform.OS === 'ios') {
    return <IOSGlassTabBar {...props} />;
  }
  return <AndroidMaterialTabBar {...props} />;
};

// ====================================================================
// ==================== iOS GLASS TAB BAR ====================
const IOSGlassTabBar: React.FC<AdaptiveTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme, isDarkMode } = useTheme();
  return (
    <View style={iosStyles.container}>
      <View style={iosStyles.glassPillContainer}>
        <BlurView intensity={100} tint={theme.blurTint} style={[iosStyles.blurLayer, isDarkMode && {
          borderTopColor: 'rgba(255, 255, 255, 0.15)',
          borderLeftColor: 'rgba(255, 255, 255, 0.1)',
          borderRightColor: 'rgba(255, 255, 255, 0.05)',
          borderBottomColor: 'rgba(255, 255, 255, 0.03)',
        }]}>
          <View style={[iosStyles.frostLayer, isDarkMode && { backgroundColor: 'rgba(0, 0, 0, 0.3)' }]}>
            <View style={iosStyles.tabBar}>
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                    style={iosStyles.tabButton}
                    activeOpacity={0.6}
                  >
                    {isFocused && (
                      <BlurView intensity={50} tint={theme.blurTint} style={iosStyles.activeGlassBackground}>
                        <View style={iosStyles.activeGlassOverlay} />
                      </BlurView>
                    )}

                    <View style={iosStyles.iconContainer}>
                      {options.tabBarIcon &&
                        options.tabBarIcon({
                          focused: isFocused,
                          color: isDarkMode ? '#FFFFFF' : (isFocused ? '#007AFF' : '#8E8E93'),
                          size: 28,
                        })}
                    </View>
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

// ====================================================================
// ==================== ANDROID MATERIAL TAB BAR ====================
// ====================================================================
const AndroidMaterialTabBar: React.FC<AdaptiveTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme, isDarkMode } = useTheme();
  return (
    <View style={[androidStyles.container, { backgroundColor: theme.background }]}>
      <View style={[androidStyles.tabBar, { backgroundColor: theme.background }]}>
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
              style={androidStyles.tabButton}
              activeOpacity={0.7}
            >
              {/* Material Design Ripple Effect Container */}
              <View style={androidStyles.rippleContainer}>
                <View style={androidStyles.iconContainer}>
                  {options.tabBarIcon &&
                    options.tabBarIcon({
                      focused: isFocused,
                      color: isDarkMode ? '#FFFFFF' : (isFocused ? '#000000' : '#666'),
                      size: 24,
                    })}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ==================== iOS STYLES ====================
const iosStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 34,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  glassPillContainer: {
    width: '100%',
    maxWidth: 450,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  blurLayer: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  frostLayer: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    borderWidth: 0.5,
    borderColor: 'rgba(0, 122, 255, 0.3)',
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

// ==================== ANDROID MATERIAL STYLES ====================
const androidStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 80,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    position: 'relative',
    width: '100%',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: [{ translateX: -32 }],
    width: 64,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    zIndex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textAlign: 'center',
    zIndex: 1,
  },
});

export default AdaptiveTabBar;
