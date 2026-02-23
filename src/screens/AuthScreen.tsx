import { useFonts } from 'expo-font';
import { useState, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, AccountType } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

// ── Validation ──────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  businessName?: string;
  businessEmail?: string;
  dob?: string;
}

const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const validatePassword = (v: string): string | null => {
  if (v.length < 8) return 'Must be at least 8 characters';
  if (!/[A-Z]/.test(v)) return 'Must include an uppercase letter';
  if (!/[0-9]/.test(v)) return 'Must include a number';
  return null;
};

const validatePhoneLocal = (v: string): string | null => {
  if (!v.trim()) return 'Phone number is required';
  const digitsOnly = v.replace(/[\s\-()+ ]/g, '');
  if (digitsOnly.length < 10) return 'Phone number must be at least 10 digits';
  if (!/^\+?[\d\s\-()]{10,}$/.test(v.trim())) return 'Enter a valid phone number';
  return null;
};

const validateDob = (d: string, m: string, y: string): string | null => {
  const day = parseInt(d, 10);
  const mon = parseInt(m, 10);
  const yr = parseInt(y, 10);
  if (!day || !mon || !yr) return 'Enter a valid date';
  if (mon < 1 || mon > 12) return 'Month must be 1–12';
  if (day < 1 || day > 31) return 'Day must be 1–31';
  if (yr < 1900 || yr > new Date().getFullYear()) return 'Enter a valid year';
  if (new Date().getFullYear() - yr < 16) return 'You must be at least 16';
  return null;
};

// ── Component ───────────────────────────────────────────────────────

export default function AuthScreen({ navigation }: any) {
  const { login } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [accountType, setAccountType] = useState<AccountType>('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  if (!fontsLoaded) {
    return <View style={styles.loading}><Text>Loading...</Text></View>;
  }

  // ── Glass helpers ─────────────────────────────────────────────────

  const glassStyle = (active?: boolean) => ({
    backgroundColor: active
      ? (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.35)')
      : (isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.15)'),
    borderTopColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)'),
    borderLeftColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)'),
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const inputGlass = (hasError: boolean) => ({
    backgroundColor: isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.12)',
    borderTopColor: hasError ? 'rgba(255,59,48,0.6)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.8)'),
    borderLeftColor: hasError ? 'rgba(255,59,48,0.4)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.6)'),
    borderRightColor: hasError ? 'rgba(255,59,48,0.3)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.2)'),
    borderBottomColor: hasError ? 'rgba(255,59,48,0.3)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.2)'),
  });

  // ── Validation ────────────────────────────────────────────────────

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};

    if (!name.trim()) errs.name = 'Name is required';
    const phoneErr = validatePhoneLocal(phone);
    if (phoneErr) errs.phone = phoneErr;

    if (accountType === 'user') {
      // User: name, email, password, phone, dob
      if (!email.trim()) errs.email = 'Email is required';
      else if (!validateEmail(email)) errs.email = 'Enter a valid email';

      const dobErr = validateDob(dobDay, dobMonth, dobYear);
      if (dobErr) errs.dob = dobErr;
    } else {
      // Provider: name, business name, business email, password
      if (!businessName.trim()) errs.businessName = 'Business name is required';
      if (!businessEmail.trim()) errs.businessEmail = 'Business email is required';
      else if (!validateEmail(businessEmail)) errs.businessEmail = 'Enter a valid email';
    }

    if (!password) errs.password = 'Password is required';
    else { const e = validatePassword(password); if (e) errs.password = e; }

    return errs;
  }, [accountType, name, email, phone, password, businessName, businessEmail, dobDay, dobMonth, dobYear]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const renderError = (field: keyof FormErrors) => {
    if (!touched[field] || !errors[field]) return null;
    return <Text style={[styles.errorText, { color: isDarkMode ? '#FF453A' : '#FF3B30' }]}>{errors[field]}</Text>;
  };

  // ── Handlers ──────────────────────────────────────────────────────

  const handleSubmit = () => {
    const errs = validate();
    setErrors(errs);

    const all: Record<string, boolean> = { name: true, phone: true, password: true };
    if (accountType === 'user') {
      all['email'] = true;
      all['dob'] = true;
    } else {
      all['businessName'] = true;
      all['businessEmail'] = true;
    }
    setTouched(all);

    if (Object.keys(errs).length > 0) return;

    if (accountType === 'user') {
      const dobString = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
      login({ name, email, phone, dob: dobString, accountType: 'user', loginMethod: 'email' });
    } else {
      login({
        name,
        email: businessEmail,
        phone,
        dob: '',
        accountType: 'provider',
        loginMethod: 'email',
        businessName,
        businessEmail,
      });
    }
    navigation.navigate('Home');
  };

  const handleSocialLogin = (provider: string) => {
    login({
      name: `${provider} User`,
      email: `${provider.toLowerCase()}@user.com`,
      phone: '',
      dob: '',
      accountType,
      loginMethod: provider.toLowerCase(),
    });
    navigation.navigate('Home');
  };

  // ── Password strength ─────────────────────────────────────────────

  const pwStrong = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
  const pwMedium = password.length >= 8;
  const strengthWidth = pwStrong ? '100%' : pwMedium ? '66%' : password.length >= 4 ? '33%' : '10%';
  const strengthColor = pwStrong ? '#34C759' : pwMedium ? '#FF9500' : '#FF3B30';
  const strengthLabel = pwStrong ? 'Strong' : pwMedium ? 'Medium' : 'Weak';

  // ── Render ────────────────────────────────────────────────────────

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity
            style={[styles.backBtn, glassStyle()]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={[styles.backIcon, { color: theme.text }]}>{'<'}</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Create Account</Text>
          </View>

          {/* User / Provider Toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, glassStyle(accountType === 'user')]}
              onPress={() => setAccountType('user')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: accountType === 'user' ? theme.text : theme.secondaryText }]}>
                USER
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, glassStyle(accountType === 'provider')]}
              onPress={() => setAccountType('provider')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: accountType === 'provider' ? theme.text : theme.secondaryText }]}>
                PROVIDER
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, glassStyle()]}>

            {/* Name (both) */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>NAME</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['name'] && !!errors.name)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => markTouched('name')}
                  placeholder="Sarah Johnson"
                  placeholderTextColor={theme.secondaryText}
                />
              </View>
              {renderError('name')}
            </View>

            {/* Phone (both) */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>PHONE NUMBER</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['phone'] && !!errors.phone)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={() => markTouched('phone')}
                  placeholder="+44 7700 900000"
                  placeholderTextColor={theme.secondaryText}
                  keyboardType="phone-pad"
                />
              </View>
              {renderError('phone')}
            </View>

            {/* ── User fields ── */}
            {accountType === 'user' && (
              <>
                {/* Email */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>EMAIL</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['email'] && !!errors.email)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={email}
                      onChangeText={setEmail}
                      onBlur={() => markTouched('email')}
                      placeholder="sarah@example.com"
                      placeholderTextColor={theme.secondaryText}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {renderError('email')}
                </View>

                {/* Password */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>PASSWORD</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['password'] && !!errors.password)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={password}
                      onChangeText={setPassword}
                      onBlur={() => markTouched('password')}
                      placeholder="••••••••"
                      placeholderTextColor={theme.secondaryText}
                      secureTextEntry
                    />
                  </View>
                  {renderError('password')}
                  {password.length > 0 && (
                    <View style={styles.strengthRow}>
                      <View style={[styles.strengthTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)' }]}>
                        <View style={[styles.strengthFill, { width: strengthWidth as any, backgroundColor: strengthColor }]} />
                      </View>
                      <Text style={[styles.strengthText, { color: theme.secondaryText }]}>{strengthLabel}</Text>
                    </View>
                  )}
                </View>

                {/* DOB */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>DATE OF BIRTH</Text>
                  <View style={styles.dobRow}>
                    {[
                      { value: dobDay, set: setDobDay, ph: 'DD', max: 2, flex: 1 },
                      { value: dobMonth, set: setDobMonth, ph: 'MM', max: 2, flex: 1 },
                      { value: dobYear, set: setDobYear, ph: 'YYYY', max: 4, flex: 1.5 },
                    ].map((f, i) => (
                      <View key={f.ph} style={{ flex: f.flex, flexDirection: 'row', alignItems: 'center' }}>
                        {i > 0 && (
                          <Text style={[styles.dobSlash, { color: theme.secondaryText }]}>/</Text>
                        )}
                        <View style={[styles.inputWrap, styles.dobField, inputGlass(!!touched['dob'] && !!errors.dob)]}>
                          <TextInput
                            style={[styles.input, { color: theme.text, textAlign: 'center' }]}
                            value={f.value}
                            onChangeText={t => { if (t.length <= f.max) f.set(t.replace(/[^0-9]/g, '')); }}
                            onBlur={() => markTouched('dob')}
                            placeholder={f.ph}
                            placeholderTextColor={theme.secondaryText}
                            keyboardType="number-pad"
                            maxLength={f.max}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                  {renderError('dob')}
                </View>
              </>
            )}

            {/* ── Provider fields ── */}
            {accountType === 'provider' && (
              <>
                {/* Business Name */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>BUSINESS NAME</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['businessName'] && !!errors.businessName)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={businessName}
                      onChangeText={setBusinessName}
                      onBlur={() => markTouched('businessName')}
                      placeholder="Glow Studio"
                      placeholderTextColor={theme.secondaryText}
                    />
                  </View>
                  {renderError('businessName')}
                </View>

                {/* Business Email */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>BUSINESS EMAIL</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['businessEmail'] && !!errors.businessEmail)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={businessEmail}
                      onChangeText={setBusinessEmail}
                      onBlur={() => markTouched('businessEmail')}
                      placeholder="hello@glowstudio.com"
                      placeholderTextColor={theme.secondaryText}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {renderError('businessEmail')}
                </View>

                {/* Password */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>PASSWORD</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['password'] && !!errors.password)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={password}
                      onChangeText={setPassword}
                      onBlur={() => markTouched('password')}
                      placeholder="••••••••"
                      placeholderTextColor={theme.secondaryText}
                      secureTextEntry
                    />
                  </View>
                  {renderError('password')}
                  {password.length > 0 && (
                    <View style={styles.strengthRow}>
                      <View style={[styles.strengthTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)' }]}>
                        <View style={[styles.strengthFill, { width: strengthWidth as any, backgroundColor: strengthColor }]} />
                      </View>
                      <Text style={[styles.strengthText, { color: theme.secondaryText }]}>{strengthLabel}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { color: isDarkMode ? '#fff' : theme.text }]}>
                {accountType === 'user' ? 'SIGN UP' : 'REGISTER BUSINESS'}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
              <Text style={[styles.dividerLabel, { color: theme.secondaryText }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
            </View>

            {/* Social */}
            <View style={styles.socialRow}>
              {['Instagram', 'Google', 'Apple'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.socialBtn, glassStyle()]}
                  onPress={() => handleSocialLogin(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.socialLabel, { color: theme.text }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Terms */}
            <Text style={[styles.termsText, { color: theme.secondaryText }]}>
              By signing up, you agree to our{' '}
              <Text style={[styles.termsLink, { color: theme.accent }]}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={[styles.termsLink, { color: theme.accent }]}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: {
    paddingHorizontal: 16,
  },

  // Back
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

  // Header
  header: {
    marginBottom: 28,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Tab Toggle
  tabRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 1,
  },

  // Form Card
  formCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    overflow: 'hidden',
  },

  // Fields
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 10 : 13,
    overflow: 'hidden',
  },
  input: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    letterSpacing: 0.5,
    padding: 0,
  },
  errorText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 6,
    marginLeft: 4,
  },

  // Password strength
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  strengthTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
  },

  // DOB
  dobRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dobField: {
    flex: 1,
    paddingHorizontal: 8,
  },
  dobSlash: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    marginHorizontal: 6,
  },

  // Submit
  submitBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  submitText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginHorizontal: 16,
  },

  // Social
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
    overflow: 'hidden',
  },
  socialLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },

  // Terms
  termsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 20,
  },
  termsLink: {
    fontWeight: '700',
  },
});
