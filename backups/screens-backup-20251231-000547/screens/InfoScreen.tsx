// Copy this template for: HomeScreen, ExploreScreen, CartScreen, UserProfileScreen, etc.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFont } from '../contexts/FontContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme } from '../contexts/ThemeContext';
import LiquidGlassCard from '../components/LiquidGlassCard';

// For stack screens, add navigation props:
// import { StackNavigationProp } from '@react-navigation/stack';
// import { RootStackParamList } from '../navigation/RootNavigation';
// type ScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ScreenName'>;
// interface Props { navigation: ScreenNavigationProp; }

export default function ScreenNameHere(/* { navigation }: Props for stack screens */) {
  const { textStyles } = useFont();
  const { theme } = useTheme();

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            
            {/* For stack screens, add back button: */}
            {/* 
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
            >
              <Text style={[textStyles.button, styles.backText]}>← Back</Text>
            </TouchableOpacity>
            */}

            {/* Header */}
            <View style={styles.header}>
              <Text style={[textStyles.h2, styles.title]}>Screen Title</Text>
              <Text style={[textStyles.subtitle, styles.subtitle]}>Screen subtitle</Text>
            </View>

            {/* Content */}
            <LiquidGlassCard style={styles.card}>
              <Text style={[textStyles.body, styles.cardText]}>
                Your screen content goes here
              </Text>
            </LiquidGlassCard>

            {/* Button Example */}
            <TouchableOpacity style={styles.button} activeOpacity={0.7}>
              <LiquidGlassCard>
                <Text style={[textStyles.button, styles.buttonText]}>Button Text</Text>
              </LiquidGlassCard>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  card: {
    marginBottom: 20,
    minHeight: 100,
  },
  cardText: {
    textAlign: 'center',
  },
  button: {
    height: 50,
    marginBottom: 15,
  },
  buttonText: {
    textAlign: 'center',
  },
  // For stack screens:
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 20,
  },
  backText: {
  },
});