// Spanish · settings. Typed against ../en/settings.ts; held keys are left out.
import type { AreaCatalog } from '../../types';
import type { settings as en } from '../en/settings';

export const settings: AreaCatalog<typeof en> = {
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
    'Cerviced sigue el idioma que elijas. El inicio de sesión, la información legal y de salud, las notificaciones y los correos se muestran en inglés, y los textos de los profesionales aparecen tal como los escribieron.',
  'languageRegion.section.region': 'REGIÓN',
  'languageRegion.regionRowDates': 'Fechas {date}',
  'languageRegion.regionFootnote':
    'Las fechas se muestran en el formato de tu región ({date}). Los precios siempre se muestran en libras (£), estés donde estés.',

  'helpCentre.title': 'Centro de ayuda',
  'helpCentre.subtitle': 'Respuestas a preguntas frecuentes',
  'helpCentre.section.booking': 'RESERVAR',
  'helpCentre.section.yourProviders': 'TUS PROFESIONALES',
  'helpCentre.section.yourProfile': 'TU PERFIL',
  'helpCentre.section.gettingStarted': 'PRIMEROS PASOS',
  'helpCentre.section.bookings': 'RESERVAS',
  'helpCentre.section.gettingPaid': 'COBRAR',
  'helpCentre.section.clients': 'CLIENTES',

  'helpCentre.faq.book.q': '¿Cómo reservo una cita?',
  'helpCentre.faq.book.a':
    'Abre la página de un profesional desde Inicio, Buscar o Explorar, elige un servicio y una hora, y añádelo a tu carrito. Pagas al finalizar la compra, y puedes reservar con más de un profesional a la vez.',
  'helpCentre.faq.request.q': '¿Por qué mi reserva dice Solicitud enviada?',
  'helpCentre.faq.cancel.q': '¿Puedo reprogramar o cancelar?',
  'helpCentre.faq.becca.q': '¿Cómo funciona Becca?',
  'helpCentre.faq.becca.a':
    'Becca es tu asistente de belleza con IA. Pregúntale lo que quieras: puede recomendar profesionales, explicar servicios y ayudarte a encontrar el look ideal.',
  'helpCentre.faq.points.q': '¿Cómo gano puntos?',
  'helpCentre.faq.points.a':
    'Completa una reserva o deja una reseña, además de bonos por tu primera reserva, tu primera reseña y tu cumpleaños. Tu saldo está en Puntos, en tu Perfil.',
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
  'profile.forYou.activity.title': 'Centro de actividad',
  'profile.forYou.activity.sub': 'Reembolsos, cambios de cita y lo que tengas pendiente',
  'profile.forYou.activity.count': '{count} pendientes',
  'profile.forYou.activity.todo': 'Algo te necesita',
  'profile.forYou.messages.title': 'Mensajes',
  'profile.forYou.messages.sub': 'Chats con tus profesionales',
  'profile.account.account.title': 'Cuenta',
  'profile.account.account.sub': 'Nombre, teléfono, fecha de nacimiento',
  'profile.forYou.beauty.title': 'Perfil de belleza',
  'profile.forYou.beauty.todo': 'Te falta algo por completar',
  'profile.account.password.title': 'Cambiar contraseña',
  'profile.account.password.sub': 'Actualizar credenciales',
  'profile.account.payment.title': 'Métodos de pago',
  'profile.account.payment.sub': 'Tarjetas, Apple Pay',

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
  'profile.appInfo.about.sub': 'Quiénes somos y qué construimos',
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
  'providerAccount.myBusiness.payouts.title': 'Pagos',
  'providerAccount.myBusiness.payouts.sub': 'Tus pagos y fechas de cobro',
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
  'providerAccount.account.achievements.title': 'Logros',
  'providerAccount.account.achievements.sub': 'Lo que has conseguido hasta ahora',

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
  'providerAccount.forClients.checking.title': 'Modo cliente',
  'providerAccount.forClients.checking.sub': 'Comprobando tu cuenta…',

  'providerAccount.section.appInfo': 'INFORMACIÓN DE LA APP Y ASPECTOS LEGALES',
  'providerAccount.appInfo.about.title': 'Acerca de Cerviced',
  'providerAccount.appInfo.about.sub': 'Quiénes somos y qué construimos',
  'providerAccount.appInfo.report.title': 'Informar de un problema',
  'providerAccount.appInfo.report.sub': 'Errores, comentarios',

  'providerAccount.logout': 'Cerrar sesión',
  'providerAccount.a11y.locked': '{title}, bloqueado. {subtitle}',
  'providerAccount.a11y.todo': '{title}, tienes algo pendiente',
  'providerAccount.error.title': 'Error',
  'providerAccount.error.biometric': 'No se pudo activar {method}. Inténtalo de nuevo.',

  'providerAccount.clientModal.title': 'Hazte cliente',
  'providerAccount.clientModal.body':
    'Añadiremos un perfil de cliente a tu cuenta actual: el mismo inicio de sesión y los mismos datos. Puedes cambiar entre el modo profesional y cliente cuando quieras.',
  'providerAccount.clientModal.cta': 'Configurar mi perfil de cliente',

  'providerAccount.logoutModal.title': 'Cerrar sesión',
  'providerAccount.logoutModal.body': '¿Seguro que quieres cerrar sesión?',
  'providerAccount.logoutModal.confirm': 'Sí, cerrar sesión',
  'profile.section.forYou': 'Para ti',
  'profile.forYou.beauty.sub': 'Recordatorios de mantenimiento, cabello, piel y más',
  'profile.forYou.beauty.due': '{count} pendientes',
  'providerAccount.linkOnly.hero.sub': 'Tu perfil, cómo te encuentran los clientes y tu cuenta, todo en un solo lugar.',
  'providerAccount.linkOnly.hero.edit': 'Editar perfil',
  'providerAccount.linkOnly.hero.branding': 'Imagen de marca',
  'providerAccount.section.yourBusiness': 'TU NEGOCIO',
  'providerAccount.linkOnly.businessInfo.title': 'Información del negocio',
  'providerAccount.linkOnly.businessInfo.sub': 'Nombre, tipo de servicio, enlace de reservas, correos',
  'providerAccount.linkOnly.hours.title': 'Horario de apertura',
  'providerAccount.linkOnly.hours.sub': 'Se muestra en tu pestaña Acerca de',
  'providerAccount.linkOnly.policies.title': 'Políticas',
  'providerAccount.linkOnly.policies.sub': 'Opcional: se muestran en tu perfil si las añades',
  'providerAccount.linkOnly.achievements.sub': 'Parte de la experiencia completa de CERVICED',
  'providerAccount.linkOnly.achievements.lockedTitle': 'Desbloquea los logros',
  'providerAccount.linkOnly.achievements.lockedBody':
    'Los miembros completos consiguen logros por reservas, reseñas de cinco estrellas y meses con la agenda llena.',
  'providerAccount.linkOnly.fullCerviced.title': 'Lo que añade CERVICED completo',
  'providerAccount.linkOnly.fullCerviced.sub':
    'Perfiles de clientes, anuncios, automatizaciones y más',
  'providerAccount.linkOnly.notifications.sub': 'Mensajes y guardados',
  'helpCentre.providerFaq.live.q': '¿Cómo me publico?',
  'helpCentre.providerFaq.live.a':
    'Tu pantalla de Inicio muestra lo que te falta. Cuando completes todos los pasos, los clientes podrán encontrarte en Buscar.',
  'helpCentre.providerFaq.share.q': '¿Cómo comparto mi página?',
  'helpCentre.providerFaq.share.a':
    'Toca el botón del código QR en Mi perfil. Imprímelo o tenlo junto a tu sillón, o copia tu enlace para compartirlo donde quieras.',
  'helpCentre.providerFaq.branding.q': '¿Cómo cambio el aspecto de mi página?',
  'helpCentre.providerFaq.branding.a':
    'Toca el botón de la paleta en Mi perfil. Elige un estilo de página, colores y tipografía, y verás los cambios al momento.',
  'helpCentre.providerFaq.book.q': '¿Cómo reservan conmigo los clientes?',
  'helpCentre.providerFaq.book.a':
    'Los clientes eligen un servicio y una hora en tu página y pagan en la app. Las nuevas reservas aparecen en tu pantalla de Inicio y en tus notificaciones.',
  'helpCentre.providerFaq.autoConfirm.q': '¿Tengo que aceptar cada reserva?',
  'helpCentre.providerFaq.autoConfirm.a':
    'Solo si quieres. Activa Confirmar reservas automáticamente en Perfil del negocio → Automatizaciones y preferencias. Si está desactivado, aceptas o rechazas cada solicitud.',
  'helpCentre.providerFaq.hours.q': '¿Cómo configuro mi horario?',
  'helpCentre.providerFaq.hours.a':
    'Ve a Perfil del negocio → Detalles del negocio → Horarios y disponibilidad. Configura tu horario, los descansos entre citas y con cuánta antelación pueden reservar los clientes.',
  'helpCentre.providerFaq.timeOff.q': '¿Cómo me tomo tiempo libre?',
  'helpCentre.providerFaq.timeOff.a':
    'Usa Cerrar mi agenda en la pantalla de horario. Los clientes no pueden reservar hasta que la reabras, y tú decides qué pasa con las reservas que ya tienes.',
  'helpCentre.providerFaq.calendar.q': '¿Puede mi calendario del móvil bloquear horas?',
  'helpCentre.providerFaq.calendar.a':
    'Sí. Activa Sincronizar calendario en Horarios y disponibilidad y elige tus calendarios. Los clientes no pueden reservar cuando estás ocupado allí y nunca ven de qué se trata.',
  'helpCentre.providerFaq.waitlist.q': '¿Cómo funciona la lista de espera?',
  'helpCentre.providerFaq.waitlist.a':
    'Activa la lista de espera en Automatizaciones y preferencias. Cuando se libera un hueco, Automático se lo ofrece a la siguiente persona. Sin Automático, lo ofreces tú desde Reservas.',
  'helpCentre.providerFaq.payouts.q': '¿Cuándo cobro?',
  'helpCentre.providerFaq.saves.q': '¿Qué pasa cuando alguien me guarda?',
  'helpCentre.providerFaq.saves.a':
    'Una vez al día recibes una notificación con cuántas personas te han guardado, nunca quiénes. Puedes desactivarla en tus ajustes de notificaciones. Tus estadísticas muestran tus guardados a lo largo del tiempo.',
  'helpCentre.linkFaq.live.a':
    'Tu pantalla de Inicio muestra lo que falta: tu logo, tu sección Sobre mí, tu horario y al menos una foto del portafolio. Cuando lo tengas, los clientes podrán encontrarte en Buscar.',
  'helpCentre.linkFaq.book.a':
    'El botón Reservar de tu perfil abre tu propia web de reservas. Los clientes reservan allí, y CERVICED no ve ni gestiona esas reservas.',
  'helpCentre.linkFaq.hours.q': '¿Cómo configuro mi horario de apertura?',
  'helpCentre.linkFaq.hours.a':
    'Abre Horario de apertura en tu Cuenta. Los clientes lo ven en tu perfil.',
  'helpCentre.linkFaq.full.q': '¿Qué añadiría CERVICED completo?',
  'helpCentre.linkFaq.full.a':
    'Abre Lo que añade CERVICED completo en tu Cuenta para ver qué cambia cuando los clientes reservan y pagan en la app.',
  'helpCentre.linkFaq.becca.a':
    'Pregúntale a Becca por tus mensajes, tu horario o tus notificaciones, y te responderá o te llevará a la pantalla adecuada.',
  'helpCentre.providerFaq.messages.q': '¿Cómo funcionan los mensajes?',
  'helpCentre.providerFaq.messages.a':
    'Los clientes pueden escribirte desde tu perfil. Recibes una notificación por cada mensaje nuevo y un recordatorio si un mensaje sigue sin respuesta después de un par de horas.',
  'helpCentre.providerFaq.clientele.q': '¿Puedo ver el perfil de belleza de un cliente?',
  'helpCentre.providerFaq.becca.q': '¿Cómo puede ayudar Becca a mi negocio?',
  'helpCentre.providerFaq.becca.a':
    'Pregúntale a Becca por tu día, tu semana, tus clientes, tus reseñas, tus mensajes o tu horario, y te responderá o te llevará a la pantalla adecuada.',
  'achievements.title': 'Logros',
  'achievements.back': 'Volver',
  'achievements.latest': 'LO ÚLTIMO',
  'achievements.summary': '{earned} de {total} conseguidos',
  'achievements.private': 'Solo tú puedes verlos',
  'achievements.none': 'Aún no has conseguido ninguno. El primero aparecerá aquí.',
  'achievements.groupCount': '{earned} de {total}',
  'achievements.earnedOn': 'Conseguido el {date}',
  'achievements.done': 'Listo',
  'achievements.loadFailed':
    'No hemos podido cargar tus logros. Comprueba tu conexión e inténtalo de nuevo.',
  'achievements.retry': 'Reintentar',
  'achievements.group.fullyBooked': 'AGENDA LLENA',
  'achievements.group.bookings': 'RESERVAS',
  'achievements.group.clientLove': 'CLIENTES FELICES',
  'achievements.group.busy': 'RACHAS DE TRABAJO',
  'achievements.group.earnings': 'INGRESOS',
  'achievements.group.waitlist': 'LISTA DE ESPERA',
  'achievements.group.established': 'EMPEZANDO',
  'achievements.progress.count': '{current} de {target}',
  'achievements.progress.busyDay': '{current} de {target} en un día',
  'achievements.progress.months': '{current} de {target} meses',
  'achievements.progress.slots': '{current} de {target} huecos',
  'achievements.progress.reviews': '{current} de {target} reseñas',
  'achievements.progress.ratingShort': 'Valoración de {rating}, necesitas 4,8',
  'achievements.name.fullyBookedFirst': 'Agenda llena',
  'achievements.name.fullyBooked3': 'Agenda llena 3 veces',
  'achievements.name.fullyBookedMonths3': '3 meses seguidos',
  'achievements.name.bookingFirst': 'Primera reserva',
  'achievements.name.bookings10': '10 reservas',
  'achievements.name.bookings50': '50 reservas',
  'achievements.name.bookings100': '100 reservas',
  'achievements.name.bookings500': '500 reservas',
  'achievements.name.fiveStarFirst': 'Primera reseña de 5 estrellas',
  'achievements.name.fiveStar10': '10 reseñas de cinco estrellas',
  'achievements.name.fiveStar50': '50 reseñas de cinco estrellas',
  'achievements.name.rating48': 'Valoración de 4,8 o más',
  'achievements.name.tipFirst': 'Primera propina',
  'achievements.name.returning10': '10 clientes que repiten',
  'achievements.name.saves25': '25 guardados',
  'achievements.name.saves100': '100 guardados',
  'achievements.name.bell10': '10 seguidores con campana',
  'achievements.name.bell50': '50 seguidores con campana',
  'achievements.name.months3': '3 meses con reservas',
  'achievements.name.months6': '6 meses con reservas',
  'achievements.name.months12': '12 meses con reservas',
  'achievements.name.busyDay': 'Día ajetreado',
  'achievements.name.payoutFirst': 'Primer pago',
  'achievements.name.paid1000': '1.000 £ pagados',
  'achievements.name.paid10000': '10.000 £ pagados',
  'achievements.name.waitlistHero': 'Héroe de la lista de espera',
  'achievements.name.live': 'Publicado en CERVICED',
  'achievements.name.photos20': '20 fotos en el portafolio',
  'achievements.name.monthsOn6': '6 meses',
  'achievements.name.monthsOn12': '1 año',
  'achievements.how.fullyBooked':
    'Se consigue cuando todos los huecos que has abierto están reservados.',
  'achievements.how.fullyBookedMonths': 'Ten la agenda llena 3 meses naturales seguidos.',
  'achievements.how.bookings': 'Una reserva cuenta cuando se completa.',
  'achievements.how.fiveStar': 'Cuenta cada reseña de 5 estrellas que te deja un cliente.',
  'achievements.how.rating': 'Mantén una valoración de 4,8 o más con al menos 25 reseñas.',
  'achievements.how.tip': 'Se consigue la primera vez que un cliente te deja propina en la app.',
  'achievements.how.returning': 'Un cliente cuenta cuando completa una segunda reserva contigo.',
  'achievements.how.saves': 'Cuenta las personas que te han guardado en sus profesionales.',
  'achievements.how.bell': 'Cuenta las personas que tienen tu campana activada.',
  'achievements.how.months':
    'Completa al menos una reserva cada mes natural, sin saltarte ninguno.',
  'achievements.how.busyDay': 'Completa 5 reservas en un solo día.',
  'achievements.how.paid':
    'Cuenta el dinero que te hemos pagado a través de CERVICED, propinas incluidas.',
  'achievements.how.waitlist':
    'Cuenta los huecos liberados que se reservan desde tu lista de espera.',
  'achievements.how.live': 'Se consigue cuando tu perfil se publica.',
  'achievements.how.photos': 'Cuenta las fotos de tu portafolio.',
  'achievements.how.monthsOn': 'Cuenta desde el día en que te uniste a CERVICED.',
  'helpCentre.faq.waitlist.q': '¿Y si no tiene huecos?',
  'helpCentre.faq.waitlist.a':
    'Toca Unirse a la lista de espera en su página y elige las fechas que te vengan bien. Si se libera un hueco, te avisaremos.',
  'helpCentre.faq.address.q': '¿Cuándo veré la dirección del profesional?',
  'helpCentre.faq.address.a':
    'Aparece en tu reserva cuando tu profesional la comparte. Algunos la comparten enseguida y otros más cerca del día.',
  'helpCentre.faq.messages.q': '¿Cómo escribo a un profesional?',
  'helpCentre.faq.messages.a':
    'Toca Contactar en su página. Tus chats están en Mensajes, en tu Perfil.',
  'helpCentre.faq.bell.q': '¿Puedo enterarme cuando un profesional tenga hueco?',
  'helpCentre.faq.bell.a':
    'Toca la campana en su página. Te avisaremos cuando abra nuevas fechas o vuelva a tener hueco.',
  'helpCentre.faq.reviews.q': '¿Cómo funcionan las reseñas?',
  'helpCentre.faq.reviews.a':
    'Cuando termine tu cita, deja una reseña desde Reservas. Puedes publicarla de forma anónima si lo prefieres.',
  'helpCentre.faq.tip.q': '¿Puedo dejar propina?',
  'helpCentre.faq.notOnCerviced.q': '¿Qué significa «Aún no está en CERVICED»?',
  'helpCentre.faq.notOnCerviced.a':
    'Ese negocio aún no se ha unido, así que no puedes reservar aquí. Toca Dar un toque para mostrar que te gustaría verlo en CERVICED.',
  'helpCentre.faq.beautyProfile.q': '¿Qué es mi perfil de belleza?',
  'helpCentre.faq.maintenance.q': '¿Qué son los recordatorios de mantenimiento?',
  'helpCentre.faq.maintenance.a':
    'Te recordaremos cuándo te toca volver a reservar cosas como uñas, pestañas o cejas. Actívalos en tus ajustes de notificaciones.',
  'helpCentre.providerFaq.deposits.q': '¿Puedo cobrar un depósito?',
  'helpCentre.providerFaq.lateFees.q': '¿Y las cancelaciones tardías y las ausencias?',
  'helpCentre.providerFaq.fee.q': '¿Pago una tarifa a CERVICED?',
  'helpCentre.providerFaq.tips.q': '¿Pueden darme propina los clientes?',
};
