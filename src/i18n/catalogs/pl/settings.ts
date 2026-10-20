// Polish · settings. Typed against ../en/settings.ts; held keys are left out.
import type { AreaCatalog } from '../../types';
import type { settings as en } from '../en/settings';

export const settings: AreaCatalog<typeof en> = {
  'textSizing.title': 'Tekst i rozmiar',
  'textSizing.subtitle': 'Dostosuj wygląd tekstu w podglądzie poniżej.',
  'textSizing.section.preview': 'PODGLĄD',
  'textSizing.preview.heading': 'Szybki brązowy lis',
  'textSizing.preview.body':
    'Rezerwacja kolejnej wizyty powinna być prosta. Tak będzie wyglądać zwykły tekst w wybranym rozmiarze i czcionce.',
  'textSizing.section.textSize': 'ROZMIAR TEKSTU',
  'textSizing.section.font': 'CZCIONKA',

  'languageRegion.title': 'Język i region',
  'languageRegion.subtitle': 'Ustaw preferowany język i region.',
  'languageRegion.section.language': 'JĘZYK',
  'languageRegion.languageFootnote':
    'Cerviced wyświetla się w wybranym języku. Logowanie, informacje prawne i zdrowotne, powiadomienia oraz e-maile pozostają po angielsku, a teksty specjalistów są widoczne tak, jak je napisali.',
  'languageRegion.section.region': 'REGION',
  'languageRegion.regionRowDates': 'Daty {date}',
  'languageRegion.regionFootnote':
    'Daty są wyświetlane w formacie wybranego regionu ({date}). Ceny zawsze podawane są w funtach (£), niezależnie od miejsca.',

  'helpCentre.title': 'Centrum pomocy',
  'helpCentre.subtitle': 'Odpowiedzi na częste pytania',
  'helpCentre.section.faqs': 'CZĘSTE PYTANIA',
  'helpCentre.faq.book.q': 'Jak zarezerwować wizytę?',
  'helpCentre.faq.book.a':
    'Przeglądaj specjalistów w zakładce Odkrywaj, wybierz specjalistę, a następnie usługę i dostępny termin. Otrzymasz powiadomienie z potwierdzeniem.',
  'helpCentre.faq.cancel.q': 'Czy mogę przełożyć lub odwołać wizytę?',
  'helpCentre.faq.becca.q': 'Jak działa Becca?',
  'helpCentre.faq.becca.a':
    'Becca to Twoja asystentka urody AI. Zapytaj ją o cokolwiek — poleci specjalistów, wyjaśni usługi i pomoże znaleźć odpowiedni look.',
  'helpCentre.faq.points.q': 'Jak zdobywać punkty?',
  'helpCentre.faq.points.a':
    'Punkty zdobywasz za zrealizowane rezerwacje, opinie, polecenia znajomym i pierwszą rezerwację. Możesz je wymienić na zniżki.',
  'helpCentre.faq.payment.q': 'Czy moje dane płatnicze są bezpieczne?',
  'helpCentre.action.contact': 'Skontaktuj się z pomocą',
  'helpCentre.action.report': 'Zgłoś problem',
  'helpCentre.action.about': 'O Cerviced',

  'profile.greeting': 'Cześć,',
  'profile.youFallback': 'Ty',
  'profile.card.saved.label': 'Zapisane',
  'profile.card.saved.sub': 'Twoje ulubione',
  'profile.card.bookings.label': 'Rezerwacje',
  'profile.card.bookings.sub': 'Wizyty',
  'profile.card.points.label': 'Punkty',
  'profile.card.points.sub': 'Twoje nagrody',

  'profile.section.forYou': 'Dla Ciebie',
  'profile.forYou.beauty.title': 'Profil urody',
  'profile.forYou.beauty.sub': 'Przypomnienia o pielęgnacji, włosy, skóra i nie tylko',
  'profile.forYou.beauty.due': 'Do zrobienia: {count}',
  'profile.forYou.messages.title': 'Wiadomości',
  'profile.forYou.messages.sub': 'Czaty ze specjalistami',

  'profile.section.account': 'Zarządzanie kontem',
  'profile.account.account.title': 'Konto',
  'profile.account.account.sub': 'Imię, telefon, data urodzenia',
  'profile.account.password.title': 'Zmień hasło',
  'profile.account.password.sub': 'Zaktualizuj dane logowania',
  'profile.account.payment.title': 'Metody płatności',
  'profile.account.payment.sub': 'Karty, Apple Pay',
  'profile.account.subscription.title': 'Subskrypcja i płatności',
  'profile.account.subscription.sub': 'Plany, faktury',

  'profile.section.preferences': 'Preferencje',
  'profile.pref.notifications.title': 'Powiadomienia',
  'profile.pref.notifications.sub': 'Rezerwacje, przypomnienia, marketing',
  'profile.pref.darkMode.title': 'Tryb ciemny',
  'profile.pref.darkMode.sub': 'Wygląd',
  'profile.pref.biometric.sub.available': 'Szybkie logowanie',
  'profile.pref.biometric.sub.unavailable': 'Niedostępne na tym urządzeniu',

  'profile.section.accessibility': 'Dostępność i pomoc',
  'profile.access.textSizing.title': 'Tekst i rozmiar',
  'profile.access.textSizing.sub': 'Rozmiar tekstu i czcionka',
  'profile.access.language.title': 'Język i region',
  'profile.access.language.sub': 'Język i region',
  'profile.access.help.title': 'Centrum pomocy',
  'profile.access.help.sub': 'Częste pytania, kontakt z pomocą',

  'profile.section.professionals': 'Dla profesjonalistów',
  'profile.pro.switch.title': 'Przełącz na tryb specjalisty',
  'profile.pro.switch.sub': 'Przejdź do panelu specjalisty',
  'profile.pro.become.title': 'Zostań specjalistą',
  'profile.pro.become.sub': 'Dodaj swoje usługi do Cerviced',

  'profile.section.appInfo': 'Informacje o aplikacji i prawne',
  'profile.appInfo.about.title': 'O Cerviced',
  'profile.appInfo.about.sub': 'Misja, wersja',
  'profile.appInfo.report.title': 'Zgłoś problem',
  'profile.appInfo.report.sub': 'Błędy, opinie',

  'profile.logout': 'Wyloguj się',
  'profile.error.title': 'Błąd',
  'profile.error.biometric': 'Nie udało się włączyć: {method}. Spróbuj ponownie.',

  'profile.becomeModal.title': 'Zostań specjalistą',
  'profile.becomeModal.body':
    'Dodamy profil specjalisty do Twojego obecnego konta — ten sam login, te same dane. W każdej chwili możesz przełączać się między trybem klienta i specjalisty.',
  'profile.becomeModal.cta': 'Utwórz profil specjalisty',

  'profile.logoutModal.title': 'Wyloguj się',
  'profile.logoutModal.body': 'Czy na pewno chcesz się wylogować?',
  'profile.logoutModal.confirm': 'Tak, wyloguj',

  'providerAccount.badge': 'SPECJALISTA',
  'providerAccount.hero.sub': 'Twoja firma, rezerwacje i wygląd Cerviced — wszystko w jednym miejscu.',
  'providerAccount.hero.analytics': 'Analityka',
  'providerAccount.hero.analyticsSub': 'Przychody i statystyki',
  'providerAccount.hero.promotions': 'Promocje',
  'providerAccount.hero.promotionsSub': 'Oferty i rabaty',
  'providerAccount.hero.clientele': 'Klienci',
  'providerAccount.hero.clienteleSub': 'Stali klienci',

  'providerAccount.linkOnly.hero.sub': 'Twój profil, to, jak znajdują Cię klienci, i Twoje konto — wszystko w jednym miejscu.',
  'providerAccount.linkOnly.hero.edit': 'Edytuj profil',
  'providerAccount.linkOnly.hero.branding': 'Wizerunek marki',
  'providerAccount.section.yourBusiness': 'TWOJA FIRMA',
  'providerAccount.linkOnly.businessInfo.title': 'Informacje o firmie',
  'providerAccount.linkOnly.businessInfo.sub': 'Nazwa, rodzaj usług, link do rezerwacji, e-maile',
  'providerAccount.linkOnly.hours.title': 'Godziny otwarcia',
  'providerAccount.linkOnly.hours.sub': 'Widoczne w zakładce O mnie',
  'providerAccount.linkOnly.policies.title': 'Zasady',
  'providerAccount.linkOnly.policies.sub': 'Opcjonalne — widoczne w profilu, jeśli je dodasz',

  'providerAccount.businessProfile.title': 'Profil firmy',
  'providerAccount.businessProfile.sub': 'Profil, szczegóły i komunikacja',

  'providerAccount.section.myBusiness': 'MOJA FIRMA',
  'providerAccount.myBusiness.schedule.title': 'Grafik',
  'providerAccount.myBusiness.schedule.sub': 'Ustaw godziny i zablokuj dni',
  'providerAccount.myBusiness.inbox.title': 'Skrzynka',
  'providerAccount.myBusiness.inbox.sub': 'Zapytania i wiadomości od klientów',
  'providerAccount.myBusiness.history.title': 'Historia rezerwacji',
  'providerAccount.myBusiness.history.sub': 'Zobacz poprzednie rezerwacje',

  'providerAccount.pref.darkMode': 'Tryb ciemny',

  'providerAccount.section.account': 'KONTO',
  'providerAccount.account.password.title': 'Zmień hasło',
  'providerAccount.account.password.sub': 'Zaktualizuj dane logowania',
  'providerAccount.account.info.title': 'Dane konta',
  'providerAccount.account.info.sub': 'Imię, telefon, data urodzenia i e-mail logowania',
  'providerAccount.account.notifications.title': 'Powiadomienia',
  'providerAccount.account.notifications.sub': 'Rezerwacje, wiadomości, przypomnienia',

  'providerAccount.section.accessibility': 'DOSTĘPNOŚĆ I POMOC',
  'providerAccount.access.textSizing.title': 'Rozmiar tekstu i czcionka',
  'providerAccount.access.textSizing.sub': 'Rozmiar i czcionka',
  'providerAccount.access.language.title': 'Język i region',
  'providerAccount.access.language.sub': 'Język i region',
  'providerAccount.access.help.title': 'Centrum pomocy',
  'providerAccount.access.help.sub': 'Częste pytania, kontakt z pomocą',

  'providerAccount.section.forClients': 'DLA KLIENTÓW',
  'providerAccount.forClients.switch.title': 'Przełącz na tryb klienta',
  'providerAccount.forClients.switch.sub': 'Przeglądaj Cerviced jako klient',
  'providerAccount.forClients.create.title': 'Utwórz konto klienta',
  'providerAccount.forClients.create.sub': 'Utwórz profil klienta, aby przeglądać',

  'providerAccount.section.appInfo': 'INFORMACJE O APLIKACJI I PRAWNE',
  'providerAccount.appInfo.about.title': 'O Cerviced',
  'providerAccount.appInfo.about.sub': 'Misja, wersja',
  'providerAccount.appInfo.report.title': 'Zgłoś problem',
  'providerAccount.appInfo.report.sub': 'Błędy, opinie',

  'providerAccount.logout': 'Wyloguj się',
  'providerAccount.error.title': 'Błąd',
  'providerAccount.error.biometric': 'Nie udało się włączyć: {method}. Spróbuj ponownie.',

  'providerAccount.clientModal.title': 'Zostań klientem',
  'providerAccount.clientModal.body':
    'Dodamy profil klienta do Twojego obecnego konta — ten sam login, te same dane. W każdej chwili możesz przełączać się między trybem specjalisty i klienta.',
  'providerAccount.clientModal.cta': 'Utwórz profil klienta',

  'providerAccount.logoutModal.title': 'Wyloguj się',
  'providerAccount.logoutModal.body': 'Czy na pewno chcesz się wylogować?',
  'providerAccount.logoutModal.confirm': 'Tak, wyloguj',
};
