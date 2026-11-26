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
import { tr } from '../../i18n';

export const ADD_ON_GUIDE_STEPS: { title: string; body: string }[] = [
  {
    get title() { return tr('providerBusiness.newp.makeItOnce'); },
    get body() { return tr('providerBusiness.newp.tapAddOnAtTheTop'); },
  },
  {
    get title() { return tr('providerBusiness.newp.chooseWhereItGoes'); },
    get body() { return tr('providerBusiness.newp.everyServiceWholeCategoriesOrOnly'); },
  },
  {
    get title() { return tr('providerBusiness.newp.clientsAddItWhenTheyBook'); },
    get body() { return tr('providerBusiness.newp.thePriceIsAddedToTheir'); },
  },
  {
    get title() { return tr('providerBusiness.newp.onePriceEverywhere'); },
    get body() { return tr('providerBusiness.newp.changeItHereAndItChanges'); },
  },
  {
    get title() { return tr('providerBusiness.newp.pauseInsteadOfDeleting'); },
    get body() { return tr('providerBusiness.newp.switchOffOfferItTo'); },
  },
  {
    get title() { return tr('providerBusiness.newp.publishToGoLive'); },
    get body() { return tr('providerBusiness.newp.addOnChangesGoLiveWhen'); },
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
