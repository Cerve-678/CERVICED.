import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

interface CustomTabBarProps extends BottomTabBarProps {}

const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <BlurView intensity={80} tint="light" style={styles.tabBarContainer}>
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
            <TabBarButton
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
  );
};

interface TabBarButtonProps {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: ((props: { focused: boolean; color: string; size: number }) => React.ReactNode) | undefined;
}

const TabBarButton: React.FC<TabBarButtonProps> = ({
  label,
  isFocused,
  onPress,
  onLongPress,
  icon,
}) => {
  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isFocused ? 1 : 0.95, {
            damping: 15,
            stiffness: 150,
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
          scale: withSpring(isFocused ? 1 : 0.8, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isFocused ? 1 : 0.6, { duration: 200 }),
      transform: [
        {
          translateY: withSpring(isFocused ? 0 : 2, {
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
      <Animated.View style={[styles.tabButtonContent, animatedButtonStyle]}>
        <Animated.View style={[styles.tabButtonBackground, animatedBackgroundStyle]} />

        <View style={styles.iconContainer}>
          {icon &&
            icon({
              focused: isFocused,
              color: isFocused ? '#C850C8' : '#666',
              size: 24,
            })}
        </View>

        <Animated.Text
          style={[
            styles.tabLabel,
            { color: isFocused ? '#C850C8' : '#666' },
            animatedTextStyle,
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(200, 80, 200, 0.1)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 20,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabButtonBackground: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200, 80, 200, 0.1)',
  },
  iconContainer: {
    marginBottom: 4,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: 'BakbakOne',
    letterSpacing: 0.5,
    fontWeight: '600',
    zIndex: 1,
  },
});

export default CustomTabBar;
