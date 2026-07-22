const urlInput = document.getElementById('url');
const status = document.getElementById('status');
const qualityGrid = document.getElementById('quality-grid');
const menuScreen = document.getElementById('menu-screen');
const downloaderScreen = document.getElementById('downloader-screen');
const downloaderTitle = document.getElementById('downloader-title');
const downloaderSubtitle = document.getElementById('downloader-subtitle');

const PLATFORMS = {
  youtube: {
    label: 'YouTube',
    urlRegex: /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i,
    placeholder: 'https://www.youtube.com/watch?v=...',
  },
  facebook: {
    label: 'Facebook',
    urlRegex: /^https?:\/\/(www\.|m\.|web\.)?(facebook\.com\/|fb\.watch\/)/i,
    placeholder: 'https://www.facebook.com/.../videos/...',
  },
  twitter: {
    label: 'Twitter / X',
    urlRegex: /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com)\//i,
    placeholder: 'https://x.com/usuario/status/...',
  },
  instagram: {
    label: 'Instagram',
    urlRegex: /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\//i,
    placeholder: 'https://www.instagram.com/reel/...',
  },
};

let currentPlatform = null;
let formatsAbortController = null;
let debounceTimer = null;

function openPlatform(name) {
  currentPlatform = name;
  const platform = PLATFORMS[name];

  urlInput.value = '';
  urlInput.placeholder = platform.placeholder;
  downloaderTitle.textContent = `Descargador de ${platform.label}`;
  downloaderSubtitle.textContent = 'Pega un enlace y elige el formato.';
  status.textContent = '';
  qualityGrid.hidden = true;
  qualityGrid.innerHTML = '';

  menuScreen.hidden = true;
  downloaderScreen.hidden = false;
  urlInput.focus();
}

function closePlatform() {
  currentPlatform = null;
  downloaderScreen.hidden = true;
  menuScreen.hidden = false;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

async function loadQualities() {
  const url = urlInput.value.trim();
  qualityGrid.hidden = true;
  qualityGrid.innerHTML = '';

  if (!currentPlatform || !PLATFORMS[currentPlatform].urlRegex.test(url)) return;

  if (formatsAbortController) formatsAbortController.abort();
  formatsAbortController = new AbortController();

  DebugLog.log('Buscando calidades disponibles', url);

  let data;
  try {
    const res = await fetch(`/api/formats?url=${encodeURIComponent(url)}`, {
      signal: formatsAbortController.signal,
    });
    data = await res.json();
    if (!res.ok) {
      DebugLog.log('Error al obtener calidades', data.error);
      if (data.detail) DebugLog.log('Detalle del servidor', data.detail);
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    DebugLog.log('Error de red al obtener calidades', err.message);
    return;
  }

  DebugLog.log('Calidades recibidas', data.qualities);

  for (const q of data.qualities) {
    const dimensions = q.width && q.height ? `${q.width}x${q.height}` : `${q.height}p`;
    const sizeStr = formatBytes(q.filesize);
    const sizeLabel = sizeStr ? (q.filesizeApprox ? `~${sizeStr}` : sizeStr) : '';
    const badgeText = sizeLabel ? `${dimensions} · ${sizeLabel}` : dimensions;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'quality-card';
    card.innerHTML = `
      <div class="quality-thumb">
        <img src="${data.thumbnail}" alt="${data.title || ''} ${q.label}" loading="lazy" />
        <span class="quality-badge">${badgeText}</span>
      </div>
      <span class="quality-label">${q.fps ? `${q.fps} fps` : ''}</span>
    `;
    card.addEventListener('click', () => download('mp4', q.formatId));
    qualityGrid.appendChild(card);
  }
  qualityGrid.hidden = data.qualities.length === 0;
}

urlInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadQualities, 600);
});
urlInput.addEventListener('paste', () => {
  setTimeout(loadQualities, 50);
});

function download(format, formatId) {
  const url = urlInput.value.trim();

  if (!url) {
    status.textContent = 'Pega un enlace primero.';
    return;
  }

  const jobId = crypto.randomUUID();
  let target = `/api/download?url=${encodeURIComponent(url)}&format=${format}&jobId=${jobId}`;
  if (formatId) target += `&formatId=${encodeURIComponent(formatId)}`;

  DebugLog.log('Iniciando descarga', { url, format, formatId, jobId });
  status.textContent = 'Conectando...';

  // El servidor emite el progreso real de yt-dlp (porcentaje, velocidad, ETA)
  // por Server-Sent Events, así el estado no es solo un spinner ciego.
  const source = new EventSource(`/api/progress/${jobId}`);
  let iframe;

  const stop = (finalText) => {
    DebugLog.log('Cerrando conexión de progreso', finalText);
    source.close();
    status.textContent = finalText;
    if (iframe) iframe.remove();
  };

  source.onopen = () => DebugLog.log('EventSource abierto');

  source.onerror = (e) => {
    // EventSource dispara 'onerror' tanto en errores reales de conexión
    // como al cerrarse la conexión normalmente tras 'done' o 'error'.
    DebugLog.log('EventSource onerror (nativo)', `readyState=${source.readyState}`);
  };

  source.addEventListener('progress', (e) => {
    const { percent, total, speed, eta } = JSON.parse(e.data);
    status.textContent = `Descargando... ${percent}% de ${total} a ${speed} (ETA ${eta})`;
    DebugLog.log('progress', e.data);
  });

  source.addEventListener('done', () => {
    DebugLog.log('done recibido');
    stop('Descarga lista, tu navegador la está guardando.');
  });

  source.addEventListener('error', (e) => {
    DebugLog.log('evento error (servidor)', e.data || '(sin data, probablemente cierre normal)');
    if (e.data) {
      const data = JSON.parse(e.data);
      stop(data.error || 'Ocurrió un error al descargar.');
    }
  });

  iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.onload = () => {
    // Al insertar un iframe sin src, el navegador carga "about:blank" de
    // inmediato y dispara 'load' para eso: hay que ignorar ese primer disparo,
    // si no, borrábamos el iframe (cancelando la descarga real) antes de tiempo.
    let currentHref;
    try {
      currentHref = iframe.contentWindow.location.href;
    } catch (err) {
      currentHref = '(no accesible)';
    }
    DebugLog.log('iframe onload disparado', currentHref);

    if (currentHref === 'about:blank') {
      return;
    }

    // Si llegamos aquí, el iframe navegó a nuestra URL real y logró cargar un
    // documento visible: eso solo pasa si el servidor respondió con JSON de
    // error (una descarga exitosa nunca "carga" un documento, el navegador la
    // intercepta como archivo adjunto).
    try {
      const text = iframe.contentDocument.body.textContent;
      const data = JSON.parse(text);
      DebugLog.log('iframe devolvió JSON', data);
      stop(data.error || 'Ocurrió un error al descargar.');
    } catch (err) {
      DebugLog.log('iframe onload con documento no parseable', String(err));
    } finally {
      iframe.remove();
    }
  };
  iframe.onerror = (e) => DebugLog.log('iframe onerror', String(e));

  document.body.appendChild(iframe);
  iframe.src = target;
  DebugLog.log('iframe.src asignado', target);

  // Red de seguridad por si el EventSource nunca recibe 'done' (p. ej. se
  // pierde el evento de red): dejamos de esperar tras un rato.
  setTimeout(() => {
    if (source.readyState !== EventSource.CLOSED) {
      DebugLog.log('Timeout de seguridad alcanzado (6 min)');
      stop('Si no ves la descarga en tu navegador, intenta de nuevo (puede haber fallado la conexión).');
    }
    iframe.remove();
  }, 6 * 60 * 1000);
}
