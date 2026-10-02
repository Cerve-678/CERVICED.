import type { Catalog } from '../types';

// Spanish UI catalog (machine-quality translations of app-authored copy).
//
// Deliberately INCOMPLETE: keys listed in DO_NOT_TRANSLATE (legal / refund /
// payment / health copy) are intentionally absent, so they fall back to the
// English source and are never shown machine-translated. The resolver enforces
// that regardless — this omission just keeps the file honest about it.
export const es: Catalog = {
  'common.cancel': 'Cancelar',

  'textSizing.title': 'Texto y tamaño',
  'textSizing.subtitle': 'Ajusta cómo se ve el texto en la vista previa de abajo.',
  'textSizing.section.preview': 'VISTA PREVIA',
  'textSizing.preview.heading': 'El veloz zorro marrón',
  'textSizing.preview.body':
    'Reservar tu próxima cita debería ser sencillo. Así se verá el texto habitual con el tamaño y la fuente que elijas.',
  'textSizing.section.textSize': 'TAMAÑO DEL TEXTO',
  'textSizing.section.font': 'FUENTE',

  'languageRegion.title': 'Idioma y región',
  'languageRegion.subtitle': 'Elige tu idioma y región preferidos.',
  'languageRegion.section.language': 'IDIOMA',
  'languageRegion.languageFootnote':
    'A medida que se publiquen las traducciones, más partes de Cerviced seguirán el idioma que elijas. La información legal y de salud siempre se muestra en inglés.',
  'languageRegion.section.region': 'REGIÓN',
  'languageRegion.regionRowDates': 'Fechas {date}',
  'languageRegion.regionFootnote':
    'Las fechas se muestran en el formato de tu región ({date}). Los precios siempre se muestran en libras (£), estés donde estés.',

  'helpCentre.title': 'Centro de ayuda',
  'helpCentre.subtitle': 'Respuestas a preguntas frecuentes',
  'helpCentre.section.faqs': 'PREGUNTAS FRECUENTES',

  'helpCentre.faq.book.q': '¿Cómo reservo una cita?',
  'helpCentre.faq.book.a':
    'Explora los profesionales en la pestaña Explorar, toca un profesional y luego selecciona un servicio y un horario disponible. Recibirás una notificación de confirmación.',
  'helpCentre.faq.cancel.q': '¿Puedo reprogramar o cancelar?',
  'helpCentre.faq.becca.q': '¿Cómo funciona Becca?',
  'helpCentre.faq.becca.a':
    'Becca es tu asistente de belleza con IA. Pregúntale lo que quieras: puede recomendar profesionales, explicar servicios y ayudarte a encontrar el look ideal.',
  'helpCentre.faq.points.q': '¿Cómo gano puntos?',
  'helpCentre.faq.points.a':
    'Ganas puntos al completar reservas, dejar reseñas, recomendar a amigos y con tu primera reserva. Los puntos se pueden canjear por descuentos.',
  'helpCentre.faq.payment.q': '¿Mi información de pago es segura?',

  'helpCentre.action.contact': 'Contactar con soporte',
  'helpCentre.action.report': 'Informar de un problema',
  'helpCentre.action.about': 'Acerca de Cerviced',

  'profile.greeting': 'Hola,',
  'profile.youFallback': 'Tú',

  'profile.card.saved.label': 'Guardados',
  'profile.card.saved.sub': 'Tus favoritos',
  'profile.card.bookings.label': 'Reservas',
  'profile.card.bookings.sub': 'Citas',
  'profile.card.points.label': 'Puntos',
  'profile.card.points.sub': 'Tus recompensas',

  'profile.section.account': 'Gestión de la cuenta',
  'profile.account.messages.title': 'Mensajes',
  'profile.account.messages.sub': 'Chats con tus profesionales',
  'profile.account.account.title': 'Cuenta',
  'profile.account.account.sub': 'Nombre, teléfono, fecha de nacimiento',
  'profile.account.beauty.title': 'Perfil de belleza',
  'profile.account.beauty.sub': 'Cabello, piel, intereses',
  'profile.account.password.title': 'Cambiar contraseña',
  'profile.account.password.sub': 'Actualizar credenciales',
  'profile.account.payment.title': 'Métodos de pago',
  'profile.account.payment.sub': 'Tarjetas, Apple Pay',
  'profile.account.subscription.title': 'Suscripción y facturación',
  'profile.account.subscription.sub': 'Planes, facturas',

  'profile.section.preferences': 'Preferencias',
  'profile.pref.notifications.title': 'Notificaciones',
  'profile.pref.notifications.sub': 'Reservas, recordatorios, marketing',
  'profile.pref.darkMode.title': 'Modo oscuro',
  'profile.pref.darkMode.sub': 'Apariencia',
  'profile.pref.biometric.sub.available': 'Inicio de sesión rápido',
  'profile.pref.biometric.sub.unavailable': 'No disponible en este dispositivo',

  'profile.section.accessibility': 'Accesibilidad y soporte',
  'profile.access.textSizing.title': 'Texto y tamaño',
  'profile.access.textSizing.sub': 'Tamaño y fuente del texto',
  'profile.access.language.title': 'Idioma y región',
  'profile.access.language.sub': 'Idioma y región',
  'profile.access.help.title': 'Centro de ayuda',
  'profile.access.help.sub': 'Preguntas frecuentes, contactar con soporte',

  'profile.section.professionals': 'Para profesionales',
  'profile.pro.switch.title': 'Cambiar a modo profesional',
  'profile.pro.switch.sub': 'Ir a tu panel de profesional',
  'profile.pro.become.title': 'Hazte profesional',
  'profile.pro.become.sub': 'Publica tus servicios en Cerviced',

  'profile.section.appInfo': 'Información de la app y aspectos legales',
  'profile.appInfo.about.title': 'Acerca de Cerviced',
  'profile.appInfo.about.sub': 'Misión, versión',
  'profile.appInfo.report.title': 'Informar de un problema',
  'profile.appInfo.report.sub': 'Errores, comentarios',

  'profile.logout': 'Cerrar sesión',
  'profile.error.title': 'Error',
  'profile.error.biometric': 'No se pudo activar {method}. Inténtalo de nuevo.',

  'profile.becomeModal.title': 'Hazte profesional',
  'profile.becomeModal.body':
    'Añadiremos un perfil de profesional a tu cuenta actual: el mismo inicio de sesión y los mismos datos. Puedes cambiar entre el modo cliente y profesional cuando quieras.',
  'profile.becomeModal.cta': 'Configurar mi perfil de profesional',

  'profile.logoutModal.title': 'Cerrar sesión',
  'profile.logoutModal.body': '¿Seguro que quieres cerrar sesión?',
  'profile.logoutModal.confirm': 'Sí, cerrar sesión',

  // Provider Account screen. The two Terms keys are deliberately absent (held
  // in English by DO_NOT_TRANSLATE); the business name is provider-written and
  // handled by DynamicText, not here.
  'providerAccount.badge': 'PROFESIONAL',
  'providerAccount.hero.sub':
    'Tu negocio, tus reservas y el aspecto de Cerviced, todo en un solo lugar.',
  'providerAccount.hero.analytics': 'Analíticas',
  'providerAccount.hero.analyticsSub': 'Ingresos y estadísticas',
  'providerAccount.hero.promotions': 'Promociones',
  'providerAccount.hero.promotionsSub': 'Ofertas y descuentos',
  'providerAccount.hero.clientele': 'Clientela',
  'providerAccount.hero.clienteleSub': 'Clientes fieles',

  'providerAccount.businessProfile.title': 'Perfil del negocio',
  'providerAccount.businessProfile.sub': 'Perfil, datos y comunicaciones',

  'providerAccount.section.myBusiness': 'MI NEGOCIO',
  'providerAccount.myBusiness.schedule.title': 'Horario',
  'providerAccount.myBusiness.schedule.sub': 'Define tus horas y bloquea fechas',
  'providerAccount.myBusiness.inbox.title': 'Bandeja de entrada',
  'providerAccount.myBusiness.inbox.sub': 'Consultas y mensajes de clientes',
  'providerAccount.myBusiness.history.title': 'Historial de reservas',
  'providerAccount.myBusiness.history.sub': 'Ver reservas pasadas',

  'providerAccount.pref.darkMode': 'Modo oscuro',

  'providerAccount.section.account': 'CUENTA',
  'providerAccount.account.password.title': 'Cambiar contraseña',
  'providerAccount.account.password.sub': 'Actualizar credenciales',
  'providerAccount.account.info.title': 'Información de la cuenta',
  'providerAccount.account.info.sub': 'Nombre, teléfono, fecha de nacimiento y correo de acceso',
  'providerAccount.account.notifications.title': 'Notificaciones',
  'providerAccount.account.notifications.sub': 'Reservas, mensajes, recordatorios',

  'providerAccount.section.accessibility': 'ACCESIBILIDAD Y SOPORTE',
  'providerAccount.access.textSizing.title': 'Tamaño y fuente del texto',
  'providerAccount.access.textSizing.sub': 'Tamaño y fuente',
  'providerAccount.access.language.title': 'Idioma y región',
  'providerAccount.access.language.sub': 'Idioma y región',
  'providerAccount.access.help.title': 'Centro de ayuda',
  'providerAccount.access.help.sub': 'Preguntas frecuentes, contactar con soporte',

  'providerAccount.section.forClients': 'PARA CLIENTES',
  'providerAccount.forClients.switch.title': 'Cambiar a modo cliente',
  'providerAccount.forClients.switch.sub': 'Explora Cerviced como cliente',
  'providerAccount.forClients.create.title': 'Crear cuenta de cliente',
  'providerAccount.forClients.create.sub': 'Configura tu perfil de cliente para explorar',

  'providerAccount.section.appInfo': 'INFORMACIÓN DE LA APP Y ASPECTOS LEGALES',
  'providerAccount.appInfo.about.title': 'Acerca de Cerviced',
  'providerAccount.appInfo.about.sub': 'Misión, versión',
  'providerAccount.appInfo.report.title': 'Informar de un problema',
  'providerAccount.appInfo.report.sub': 'Errores, comentarios',

  'providerAccount.logout': 'Cerrar sesión',
  'providerAccount.error.title': 'Error',
  'providerAccount.error.biometric': 'No se pudo activar {method}. Inténtalo de nuevo.',

  'providerAccount.clientModal.title': 'Hazte cliente',
  'providerAccount.clientModal.body':
    'Añadiremos un perfil de cliente a tu cuenta actual: el mismo inicio de sesión y los mismos datos. Puedes cambiar entre el modo profesional y cliente cuando quieras.',
  'providerAccount.clientModal.cta': 'Configurar mi perfil de cliente',

  'providerAccount.logoutModal.title': 'Cerrar sesión',
  'providerAccount.logoutModal.body': '¿Seguro que quieres cerrar sesión?',
  'providerAccount.logoutModal.confirm': 'Sí, cerrar sesión',
};
