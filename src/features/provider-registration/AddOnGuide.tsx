// "How add-ons work": the short guide on InfoReg's services page. Shown
// inline (never as a Modal) because InfoReg already stacks Modals for the
// service and add-on editors, and a Modal on top of another doesn't reliably
// take touches on Android. Open by default while the provider has no add-ons.
//
// Every line here has to stay true to how add-ons actually behave:
//  - one price everywhere: the library item's price is copied onto every
//    service it's on (applyRuleToServices / sync_provider_add_on_links);
//  - a whole category covers services added to it later (rule 'categories');
//  - extra time lengthens the appointment (prepare_checkout adds
//    extra_minutes to end_time) and the time picker only offers starts with
//    room for it (durationWithAddOns);
//  - bookings already made keep the price paid (booking_add_ons.price_snapshot);
//  - nothing is live until Save & Publish (handleSaveAddOn only edits the
//    draft in providerData).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../constants/providerThemes';
import { ADD_ON_FONTS, type AddOnPalette } from './addOnUi';

export const ADD_ON_GUIDE_STEPS: { title: string; body: string }[] = [
  {
    title: 'Make it once',
    body: 'Tap + Add-on at the top of this page. Give it a name, a price, and any extra time it needs.',
  },
  {
    title: 'Choose where it goes',
    body: 'Every service, whole categories, or only the services you pick. A whole category also covers services you add to it later.',
  },
  {
    title: 'Clients add it when they book',
    body: 'The price is added to their total and the appointment gets longer by the extra time. They only see start times when you\'re free for the whole thing.',
  },
  {
    title: 'One price everywhere',
    body: 'Change it here and it changes on every service. Bookings already made keep the price the client paid.',
  },
  {
    title: 'Pause instead of deleting',
    body: 'Switch off "Offer it to clients" to hide it on every service. Switch it back on whenever you like.',
  },
  {
    title: 'Publish to go live',
    body: 'Add-on changes go live when you tap Save & Publish. You can also tick add-ons, or make a new one, while you edit a service.',
  },
];

export function AddOnGuide({ palette }: { palette: AddOnPalette }) {
  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      {ADD_ON_GUIDE_STEPS.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <Text style={[styles.num, { color: palette.accent, backgroundColor: withAlpha(palette.accent, 0.12) }]}>{index + 1}</Text>
          <View style={styles.text}>
            <Text style={[styles.title, { color: palette.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: palette.sub }]}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 12 },
  step: { flexDirection: 'row', gap: 11 },
  num: {
    fontFamily: ADD_ON_FONTS.display,
    fontSize: 11,
    width: 22,
    height: 22,
    lineHeight: 22,
    borderRadius: 11,
    textAlign: 'center',
    overflow: 'hidden',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 14 },
  body: { fontFamily: ADD_ON_FONTS.body, fontWeight: '600', fontSize: 12.5, lineHeight: 18 },
});
