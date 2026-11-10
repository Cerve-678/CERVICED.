import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SafeHeaderProps {
  title?: string;
  subtitle?: string;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
  style?: any;
}

const SafeHeader: React.FC<SafeHeaderProps> = ({
  title,
  subtitle,
  leftComponent,
  rightComponent,
  style,
}) => {
  const insets = useSafeAreaInsets();

  // Platform-specific top padding
  const topPadding = Platform.select({
    ios: insets.top > 0 ? insets.top : 20, // Safe area or fallback
    android: (StatusBar.currentHeight || 0) + 16, // Status bar height + padding
    default: 20,
  });

  return (
    <View style={[styles.container, { paddingTop: topPadding }, style]}>
      <View style={styles.content}>
        {/* Left Component */}
        {leftComponent && <View style={styles.leftComponent}>{leftComponent}</View>}

        {/* Title & Subtitle */}
        <View style={styles.titleContainer}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {/* Right Component */}
        {rightComponent && <View style={styles.rightComponent}>{rightComponent}</View>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flex: 1,
    alignItems: Platform.OS === 'android' ? 'flex-start' : 'center',
  },
  title: {
    fontFamily: 'BakbakOne',
    fontSize: Platform.OS === 'android' ? 20 : 28,
    color: '#000',
    letterSpacing: Platform.OS === 'android' ? 0.15 : 1,
    fontWeight: Platform.OS === 'android' ? '500' : '800',
    textAlign: Platform.OS === 'android' ? 'left' : 'center',
  },
  subtitle: {
    fontFamily: 'Jura',
    fontSize: Platform.OS === 'android' ? 13 : 14,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: Platform.OS === 'android' ? 'left' : 'center',
    marginTop: 2,
  },
  leftComponent: {
    marginRight: 12,
  },
  rightComponent: {
    marginLeft: 12,
  },
});

export default SafeHeader;
