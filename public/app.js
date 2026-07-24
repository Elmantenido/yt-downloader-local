const urlInput = document.getElementById('url');
const status = document.getElementById('status');
const btnFetch = document.getElementById('btn-fetch');
const btnFetchText = document.getElementById('btn-fetch-text');
const fetchSpinner = document.getElementById('fetch-spinner');
const resultBox = document.getElementById('result-box');
const resultThumb = document.getElementById('result-thumb');
const btnDownloadVideo = document.getElementById('btn-download-video');
const btnDownloadAudio = document.getElementById('btn-download-audio');
const errorBox = document.getElementById('error-box');
const errorText = document.getElementById('error-text');
const btnPaste = document.getElementById('btn-paste');
const btnClear = document.getElementById('btn-clear');

const INSTAGRAM_URL_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\//i;

let formatsAbortController = null;
let debounceTimer = null;
let bestVideoFormatId = null;

function makeJobId() {
  // crypto.randomUUID requiere un contexto seguro (HTTPS o localhost); por
  // IP+HTTP plano no existe. No hace falta que sea criptográficamente
  // segura, solo única para trackear el progreso.
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hideResult() {
  resultBox.hidden = true;
  bestVideoFormatId = null;
}

function hideError() {
  errorBox.hidden = true;
}

function showError(message) {
  hideResult();
  errorText.textContent = message;
  errorBox.hidden = false;
}

function setFetching(isFetching) {
  btnFetch.disabled = isFetching;
  fetchSpinner.hidden = !isFetching;
  btnFetchText.textContent = isFetching ? I18N.t('btn_fetching') : I18N.t('btn_fetch');
}

async function fetchInfo() {
  const url = urlInput.value.trim();
  hideResult();
  hideError();
  status.textContent = '';

  if (!url) return;
  if (!INSTAGRAM_URL_RE.test(url)) {
    showError(I18N.t('status_invalid_link'));
    return;
  }

  if (formatsAbortController) formatsAbortController.abort();
  formatsAbortController = new AbortController();

  DebugLog.log('Fetching video info', url);
  setFetching(true);

  let data;
  try {
    const res = await fetch(`/api/formats?url=${encodeURIComponent(url)}`, {
      signal: formatsAbortController.signal,
    });
    data = await res.json();
    if (!res.ok) {
      DebugLog.log('Error fetching info', data.error);
      if (data.detail) DebugLog.log('Server detail', data.detail);
      showError(data.error || I18N.t('status_generic_error'));
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    DebugLog.log('Network error fetching info', err.message);
    showError(I18N.t('status_generic_error'));
    return;
  } finally {
    setFetching(false);
  }

  DebugLog.log('Video info received', data);

  if (!data.qualities || data.qualities.length === 0) {
    showError(I18N.t('status_generic_error'));
    return;
  }

  // Las calidades ya vienen ordenadas de mayor a menor resolución desde el
  // servidor, así que la primera es la mejor disponible para ese post.
  bestVideoFormatId = data.qualities[0].formatId;
  resultThumb.src = data.thumbnail || '';
  resultThumb.alt = data.title || '';
  hideError();
  resultBox.hidden = false;
}

urlInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchInfo, 600);
});
urlInput.addEventListener('paste', () => {
  setTimeout(fetchInfo, 50);
});

btnFetch.addEventListener('click', fetchInfo);

btnClear.addEventListener('click', () => {
  urlInput.value = '';
  hideResult();
  hideError();
  status.textContent = '';
  urlInput.focus();
});

btnPaste.addEventListener('click', async () => {
  // navigator.clipboard.readText requiere un contexto seguro (HTTPS o
  // localhost); por IP+HTTP plano puede no existir o pedir permiso y
  // fallar. En ese caso, simplemente enfocamos el campo para que el
  // usuario pegue manualmente (Ctrl/Cmd+V).
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        fetchInfo();
        return;
      }
    }
  } catch (err) {
    DebugLog.log('Clipboard read failed', err.message);
  }
  urlInput.focus();
});

btnDownloadVideo.addEventListener('click', () => download('mp4', bestVideoFormatId));
btnDownloadAudio.addEventListener('click', () => download('mp3'));

// Evita que dos descargas se disparen casi al mismo tiempo (por ejemplo, si
// alguien le da doble clic): dos navegaciones de descarga compitiendo pueden
// hacer que el navegador cancele o ignore silenciosamente una de ellas.
let downloadInFlight = false;

function download(format, formatId) {
  if (downloadInFlight) return;

  const url = urlInput.value.trim();

  if (!url) {
    status.textContent = I18N.t('status_paste_first');
    return;
  }
  if (!INSTAGRAM_URL_RE.test(url)) {
    status.textContent = I18N.t('status_invalid_link');
    return;
  }

  downloadInFlight = true;

  const jobId = makeJobId();
  let target = `/api/download?url=${encodeURIComponent(url)}&format=${format}&jobId=${jobId}`;
  if (formatId) target += `&formatId=${encodeURIComponent(formatId)}`;

  DebugLog.log('Starting download', { url, format, formatId, jobId });
  status.textContent = I18N.t('status_connecting');

  // El servidor emite el progreso real de yt-dlp (porcentaje, velocidad, ETA)
  // por Server-Sent Events, así el estado no es solo un spinner ciego.
  const source = new EventSource(`/api/progress/${jobId}`);

  const stop = (finalText) => {
    DebugLog.log('Closing progress connection', finalText);
    source.close();
    status.textContent = finalText;
    downloadInFlight = false;
  };

  source.onopen = () => DebugLog.log('EventSource opened');

  source.onerror = () => {
    // EventSource dispara 'onerror' tanto en errores reales de conexión
    // como al cerrarse la conexión normalmente tras 'done' o 'error'.
    DebugLog.log('EventSource onerror (native)', `readyState=${source.readyState}`);
  };

  source.addEventListener('queued', (e) => {
    const { position, active } = JSON.parse(e.data);
    status.textContent = I18N.t('status_queued', position, active);
    DebugLog.log('queued', e.data);
  });

  source.addEventListener('started', () => {
    status.textContent = I18N.t('status_started');
    DebugLog.log('started received');
  });

  source.addEventListener('progress', (e) => {
    const { percent, total, speed, eta } = JSON.parse(e.data);
    status.textContent = I18N.t('status_downloading', percent, total, speed, eta);
    DebugLog.log('progress', e.data);
  });

  source.addEventListener('done', () => {
    DebugLog.log('done received');
    stop(I18N.t('status_done'));
  });

  source.addEventListener('error', (e) => {
    DebugLog.log('server error event', e.data || '(no data, likely a normal close)');
    if (e.data) {
      const data = JSON.parse(e.data);
      stop(data.error || I18N.t('status_generic_error'));
    }
  });

  // Navegar directamente (en vez de un iframe oculto) es mucho más compatible
  // entre navegadores: Safari en particular no dispara de forma confiable las
  // descargas con "Content-Disposition: attachment" cuando vienen de un
  // iframe oculto (falla en silencio, sin error visible). Al navegar la
  // pestaña actual, el navegador detecta el archivo adjunto, muestra el
  // diálogo/flujo de guardado, y se queda en la misma página sin recargarla.
  window.location.href = target;
  DebugLog.log('Navigating to download URL', target);

  // Red de seguridad por si el EventSource nunca recibe 'done' (p. ej. se
  // pierde el evento de red): dejamos de esperar tras un rato.
  setTimeout(() => {
    if (source.readyState !== EventSource.CLOSED) {
      DebugLog.log('Safety timeout reached (6 min)');
      stop(I18N.t('status_timeout'));
    }
  }, 6 * 60 * 1000);
}
