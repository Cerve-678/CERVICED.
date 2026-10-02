import type { Catalog } from '../types';

// French UI catalog (machine-quality translations of app-authored copy).
//
// Deliberately INCOMPLETE: keys listed in DO_NOT_TRANSLATE (legal / refund /
// payment / health copy) are intentionally absent, so they fall back to the
// English source and are never shown machine-translated. The resolver enforces
// that regardless — this omission just keeps the file honest about it.
export const fr: Catalog = {
  'common.cancel': 'Annuler',

  'textSizing.title': 'Texte et taille',
  'textSizing.subtitle': "Ajustez l'apparence du texte dans l'aperçu ci-dessous.",
  'textSizing.section.preview': 'APERÇU',
  'textSizing.preview.heading': 'Le vif renard brun',
  'textSizing.preview.body':
    'Réserver votre prochain rendez-vous devrait être simple. Voici comment le texte courant apparaîtra avec la taille et la police que vous choisissez.',
  'textSizing.section.textSize': 'TAILLE DU TEXTE',
  'textSizing.section.font': 'POLICE',

  'languageRegion.title': 'Langue et région',
  'languageRegion.subtitle': 'Choisissez votre langue et votre région préférées.',
  'languageRegion.section.language': 'LANGUE',
  'languageRegion.languageFootnote':
    "Au fur et à mesure du déploiement des traductions, une plus grande partie de Cerviced suivra la langue que vous choisissez. Les informations légales et de santé sont toujours affichées en anglais.",
  'languageRegion.section.region': 'RÉGION',
  'languageRegion.regionRowDates': 'Dates {date}',
  'languageRegion.regionFootnote':
    'Les dates sont affichées au format de votre région ({date}). Les prix sont toujours indiqués en livres (£), où que vous soyez.',

  'helpCentre.title': "Centre d'aide",
  'helpCentre.subtitle': 'Réponses aux questions fréquentes',
  'helpCentre.section.faqs': 'QUESTIONS FRÉQUENTES',

  'helpCentre.faq.book.q': 'Comment réserver un rendez-vous ?',
  'helpCentre.faq.book.a':
    "Parcourez les professionnels dans l'onglet Explorer, appuyez sur un professionnel, puis sélectionnez un service et un créneau disponible. Vous recevrez une notification de confirmation.",
  'helpCentre.faq.cancel.q': 'Puis-je reporter ou annuler ?',
  'helpCentre.faq.becca.q': 'Comment fonctionne Becca ?',
  'helpCentre.faq.becca.a':
    "Becca est votre assistante beauté dotée d'une IA. Posez-lui n'importe quelle question : elle peut recommander des professionnels, expliquer des services et vous aider à trouver le bon look.",
  'helpCentre.faq.points.q': 'Comment gagner des points ?',
  'helpCentre.faq.points.a':
    'Vous gagnez des points en effectuant des réservations, en laissant des avis, en parrainant des amis et lors de votre première réservation. Les points peuvent être échangés contre des réductions.',
  'helpCentre.faq.payment.q': 'Mes informations de paiement sont-elles sécurisées ?',

  'helpCentre.action.contact': 'Contacter le support',
  'helpCentre.action.report': 'Signaler un problème',
  'helpCentre.action.about': 'À propos de Cerviced',

  'profile.greeting': 'Bonjour,',
  'profile.youFallback': 'Vous',

  'profile.card.saved.label': 'Enregistrés',
  'profile.card.saved.sub': 'Vos favoris',
  'profile.card.bookings.label': 'Réservations',
  'profile.card.bookings.sub': 'Rendez-vous',
  'profile.card.points.label': 'Points',
  'profile.card.points.sub': 'Vos récompenses',

  'profile.section.account': 'Gestion du compte',
  'profile.account.messages.title': 'Messages',
  'profile.account.messages.sub': 'Discussions avec vos professionnels',
  'profile.account.account.title': 'Compte',
  'profile.account.account.sub': 'Nom, téléphone, date de naissance',
  'profile.account.beauty.title': 'Profil beauté',
  'profile.account.beauty.sub': 'Cheveux, peau, centres d\'intérêt',
  'profile.account.password.title': 'Changer le mot de passe',
  'profile.account.password.sub': 'Mettre à jour les identifiants',
  'profile.account.payment.title': 'Moyens de paiement',
  'profile.account.payment.sub': 'Cartes, Apple Pay',
  'profile.account.subscription.title': 'Abonnement et facturation',
  'profile.account.subscription.sub': 'Forfaits, factures',

  'profile.section.preferences': 'Préférences',
  'profile.pref.notifications.title': 'Notifications',
  'profile.pref.notifications.sub': 'Réservations, rappels, marketing',
  'profile.pref.darkMode.title': 'Mode sombre',
  'profile.pref.darkMode.sub': 'Apparence',
  'profile.pref.biometric.sub.available': 'Connexion rapide',
  'profile.pref.biometric.sub.unavailable': 'Non disponible sur cet appareil',

  'profile.section.accessibility': 'Accessibilité et support',
  'profile.access.textSizing.title': 'Texte et taille',
  'profile.access.textSizing.sub': 'Taille et police du texte',
  'profile.access.language.title': 'Langue et région',
  'profile.access.language.sub': 'Langue et région',
  'profile.access.help.title': "Centre d'aide",
  'profile.access.help.sub': 'Questions fréquentes, contacter le support',

  'profile.section.professionals': 'Pour les professionnels',
  'profile.pro.switch.title': 'Passer en mode professionnel',
  'profile.pro.switch.sub': 'Accéder à votre tableau de bord professionnel',
  'profile.pro.become.title': 'Devenir professionnel',
  'profile.pro.become.sub': 'Proposez vos services sur Cerviced',

  'profile.section.appInfo': "Infos de l'app et mentions légales",
  'profile.appInfo.about.title': 'À propos de Cerviced',
  'profile.appInfo.about.sub': 'Mission, version',
  'profile.appInfo.report.title': 'Signaler un problème',
  'profile.appInfo.report.sub': 'Bugs, commentaires',

  'profile.logout': 'Se déconnecter',
  'profile.error.title': 'Erreur',
  'profile.error.biometric': "Impossible d'activer {method}. Veuillez réessayer.",

  'profile.becomeModal.title': 'Devenir professionnel',
  'profile.becomeModal.body':
    'Nous ajouterons un profil professionnel à votre compte actuel — même identifiant, mêmes informations. Vous pouvez basculer entre le mode client et le mode professionnel à tout moment.',
  'profile.becomeModal.cta': 'Configurer mon profil professionnel',

  'profile.logoutModal.title': 'Se déconnecter',
  'profile.logoutModal.body': 'Voulez-vous vraiment vous déconnecter ?',
  'profile.logoutModal.confirm': 'Oui, se déconnecter',

  // Écran Compte professionnel. Les deux clés « Conditions » sont volontairement
  // absentes (maintenues en anglais par DO_NOT_TRANSLATE) ; le nom de
  // l'entreprise est rédigé par le professionnel et géré par DynamicText.
  'providerAccount.badge': 'PROFESSIONNEL',
  'providerAccount.hero.sub':
    'Votre entreprise, vos réservations et l\'apparence de Cerviced, le tout au même endroit.',
  'providerAccount.hero.analytics': 'Statistiques',
  'providerAccount.hero.analyticsSub': 'Revenus et chiffres',
  'providerAccount.hero.promotions': 'Promotions',
  'providerAccount.hero.promotionsSub': 'Offres et réductions',
  'providerAccount.hero.clientele': 'Clientèle',
  'providerAccount.hero.clienteleSub': 'Clients fidèles',

  'providerAccount.businessProfile.title': "Profil de l'entreprise",
  'providerAccount.businessProfile.sub': 'Profil, informations et communications',

  'providerAccount.section.myBusiness': 'MON ENTREPRISE',
  'providerAccount.myBusiness.schedule.title': 'Horaires',
  'providerAccount.myBusiness.schedule.sub': 'Définissez vos heures et bloquez des dates',
  'providerAccount.myBusiness.inbox.title': 'Boîte de réception',
  'providerAccount.myBusiness.inbox.sub': 'Demandes et messages des clients',
  'providerAccount.myBusiness.history.title': 'Historique des réservations',
  'providerAccount.myBusiness.history.sub': 'Voir les réservations passées',

  'providerAccount.pref.darkMode': 'Mode sombre',

  'providerAccount.section.account': 'COMPTE',
  'providerAccount.account.password.title': 'Changer le mot de passe',
  'providerAccount.account.password.sub': 'Mettre à jour les identifiants',
  'providerAccount.account.info.title': 'Informations du compte',
  'providerAccount.account.info.sub': 'Nom, téléphone, date de naissance et e-mail de connexion',
  'providerAccount.account.notifications.title': 'Notifications',
  'providerAccount.account.notifications.sub': 'Réservations, messages, rappels',

  'providerAccount.section.accessibility': 'ACCESSIBILITÉ ET SUPPORT',
  'providerAccount.access.textSizing.title': 'Taille et police du texte',
  'providerAccount.access.textSizing.sub': 'Taille et police',
  'providerAccount.access.language.title': 'Langue et région',
  'providerAccount.access.language.sub': 'Langue et région',
  'providerAccount.access.help.title': "Centre d'aide",
  'providerAccount.access.help.sub': 'Questions fréquentes, contacter le support',

  'providerAccount.section.forClients': 'POUR LES CLIENTS',
  'providerAccount.forClients.switch.title': 'Passer en mode client',
  'providerAccount.forClients.switch.sub': 'Parcourez Cerviced en tant que client',
  'providerAccount.forClients.create.title': 'Créer un compte client',
  'providerAccount.forClients.create.sub': 'Configurez votre profil client pour explorer',

  'providerAccount.section.appInfo': "INFOS DE L'APP ET MENTIONS LÉGALES",
  'providerAccount.appInfo.about.title': 'À propos de Cerviced',
  'providerAccount.appInfo.about.sub': 'Mission, version',
  'providerAccount.appInfo.report.title': 'Signaler un problème',
  'providerAccount.appInfo.report.sub': 'Bugs, commentaires',

  'providerAccount.logout': 'Se déconnecter',
  'providerAccount.error.title': 'Erreur',
  'providerAccount.error.biometric': "Impossible d'activer {method}. Veuillez réessayer.",

  'providerAccount.clientModal.title': 'Devenir client',
  'providerAccount.clientModal.body':
    'Nous ajouterons un profil client à votre compte actuel — même identifiant, mêmes informations. Vous pouvez basculer entre le mode professionnel et le mode client à tout moment.',
  'providerAccount.clientModal.cta': 'Configurer mon profil client',

  'providerAccount.logoutModal.title': 'Se déconnecter',
  'providerAccount.logoutModal.body': 'Voulez-vous vraiment vous déconnecter ?',
  'providerAccount.logoutModal.confirm': 'Oui, se déconnecter',
};
