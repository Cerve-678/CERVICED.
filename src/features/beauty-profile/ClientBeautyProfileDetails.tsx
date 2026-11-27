// A client's Beauty Profile as a provider reads it: Health & Alerts first,
// then each area the client filled in, then photography consent. Shared by
// the provider booking page and the client sheet in My Clientele, so the two
// always show the same answers the same way.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ClientBeautyProfile } from '../../services/databaseService';
import { formatPickList } from './pickList';
import { hairTreatmentHistory } from './options';

const ALERT = '#FF9500';
const DANGER = '#FF3B30';
const GREEN = '#34C759';

export function ClientBeautyProfileDetails({ profile, text, sub, surface, divider, isDark }: {
  profile: ClientBeautyProfile;
  text: string;
  sub: string;
  /** Chip background for plain (non-alert) chips. */
  surface: string;
  divider: string;
  isDark: boolean;
}) {
  const catLabel = (label: string) => (
    <Text style={[st.catLabel, { color: sub }]}>{label}</Text>
  );
  const chips = (items: string[], color?: string) => (
    <View style={st.chips}>
      {items.map(item => (
        <View key={item} style={[st.chip, {
          backgroundColor: color ? color + '18' : surface,
          borderColor: color ? color + '44' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',
        }]}>
          <Text style={[st.chipText, { color: color ?? text }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
  const chipRow = (label: string, items: string[], labelColor = text, color?: string) => (
    <View style={[st.chipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider }]}>
      <Text style={[st.rowLabel, { color: labelColor }]}>{label}</Text>
      {chips(items, color)}
    </View>
  );
  const row = (label: string, value: string, opts?: { last?: boolean; valueColor?: string }) => (
    <View style={[st.row, !opts?.last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider }]}>
      {/* Labels sit back (≈55% of the text colour) so the values carry the row. */}
      <Text style={[st.rowLabel, { color: text + '8C' }]} numberOfLines={1}>{label}</Text>
      <Text style={[st.rowValue, { color: opts?.valueColor ?? text }]}>{value}</Text>
    </View>
  );
  const pick = (label: string, items: string[]) => (items.length > 0 ? row(label, formatPickList(items)) : null);

  const p = profile;
  const hairHistory = hairTreatmentHistory(p.treatmentHistory);
  const hasSkin = p.skinType.length > 0 || !!p.skinTone || !!p.skinUndertone || p.skinConcerns.length > 0 || p.sensitiveAreas.length > 0;
  const hasHair = p.hairType.length > 0 || !!p.hairPorosity || !!p.hairThickness
    || p.scalpCondition.length > 0 || p.hairGoals.length > 0 || hairHistory.length > 0;
  const hasNails = p.nailLength.length > 0 || p.nailShape.length > 0 || p.nailCondition.length > 0
    || p.nailService.length > 0 || p.nailStyle.length > 0 || p.nailColours.length > 0;
  const hasLashesBrows = p.eyeShape.length > 0 || p.lashStyle.length > 0 || !!p.lashStatus || !!p.lashCurl
    || p.browStyle.length > 0 || p.browCondition.length > 0;
  const hasMakeup = p.makeupCoverage.length > 0 || p.makeupFinish.length > 0 || p.makeupEyes.length > 0 || p.makeupLips.length > 0;
  const hasAlerts = p.allergies.length > 0 || !!p.medicalNotes;

  return (
    <>
      {/* ── HEALTH & ALERTS (always first) ── */}
      {hasAlerts && catLabel('Health & Alerts')}
      {p.allergies.length > 0 && chipRow('⚠ Allergies', p.allergies, ALERT, ALERT)}
      {p.medicalNotes ? (
        <View style={[st.chipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider }]}>
          <Text style={[st.rowLabel, { color: DANGER }]}>⚕ Medical notes</Text>
          <Text style={[st.rowValue, { color: text, flex: 1, textAlign: 'left', marginLeft: 8 }]}>{p.medicalNotes}</Text>
        </View>
      ) : null}

      {hasSkin && (
        <>
          {catLabel('Skin')}
          {pick('Skin type', p.skinType)}
          {p.skinTone ? row('Skin tone', p.skinTone) : null}
          {p.skinUndertone ? row('Undertone', p.skinUndertone) : null}
          {p.skinConcerns.length > 0 && chipRow('Skin concerns', p.skinConcerns)}
          {p.sensitiveAreas.length > 0 && chipRow('Sensitive areas', p.sensitiveAreas)}
        </>
      )}

      {hasHair && (
        <>
          {catLabel('Hair')}
          {pick('Hair type', p.hairType)}
          {p.hairPorosity ? row('Porosity', p.hairPorosity) : null}
          {p.hairThickness ? row('Thickness', p.hairThickness) : null}
          {pick('Scalp condition', p.scalpCondition)}
          {hairHistory.length > 0 && chipRow('Treatment history', hairHistory)}
          {p.hairGoals.length > 0 && chipRow('Hair goals', p.hairGoals)}
        </>
      )}

      {hasNails && (
        <>
          {catLabel('Nails')}
          {pick('Natural nails', p.nailCondition)}
          {pick('Usually gets', p.nailService)}
          {pick('Preferred length', p.nailLength)}
          {pick('Preferred shape', p.nailShape)}
          {pick('Looks', p.nailStyle)}
          {pick('Colours', p.nailColours)}
        </>
      )}

      {hasLashesBrows && (
        <>
          {catLabel('Lashes & Brows')}
          {pick('Eye shape', p.eyeShape)}
          {pick('Lash style', p.lashStyle)}
          {p.lashStatus ? row('Lash status', p.lashStatus) : null}
          {p.lashCurl ? row('Lash curl', p.lashCurl) : null}
          {pick('Brow style', p.browStyle)}
          {pick('Brow condition', p.browCondition)}
        </>
      )}

      {hasMakeup && (
        <>
          {catLabel('Makeup')}
          {pick('Coverage', p.makeupCoverage)}
          {pick('Finish', p.makeupFinish)}
          {pick('Eye style', p.makeupEyes)}
          {pick('Lip preference', p.makeupLips)}
        </>
      )}

      {p.styleVibe.length > 0 && (
        <>
          {catLabel('Style')}
          {row('Style vibe', formatPickList(p.styleVibe))}
        </>
      )}

      {catLabel('Consent')}
      {row('Photography consent', p.photographyConsent ? 'Yes' : 'No', {
        last: true,
        valueColor: p.photographyConsent ? GREEN : DANGER,
      })}
    </>
  );
}

const st = StyleSheet.create({
  catLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, opacity: 0.6, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowLabel: { fontSize: 14, flex: 1, marginRight: 12 },
  rowValue: { fontSize: 14, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  chipRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 8 },
  chips:    { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  chip:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
});
