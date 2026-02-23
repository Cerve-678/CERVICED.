import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface FloatingTabBarProps extends BottomTabBarProps {}

const FloatingTabBarFixed: React.FC<FloatingTabBarProps> = ({ state, descriptors, navigation }) => {
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
  const translateYAnim = React.useRef(new Animated.Value(isFocused ? -8 : 0)).current;
  const scaleAnim = React.useRef(new Animated.Value(isFocused ? 1.1 : 1)).current;
  const backgroundOpacityAnim = React.useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelOpacityAnim = React.useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(translateYAnim, {
        toValue: isFocused ? -8 : 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150,
      }),
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1.1 : 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150,
      }),
      Animated.timing(backgroundOpacityAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(labelOpacityAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

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
      <Animated.View
        style={[
          styles.tabButtonContainer,
          {
            transform: [{ translateY: translateYAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.activeBackground,
            {
              opacity: backgroundOpacityAnim,
            },
          ]}
        />

        <View style={styles.iconWrapper}>
          {icon &&
            icon({
              focused: isFocused,
              color: isFocused ? '#FFF' : '#666',
              size: 24,
            })}
        </View>

        <Animated.View style={{ opacity: labelOpacityAnim }}>
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

export default FloatingTabBarFixed;
