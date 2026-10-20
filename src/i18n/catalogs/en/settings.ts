// English · settings — Text & Sizing, Language & Region, Help Centre, client Profile tab, provider Account tab.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const settings = {

  // ── Text & Sizing screen ────────────────────────────────────────────────────
  'textSizing.title': 'Text & Sizing',
  'textSizing.subtitle': 'Adjust how text looks across your preview below.',
  'textSizing.section.preview': 'PREVIEW',
  'textSizing.preview.heading': 'The quick brown fox',
  'textSizing.preview.body':
    'Booking your next appointment should feel effortless. This is how everyday text will read at your chosen size and font.',
  'textSizing.section.textSize': 'TEXT SIZE',
  'textSizing.section.font': 'FONT',

  // ── Language & Region screen ────────────────────────────────────────────────
  'languageRegion.title': 'Language & Region',
  'languageRegion.subtitle': 'Set your preferred language and region.',
  'languageRegion.section.language': 'LANGUAGE',
  'languageRegion.languageFootnote':
    "Cerviced follows your chosen language. Sign-in, legal and health information, notifications and emails stay in English, and providers' own words appear as they wrote them.",
  'languageRegion.section.region': 'REGION',
  'languageRegion.regionRowDates': 'Dates {date}',
  'languageRegion.regionFootnote':
    "Dates display in your selected region's format ({date}). Prices are always shown in pounds (£), wherever you are.",

  // ── Help Centre screen ──────────────────────────────────────────────────────
  'helpCentre.title': 'Help Centre',
  'helpCentre.subtitle': 'Answers to common questions',
  'helpCentre.section.faqs': 'FAQS',

  'helpCentre.faq.book.q': 'How do I book an appointment?',
  'helpCentre.faq.book.a':
    "Browse providers on the Explore tab, tap a provider, then select a service and available time slot. You'll receive a confirmation notification.",
  'helpCentre.faq.cancel.q': 'Can I reschedule or cancel?',
  // HELD IN ENGLISH (cancellation / refund policy) — see DO_NOT_TRANSLATE.
  'helpCentre.faq.cancel.a':
    "Yes. Go to Bookings, tap your appointment, and choose Reschedule or Cancel. Cancellations may be subject to the provider's policy.",
  'helpCentre.faq.becca.q': 'How does Becca work?',
  'helpCentre.faq.becca.a':
    'Becca is your AI beauty assistant. Ask her anything — she can recommend providers, explain services, and help you find the right look.',
  'helpCentre.faq.points.q': 'How do I earn points?',
  'helpCentre.faq.points.a':
    'You earn points by completing bookings, leaving reviews, referring friends, and on your first booking. Points can be redeemed for discounts.',
  'helpCentre.faq.payment.q': 'Is my payment info secure?',
  // HELD IN ENGLISH (payment handling) — see DO_NOT_TRANSLATE.
  'helpCentre.faq.payment.a':
    'All payment data is encrypted end-to-end. We never store full card numbers — payments are processed via PCI-DSS compliant providers.',

  'helpCentre.action.contact': 'Contact Support',
  'helpCentre.action.report': 'Report a Problem',
  // HELD IN ENGLISH (legal reference) — see DO_NOT_TRANSLATE.
  'helpCentre.action.terms': 'Terms & Conditions',
  'helpCentre.action.about': 'About Cerviced',

  // ── Client Profile screen ────────────────────────────────────────────────────
  'profile.greeting': 'Hello,',
  'profile.youFallback': 'You',

  'profile.card.saved.label': 'Saved',
  'profile.card.saved.sub': 'Your Favourites',
  'profile.card.bookings.label': 'Bookings',
  'profile.card.bookings.sub': 'Appointments',
  'profile.card.points.label': 'Points',
  'profile.card.points.sub': 'Your Rewards',

  'profile.section.forYou': 'For You',
  'profile.forYou.beauty.title': 'Beauty Profile',
  'profile.forYou.beauty.sub': 'Maintenance reminders, hair, skin and more',
  'profile.forYou.beauty.due': '{count} due',
  'profile.forYou.messages.title': 'Messages',
  'profile.forYou.messages.sub': 'Chats with your providers',

  'profile.section.account': 'Account Management',
  'profile.account.account.title': 'Account',
  'profile.account.account.sub': 'Name, phone, date of birth',
  'profile.account.password.title': 'Change Password',
  'profile.account.password.sub': 'Update credentials',
  'profile.account.payment.title': 'Payment Methods',
  'profile.account.payment.sub': 'Cards, Apple Pay',
  'profile.account.subscription.title': 'Subscription & Billing',
  'profile.account.subscription.sub': 'Plans, invoices',

  'profile.section.preferences': 'Preferences',
  'profile.pref.notifications.title': 'Notifications',
  'profile.pref.notifications.sub': 'Bookings, reminders, marketing',
  'profile.pref.darkMode.title': 'Dark Mode',
  'profile.pref.darkMode.sub': 'Appearance',
  'profile.pref.biometric.sub.available': 'Quick sign-in',
  'profile.pref.biometric.sub.unavailable': 'Not available on this device',

  'profile.section.accessibility': 'Accessibility & Support',
  'profile.access.textSizing.title': 'Text & Sizing',
  'profile.access.textSizing.sub': 'Text size and font',
  'profile.access.language.title': 'Language & Region',
  'profile.access.language.sub': 'Language and region',
  'profile.access.help.title': 'Help Centre',
  'profile.access.help.sub': 'FAQs, contact support',

  'profile.section.professionals': 'For Professionals',
  'profile.pro.switch.title': 'Switch to Provider Mode',
  'profile.pro.switch.sub': 'Go to your provider dashboard',
  'profile.pro.become.title': 'Become a Provider',
  'profile.pro.become.sub': 'List your services on Cerviced',

  'profile.section.appInfo': 'App Info & Legal',
  'profile.appInfo.about.title': 'About Cerviced',
  'profile.appInfo.about.sub': 'Mission, version',
  // HELD IN ENGLISH (legal reference) — see DO_NOT_TRANSLATE.
  'profile.appInfo.terms.title': 'Terms & Conditions',
  'profile.appInfo.terms.sub': 'Legal info',
  'profile.appInfo.report.title': 'Report a Problem',
  'profile.appInfo.report.sub': 'Bugs, feedback',

  'profile.logout': 'Log Out',
  'profile.error.title': 'Error',
  'profile.error.biometric': 'Could not enable {method}. Please try again.',

  'profile.becomeModal.title': 'Become a Provider',
  'profile.becomeModal.body':
    "We'll add a provider profile to your current account — same login, same details. You can switch between client and provider mode any time.",
  'profile.becomeModal.cta': 'Set up my provider profile',

  'profile.logoutModal.title': 'Log Out',
  'profile.logoutModal.body': 'Are you sure you want to log out?',
  'profile.logoutModal.confirm': 'Yes, log out',

  // ── Provider Account screen ──────────────────────────────────────────────────
  // The provider hat's own settings surface. The business NAME shown in the hero
  // is provider-written and rendered via <DynamicText>, not a key here.
  'providerAccount.badge': 'PROVIDER',
  'providerAccount.hero.sub':
    'Your business, bookings and how Cerviced looks & feels — all in one place.',
  'providerAccount.hero.analytics': 'Analytics',
  'providerAccount.hero.analyticsSub': 'Revenue & Stats',
  'providerAccount.hero.promotions': 'Promotions',
  'providerAccount.hero.promotionsSub': 'Offers & Deals',
  'providerAccount.hero.clientele': 'Clientele',
  'providerAccount.hero.clienteleSub': 'Loyal Clients',

  // Link-only providers (book on their own page) — this screen is their
  // Profile tab, so the hero leads with their profile instead of bookings.
  'providerAccount.linkOnly.hero.sub':
    'Your profile, how clients find you, and your account — all in one place.',
  'providerAccount.linkOnly.hero.edit': 'Edit profile',
  'providerAccount.linkOnly.hero.branding': 'Branding',
  'providerAccount.section.yourBusiness': 'YOUR BUSINESS',
  'providerAccount.linkOnly.businessInfo.title': 'Business Info',
  'providerAccount.linkOnly.businessInfo.sub': 'Name, service type, booking link, emails',
  'providerAccount.linkOnly.hours.title': 'Opening Hours',
  'providerAccount.linkOnly.hours.sub': 'Shown on your About tab',
  'providerAccount.linkOnly.policies.title': 'Policies',
  'providerAccount.linkOnly.policies.sub': 'Optional — shown on your profile if added',

  'providerAccount.businessProfile.title': 'Business Profile',
  'providerAccount.businessProfile.sub': 'Profile, details & communications',

  'providerAccount.section.myBusiness': 'MY BUSINESS',
  'providerAccount.myBusiness.schedule.title': 'Schedule',
  'providerAccount.myBusiness.schedule.sub': 'Set your hours & block dates',
  'providerAccount.myBusiness.inbox.title': 'Inbox',
  'providerAccount.myBusiness.inbox.sub': 'Enquiries and client messages',
  'providerAccount.myBusiness.history.title': 'Booking History',
  'providerAccount.myBusiness.history.sub': 'View past bookings',

  'providerAccount.pref.darkMode': 'Dark Mode',

  'providerAccount.section.account': 'ACCOUNT',
  'providerAccount.account.password.title': 'Change Password',
  'providerAccount.account.password.sub': 'Update credentials',
  'providerAccount.account.info.title': 'Account Info',
  'providerAccount.account.info.sub': 'Name, phone, DOB & login email',
  'providerAccount.account.notifications.title': 'Notifications',
  'providerAccount.account.notifications.sub': 'Bookings, messages, reminders',

  'providerAccount.section.accessibility': 'ACCESSIBILITY & SUPPORT',
  'providerAccount.access.textSizing.title': 'Text Size & Font',
  'providerAccount.access.textSizing.sub': 'Size and font',
  'providerAccount.access.language.title': 'Language & Region',
  'providerAccount.access.language.sub': 'Language and region',
  'providerAccount.access.help.title': 'Help Centre',
  'providerAccount.access.help.sub': 'FAQs, contact support',

  'providerAccount.section.forClients': 'FOR CLIENTS',
  'providerAccount.forClients.switch.title': 'Switch to Client Mode',
  'providerAccount.forClients.switch.sub': 'Browse Cerviced as a client',
  'providerAccount.forClients.create.title': 'Create Client Account',
  'providerAccount.forClients.create.sub': 'Set up your client profile to browse',

  'providerAccount.section.appInfo': 'APP INFO & LEGAL',
  'providerAccount.appInfo.about.title': 'About Cerviced',
  'providerAccount.appInfo.about.sub': 'Mission, version',
  // HELD IN ENGLISH (legal reference) — see DO_NOT_TRANSLATE.
  'providerAccount.appInfo.terms.title': 'Terms & Conditions',
  'providerAccount.appInfo.terms.sub': 'Legal info',
  'providerAccount.appInfo.report.title': 'Report a Problem',
  'providerAccount.appInfo.report.sub': 'Bugs, feedback',

  'providerAccount.logout': 'Log Out',
  'providerAccount.error.title': 'Error',
  'providerAccount.error.biometric': 'Could not enable {method}. Please try again.',

  'providerAccount.clientModal.title': 'Become a Client',
  'providerAccount.clientModal.body':
    "We'll add a client profile to your current account — same login, same details. You can switch between provider and client mode any time.",
  'providerAccount.clientModal.cta': 'Set up my client profile',

  'providerAccount.logoutModal.title': 'Log Out',
  'providerAccount.logoutModal.body': 'Are you sure you want to log out?',
  'providerAccount.logoutModal.confirm': 'Yes, log out',
} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const settingsHeld: readonly (keyof typeof settings)[] = [
  'helpCentre.faq.cancel.a', // cancellation / refund policy
  'helpCentre.faq.payment.a', // payment handling
  'helpCentre.action.terms', // legal reference
  'profile.appInfo.terms.title', // legal reference
  'profile.appInfo.terms.sub', // legal reference
  'providerAccount.appInfo.terms.title', // legal reference
  'providerAccount.appInfo.terms.sub', // legal reference
];
