import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface NativeIOSTabBarProps extends BottomTabBarProps {}

const NativeIOSTabBar: React.FC<NativeIOSTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <BlurView intensity={100} tint="light" style={styles.tabBarContainer}>
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
    </BlurView>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0, 0, 0, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: -0.08,
    textAlign: 'center',
  },
});

export default NativeIOSTabBar;
