/**
 * Business Info — the "who you are and how to reach you" half of what used
 * to be the single 671-line Business Details screen.
 *
 * Scope: business name, business type, social/web links, the two emails, and
 * the external booking link. Deliberately excludes anything about how you
 * practise (that's ServicesPricingScreen) or trust/access claims
 * (AboutYouScreen).
 *
 * The business name is editable here and nowhere else — InfoRegScreen asks
 * for it at sign-up and then renders it locked, pointing here. Changing it
 * starts a 14-day cooldown enforced by a DB trigger, not by this screen.
 *
 * The private full address is deliberately NOT here — InfoRegScreen owns it,
 * as the one screen that both asks for it at first publish and validates it
 * on save. Address release timing is editable in both places on purpose;
 * it's a setting, not an address.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyProviderProfileContext,
  getUserBusinessInfo,
  updateUserBusinessInfo,
  updateProviderContactDetails,
} from '../../services/databaseService';
import {
  Card, Field, RadioGroup, Toast, SaveButton, useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  ADDRESS_RELEASE_OPTS,
  BUSINESS_TYPE_OPTS,
  isAddressReleaseAllowed,
  reconcileAddressReleasePolicy,
  type AddressReleasePolicy,
  type BusinessType,
} from '../../features/business-details/options';
import { formatLongDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';

export default function BusinessInfoScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [userId, setUserId]         = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);

  const [businessName, setBusinessName]   = useState('');
  // The name as loaded, so a save only sends display_name when it actually
  // changed — the cooldown trigger fires on the column being in the UPDATE,
  // and re-sending an identical name would be a no-op it still has to reason
  // about.
  const [savedName, setSavedName]         = useState('');
  const [nameChangedAt, setNameChangedAt] = useState<string | null>(null);
  const [businessType, setBusinessType]   = useState<BusinessType | null>(null);
  const [addressReleasePolicy, setAddressReleasePolicy] = useState<AddressReleasePolicy | null>(null);
  const [businessEmail, setBusinessEmail] = useState('');
  const [bookingEmail, setBookingEmail]   = useState('');
  const [instagram, setInstagram]         = useState('');
  const [website, setWebsite]             = useState('');
  const [externalBookingUrl, setExternalBookingUrl] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const context = await getMyProviderProfileContext();
        if (!context) return;
        setUserId(context.userId);
        const providerData = context.profile;
        const userBizInfo = await getUserBusinessInfo(context.userId);

        if (userBizInfo) {
          setBusinessEmail(userBizInfo.business_email ?? '');
        }
        if (providerData) {
          setProviderId(providerData.id ?? null);
          // providers.display_name is the name clients actually see, so it's
          // the one this field edits. users.business_name is the account-level
          // copy and is kept in sync on save rather than being a second,
          // separately-editable name.
          const name = (providerData as { display_name?: string | null }).display_name
            ?? userBizInfo?.business_name ?? '';
          setBusinessName(name);
          setSavedName(name);
          setNameChangedAt(
            (providerData as { display_name_changed_at?: string | null }).display_name_changed_at ?? null,
          );
          setBusinessType((providerData.business_type as BusinessType | null) ?? null);
          setAddressReleasePolicy((providerData.address_release_policy as AddressReleasePolicy | null) ?? null);
          // Prefilled, not left blank pointing at another screen: if the
          // provider never set a separate enquiry address, their business
          // email is the answer and should already be in the box.
          setBookingEmail(providerData.email ?? userBizInfo?.business_email ?? '');
          setInstagram(providerData.instagram ?? '');
          setWebsite(providerData.website ?? '');
          setExternalBookingUrl(providerData.external_booking_url ?? '');
          setYearsExperience(providerData.years_experience != null ? String(providerData.years_experience) : '');
        }
      } catch {
        flash('Could not load business details', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Mirrors the providers_display_name_cooldown trigger exactly (14 days from
  // the last change). This only decides what the field looks like — the DB is
  // what actually refuses the write, so a stale clock here can't get a change
  // through.
  const NAME_COOLDOWN_DAYS = 14;
  const nameUnlocksAt = nameChangedAt
    ? new Date(new Date(nameChangedAt).getTime() + NAME_COOLDOWN_DAYS * 86400000)
    : null;
  const nameLocked = nameUnlocksAt != null && nameUnlocksAt.getTime() > Date.now();

  function isValidEmail(email: string) {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSave() {
    if (!businessName.trim()) { flash('Enter your business name', 'error'); return; }
    if (!isValidEmail(businessEmail)) { flash('Enter a valid business email', 'error'); return; }
    if (!isValidEmail(bookingEmail))  { flash('Enter a valid public enquiry email', 'error'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const ops: Promise<void>[] = [];

      const trimmedName = businessName.trim();
      const nameChanged = trimmedName.length > 0 && trimmedName !== savedName;

      if (userId) {
        ops.push(updateUserBusinessInfo(
          userId,
          trimmedName || null,
          businessEmail.trim() || null,
        ));
      }
      if (providerId) {
        ops.push(updateProviderContactDetails(providerId, {
          // Only when it actually changed — sending it unchanged puts the
          // column in the UPDATE for no reason, and an empty name would wipe
          // the profile's title.
          ...(nameChanged ? { display_name: trimmedName } : {}),
          // Written as a pair: business_type gates which release timings are
          // valid, so persisting the type without reconciling the policy is
          // what leaves a stale, unofferable timing in the DB.
          ...(businessType
            ? {
                business_type: businessType,
                address_release_policy: reconcileAddressReleasePolicy(businessType, addressReleasePolicy),
              }
            : {}),
          email: bookingEmail.trim() || null,
          instagram: instagram.trim() || null,
          website: website.trim() || null,
          external_booking_url: externalBookingUrl.trim() || null,
          years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        }));
      }

      await Promise.all(ops);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      flash(toUserMessage(e, 'Could not save your changes.', 'BusinessInfoScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardDismissView style={{ flex: 1 }}>
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>Business Info</Text>
            <TouchableOpacity
              style={[s.closeBtn, { backgroundColor: C.surface }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
              activeOpacity={0.5}
            >
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {toast && <Toast message={toast.message} type={toast.type} />}

            <Card title="Business Details" sub="Shown on your public profile and used for communications.">
              {/* The one place a provider's public business name can be
                  changed. Locked for 14 days after each change — the note
                  says when it reopens rather than just refusing. */}
              <Field
                label="Business Name"
                value={businessName}
                onChange={setBusinessName}
                readOnly={nameLocked}
                placeholder="Your business name"
                note={nameLocked && nameUnlocksAt
                  ? `Shown on your profile. You changed it recently — you can change it again on ${formatLongDate(nameUnlocksAt)}.`
                  : 'Shown on your profile. Once you change it, you can’t change it again for 14 days.'}
              />
              <Field label="Instagram Handle" value={instagram} onChange={setInstagram} placeholder="@yourbusiness" note="Shown on your profile. Clients can tap to visit your page." />
              <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourbusiness.com" />
              {/* Two emails, and the old labels had them backwards. `business_email`
                  on `users` is the account/business address — it is never rendered
                  on the public profile; it's what Cerviced writes to and what
                  prefills the enquiry address below. `providers.email` is the one
                  the profile actually shows under Get In Touch. It was labelled
                  "Booking Notification Email", which describes a feature that does
                  not exist: nothing in the app or the edge functions ever emails a
                  provider about a booking (those are push + in-app only). */}
              <Field label="Business Email" value={businessEmail} onChange={setBusinessEmail} placeholder="hello@mybusiness.com" keyboardType="email-address" note="Your business address. Cerviced uses this to reach you, and it prefills the enquiry email below." />
              <Field label="Public Enquiry Email" value={bookingEmail} onChange={setBookingEmail} placeholder="hello@mybusiness.com" keyboardType="email-address" note="Shown on your profile under Get In Touch. Prefilled from your business email — change it only if you'd rather enquiries went elsewhere." />
              <Field label="Years of Experience" value={yearsExperience} onChange={v => setYearsExperience(v.replace(/[^0-9]/g, ''))} placeholder="e.g. 5" keyboardType="phone-pad" />
            </Card>

            <Card
              title="Business Type"
              sub="Where you see clients. This decides whether — and when — your address is shared with them."
            >
              <RadioGroup
                options={BUSINESS_TYPE_OPTS}
                value={businessType ?? ''}
                onChange={v => {
                  const next = v as BusinessType;
                  setBusinessType(next);
                  // Switching type can strip the current timing from the
                  // allowed set — move it to one the new type offers instead
                  // of leaving a selection no pill below can show.
                  setAddressReleasePolicy(prev => reconcileAddressReleasePolicy(next, prev));
                }}
              />

              {/* Mobile providers get this picker too now. The list they're
                  offered excludes 'always' (see ADDRESS_RELEASE_BY_BUSINESS_TYPE)
                  because the address on file for a mobile provider is usually
                  their home. */}
              {businessType && (
                <View style={{ marginTop: 18 }}>
                  <Text style={[s.cardTitle, { color: C.text, marginBottom: 4 }]}>Address Release</Text>
                  <Text style={[s.cardSub, { color: C.sub }]}>
                    {businessType === 'mobile'
                      ? 'You travel to your clients, so they give you their address. Yours is never sent automatically — pick Manual release if you want the option to send it per booking.'
                      : 'When a booked client can see your address.'}
                  </Text>
                  {/* Mobile gets an explicit "never" choice, stored as NULL.
                      Without it, not-sharing would only ever be the initial
                      state and a provider who picked a timing could never go
                      back to private. Offered to mobile only: for a premises
                      type the address is the whole point of the booking. */}
                  <RadioGroup
                    options={[
                      ...ADDRESS_RELEASE_OPTS.filter(o => isAddressReleaseAllowed(businessType, o.value)),
                      ...(businessType === 'mobile'
                        ? [{ value: '', label: 'Never share', sub: 'Your address is never sent to clients. They give you theirs instead.' }]
                        : []),
                    ]}
                    value={addressReleasePolicy ?? ''}
                    onChange={v => setAddressReleasePolicy(v === '' ? null : (v as AddressReleasePolicy))}
                  />
                </View>
              )}
            </Card>

            <Card title="External Booking Link" sub="Already booking through Fresha, Treatwell, Acuity, or similar?">
              <Field
                label="Booking Link"
                value={externalBookingUrl}
                onChange={setExternalBookingUrl}
                placeholder="e.g. your Fresha or Acuity booking page"
                note="When set, clients tap Book and go straight to this link — Cerviced's in-app booking is skipped for your profile. Leave blank to keep booking in-app."
              />
            </Card>

            {/* A provider's own client-facing Terms & Conditions are authored
                as a FORM (booking_intake_forms, is_terms) via the
                ProviderIntakeForm builder, and their only entry point is now
                the "Your Terms & Conditions" card near the end of Edit Profile
                (InfoRegScreen) — kept next to first-publish setup rather than
                buried in this hub. Cerviced's own Terms are a separate document
                and are not editable by providers. */}

            {/* Contact preferences live in Communications, which owns the
                canonical lowercase preferred_contact_methods write path. This
                card used to re-implement it with mismatched capitalized chip
                labels, silently desyncing what clients' contact sheets check —
                link out rather than duplicating the writer again. */}
            <TouchableOpacity
              style={[s.card, { backgroundColor: C.surface, borderColor: C.border, flexDirection: 'row', alignItems: 'center' }]}
              onPress={() => navigation.navigate('Communications')}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: C.text }]}>Contact Preferences</Text>
                <Text style={[s.cardSub, { color: C.sub, marginBottom: 0 }]}>How clients can best reach you — manage in Communications</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.sub} />
            </TouchableOpacity>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}
