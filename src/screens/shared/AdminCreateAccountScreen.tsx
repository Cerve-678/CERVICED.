import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  type StyleProp,
  type ViewStyle,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useAppDialog } from '../../components/AppDialog';
import { DobField } from '../../components/signup/FormKit';
import { useSignInAsAccount } from '../../features/admin/useSignInAsAccount';
import {
  adminAddAccountDetails,
  adminCreateAccount,
  AdminCreateAccountRefused,
  adminStartBlankProvider,
  type AdminCreateAccountInput,
} from '../../services/databaseService';
import { toUserMessage } from '../../utils/userFacingError';
import { validateDob } from '../../utils/validation';
import { logger } from '../../utils/logger';

// ── Create an account (admin) ──────────────────────────────────────────────
// Opens a provider or client account on someone's behalf, e.g. while
// onboarding a provider in person, so it's ready before they leave. The email
// is already confirmed and nothing is emailed: the admin hands over the login.
// The server (admin-create-account) refuses anyone who isn't an admin.
// "Set up their profile now" signs the admin out and into the new account,
// which they can do only because they hold its password at this moment.
//
// Two more ways in:
// - "Start a provider now" opens a blank provider account (no details at all)
//   and signs straight into it, for setting a profile up before anything else.
// - With route param addDetailsForUserId (from Accounts you created), the form
//   gives that blank account its owner's details instead of creating one.
// Internal tool, so its copy is English only.

type AccountType = AdminCreateAccountInput['accountType'];

interface CreatedAccount {
  accountType: AccountType;
  name: string;
  email: string;
  password: string;
}

export default function AdminCreateAccountScreen({ navigation, route }: any) {
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const signInAs = useSignInAsAccount();
  const addDetailsForUserId: string | undefined =
    typeof route?.params?.addDetailsForUserId === 'string' ? route.params.addDetailsForUserId : undefined;
  const addingDetails = addDetailsForUserId !== undefined;

  const [accountType, setAccountType] = useState<AccountType>('provider');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingBlank, setStartingBlank] = useState(false);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  const isProvider = addingDetails || accountType === 'provider';
  const rowStyle = [
    styles.inputRow,
    {
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    },
  ];
  const inputStyle = [styles.input, { color: P.text }];
  const card = [styles.card, { backgroundColor: P.card, borderColor: P.border }];

  const resetForm = () => {
    setName('');
    setBusinessName('');
    setEmail('');
    setPhone('');
    setDob({ day: '', month: '', year: '' });
    setPassword('');
    setShowPassword(false);
    setCreated(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) return showAlert('Missing name', 'Add their name.', 'center');
    if (isProvider && !addingDetails && !businessName.trim()) return showAlert('Missing business name', 'Add the business name.', 'center');
    if (!email.trim()) return showAlert('Missing email', 'Add the email address they will sign in with.', 'center');
    const dobError = validateDob(dob.day, dob.month, dob.year);
    if (dobError) return showAlert('Date of birth', dobError === 'You must be at least 16' ? 'They must be at least 16.' : dobError, 'center');
    if (password.length > 0 && password.length < 8) {
      return showAlert('Password too short', 'Use at least 8 characters, or leave it blank to have one made up.', 'center');
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const common = {
        name: name.trim(),
        email: email.trim(),
        dob: `${dob.year}-${dob.month.padStart(2, '0')}-${dob.day.padStart(2, '0')}`,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(password ? { password } : {}),
      };
      const result = addDetailsForUserId !== undefined
        ? await adminAddAccountDetails({ userId: addDetailsForUserId, ...common })
        : await adminCreateAccount({
          accountType,
          ...common,
          ...(isProvider ? { businessName: businessName.trim() } : {}),
        });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreated({
        accountType: result.accountType,
        name: name.trim(),
        email: result.email,
        password: result.generatedPassword ?? password,
      });
    } catch (err) {
      if (err instanceof AdminCreateAccountRefused) {
        logger.warn('[AdminCreateAccount] refused:', err.message);
        showAlert(addingDetails ? "Couldn't add their details" : "Couldn't create the account", err.message, 'center');
      } else {
        showAlert(
          addingDetails ? "Couldn't add their details" : "Couldn't create the account",
          toUserMessage(err, 'Something went wrong. Please try again.', 'AdminCreateAccountScreen.adminCreateAccount'),
          'center',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const shareLogin = (account: CreatedAccount) => {
    Haptics.selectionAsync().catch(() => {});
    Share.share({
      message:
        `Hi ${account.name}, your CERVICED account is ready.\n\n` +
        `Email: ${account.email}\nPassword: ${account.password}\n\n` +
        'Sign in on the CERVICED app, then change your password in Settings.',
    }).catch(err => logger.error('[AdminCreateAccount] share failed:', err));
  };

  const signInAsThem = (account: CreatedAccount) => {
    Haptics.selectionAsync().catch(() => {});
    showConfirm(
      'Sign in as them?',
      `This signs you out of your own account and into ${account.name}'s, so you can set things up for them. ` +
        "Send them their login first: you won't see the password again. Sign back into your own account when you're done.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign in as them',
          onPress: () => { void signInAs(account.email, account.password); },
        },
      ],
      'center',
    );
  };

  const startBlankProvider = () => {
    Haptics.selectionAsync().catch(() => {});
    showConfirm(
      'Start a provider now?',
      'This makes a provider account with no details yet and signs you into it, so you can set their profile up straight away. ' +
        "Add their name, email and password later from Admin → Accounts you created. You'll need to sign back into your own account when you're done.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: () => {
            void (async () => {
              setStartingBlank(true);
              try {
                const login = await adminStartBlankProvider();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                // Takes this screen away; nothing after it may touch state.
                await signInAs(login.email, login.password);
              } catch (err) {
                setStartingBlank(false);
                showAlert(
                  "Couldn't start the account",
                  err instanceof AdminCreateAccountRefused
                    ? err.message
                    : toUserMessage(err, 'Something went wrong. Please try again.', 'AdminCreateAccountScreen.adminStartBlankProvider'),
                  'center',
                );
              }
            })();
          },
        },
      ],
      'center',
    );
  };

  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.goBack();
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <KeyboardDismissView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backBtn} onPress={back} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.text }]}>{addingDetails ? 'ADD THEIR DETAILS' : 'CREATE AN ACCOUNT'}</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>
            {addingDetails
              ? "Gives the profile you set up its owner's sign-in. After this the account is theirs. No emails are sent."
              : 'Ready to sign in to straight away. No verification code, and no emails are sent. You hand them their login.'}
          </Text>

          {created ? (
            <>
              <View style={card}>
                <Text style={[styles.label, { color: P.sub }]}>
                  {created.accountType === 'provider' ? 'PROVIDER ACCOUNT READY' : 'CLIENT ACCOUNT READY'}
                </Text>
                <Text style={[styles.name, { color: P.text }]}>{created.name}</Text>
                <View style={[styles.sep, { backgroundColor: P.sep }]} />
                <Text style={[styles.small, { color: P.sub }]}>Email</Text>
                <Text selectable style={[styles.value, { color: P.text }]}>{created.email}</Text>
                <Text style={[styles.small, { color: P.sub, marginTop: 6 }]}>Password</Text>
                <Text selectable style={[styles.value, { color: P.text }]}>{created.password}</Text>
                <View style={[styles.sep, { backgroundColor: P.sep }]} />
                <Text style={[styles.small, { color: P.sub }]}>
                  {created.accountType === 'provider'
                    ? 'They sign in with these, then set up their profile the usual way, or you can set it up for them now. Nothing shows to clients until they go live.'
                    : 'They sign in with these and can book straight away.'}
                  {' '}Ask them to change the password in Settings.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: P.accent }]}
                onPress={() => shareLogin(created)}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryText, { color: P.onAccent }]}>SEND THEM THEIR LOGIN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: P.border }]}
                onPress={() => signInAsThem(created)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: P.accentText }]}>
                  {created.accountType === 'provider' ? 'SET UP THEIR PROFILE NOW' : 'SIGN IN AS THEM'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: P.border }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (addingDetails) navigation.goBack(); else resetForm();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: P.accentText }]}>{addingDetails ? 'DONE' : 'CREATE ANOTHER'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!addingDetails && (
                <View style={card}>
                  <Text style={[styles.label, { color: P.sub }]}>NO DETAILS YET?</Text>
                  <Text style={[styles.small, { color: P.text }]}>
                    Open a provider's side straight away and set their profile up. Add their name, email and password later.
                  </Text>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: P.border, opacity: startingBlank ? 0.7 : 1 }]}
                    onPress={startBlankProvider}
                    disabled={startingBlank}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    {startingBlank
                      ? <ActivityIndicator color={P.accent} />
                      : <Text style={[styles.secondaryText, { color: P.accentText }]}>START A PROVIDER NOW</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {!addingDetails && <Text style={[styles.label, { color: P.sub }]}>ACCOUNT TYPE</Text>}
              {!addingDetails && <View style={styles.segment}>
                {(['provider', 'client'] as const).map(type => {
                  const on = accountType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setAccountType(type); }}
                      activeOpacity={0.7}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[styles.segmentBtn, { backgroundColor: on ? P.accent : P.card, borderColor: P.border }]}
                    >
                      <Text style={[styles.segmentText, { color: on ? P.onAccent : P.accentText }]}>
                        {type === 'provider' ? 'PROVIDER' : 'CLIENT'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>}

              <Field label="THEIR NAME" labelColor={P.sub} rowStyle={rowStyle}>
                <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="First and last name"
                  placeholderTextColor={P.sub} autoCapitalize="words" textContentType="none" autoComplete="off" />
              </Field>

              {isProvider && !addingDetails && (
                <Field label="BUSINESS NAME" labelColor={P.sub} rowStyle={rowStyle}>
                  <TextInput style={inputStyle} value={businessName} onChangeText={setBusinessName} placeholder="As clients will see it"
                    placeholderTextColor={P.sub} autoCapitalize="words" textContentType="none" autoComplete="off" />
                </Field>
              )}

              <Field label="EMAIL (THEY SIGN IN WITH THIS)" labelColor={P.sub} rowStyle={rowStyle}>
                <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="name@example.com"
                  placeholderTextColor={P.sub} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                  textContentType="none" autoComplete="off" />
              </Field>

              <Field label="PHONE (OPTIONAL)" labelColor={P.sub} rowStyle={rowStyle}>
                <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="07…"
                  placeholderTextColor={P.sub} keyboardType="phone-pad" textContentType="none" autoComplete="off" />
              </Field>

              <Field label="DATE OF BIRTH" labelColor={P.sub} rowStyle={styles.dobRow}>
                <DobField value={dob} onChange={setDob} onDone={() => {}} />
              </Field>

              <Field label="PASSWORD (OPTIONAL)" labelColor={P.sub} rowStyle={rowStyle}
                hint="Leave blank and one is made up for you. You'll see it on the next screen.">
                <TextInput style={inputStyle} value={password} onChangeText={setPassword} placeholder="Min. 8 characters"
                  placeholderTextColor={P.sub} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                  textContentType="newPassword" autoComplete="off" />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={[styles.eyeText, { color: P.sub }]}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </Field>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: P.accent, opacity: saving ? 0.7 : 1 }]}
                onPress={() => void handleCreate()}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                {saving
                  ? <ActivityIndicator color={P.onAccent} />
                  : <Text style={[styles.primaryText, { color: P.onAccent }]}>{addingDetails ? 'SAVE THEIR DETAILS' : 'CREATE ACCOUNT'}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardDismissView>
      <DialogHost />
    </ThemedBackground>
  );
}

// Outside the screen on purpose: a component defined inside it would be a new
// type every render, remounting its TextInput and dropping the keyboard.
function Field({ label, hint, labelColor, rowStyle, children }: {
  label: string; hint?: string; labelColor: string; rowStyle: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <View style={rowStyle}>{children}</View>
      {hint ? <Text style={[styles.small, { color: labelColor, marginTop: 6 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 22 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.5, marginBottom: 8 },
  fieldGroup: { marginBottom: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, fontFamily: 'Jura-VariableFont_wght' },
  eyeBtn: { paddingLeft: 8, minHeight: 44, justifyContent: 'center' },
  eyeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600' },
  dobRow: { flexDirection: 'row' },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  segmentBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.5 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4, marginBottom: 16 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 1 },
  value: { fontSize: 17, fontWeight: '700' },
  small: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  primaryBtn: { borderRadius: 100, minHeight: 50, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  secondaryBtn: { borderRadius: 100, borderWidth: 1, minHeight: 50, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 1.5 },
});
