import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

interface FloatingTabBarProps extends BottomTabBarProps {}

const FloatingTabBar: React.FC<FloatingTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.container}>
      <BlurView intensity={90} tint="light" style={styles.tabBarContainer}>
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
              if (Platform.OS === 'ios') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            };

            return (
              <FloatingTabButton
                key={route.key}
                label={typeof label === 'string' ? label : route.name}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                icon={options.tabBarIcon}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
};

interface FloatingTabButtonProps {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: ((props: { focused: boolean; color: string; size: number }) => React.ReactNode) | undefined;
}

const FloatingTabButton: React.FC<FloatingTabButtonProps> = ({
  label,
  isFocused,
  onPress,
  onLongPress,
  icon,
}) => {
  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withSpring(isFocused ? -8 : 0, {
            damping: 15,
            stiffness: 150,
          }),
        },
        {
          scale: withSpring(isFocused ? 1.1 : 1, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(isFocused ? 1 : 0, [0, 1], [0, 1], Extrapolate.CLAMP),
      transform: [
        {
          scale: withSpring(isFocused ? 1 : 0.5, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(isFocused ? 1 : 0, [0, 1], [0, 1], Extrapolate.CLAMP),
      transform: [
        {
          translateY: withSpring(isFocused ? 0 : 10, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={`${label} tab`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.tabButtonContainer, animatedContainerStyle]}>
        <Animated.View style={[styles.activeBackground, animatedBackgroundStyle]} />

        <View style={styles.iconWrapper}>
          {icon &&
            icon({
              focused: isFocused,
              color: isFocused ? '#FFF' : '#666',
              size: 24,
            })}
        </View>

        <Animated.View style={animatedLabelStyle}>
          <Text style={styles.tabLabel} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
    left: 20,
    right: 20,
  },
  tabBarContainer: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200, 80, 200, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    position: 'relative',
  },
  activeBackground: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C850C8',
    shadowColor: '#C850C8',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  iconWrapper: {
    marginBottom: 4,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'BakbakOne',
    color: '#FFF',
    letterSpacing: 0.5,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default FloatingTabBar;
