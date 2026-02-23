import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Switch,
  ImageBackground,
  StatusBar,
  Modal,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Icon from '../components/IconLibrary';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

interface SettingsOptionProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
  theme: any;
}

const SettingsOption = React.memo(({ icon, title, subtitle, onPress, disabled, theme }: SettingsOptionProps) => {
  return (
    <TouchableOpacity
      style={[styles.option, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.optionLeft}>
        <View style={styles.iconContainer}>
          <Icon
            name={icon}
            size={24}
            color={disabled ? theme.secondaryText : theme.text}
          />
        </View>
        <Text style={[styles.optionText, { color: disabled ? theme.secondaryText : theme.text }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.optionSubText, { color: disabled ? theme.secondaryText : theme.secondaryText }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
});

export default function UserProfileScreen({ navigation }: any) {
  const { isLoggedIn, logout } = useAuth();
  const { isDarkMode, toggleTheme, theme: currentTheme } = useTheme();
  
  // Modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showBeautyModal, setShowBeautyModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Form states for modals
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogout = () => {
    if (__DEV__) console.log('User logged out');
    logout();
  };
  
  // Profile Info Modal
  const ProfileInfoModal = () => (
    <Modal
      visible={showProfileModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowProfileModal(false)}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={20} tint="dark" style={styles.modalBlur}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.text }]}>PROFILE INFO</Text>
              <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                <Text style={[styles.closeButton, { color: currentTheme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: currentTheme.text }]}>NAME</Text>
                <BlurView intensity={30} tint={currentTheme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: currentTheme.text }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="SARAH JOHNSON"
                    placeholderTextColor={currentTheme.secondaryText}
                  />
                </BlurView>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: currentTheme.text }]}>PHONE NUMBER</Text>
                <BlurView intensity={30} tint={currentTheme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: currentTheme.text }]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+44 7700 900000"
                    placeholderTextColor={currentTheme.secondaryText}
                    keyboardType="phone-pad"
                  />
                </BlurView>
              </View>

              <TouchableOpacity style={styles.saveButton}>
                <BlurView intensity={60} tint={currentTheme.blurTint} style={styles.saveButtonBlur}>
                  <Text style={[styles.saveButtonText, { color: currentTheme.text }]}>SAVE CHANGES</Text>
                </BlurView>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </BlurView>
      </View>
    </Modal>
  );

  // Email & Password Modal
  const EmailPasswordModal = () => (
    <Modal
      visible={showEmailModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowEmailModal(false)}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={20} tint="dark" style={styles.modalBlur}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.text }]}>EMAIL & PASSWORD</Text>
              <TouchableOpacity onPress={() => setShowEmailModal(false)}>
                <Text style={[styles.closeButton, { color: currentTheme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: currentTheme.text }]}>EMAIL</Text>
                <BlurView intensity={30} tint={currentTheme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: currentTheme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="JOHN@EXAMPLE.COM"
                    placeholderTextColor={currentTheme.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </BlurView>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: currentTheme.text }]}>CURRENT PASSWORD</Text>
                <BlurView intensity={30} tint={currentTheme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: currentTheme.text }]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="••••••••••"
                    placeholderTextColor={currentTheme.secondaryText}
                    secureTextEntry
                  />
                </BlurView>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: currentTheme.text }]}>NEW PASSWORD</Text>
                <BlurView intensity={30} tint={currentTheme.blurTint} style={styles.inputBlur}>
                  <TextInput
                    style={[styles.textInput, { color: currentTheme.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="••••••••••"
                    placeholderTextColor={currentTheme.secondaryText}
                    secureTextEntry
                  />
                </BlurView>
              </View>

              <TouchableOpacity style={styles.saveButton}>
                <BlurView intensity={60} tint={currentTheme.blurTint} style={styles.saveButtonBlur}>
                  <Text style={[styles.saveButtonText, { color: currentTheme.text }]}>UPDATE CREDENTIALS</Text>
                </BlurView>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </BlurView>
      </View>
    </Modal>
  );

  // About Modal
  const AboutModal = () => (
    <Modal
      visible={showAboutModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAboutModal(false)}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={20} tint="dark" style={styles.modalBlur}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.text }]}>ABOUT CERVICED</Text>
              <TouchableOpacity onPress={() => setShowAboutModal(false)}>
                <Text style={[styles.closeButton, { color: currentTheme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.aboutText, { color: currentTheme.text }]}>
                Cerviced is your premier beauty services platform connecting users with top-tier beauty professionals.
              </Text>
              <Text style={[styles.aboutText, { color: currentTheme.text }]}>
                Version 1.0.0
              </Text>
              <Text style={[styles.aboutText, { color: currentTheme.text }]}>
                © 2025 Cerviced. All rights reserved.
              </Text>
            </ScrollView>
          </View>
        </BlurView>
      </View>
    </Modal>
  );

  return (
    <ThemedBackground style={styles.background}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={currentTheme.statusBar} translucent={true} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: currentTheme.text }]}>Your Account</Text>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Quick Access Cards */}
          <View style={[styles.liquidGlassCell, { backgroundColor: currentTheme.glassBackground, borderColor: currentTheme.border }]}>
            <View style={styles.cardContainer}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
                onPress={() => {}}
                disabled={!isLoggedIn}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconContainer}>
                  <Icon name="bookmark" size={28} color={isLoggedIn ? currentTheme.accent : currentTheme.secondaryText} />
                </View>
                <Text style={[styles.cardTitle, { color: isLoggedIn ? currentTheme.text : currentTheme.secondaryText }]}>
                  Saved Looks
                </Text>
                <Text style={[styles.cardSubText, { color: isLoggedIn ? currentTheme.secondaryText : currentTheme.secondaryText }]}>
                  View favorites
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
                onPress={() => {}}
                disabled={!isLoggedIn}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconContainer}>
                  <Icon name="calendar-today" size={28} color={isLoggedIn ? currentTheme.accent : currentTheme.secondaryText} />
                </View>
                <Text style={[styles.cardTitle, { color: isLoggedIn ? currentTheme.text : currentTheme.secondaryText }]}>
                  Bookings
                </Text>
                <Text style={[styles.cardSubText, { color: isLoggedIn ? currentTheme.secondaryText : currentTheme.secondaryText }]}>
                  Appointments
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
                onPress={() => {}}
                disabled={!isLoggedIn}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconContainer}>
                  <Icon name="star" size={28} color={isLoggedIn ? currentTheme.accent : currentTheme.secondaryText} />
                </View>
                <Text style={[styles.cardTitle, { color: isLoggedIn ? currentTheme.text : currentTheme.secondaryText }]}>
                  Points
                </Text>
                <Text style={[styles.cardSubText, { color: isLoggedIn ? currentTheme.secondaryText : currentTheme.secondaryText }]}>
                  Your rewards
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Account Management */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: currentTheme.accent }]}>Account Management</Text>
            
            <SettingsOption
              icon="user"
              title="Profile Info"
              subtitle="Name, phone, picture"
              onPress={() => setShowProfileModal(true)}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="heart"
              title="Beauty Preferences"
              subtitle="Favorites, providers"
              onPress={() => setShowBeautyModal(true)}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="bookmark"
              title="Saved Looks"
              subtitle="Looks, products"
              onPress={() => {}}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="email"
              title="Email & Password"
              subtitle="Update credentials"
              onPress={() => setShowEmailModal(true)}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="payment"
              title="Payment Methods"
              subtitle="Cards, Apple Pay"
              onPress={() => setShowPaymentModal(true)}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="receipt"
              title="Subscription & Billing"
              subtitle="Plans, invoices"
              onPress={() => {}}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />
          </View>

          {/* Notifications & Preferences */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: currentTheme.accent }]}>Notifications & Preferences</Text>
            
            <SettingsOption
              icon="notifications"
              title="Push Notifications"
              subtitle="Bookings, reminders"
              onPress={() => setShowNotificationsModal(true)}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />

            <SettingsOption
              icon="message"
              title="Email/SMS Alerts"
              subtitle="Marketing"
              onPress={() => {}}
              disabled={!isLoggedIn}
              theme={currentTheme}
            />
            
            {/* Dark Mode Toggle */}
            <View style={[styles.option, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
              <View style={styles.optionLeft}>
                <View style={styles.iconContainer}>
                  <Icon name="brightness-6" size={24} color={currentTheme.text} />
                </View>
                <Text style={[styles.optionText, { color: currentTheme.text }]}>
                  Dark Mode
                </Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: '#D1D1D6', true: currentTheme.accent }}
                thumbColor={isDarkMode ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Accessibility & Support */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: currentTheme.accent }]}>Accessibility & Support</Text>
            
            <SettingsOption
              icon="format-size"
              title="Text Size & Font"
              subtitle="Accessibility"
              onPress={() => {}}
              disabled={false}
              theme={currentTheme}
            />

            <SettingsOption
              icon="language"
              title="Language & Region"
              subtitle="Multilingual"
              onPress={() => {}}
              disabled={false}
              theme={currentTheme}
            />

            <SettingsOption
              icon="help"
              title="Help Center"
              subtitle="FAQs, chat"
              onPress={() => setShowHelpModal(true)}
              disabled={false}
              theme={currentTheme}
            />
          </View>

          {/* Become a Provider */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: currentTheme.accent }]}>For Professionals</Text>

            <TouchableOpacity
              style={[styles.becomeProviderButton, { backgroundColor: currentTheme.accent }]}
              onPress={() => navigation.navigate('InfoReg')}
              activeOpacity={0.8}
            >
              <Icon name="storefront" size={24} color="#fff" />
              <View style={styles.becomeProviderText}>
                <Text style={styles.becomeProviderTitle}>Become a Provider</Text>
                <Text style={styles.becomeProviderSubtitle}>List your services on Cerviced</Text>
              </View>
              <Icon name="chevron-right" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* App Info & Legal */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: currentTheme.accent }]}>App Info & Legal</Text>

            <SettingsOption
              icon="info"
              title="About Cerviced"
              subtitle="Mission, version"
              onPress={() => setShowAboutModal(true)}
              disabled={false}
              theme={currentTheme}
            />

            <SettingsOption
              icon="gavel"
              title="Terms & Conditions"
              subtitle="Legal info"
              onPress={() => {}}
              disabled={false}
              theme={currentTheme}
            />

            <SettingsOption
              icon="bug-report"
              title="Report a Problem"
              subtitle="Bugs, feedback"
              onPress={() => {}}
              disabled={false}
              theme={currentTheme}
            />
          </View>

          {isLoggedIn && (
            <TouchableOpacity
              style={[styles.logoutButton, { borderColor: currentTheme.accent }]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Icon name="logout" size={24} color={currentTheme.accent} />
              </View>
              <Text style={[styles.logoutText, { color: currentTheme.accent }]}>Log Out</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.footerText, { color: currentTheme.secondaryText }]}>
            {isLoggedIn ? 'Customize your Cerviced experience!' : 'Sign in to access more features!'}
          </Text>
        </ScrollView>

        {/* Modals */}
        <ProfileInfoModal />
        <EmailPasswordModal />
        <AboutModal />
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  signInButton: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  liquidGlassCell: {
    borderRadius: 20,
    padding: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 0.5,
  },
  cardContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: 12,
    padding: 12,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 0.5,
  },
  cardIconContainer: {
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  cardSubText: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  section: {
    marginBottom: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 15,
    marginLeft: 10,
  },
  option: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0.5,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingLeft: 5,
  },
  iconContainer: {
    marginRight: 15,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubText: {
    fontSize: 12,
    maxWidth: '40%',
    textAlign: 'right',
  },
  logoutButton: {
    backgroundColor: 'rgba(218, 112, 214, 0.1)',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 30,
    lineHeight: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBlur: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1,
  },
  closeButton: {
    fontSize: 28,
    fontWeight: '300',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputBlur: {
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textInput: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 25,
    overflow: 'hidden',
  },
  saveButtonBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 15,
  },
  // Beauty Preferences Modal Styles
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  chip: {
    backgroundColor: 'rgba(218, 112, 214, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  providerList: {
    marginBottom: 20,
  },
  providerItem: {
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    marginBottom: 8,
  },
  // Payment Modal Styles
  paymentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  paymentCardExpiry: {
    fontSize: 12,
    marginLeft: 36,
  },
  addButton: {
    marginTop: 10,
    borderRadius: 25,
    overflow: 'hidden',
  },
  // Notifications Modal Styles
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  notificationSubtitle: {
    fontSize: 12,
  },
  // Help Center Modal Styles
  helpItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  helpQuestion: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  contactButton: {
    marginTop: 20,
    borderRadius: 25,
    overflow: 'hidden',
  },
  // Become Provider Button
  becomeProviderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  becomeProviderText: {
    flex: 1,
    marginLeft: 15,
  },
  becomeProviderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  becomeProviderSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
});