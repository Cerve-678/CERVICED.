// src/screens/auth/SignUpStep4Screen.tsx
import React, { useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { useAuth } from '../../contexts/AuthContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { storage, STORAGE_KEYS } from '../../utils/storage';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep4'>;

const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];

export default function SignUpStep4Screen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { data, updateData, resetData, totalSteps } = useRegistration();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [selectedInterests, setSelectedInterests] = useState<string[]>(data.serviceInterests);

  const isUser = data.accountType === 'user';

  const glassStyle = (active?: boolean) => ({
    backgroundColor: active
      ? (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.35)')
      : (isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.15)'),
    borderTopColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)'),
    borderLeftColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)'),
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const toggleInterest = (category: string) => {
    setSelectedInterests(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleComplete = async () => {
    updateData({ serviceInterests: selectedInterests });

    const userData = isUser
      ? {
          name: data.name,
          email: data.email,
          phone: data.phone,
          dob: `${data.dobYear}-${data.dobMonth.padStart(2, '0')}-${data.dobDay.padStart(2, '0')}`,
          accountType: 'user' as const,
          loginMethod: 'email',
        }
      : {
          name: data.name,
          email: data.businessEmail,
          phone: data.phone,
          dob: '',
          accountType: 'provider' as const,
          loginMethod: 'email',
          businessName: data.businessName,
          businessEmail: data.businessEmail,
        };

    await storage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, true);
    login(userData);
    resetData();
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, glassStyle()]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.backIcon, { color: theme.text }]}>{'<'}</Text>
        </TouchableOpacity>

        {/* Progress */}
        <StepProgressIndicator currentStep={4} totalSteps={totalSteps} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {isUser ? 'What interests you?' : 'Almost there!'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]}>
            {isUser
              ? 'Select the services you\'re most interested in (optional)'
              : 'You can set up your full profile later in the app'}
          </Text>
        </View>

        {isUser ? (
          /* User: Service Interest Chips */
          <View style={styles.chipsContainer}>
            {SERVICE_CATEGORIES.map(category => {
              const isSelected = selectedInterests.includes(category);
              return (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.chip,
                    glassStyle(isSelected),
                    isSelected && { backgroundColor: isDarkMode ? 'rgba(218,112,214,0.4)' : 'rgba(218,112,214,0.25)' },
                  ]}
                  onPress={() => toggleInterest(category)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? (isDarkMode ? '#fff' : theme.text) : theme.secondaryText },
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* Provider: Summary Card */
          <View style={[styles.summaryCard, glassStyle()]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>Name</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{data.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>Business</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{data.businessName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>Email</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{data.businessEmail}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={handleComplete}
            activeOpacity={0.8}
          >
            <Text style={[styles.completeBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
              GET STARTED
            </Text>
          </TouchableOpacity>

          {isUser && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleComplete}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipText, { color: theme.secondaryText }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  backIcon: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },
  header: { marginBottom: 28 },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  chip: {
    borderRadius: 100,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  chipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 1,
  },
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    overflow: 'hidden',
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  summaryLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 1,
  },
  summaryValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    fontWeight: '600',
  },
  actionsSection: {
    alignItems: 'center',
  },
  completeBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
    width: '100%',
  },
  completeBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
  skipBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    fontWeight: '600',
  },
});
