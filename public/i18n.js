const I18N = (() => {
  // Traducciones cargadas desde translations.js (compartido con el servidor para SSR).
  const TRANSLATIONS = window.TRANSLATIONS;

  // Lista de idiomas soportados: cada uno tiene su propia ruta real
  // (/en, /es, /fr...) en vez de un botón que solo cambia texto en pantalla,
  // así se puede compartir o guardar en favoritos un idioma específico.
  const LANGUAGES = [
    { code: 'ar', name: 'العربية' },
    { code: 'bn', name: 'বাংলা' },
    { code: 'cs', name: 'Čeština' },
    { code: 'de', name: 'Deutsch' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fa', name: 'فارسی' },
    { code: 'fr', name: 'Français' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'it', name: 'Italiano' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'pt', name: 'Português' },
    { code: 'ro', name: 'Română' },
    { code: 'ru', name: 'Русский' },
    { code: 'sk', name: 'Slovenčina' },
    { code: 'sv', name: 'Svenska' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'zh', name: '中文' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'th', name: 'ไทย' },
  ];
  const RTL_LANGS = new Set(['ar', 'fa']);

  function detectLang() {
    const path = window.location.pathname.replace(/\/+$/, '');
    const match = LANGUAGES.find((l) => path === `/${l.code}` || path.startsWith(`/${l.code}/`));
    return match ? match.code : 'en';
  }

  const lang = detectLang();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;

  function t(key, ...args) {
    const entry = dict[key] ?? TRANSLATIONS.en[key];
    if (entry == null) return key;
    if (args.length === 0) return entry;
    return entry.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '');
  }

  function buildLangMenu() {
    const toggle = document.getElementById('lang-toggle');
    const toggleLabel = document.getElementById('lang-toggle-label');
    const menu = document.getElementById('lang-menu');
    if (!toggle || !menu) return;

    const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[4];
    toggleLabel.textContent = current.code.toUpperCase();

    menu.innerHTML = '';
    for (const l of LANGUAGES) {
      const li = document.createElement('li');
      if (l.code === lang) {
        const span = document.createElement('span');
        span.textContent = l.name;
        li.appendChild(span);
      } else {
        const a = document.createElement('a');
        a.href = `/${l.code}`;
        a.textContent = l.name;
        li.appendChild(a);
      }
      menu.appendChild(li);
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      toggle.setAttribute('aria-expanded', String(!isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== toggle) {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // <title>, meta description, canonical, hreflang y JSON-LD ya vienen
  // correctos por idioma desde el servidor (ver renderIndexHtml en
  // server.js), así que aquí solo queda traducir el contenido visible del DOM.
  function applyStaticText() {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', t(key));
    });

    buildLangMenu();
  }

  document.addEventListener('DOMContentLoaded', applyStaticText);

  return { lang, t };
})();
