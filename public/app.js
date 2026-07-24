const urlInput = document.getElementById('url');
const status = document.getElementById('status');
const qualityGrid = document.getElementById('quality-grid');

const INSTAGRAM_URL_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\//i;

let formatsAbortController = null;
let debounceTimer = null;

function makeJobId() {
  // crypto.randomUUID requiere un contexto seguro (HTTPS o localhost); por
  // IP+HTTP plano no existe. No hace falta que sea criptográficamente
  // segura, solo única para trackear el progreso.
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  if (!INSTAGRAM_URL_RE.test(url)) return;

  if (formatsAbortController) formatsAbortController.abort();
  formatsAbortController = new AbortController();

  DebugLog.log('Fetching available qualities', url);

  let data;
  try {
    const res = await fetch(`/api/formats?url=${encodeURIComponent(url)}`, {
      signal: formatsAbortController.signal,
    });
    data = await res.json();
    if (!res.ok) {
      DebugLog.log('Error fetching qualities', data.error);
      if (data.detail) DebugLog.log('Server detail', data.detail);
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    DebugLog.log('Network error fetching qualities', err.message);
    return;
  }

  DebugLog.log('Qualities received', data.qualities);

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
    status.textContent = 'Paste an Instagram link first.';
    return;
  }
  if (!INSTAGRAM_URL_RE.test(url)) {
    status.textContent = 'That doesn\'t look like a valid Instagram link.';
    return;
  }

  const jobId = makeJobId();
  let target = `/api/download?url=${encodeURIComponent(url)}&format=${format}&jobId=${jobId}`;
  if (formatId) target += `&formatId=${encodeURIComponent(formatId)}`;

  DebugLog.log('Starting download', { url, format, formatId, jobId });
  status.textContent = 'Connecting...';

  // El servidor emite el progreso real de yt-dlp (porcentaje, velocidad, ETA)
  // por Server-Sent Events, así el estado no es solo un spinner ciego.
  const source = new EventSource(`/api/progress/${jobId}`);
  let iframe;

  const stop = (finalText) => {
    DebugLog.log('Closing progress connection', finalText);
    source.close();
    status.textContent = finalText;
    if (iframe) iframe.remove();
  };

  source.onopen = () => DebugLog.log('EventSource opened');

  source.onerror = () => {
    // EventSource dispara 'onerror' tanto en errores reales de conexión
    // como al cerrarse la conexión normalmente tras 'done' o 'error'.
    DebugLog.log('EventSource onerror (native)', `readyState=${source.readyState}`);
  };

  source.addEventListener('queued', (e) => {
    const { position, active } = JSON.parse(e.data);
    status.textContent = `In queue... position ${position} (${active} downloads active right now).`;
    DebugLog.log('queued', e.data);
  });

  source.addEventListener('started', () => {
    status.textContent = 'Starting download...';
    DebugLog.log('started received');
  });

  source.addEventListener('progress', (e) => {
    const { percent, total, speed, eta } = JSON.parse(e.data);
    status.textContent = `Downloading... ${percent}% of ${total} at ${speed} (ETA ${eta})`;
    DebugLog.log('progress', e.data);
  });

  source.addEventListener('done', () => {
    DebugLog.log('done received');
    stop('Download ready, saving to your device.');
  });

  source.addEventListener('error', (e) => {
    DebugLog.log('server error event', e.data || '(no data, likely a normal close)');
    if (e.data) {
      const data = JSON.parse(e.data);
      stop(data.error || 'Something went wrong while downloading.');
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
      currentHref = '(not accessible)';
    }
    DebugLog.log('iframe onload fired', currentHref);

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
      DebugLog.log('iframe returned JSON', data);
      stop(data.error || 'Something went wrong while downloading.');
    } catch (err) {
      DebugLog.log('iframe onload with unparseable document', String(err));
    } finally {
      iframe.remove();
    }
  };
  iframe.onerror = (e) => DebugLog.log('iframe onerror', String(e));

  document.body.appendChild(iframe);
  iframe.src = target;
  DebugLog.log('iframe.src set', target);

  // Red de seguridad por si el EventSource nunca recibe 'done' (p. ej. se
  // pierde el evento de red): dejamos de esperar tras un rato.
  setTimeout(() => {
    if (source.readyState !== EventSource.CLOSED) {
      DebugLog.log('Safety timeout reached (6 min)');
      stop('If you don\'t see the download in your browser, try again (the connection may have dropped).');
    }
    iframe.remove();
  }, 6 * 60 * 1000);
}
