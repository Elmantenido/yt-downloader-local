const I18N = (() => {
  const TRANSLATIONS = {
    en: {
      nav_how: 'How it works',
      nav_features: 'Features',
      nav_about: 'About',
      nav_faq: 'FAQ',

      hero_title: 'Download Instagram Videos, Reels & Photos',
      hero_subtitle: 'Paste a public Instagram link and save it to your device — fast, free, and in the original quality. No app, no login, no watermark.',

      url_placeholder: 'Paste an Instagram link here (post, reel, story...)',
      btn_video: 'Download Video',
      btn_audio: 'Download Audio (MP3)',

      steps_title: 'How it works',
      step1_title: 'Copy the Instagram link',
      step1_text: 'Open the Instagram app, open the post you want, tap the three dots (•••), then tap "Copy Link".',
      step2_title: 'Paste it above',
      step2_text: 'Paste the link into the box at the top of this page. We\'ll fetch the media automatically.',
      step3_title: 'Download',
      step3_text: 'Choose video or audio and click download. The file saves straight to your device — no app, no account.',

      features_title: 'Why InstaGrab',
      feat1_title: 'Free & fast',
      feat1_text: 'No hidden fees, no daily limits for normal use. Downloads start almost instantly.',
      feat2_title: 'No app required',
      feat2_text: 'It\'s entirely web-based — nothing to install, and no extra app taking up storage on your phone.',
      feat3_title: 'No login needed',
      feat3_text: 'You never share your Instagram username or password with us — we only need the post link.',
      feat4_title: 'Any device',
      feat4_text: 'Works from your phone, tablet, or computer — any modern browser.',
      feat5_title: 'Original quality',
      feat5_text: 'We fetch the highest quality available for that post, with no extra compression.',
      feat6_title: 'Reels, IGTV & photos',
      feat6_text: 'Works with feed videos, Reels, IGTV, photos, and stories from public accounts.',

      about_title: 'Why we built InstaGrab',
      about_text_1: 'Instagram is home to some of the best short-form video on the internet — funny, inspiring, educational — but the app itself gives you no built-in way to save a post to your device.',
      about_text_2: 'We ran into that same wall ourselves, so we built a simple, safe, and anonymous way to grab a copy of any public post — no extra app, no account, no login details shared with anyone.',

      whatis_title: 'What is Instagram?',
      whatis_text: 'Instagram is a social network where people share photos and videos and connect through comments, likes, and messages. Creators, brands, and public figures use it to publish everything from quick Reels to longer IGTV videos on topics like tech, music, education, and entertainment.',

      faq_title: 'Frequently asked questions',
      faq1_q: 'What is an Instagram video downloader?',
      faq1_a: 'It\'s a free web tool that lets you save public Instagram videos, Reels, and photos to your device just by pasting the post\'s link.',
      faq2_q: 'How do I download a video from Instagram?',
      faq2_a: 'Copy the link to the post from the Instagram app, paste it into the box above, and click Download.',
      faq3_q: 'Can I download the video in its original quality?',
      faq3_a: 'Yes — we fetch the highest quality available for that post, with no extra compression added on our end.',
      faq4_q: 'Is there a download limit?',
      faq4_a: 'There\'s no daily limit for normal personal use, though heavy automated use may be rate-limited to keep things fast for everyone.',
      faq5_q: 'Can I download IGTV videos?',
      faq5_a: 'Yes — the process is the same: copy the IGTV video\'s link from Instagram and paste it here.',
      faq6_q: 'Can I use this on a PC?',
      faq6_a: 'Yes, just open this page in your computer\'s browser and paste the link — no software installation needed.',
      faq7_q: 'Is downloading Instagram videos legal?',
      faq7_a: 'Downloading content you have the right to use — your own posts, or content shared with the creator\'s permission — is fine. Redistributing someone else\'s content without permission may violate their copyright, so always respect the original creator\'s rights.',
      faq8_q: 'Can I download private Instagram videos?',
      faq8_a: 'No. Only public posts can be downloaded — private accounts require access we don\'t have or request.',

      footer_text: 'This tool is for personal and educational use. We don\'t host any content — all rights belong to the original creators. Instagram and the Instagram logo are trademarks of Instagram/Meta. This site is not affiliated with or endorsed by Instagram.',

      status_paste_first: 'Paste an Instagram link first.',
      status_invalid_link: 'That doesn\'t look like a valid Instagram link.',
      status_connecting: 'Connecting...',
      status_queued: (position, active) => `In queue... position ${position} (${active} downloads active right now).`,
      status_started: 'Starting download...',
      status_downloading: (percent, total, speed, eta) => `Downloading... ${percent}% of ${total} at ${speed} (ETA ${eta})`,
      status_done: 'Download ready, saving to your device.',
      status_generic_error: 'Something went wrong while downloading.',
      status_timeout: 'If you don\'t see the download in your browser, try again (the connection may have dropped).',
    },
    es: {
      nav_how: 'Cómo funciona',
      nav_features: 'Características',
      nav_about: 'Nosotros',
      nav_faq: 'Preguntas',

      hero_title: 'Descarga Videos, Reels y Fotos de Instagram',
      hero_subtitle: 'Pega un enlace público de Instagram y guárdalo en tu dispositivo — rápido, gratis y en la calidad original. Sin apps, sin iniciar sesión, sin marca de agua.',

      url_placeholder: 'Pega aquí un enlace de Instagram (post, reel, historia...)',
      btn_video: 'Descargar Video',
      btn_audio: 'Descargar Audio (MP3)',

      steps_title: 'Cómo funciona',
      step1_title: 'Copia el enlace de Instagram',
      step1_text: 'Abre la app de Instagram, entra a la publicación que quieres, toca los tres puntos (•••) y luego "Copiar enlace".',
      step2_title: 'Pégalo arriba',
      step2_text: 'Pega el enlace en el recuadro de arriba de esta página. Buscaremos el contenido automáticamente.',
      step3_title: 'Descarga',
      step3_text: 'Elige video o audio y haz clic en descargar. El archivo se guarda directo en tu dispositivo — sin apps, sin cuenta.',

      features_title: 'Por qué InstaGrab',
      feat1_title: 'Gratis y rápido',
      feat1_text: 'Sin costos ocultos, sin límites diarios para uso normal. Las descargas empiezan casi al instante.',
      feat2_title: 'Sin necesidad de app',
      feat2_text: 'Es 100% web — no hay que instalar nada, ni ocupa espacio extra en tu teléfono.',
      feat3_title: 'Sin iniciar sesión',
      feat3_text: 'Nunca compartes tu usuario o contraseña de Instagram con nosotros — solo necesitamos el enlace.',
      feat4_title: 'Cualquier dispositivo',
      feat4_text: 'Funciona desde tu celular, tablet o computadora — en cualquier navegador moderno.',
      feat5_title: 'Calidad original',
      feat5_text: 'Obtenemos la mejor calidad disponible de esa publicación, sin compresión adicional.',
      feat6_title: 'Reels, IGTV y fotos',
      feat6_text: 'Funciona con videos del feed, Reels, IGTV, fotos e historias de cuentas públicas.',

      about_title: 'Por qué creamos InstaGrab',
      about_text_1: 'Instagram tiene algunos de los mejores videos cortos de internet — divertidos, inspiradores, educativos — pero la app no trae una forma nativa de guardar una publicación en tu dispositivo.',
      about_text_2: 'A nosotros nos pasó lo mismo, así que construimos una forma simple, segura y anónima de guardar una copia de cualquier publicación pública — sin apps extra, sin cuenta, sin compartir tus datos de acceso con nadie.',

      whatis_title: '¿Qué es Instagram?',
      whatis_text: 'Instagram es una red social donde la gente comparte fotos y videos y se conecta a través de comentarios, likes y mensajes. Creadores, marcas y figuras públicas la usan para publicar desde Reels rápidos hasta videos más largos de IGTV sobre tecnología, música, educación y entretenimiento.',

      faq_title: 'Preguntas frecuentes',
      faq1_q: '¿Qué es un descargador de video de Instagram?',
      faq1_a: 'Es una herramienta web gratuita que te permite guardar videos, Reels y fotos públicas de Instagram en tu dispositivo con solo pegar el enlace de la publicación.',
      faq2_q: '¿Cómo descargo un video de Instagram?',
      faq2_a: 'Copia el enlace de la publicación desde la app de Instagram, pégalo en el recuadro de arriba, y haz clic en Descargar.',
      faq3_q: '¿Puedo descargar el video en su calidad original?',
      faq3_a: 'Sí — obtenemos la mejor calidad disponible para esa publicación, sin compresión adicional de nuestra parte.',
      faq4_q: '¿Hay un límite de descargas?',
      faq4_a: 'No hay límite diario para uso personal normal, aunque el uso automatizado excesivo puede limitarse para mantener el servicio rápido para todos.',
      faq5_q: '¿Puedo descargar videos de IGTV?',
      faq5_a: 'Sí — el proceso es el mismo: copia el enlace del video de IGTV desde Instagram y pégalo aquí.',
      faq6_q: '¿Puedo usar esto en una PC?',
      faq6_a: 'Sí, solo abre esta página en el navegador de tu computadora y pega el enlace — no hace falta instalar nada.',
      faq7_q: '¿Es legal descargar videos de Instagram?',
      faq7_a: 'Descargar contenido que tienes derecho a usar — tus propias publicaciones, o contenido compartido con permiso del creador — está bien. Redistribuir el contenido de otra persona sin permiso puede violar sus derechos de autor, así que siempre respeta los derechos del creador original.',
      faq8_q: '¿Puedo descargar videos privados de Instagram?',
      faq8_a: 'No. Solo se pueden descargar publicaciones públicas — las cuentas privadas requieren un acceso que no tenemos ni solicitamos.',

      footer_text: 'Esta herramienta es para uso personal y educativo. No alojamos ningún contenido — todos los derechos pertenecen a los creadores originales. Instagram y su logo son marcas registradas de Instagram/Meta. Este sitio no está afiliado ni respaldado por Instagram.',

      status_paste_first: 'Pega un enlace de Instagram primero.',
      status_invalid_link: 'Eso no parece un enlace válido de Instagram.',
      status_connecting: 'Conectando...',
      status_queued: (position, active) => `En cola... posición ${position} (${active} descargas activas ahora mismo).`,
      status_started: 'Iniciando descarga...',
      status_downloading: (percent, total, speed, eta) => `Descargando... ${percent}% de ${total} a ${speed} (ETA ${eta})`,
      status_done: 'Descarga lista, guardando en tu dispositivo.',
      status_generic_error: 'Ocurrió un error al descargar.',
      status_timeout: 'Si no ves la descarga en tu navegador, intenta de nuevo (puede haber fallado la conexión).',
    },
  };

  // El idioma se decide por la ruta (/en, /es), no por JS-en-el-lugar: así
  // cada idioma tiene una URL real que se puede compartir o guardar en
  // favoritos, en vez de un simple botón que solo cambia texto en pantalla.
  function detectLang() {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path.startsWith('/es')) return 'es';
    return 'en';
  }

  const lang = detectLang();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;

  function t(key, ...args) {
    const entry = dict[key] ?? TRANSLATIONS.en[key];
    if (typeof entry === 'function') return entry(...args);
    return entry ?? key;
  }

  function applyStaticText() {
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });

    document.querySelectorAll('.lang-btn').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-lang') === lang);
    });
  }

  document.addEventListener('DOMContentLoaded', applyStaticText);

  return { lang, t };
})();
