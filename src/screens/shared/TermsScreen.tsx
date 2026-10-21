import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FEE_TERMS_BODY, FEE_TERMS_HEADING } from '../../constants/feeTerms';

// The Terms & Conditions shown to clients and providers. Rewritten 2026-10-19
// at the product owner's direction to cover what's live on main (service fee,
// refunds, payouts, provider websites shown in the app, health information,
// Becca, points, account deletion) and the standard topics in comparable
// platforms' terms (Fresha, Treatwell, Uber, Pinterest, Squarespace/Acuity),
// written in our own words. NOT lawyer-reviewed: see LEGAL-COMPLIANCE-NOTES.md
// §19 for what to take to a solicitor. [company number] / [registered address]
// are placeholders to fill in before launch.
const SECTIONS = [
  {
    heading: '1. About Cerviced and These Terms',
    body: [
      'Cerviced is run by Cerviced Ltd, a company registered in England and Wales (company number [company number]), whose registered office is at [registered address]. In these Terms, "Cerviced", "we", "us" and "our" mean Cerviced Ltd. You can contact us at support@cerviced.co.',
      'These Terms apply to everyone who uses the Cerviced app, whether you book treatments (a "client") or offer them (a "provider"). They work alongside our Privacy Policy, which explains how we use your personal information, and alongside the policies each provider shows on their profile, such as their cancellation policy. Some providers also have their own terms and conditions, which you\'ll be asked to accept before you book with them.',
      'By creating an account or using the app, you agree to these Terms. If you don\'t agree, please don\'t use the app. Please read them carefully, and keep a copy for your records.',
    ].join('\n\n'),
  },
  {
    heading: '2. Key Words Used in These Terms',
    body: '"Booking" means an appointment you request or make with a provider through the app. "Service fee" means the fee Cerviced charges clients for bookings paid in the app. "Own booking page" means a provider\'s booking website outside Cerviced, such as Fresha or Treatwell. "Content" means anything posted in the app, including photos, reviews, profile text and messages.',
  },
  {
    heading: '3. Who Can Use Cerviced',
    body: [
      'You must be at least 16 to create a Cerviced account. Some treatments have a legal minimum age. For example, Botox and dermal fillers can\'t be given to anyone under 18 in England, and other treatments may need a parent\'s consent. Providers must follow these rules and can refuse a booking that breaks them.',
      'You may have one account, which is for your own use. The details you give us, including your name, date of birth and contact details, must be true and kept up to date. We may check the details you give us and may refuse or close an account if they aren\'t accurate.',
      'If you use Cerviced as a business, you must do so through a provider account and follow the "For Providers" section of these Terms.',
    ].join('\n\n'),
  },
  {
    heading: '4. Your Licence to Use the App',
    body: [
      'We give you a personal, non-transferable right to use the Cerviced app on your own devices, for as long as you keep to these Terms. The app is licensed to you, not sold. The terms of the app store you downloaded it from (Apple App Store or Google Play) also apply.',
      'You must not copy, change, reverse-engineer or resell the app, collect information from it by automated means (for example, scraping), or use it to build a competing service.',
    ].join('\n\n'),
  },
  {
    heading: '5. What Cerviced Does',
    body: [
      'Cerviced is a marketplace that connects clients with independent beauty and wellness professionals. We do not employ providers and we don\'t provide the treatments. Every booking is an agreement between you and the provider, and the provider is responsible for the service they give you, for their premises, and for meeting the standards and laws that apply to their work.',
      'Providers write their own profiles, prices, photos, opening hours and policies. We ask them to keep these accurate, but we can\'t check every detail. Photos show examples of a provider\'s work, not a guarantee of your result. Unless we say otherwise, we don\'t check providers\' qualifications, licences or insurance, so please ask a provider directly if these matter to you.',
    ].join('\n\n'),
  },
  {
    heading: '6. How Search and Explore Work',
    body: [
      'In Search, providers that match your search and filters are shown with providers Cerviced has chosen to feature first, then by rating. You can change the order, for example to nearest or price. Providers can\'t pay to be featured or to appear higher.',
      'Explore, Becca and some reminders are personalised. We use your activity in the app, such as the looks and providers you save, view and book, and the beauty profile you fill in, to suggest things you\'re likely to want. Our Privacy Policy explains this in more detail.',
      'Providers only appear to clients once they\'ve completed their profile and gone live.',
    ].join('\n\n'),
  },
  {
    heading: '7. Your Account and Security',
    body: 'You are responsible for maintaining the security of your account and all activity under it. Keep your password private and don\'t share your account. Please notify us immediately at support@cerviced.co if you think someone else has used it. We\'ll never ask for your password.',
  },
  {
    heading: '8. Making a Booking',
    body: [
      'When you book through Cerviced, you send the provider a request. Your booking is confirmed when the provider accepts it, and we\'ll let you know. If they decline it, or don\'t respond before it expires, any payment you made is refunded in full automatically.',
      'Before you book, check the provider\'s profile, prices, cancellation policy and any terms they ask you to accept. Arrive on time and tell the provider anything they need to know, such as allergies or health conditions.',
      'If a provider comes to you, your address is only shared with them once they\'ve accepted your booking.',
      'If you book for someone else, you\'re responsible for that booking, and you must have their permission to share their details with the provider.',
    ].join('\n\n'),
  },
  {
    heading: '9. Prices and Payment',
    body: [
      'Prices are in pounds sterling and are set by each provider. The total you pay in the app, including any deposit and Cerviced\'s service fee, is shown before you pay.',
      'You can pay in the app by card, Apple Pay, Google Pay or PayPal. Payments are processed securely by Stripe, and Cerviced never sees or stores your full card number or your PayPal login. Stripe\'s own terms also apply, and PayPal\'s terms apply when you pay with PayPal. If a provider has a late arrival or no-show fee, that booking is paid by card, because the fee may be charged to it after the appointment. If a provider asks you to save your card for an agreed fee, Stripe stores it, not us.',
      'If a price is clearly wrong because of a mistake, for example a treatment listed at a fraction of its usual price, we or the provider may cancel the booking and refund you in full.',
      'After a completed appointment you can choose to tip the provider in the app. A tip is optional and is a separate card payment. It goes to the provider, less the card processing fee, and Cerviced keeps none of it.',
      'Anything you agree with the provider at the appointment, such as adding a treatment or a tip paid in person, is between you and the provider and isn\'t paid through the app.',
    ].join('\n\n'),
  },
  {
    heading: '10. Cerviced Service Fee',
    body: [
      'Cerviced adds a service fee to each booking you pay for in the app. The fee is shown before you pay. It is charged to you and is never taken from the provider\'s price.',
      'If your booking is refunded in full, for example because the provider declined or cancelled it, or you cancelled early enough under their policy, the service fee is refunded too. If you get a partial refund, the service fee is not refunded.',
    ].join('\n\n'),
  },
  {
    heading: '11. Deposits & Remaining Balances',
    body: 'Some providers accept a deposit through the app instead of full payment. Any remaining balance is owed directly to the provider and is settled between you and the provider in person — Cerviced does not collect, hold, verify, or guarantee payment of that balance, and is not responsible for resolving disputes about whether or how much was paid at the appointment.',
  },
  {
    heading: '12. Rescheduling',
    body: 'You can ask to move a booking from the booking itself. The provider can accept your new time or suggest another, and providers can also suggest a new time to you. A request that isn\'t answered in time expires, and your original booking stays as it was. Providers may limit how close to the appointment you can reschedule; this is shown in their policy.',
  },
  {
    heading: '13. Cancellations by You',
    body: [
      'Each provider sets their own cancellation policy, which is shown on their profile and before you book. If you cancel a booking you paid for in the app, the provider\'s policy is applied automatically. If you cancel before their notice period, you get a full refund. If you cancel inside it, the provider keeps the share their policy states and you\'re refunded the rest.',
      'Cancelling late or missing appointments is recorded, and the provider you booked with can see how often this has happened with them.',
    ].join('\n\n'),
  },
  {
    heading: '14. Cancellations by the Provider',
    body: 'If a provider declines or cancels a booking you\'ve paid for, you\'re refunded in full, including the service fee. We\'ll let you know, and you\'re free to book with someone else.',
  },
  {
    heading: '15. Refunds and Refund Requests',
    body: [
      'A provider can refund you in full or in part at any time. If you\'d like a refund, you can request one from the booking. Your request goes to the provider first. They can refund you or pass it to Cerviced, and if it\'s passed to us, we\'ll review it and let you know the outcome.',
      'Refunds go back to the way you paid: to your card, or to your PayPal account if you paid with PayPal. A card refund usually takes 5 to 10 working days to appear, depending on your bank.',
    ].join('\n\n'),
  },
  {
    heading: `16. ${FEE_TERMS_HEADING}`,
    body: FEE_TERMS_BODY,
  },
  {
    heading: '17. Waitlists',
    body: 'If a time you want is taken, you may be able to join the provider\'s waitlist. If a slot opens, we\'ll let you know and hold it for you for a limited time. If you don\'t book it in time, it may be offered to the next person. Joining a waitlist doesn\'t guarantee you a slot.',
  },
  {
    heading: '18. Problems With a Treatment',
    body: [
      'If something goes wrong with a treatment, please tell the provider first, as they\'re best placed to put it right, for example by redoing the treatment. If you can\'t resolve it with them, contact us at support@cerviced.co with your booking reference and we\'ll try to help. We may, at our discretion, offer a refund or credit, but the provider remains responsible for the service they gave you.',
      'Nothing in these Terms affects your statutory rights, including your right to a service carried out with reasonable care and skill.',
    ].join('\n\n'),
  },
  {
    heading: '19. Your Health and Your Treatment',
    body: [
      'If you share health information when you book, for example allergies, pregnancy or a skin condition, it\'s passed to your provider for that appointment. Answer any questions honestly and tell your provider about anything that could affect your treatment, even if you weren\'t asked. If you don\'t, the provider may not be able to treat you safely and may not be responsible for harm that disclosure would have avoided.',
      'Follow your provider\'s patch-test and aftercare instructions. A provider may refuse or stop a treatment if they believe it isn\'t safe for you.',
      'Cerviced doesn\'t give medical advice or decide whether a treatment is safe for you. If you\'re unsure, speak to a doctor or pharmacist before booking.',
    ].join('\n\n'),
  },
  {
    heading: '20. Provider Websites Shown in the App',
    body: [
      'Some providers take bookings on their own booking page, such as Fresha, Treatwell or Acuity, instead of through Cerviced. When you tap Book on their profile, their page opens inside the Cerviced app, in your phone\'s secure browser view. It\'s still their website: it\'s run by them or their booking company, not by Cerviced.',
      'We don\'t control, check or endorse those pages. Anything you book, pay or share on them, including your card details and personal information, goes to the provider and their booking company, under their terms and privacy policy, not ours. Cerviced can\'t see what you enter there. We can\'t change, cancel or refund a booking made there, so please contact the provider directly about it.',
      'We count how many times clients tap Book on each profile, and show providers the totals. We don\'t record what you do on their website.',
      'When you close their page, we may ask whether you booked. If you add the appointment to your Upcoming list, it\'s your own note to help you keep track. Cerviced doesn\'t confirm that it was booked, or that the date, time or details are correct.',
      'Links to providers\' websites can change or stop working. If a page doesn\'t load or looks wrong, contact the provider.',
    ].join('\n\n'),
  },
  {
    heading: '21. Other Services We Work With',
    body: 'Cerviced works with other companies\' services, for example Stripe and PayPal for payments, Apple and Google for sign-in and notifications, and Instagram when you open a provider\'s Instagram profile. When you use them, their own terms and privacy policies apply, and we aren\'t responsible for them.',
  },
  {
    heading: '22. Reviews',
    body: [
      'Reviews help everyone choose well, so they must be honest and about an appointment you actually had through Cerviced. Don\'t review a business you own, work for or compete with, and don\'t offer, ask for or accept anything in return for a review.',
      'Providers must not pressure clients to change or remove a review, or only ask happy clients to leave one.',
      'We may refuse, hide or remove a review that breaks these Terms, and we may temporarily hide a review while we look into a report.',
    ].join('\n\n'),
  },
  {
    heading: '23. Content You Post',
    body: [
      'You keep ownership of the photos, text and other content you post. You give Cerviced a free licence to store, show and adapt it (for example, resizing photos) so we can run the app, including showing it on your profile, in Explore and in Search, for as long as it\'s on your account.',
      'You must have the right to post your content, and it must not be abusive, threatening, discriminatory, sexually explicit, misleading or unlawful, include anyone else\'s personal details without their permission, or break anyone\'s copyright. Photos of clients need those clients\' permission.',
      'When you delete content, it may stay in our backups for a short time, and copies others have already saved may remain.',
      'To report content that breaks these rules, or that you believe infringes your rights, contact support@cerviced.co and tell us what it is, where it is, why you\'re reporting it, and how to contact you. We may remove content, and close accounts that repeatedly break these rules.',
      'If you send us ideas or feedback, we may use them without owing you anything.',
    ].join('\n\n'),
  },
  {
    heading: '24. Messages and Notifications',
    body: [
      'We send you messages about your bookings and your account, such as confirmations, reminders, changes and receipts, by push notification and email. You can manage which notifications you receive in Settings and in your phone\'s settings, but turning off booking messages may mean you miss important updates.',
      'Messages between clients and providers in the app must be about bookings and services. Don\'t use them to send spam or advertising, or to ask for payment outside the app for bookings made through it.',
    ].join('\n\n'),
  },
  {
    heading: '25. Becca and Personalised Suggestions',
    body: 'Becca, our in-app assistant, and features like Beauty Maintenance reminders give automatic suggestions based on what you tell us and your past bookings. They\'re general help and can be wrong or out of date. They aren\'t professional, medical or financial advice. Check anything important with your provider.',
  },
  {
    heading: '26. Loyalty Points',
    body: 'You earn points for eligible bookings. Points have no cash value, can\'t be transferred or sold, and never expire while your account is active. Ways to use points will be shown in the app when they\'re available. We may change how points are earned or used, or end the scheme, with reasonable notice, and we may remove points earned through misuse or bookings that are refunded.',
  },
  {
    heading: '27. Offers and Promo Codes',
    body: 'Offers and promo codes are set by providers or by Cerviced, and any conditions are shown with them. A code can only be used as described, can\'t be exchanged for cash, and may be withdrawn at any time before you use it. Personal codes mustn\'t be shared.',
  },
  {
    heading: '28. Prohibited Conduct',
    body: 'You agree not to misuse the platform. In particular, you must not post false reviews; harass, abuse or threaten anyone; send spam; pretend to be someone else or misrepresent your qualifications; book appointments you don\'t intend to keep; use someone else\'s payment card; engage in fraud or money laundering; copy or scrape content; upload viruses or try to access parts of the app you\'re not allowed into; or use the app in any way that breaks the law. Violations may result in account suspension.',
  },
  {
    heading: '29. Suspending or Closing Accounts',
    body: [
      'We may limit, suspend or close an account if we reasonably believe it has broken these Terms, been used for fraud, put someone at risk, received payment chargebacks, or repeatedly missed or cancelled appointments at short notice. Where we can, we\'ll tell you why and give you a chance to respond, unless that would put others at risk or break the law. If you think we\'ve made a mistake, contact support@cerviced.co.',
      'Providers may also choose not to accept bookings from you.',
    ].join('\n\n'),
  },
  {
    heading: '30. Deleting Your Account',
    body: [
      'You can delete your account at any time in Settings. If you sign back in within 30 days, your account is restored. After that, your profile and personal details are removed. Before you delete your account, please cancel any upcoming bookings or let your providers know.',
      'We keep some records after deletion where the law requires or allows us to, for example payment and booking records for tax and accounting, with your name removed where we can.',
    ].join('\n\n'),
  },
  {
    heading: '31. For Providers',
    body: [
      'Your business. You run your own independent business and aren\'t employed by Cerviced. You\'re responsible for your services and any licences, qualifications and insurance they need, for following the law (including health and safety, consumer law and minimum-age rules), and for keeping your profile, prices, opening hours and policies accurate.',
      'Bookings and policies. You must honour bookings you accept, at the price and on the terms shown when the client booked. If you can\'t, cancel as early as you can; the client will be refunded in full. Your cancellation, deposit, late arrival and no-show policies must be fair, and must be shown on your profile before clients book.',
      'Payments and payouts. To take payments in the app you need a Stripe account, and Stripe\'s terms apply to it. Clients pay Cerviced\'s service fee on top of your price, so it\'s never taken from what you earn. After each appointment, your share is held for the payout period you choose in Payment settings, then sent to your Stripe account. Stripe then pays your bank on its own schedule. A payout is held while a client\'s refund request is open. If money is refunded or reversed after you\'ve been paid, for example a refund or a bank chargeback, it\'s taken back from your Stripe balance or from your next payout. For late arrival and no-show fees, Cerviced takes no cut, but Stripe\'s card fee comes out of your share. Tips clients leave in the app work the same way: Cerviced takes no cut, Stripe\'s card fee comes out of the tip, and the rest is sent to your Stripe account 24 hours after the client pays, whatever payout period you\'ve chosen.',
      'Taxes. You\'re responsible for your own tax, including any VAT, on the money you earn.',
      'Your clients\' information. Use the details clients share with you, including any health information, only for their bookings. Keep them secure and confidential, and follow data protection law. Don\'t add clients to marketing lists unless they\'ve agreed.',
      'Your own booking link. If you take bookings on your own booking page, you\'re responsible for that page, its terms and the bookings, payments and data handled there. Your booking link must lead to your own genuine booking page, and you must keep it up to date.',
      'Indemnity. You agree to cover Cerviced\'s reasonable losses and costs if a claim is brought against us because of your services, your content, your handling of client information, or your breach of these Terms.',
    ].join('\n\n'),
  },
  {
    heading: '32. Intellectual Property',
    body: 'All content, logos and branding on Cerviced, and the app itself, are owned by or licensed to Cerviced Ltd. You may not reproduce or distribute them, or use the Cerviced name or logo, without our written permission.',
  },
  {
    heading: '33. Availability of the App',
    body: 'We work to keep Cerviced running smoothly, but we can\'t promise it will always be available, uninterrupted or free from errors, for example during maintenance or problems with our suppliers. We may change, add or remove features. If a change significantly affects something you\'ve paid for, we\'ll tell you first. Information in the app is for general guidance, so please check anything important with the provider.',
  },
  {
    heading: '34. Limitation of Liability',
    body: [
      'If we break these Terms or fail to use reasonable care and skill, we\'re responsible for losses you suffer that were a foreseeable result. Loss is foreseeable if it\'s obvious it would happen, or if both of us knew it might happen when you started using the service. We\'re not responsible for losses that weren\'t foreseeable.',
      'If you use Cerviced as a client, we only provide the app for your personal use, so we\'re not responsible for business losses. We\'re not responsible for the services a provider gives you, which are the provider\'s responsibility, or for events outside our reasonable control.',
      'Nothing in these Terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that can\'t be limited under UK law.',
    ].join('\n\n'),
  },
  {
    heading: '35. Changes to These Terms',
    body: 'We may update these Terms, for example to reflect changes to the app, the law or how we work. We\'ll tell you in the app or by email before a significant change takes effect. Changes don\'t affect bookings you\'ve already made. If you keep using the app after a change, you accept the updated Terms. If you don\'t agree, you can delete your account.',
  },
  {
    heading: '36. How We Contact Each Other',
    body: 'We\'ll contact you in the app, by push notification, or by email to the address on your account, so please keep it up to date. You can contact us at support@cerviced.co.',
  },
  {
    heading: '37. Law and Disputes',
    body: 'If you have a complaint, please contact us first at support@cerviced.co and we\'ll try to resolve it. These Terms are governed by the law of England and Wales. If you live in Scotland or Northern Ireland, you can also bring a claim in your local courts.',
  },
  {
    heading: '38. General',
    body: 'These Terms, together with the documents they mention, are the whole agreement between you and us about using Cerviced. If a court finds part of them can\'t be enforced, the rest still applies. If we don\'t enforce a right straight away, we can still enforce it later. We may transfer our rights under these Terms to another business, and we\'ll tell you if that affects you. You may not transfer your account or your rights. No one else has rights under these Terms.',
  },
];

export default function TermsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Terms & Conditions</Text>
        <Text style={[styles.updated, { color: P.sub }]}>Last updated: 21 October 2026</Text>

        {SECTIONS.map(s => (
          <View key={s.heading} style={styles.section}>
            <Text style={[styles.heading, { color: P.text }]}>{s.heading}</Text>
            <Text style={[styles.body, { color: P.sub }]}>{s.body}</Text>
          </View>
        ))}

        <Text style={[styles.footer, { color: P.sub }]}>© 2026 Cerviced Ltd. All rights reserved.</Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 4 },
  updated: { fontSize: 12, marginBottom: 28 },
  section: { marginBottom: 22 },
  heading: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.5, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
