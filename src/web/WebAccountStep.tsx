/**
 * The web checkout's sign-in: email → 6-digit code → any details the account
 * still needs → "Booking as …". A new email gets a real CERVICED account, the
 * same kind the app makes, so the booking shows up there too.
 *
 * Drawn in the booking sheet's own colours (the tokens WebCheckoutSheet hands
 * its steps), with the app's validation rules for mobile and date of birth.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { ProviderThemeTokens } from '../constants/providerThemes';
import { isDarkColor } from '../constants/providerThemes';
import type { BookingDetail } from '../features/bookings/beforeYouBook';
import {
  createSocialProfileIfMissing,
  getSignedInAccount,
  getUserProfileById,
  sendEmailSignInCode,
  signOutCurrentSession,
  updateClientProfileFields,
  verifySignupOtp,
} from '../services/databaseService';
import { legalPageUrl } from '../utils/legalPage';
import { logger } from '../utils/logger';
import { validateDob, validateEmail, validatePhone } from '../utils/validation';
import { cleanSignInCode, dobForAccount, webAccountState } from './webAccount';
import type { WebAccountProfile } from './webAccount';

export interface WebBookingAccount {
  id: string;
  email: string;
  name: string;
}

type Step =
  | { kind: 'checking' }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'details'; account: { id: string; email: string }; missing: BookingDetail[] }
  | { kind: 'providerOnly'; email: string }
  | { kind: 'ready'; account: WebBookingAccount };

function authErrorMessage(error: unknown, during: 'send' | 'verify'): string {
  const { status, code } = (error ?? {}) as { status?: number; code?: string };
  if (status === 429 || code?.startsWith('over_')) return 'Too many tries. Please wait a minute and try again.';
  if (during === 'verify') return 'That code didn’t work. Check it, or send a new one.';
  return 'We couldn’t send the code. Check your email address and try again.';
}

interface WebAccountStepProps {
  tokens: ProviderThemeTokens;
  accentColor: string;
  /** Called with the account once it can book, and with null when it can't (signed out, or details still missing). */
  onReadyChange: (account: WebBookingAccount | null) => void;
}

export function WebAccountStep({ tokens, accentColor, onReadyChange }: WebAccountStepProps) {
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [showErrors, setShowErrors] = useState(false);
  const onAccent = isDarkColor(accentColor) ? '#fff' : '#1B2740';

  /** Where a signed-in account goes next, reading its row (and making one for a new email). */
  const continueSignedIn = useCallback(async (account: { id: string; email: string }) => {
    let profile: WebAccountProfile | null = await getUserProfileById(account.id);
    if (!profile) {
      await createSocialProfileIfMissing({ id: account.id, email: account.email, loginMethod: 'email' });
      profile = await getUserProfileById(account.id);
    }
    if (!profile) throw new Error('The account has no users row after creating one');
    const state = webAccountState(profile);
    if (state.kind === 'providerOnly') {
      setStep({ kind: 'providerOnly', email: account.email });
    } else if (state.kind === 'details') {
      setName(profile.name ?? '');
      setPhone(profile.phone ?? '');
      setStep({ kind: 'details', account, missing: state.missing });
    } else {
      setStep({ kind: 'ready', account: { ...account, name: profile.name } });
    }
  }, []);

  // Someone already signed in on this browser goes straight past the code.
  useEffect(() => {
    let cancelled = false;
    getSignedInAccount()
      .then(async account => {
        if (cancelled) return;
        if (!account) { setStep({ kind: 'email' }); return; }
        await continueSignedIn(account);
      })
      .catch((err: unknown) => {
        logger.error('[WebAccountStep] reading the signed-in account failed:', err);
        if (!cancelled) setStep({ kind: 'email' });
      });
    return () => { cancelled = true; };
  }, [continueSignedIn]);

  useEffect(() => {
    onReadyChange(step.kind === 'ready' ? step.account : null);
  }, [step, onReadyChange]);

  const sendCode = async (to: string) => {
    setBusy(true);
    setError(null);
    try {
      await sendEmailSignInCode(to);
      setCode('');
      setStep({ kind: 'code', email: to });
    } catch (err) {
      logger.error('[WebAccountStep] sending the sign-in code failed:', err);
      setError(authErrorMessage(err, 'send'));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = () => {
    const trimmed = email.trim().toLowerCase();
    if (!validateEmail(trimmed)) { setError('Enter a valid email address.'); return; }
    void sendCode(trimmed);
  };

  const submitCode = async () => {
    if (step.kind !== 'code') return;
    if (code.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    setError(null);
    let session: Awaited<ReturnType<typeof verifySignupOtp>>;
    try {
      session = await verifySignupOtp(step.email, code);
    } catch (err) {
      logger.error('[WebAccountStep] confirming the sign-in code failed:', err);
      setError(authErrorMessage(err, 'verify'));
      setBusy(false);
      return;
    }
    try {
      await continueSignedIn({ id: session.userId, email: session.email ?? step.email });
    } catch (err) {
      // The code worked and they're signed in; only reading the account failed.
      logger.error('[WebAccountStep] opening the account after sign-in failed:', err);
      setError('You’re signed in, but we couldn’t open your account. Refresh the page to carry on.');
    } finally {
      setBusy(false);
    }
  };

  const detailError = (detail: BookingDetail): string | null => {
    if (detail === 'name') return name.trim() ? null : 'Enter your name';
    if (detail === 'phone') return validatePhone(phone);
    return validateDob(dob.day, dob.month, dob.year);
  };

  const submitDetails = async () => {
    if (step.kind !== 'details') return;
    if (step.missing.some(detail => detailError(detail))) { setShowErrors(true); return; }
    setBusy(true);
    setError(null);
    try {
      await updateClientProfileFields(step.account.id, {
        ...(step.missing.includes('name') ? { name: name.trim() } : {}),
        ...(step.missing.includes('phone') ? { phone: phone.trim() } : {}),
        ...(step.missing.includes('dob') ? { dob: dobForAccount(dob.day, dob.month, dob.year) } : {}),
      });
      await continueSignedIn(step.account);
    } catch (err) {
      logger.error('[WebAccountStep] saving booking details failed:', err);
      setError('We couldn’t save your details. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOutCurrentSession();
      setCode('');
      setStep({ kind: 'email' });
    } catch (err) {
      // Still signed in, so stay on this step rather than pretend it worked.
      logger.error('[WebAccountStep] signing out failed:', err);
      setError('We couldn’t sign you out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.bg }];
  const fieldError = (detail: BookingDetail) => (showErrors ? detailError(detail) : null);

  const button = (label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      style={[styles.button, { backgroundColor: accentColor }, busy && styles.buttonBusy]}
      accessibilityRole="button"
      activeOpacity={0.8}
    >
      {busy ? <ActivityIndicator color={onAccent} /> : <Text style={[styles.buttonText, { color: onAccent }]}>{label}</Text>}
    </TouchableOpacity>
  );
  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} disabled={busy} accessibilityRole="button" hitSlop={8} activeOpacity={0.6}>
      <Text style={[styles.link, { color: accentColor }]}>{label}</Text>
    </TouchableOpacity>
  );
  const errorLine = error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null;

  if (step.kind === 'checking') {
    return <ActivityIndicator color={accentColor} style={styles.checking} />;
  }

  if (step.kind === 'ready') {
    return (
      <>
        <View style={[styles.card, { backgroundColor: tokens.surface }]}>
          <View style={styles.cardText}>
            <Text style={[styles.label, { color: tokens.sub }]}>BOOKING AS</Text>
            <Text style={[styles.strong, { color: tokens.text }]}>{step.account.name}</Text>
            <Text style={[styles.body, { color: tokens.sub }]}>{step.account.email}</Text>
          </View>
          {link('Not you?', () => void signOut())}
        </View>
        {errorLine}
      </>
    );
  }

  if (step.kind === 'providerOnly') {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: tokens.text }]}>This is a provider account</Text>
        <Text style={[styles.body, { color: tokens.sub }]}>
          {step.email} can’t book yet. Add a client profile in the CERVICED app, or use a different email.
        </Text>
        {link('Use a different email', () => void signOut())}
        {errorLine}
      </View>
    );
  }

  if (step.kind === 'details') {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: tokens.text }]}>A few details</Text>
        <Text style={[styles.body, { color: tokens.sub }]}>The provider needs these for your booking.</Text>
        {step.missing.includes('name') && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: tokens.sub }]}>NAME</Text>
            <TextInput style={input} value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Your full name" placeholderTextColor={tokens.sub} />
            {fieldError('name') ? <Text style={styles.error}>{fieldError('name')}</Text> : null}
          </View>
        )}
        {step.missing.includes('phone') && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: tokens.sub }]}>MOBILE</Text>
            <TextInput style={input} value={phone} onChangeText={setPhone} autoComplete="tel" textContentType="telephoneNumber" keyboardType="phone-pad" placeholder="07700 900123" placeholderTextColor={tokens.sub} />
            {fieldError('phone') ? <Text style={styles.error}>{fieldError('phone')}</Text> : null}
          </View>
        )}
        {step.missing.includes('dob') && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: tokens.sub }]}>DATE OF BIRTH</Text>
            <View style={styles.dobRow}>
              <TextInput style={[input, styles.dobShort]} value={dob.day} onChangeText={day => setDob(d => ({ ...d, day: day.replace(/\D/g, '').slice(0, 2) }))} keyboardType="number-pad" placeholder="DD" placeholderTextColor={tokens.sub} accessibilityLabel="Day" autoComplete="birthdate-day" />
              <TextInput style={[input, styles.dobShort]} value={dob.month} onChangeText={month => setDob(d => ({ ...d, month: month.replace(/\D/g, '').slice(0, 2) }))} keyboardType="number-pad" placeholder="MM" placeholderTextColor={tokens.sub} accessibilityLabel="Month" autoComplete="birthdate-month" />
              <TextInput style={[input, styles.dobYear]} value={dob.year} onChangeText={year => setDob(d => ({ ...d, year: year.replace(/\D/g, '').slice(0, 4) }))} keyboardType="number-pad" placeholder="YYYY" placeholderTextColor={tokens.sub} accessibilityLabel="Year" autoComplete="birthdate-year" />
            </View>
            {fieldError('dob') ? <Text style={styles.error}>{fieldError('dob')}</Text> : null}
          </View>
        )}
        {errorLine}
        {button('Save', () => void submitDetails())}
      </View>
    );
  }

  if (step.kind === 'code') {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: tokens.text }]}>Check your email</Text>
        <Text style={[styles.body, { color: tokens.sub }]}>Enter the 6-digit code we sent to {step.email}.</Text>
        <TextInput
          style={[input, styles.codeInput]}
          value={code}
          onChangeText={typed => setCode(cleanSignInCode(typed))}
          onSubmitEditing={() => void submitCode()}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="000000"
          placeholderTextColor={tokens.sub}
          accessibilityLabel="6-digit code"
          autoFocus
        />
        {errorLine}
        {button('Confirm', () => void submitCode())}
        <View style={styles.links}>
          {link('Send a new code', () => void sendCode(step.email))}
          {link('Use a different email', () => { setError(null); setStep({ kind: 'email' }); })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: tokens.text }]}>Your email</Text>
      <Text style={[styles.body, { color: tokens.sub }]}>
        We’ll send you a code. It also opens your CERVICED account, where you can manage this booking.
      </Text>
      <TextInput
        style={input}
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submitEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="you@example.com"
        placeholderTextColor={tokens.sub}
        accessibilityLabel="Email"
      />
      {errorLine}
      {button('Send code', submitEmail)}
      <Text style={[styles.small, { color: tokens.sub }]}>
        By continuing you agree to our{' '}
        <Text style={[styles.smallLink, { color: accentColor }]} onPress={() => void Linking.openURL(legalPageUrl('terms'))} accessibilityRole="link">Terms of Service</Text>
        {' '}and{' '}
        <Text style={[styles.smallLink, { color: accentColor }]} onPress={() => void Linking.openURL(legalPageUrl('privacy'))} accessibilityRole="link">Privacy Policy</Text>.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checking: { paddingVertical: 24 },
  section: { gap: 10 },
  card: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardText: { flex: 1, gap: 3 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  strong: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  dobRow: { flexDirection: 'row', gap: 8 },
  dobShort: { width: 64, textAlign: 'center' },
  dobYear: { width: 88, textAlign: 'center' },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  buttonBusy: { opacity: 0.7 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, lineHeight: 20 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  link: { fontSize: 14, fontWeight: '700' },
  error: { color: '#B3261E', fontSize: 13 },
  small: { fontSize: 12, lineHeight: 17 },
  smallLink: { fontWeight: '700', textDecorationLine: 'underline' },
});
