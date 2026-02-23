import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface MinimalTabBarProps extends BottomTabBarProps {}

const MinimalTabBar: React.FC<MinimalTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.container}>
      <BlurView intensity={95} tint="light" style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            if (!descriptor) return null;

            const { options } = descriptor;
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
              <MinimalTabButton
                key={route.key}
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

interface MinimalTabButtonProps {
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: ((props: { focused: boolean; color: string; size: number }) => React.ReactNode) | undefined;
}

const MinimalTabButton: React.FC<MinimalTabButtonProps> = ({
  isFocused,
  onPress,
  onLongPress,
  icon,
}) => {
  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isFocused ? 1 : 0.85, {
            damping: 15,
            stiffness: 200,
          }),
        },
      ],
    };
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isFocused ? 1 : 0, { duration: 200 }),
      transform: [
        {
          scale: withSpring(isFocused ? 1 : 0.5, {
            damping: 15,
            stiffness: 200,
          }),
        },
      ],
    };
  });

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scaleX: withSpring(isFocused ? 1 : 0, {
            damping: 15,
            stiffness: 200,
          }),
        },
      ],
    };
  });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.buttonContent, animatedButtonStyle]}>
        <Animated.View style={[styles.activeBackground, animatedBackgroundStyle]} />

        <View style={styles.iconContainer}>
          {icon &&
            icon({
              focused: isFocused,
              color: isFocused ? '#C850C8' : '#999',
              size: 26,
            })}
        </View>

        <Animated.View style={[styles.activeIndicator, animatedIndicatorStyle]} />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 35 : 25,
    left: '50%',
    transform: [{ translateX: -150 }],
    width: 300,
  },
  tabBarContainer: {
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(200, 80, 200, 0.15)',
    borderBottomColor: 'rgba(200, 80, 200, 0.15)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    position: 'relative',
  },
  activeBackground: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(200, 80, 200, 0.12)',
  },
  iconContainer: {
    zIndex: 1,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#C850C8',
  },
});

export default MinimalTabBar;
