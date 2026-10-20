// German · settings. Typed against ../en/settings.ts; held keys are left out.
import type { AreaCatalog } from '../../types';
import type { settings as en } from '../en/settings';

export const settings: AreaCatalog<typeof en> = {
  'textSizing.title': 'Text & Größe',
  'textSizing.subtitle': 'Passe an, wie Text in der Vorschau unten aussieht.',
  'textSizing.section.preview': 'VORSCHAU',
  'textSizing.preview.heading': 'Der schnelle braune Fuchs',
  'textSizing.preview.body':
    'Deinen nächsten Termin zu buchen, sollte ganz leicht sein. So liest sich normaler Text in deiner gewählten Größe und Schrift.',
  'textSizing.section.textSize': 'TEXTGRÖSSE',
  'textSizing.section.font': 'SCHRIFT',

  'languageRegion.title': 'Sprache & Region',
  'languageRegion.subtitle': 'Lege deine bevorzugte Sprache und Region fest.',
  'languageRegion.section.language': 'SPRACHE',
  'languageRegion.languageFootnote':
    'Mit jeder neuen Übersetzung folgt mehr von Cerviced deiner gewählten Sprache. Rechtliche und gesundheitliche Informationen werden immer auf Englisch angezeigt.',
  'languageRegion.section.region': 'REGION',
  'languageRegion.regionRowDates': 'Datum {date}',
  'languageRegion.regionFootnote':
    'Datumsangaben erscheinen im Format deiner Region ({date}). Preise werden immer in Pfund (£) angezeigt, egal wo du bist.',

  'helpCentre.title': 'Hilfe-Center',
  'helpCentre.subtitle': 'Antworten auf häufige Fragen',
  'helpCentre.section.faqs': 'HÄUFIGE FRAGEN',
  'helpCentre.faq.book.q': 'Wie buche ich einen Termin?',
  'helpCentre.faq.book.a':
    'Stöbere im Tab „Entdecken“ nach Anbieter:innen, tippe auf eine:n, wähle dann einen Service und einen freien Termin. Du erhältst eine Bestätigung per Benachrichtigung.',
  'helpCentre.faq.cancel.q': 'Kann ich verschieben oder stornieren?',
  'helpCentre.faq.becca.q': 'Wie funktioniert Becca?',
  'helpCentre.faq.becca.a':
    'Becca ist deine KI-Beauty-Assistentin. Frag sie alles – sie empfiehlt Anbieter:innen, erklärt Services und hilft dir, den passenden Look zu finden.',
  'helpCentre.faq.points.q': 'Wie sammle ich Punkte?',
  'helpCentre.faq.points.a':
    'Punkte bekommst du für abgeschlossene Buchungen, Bewertungen, Empfehlungen an Freund:innen und deine erste Buchung. Du kannst sie gegen Rabatte einlösen.',
  'helpCentre.faq.payment.q': 'Sind meine Zahlungsdaten sicher?',
  'helpCentre.action.contact': 'Support kontaktieren',
  'helpCentre.action.report': 'Problem melden',
  'helpCentre.action.about': 'Über Cerviced',

  'profile.greeting': 'Hallo,',
  'profile.youFallback': 'Du',
  'profile.card.saved.label': 'Gespeichert',
  'profile.card.saved.sub': 'Deine Favoriten',
  'profile.card.bookings.label': 'Buchungen',
  'profile.card.bookings.sub': 'Termine',
  'profile.card.points.label': 'Punkte',
  'profile.card.points.sub': 'Deine Prämien',

  'profile.section.forYou': 'Für dich',
  'profile.forYou.beauty.title': 'Beauty-Profil',
  'profile.forYou.beauty.sub': 'Pflege-Erinnerungen, Haare, Haut und mehr',
  'profile.forYou.beauty.due': '{count} fällig',
  'profile.forYou.messages.title': 'Nachrichten',
  'profile.forYou.messages.sub': 'Chats mit deinen Anbieter:innen',

  'profile.section.account': 'Kontoverwaltung',
  'profile.account.account.title': 'Konto',
  'profile.account.account.sub': 'Name, Telefon, Geburtsdatum',
  'profile.account.password.title': 'Passwort ändern',
  'profile.account.password.sub': 'Zugangsdaten aktualisieren',
  'profile.account.payment.title': 'Zahlungsmethoden',
  'profile.account.payment.sub': 'Karten, Apple Pay',
  'profile.account.subscription.title': 'Abo & Abrechnung',
  'profile.account.subscription.sub': 'Tarife, Rechnungen',

  'profile.section.preferences': 'Einstellungen',
  'profile.pref.notifications.title': 'Benachrichtigungen',
  'profile.pref.notifications.sub': 'Buchungen, Erinnerungen, Marketing',
  'profile.pref.darkMode.title': 'Dunkelmodus',
  'profile.pref.darkMode.sub': 'Darstellung',
  'profile.pref.biometric.sub.available': 'Schnelle Anmeldung',
  'profile.pref.biometric.sub.unavailable': 'Auf diesem Gerät nicht verfügbar',

  'profile.section.accessibility': 'Bedienungshilfen & Support',
  'profile.access.textSizing.title': 'Text & Größe',
  'profile.access.textSizing.sub': 'Textgröße und Schrift',
  'profile.access.language.title': 'Sprache & Region',
  'profile.access.language.sub': 'Sprache und Region',
  'profile.access.help.title': 'Hilfe-Center',
  'profile.access.help.sub': 'FAQ, Support kontaktieren',

  'profile.section.professionals': 'Für Profis',
  'profile.pro.switch.title': 'Zum Anbietermodus wechseln',
  'profile.pro.switch.sub': 'Zu deinem Anbieter-Dashboard',
  'profile.pro.become.title': 'Anbieter:in werden',
  'profile.pro.become.sub': 'Biete deine Services auf Cerviced an',

  'profile.section.appInfo': 'App-Infos & Rechtliches',
  'profile.appInfo.about.title': 'Über Cerviced',
  'profile.appInfo.about.sub': 'Mission, Version',
  'profile.appInfo.report.title': 'Problem melden',
  'profile.appInfo.report.sub': 'Fehler, Feedback',

  'profile.logout': 'Abmelden',
  'profile.error.title': 'Fehler',
  'profile.error.biometric': '{method} konnte nicht aktiviert werden. Bitte versuche es erneut.',

  'profile.becomeModal.title': 'Anbieter:in werden',
  'profile.becomeModal.body':
    'Wir fügen deinem Konto ein Anbieterprofil hinzu – gleiche Anmeldung, gleiche Daten. Du kannst jederzeit zwischen Kunden- und Anbietermodus wechseln.',
  'profile.becomeModal.cta': 'Anbieterprofil einrichten',

  'profile.logoutModal.title': 'Abmelden',
  'profile.logoutModal.body': 'Möchtest du dich wirklich abmelden?',
  'profile.logoutModal.confirm': 'Ja, abmelden',

  'providerAccount.badge': 'ANBIETER',
  'providerAccount.hero.sub': 'Dein Business, deine Buchungen und wie Cerviced aussieht – alles an einem Ort.',
  'providerAccount.hero.analytics': 'Statistiken',
  'providerAccount.hero.analyticsSub': 'Umsatz & Zahlen',
  'providerAccount.hero.promotions': 'Aktionen',
  'providerAccount.hero.promotionsSub': 'Angebote & Deals',
  'providerAccount.hero.clientele': 'Kundschaft',
  'providerAccount.hero.clienteleSub': 'Stammkundschaft',

  'providerAccount.linkOnly.hero.sub': 'Dein Profil, wie Kund:innen dich finden, und dein Konto – alles an einem Ort.',
  'providerAccount.linkOnly.hero.edit': 'Profil bearbeiten',
  'providerAccount.linkOnly.hero.branding': 'Branding',
  'providerAccount.section.yourBusiness': 'DEIN BUSINESS',
  'providerAccount.linkOnly.businessInfo.title': 'Business-Infos',
  'providerAccount.linkOnly.businessInfo.sub': 'Name, Serviceart, Buchungslink, E-Mails',
  'providerAccount.linkOnly.hours.title': 'Öffnungszeiten',
  'providerAccount.linkOnly.hours.sub': 'Wird in deinem Tab „Über“ angezeigt',
  'providerAccount.linkOnly.policies.title': 'Richtlinien',
  'providerAccount.linkOnly.policies.sub': 'Optional – erscheinen in deinem Profil, wenn du sie hinzufügst',

  'providerAccount.businessProfile.title': 'Business-Profil',
  'providerAccount.businessProfile.sub': 'Profil, Details & Kommunikation',

  'providerAccount.section.myBusiness': 'MEIN BUSINESS',
  'providerAccount.myBusiness.schedule.title': 'Zeitplan',
  'providerAccount.myBusiness.schedule.sub': 'Zeiten festlegen & Tage blockieren',
  'providerAccount.myBusiness.inbox.title': 'Posteingang',
  'providerAccount.myBusiness.inbox.sub': 'Anfragen und Kundennachrichten',
  'providerAccount.myBusiness.history.title': 'Buchungsverlauf',
  'providerAccount.myBusiness.history.sub': 'Vergangene Buchungen ansehen',

  'providerAccount.pref.darkMode': 'Dunkelmodus',

  'providerAccount.section.account': 'KONTO',
  'providerAccount.account.password.title': 'Passwort ändern',
  'providerAccount.account.password.sub': 'Zugangsdaten aktualisieren',
  'providerAccount.account.info.title': 'Kontoinfos',
  'providerAccount.account.info.sub': 'Name, Telefon, Geburtsdatum & Login-E-Mail',
  'providerAccount.account.notifications.title': 'Benachrichtigungen',
  'providerAccount.account.notifications.sub': 'Buchungen, Nachrichten, Erinnerungen',

  'providerAccount.section.accessibility': 'BEDIENUNGSHILFEN & SUPPORT',
  'providerAccount.access.textSizing.title': 'Textgröße & Schrift',
  'providerAccount.access.textSizing.sub': 'Größe und Schrift',
  'providerAccount.access.language.title': 'Sprache & Region',
  'providerAccount.access.language.sub': 'Sprache und Region',
  'providerAccount.access.help.title': 'Hilfe-Center',
  'providerAccount.access.help.sub': 'FAQ, Support kontaktieren',

  'providerAccount.section.forClients': 'FÜR KUND:INNEN',
  'providerAccount.forClients.switch.title': 'Zum Kundenmodus wechseln',
  'providerAccount.forClients.switch.sub': 'Cerviced als Kund:in nutzen',
  'providerAccount.forClients.create.title': 'Kundenkonto erstellen',
  'providerAccount.forClients.create.sub': 'Richte dein Kundenprofil zum Stöbern ein',

  'providerAccount.section.appInfo': 'APP-INFOS & RECHTLICHES',
  'providerAccount.appInfo.about.title': 'Über Cerviced',
  'providerAccount.appInfo.about.sub': 'Mission, Version',
  'providerAccount.appInfo.report.title': 'Problem melden',
  'providerAccount.appInfo.report.sub': 'Fehler, Feedback',

  'providerAccount.logout': 'Abmelden',
  'providerAccount.error.title': 'Fehler',
  'providerAccount.error.biometric': '{method} konnte nicht aktiviert werden. Bitte versuche es erneut.',

  'providerAccount.clientModal.title': 'Kund:in werden',
  'providerAccount.clientModal.body':
    'Wir fügen deinem Konto ein Kundenprofil hinzu – gleiche Anmeldung, gleiche Daten. Du kannst jederzeit zwischen Anbieter- und Kundenmodus wechseln.',
  'providerAccount.clientModal.cta': 'Kundenprofil einrichten',

  'providerAccount.logoutModal.title': 'Abmelden',
  'providerAccount.logoutModal.body': 'Möchtest du dich wirklich abmelden?',
  'providerAccount.logoutModal.confirm': 'Ja, abmelden',
};
