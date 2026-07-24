const urlInput = document.getElementById('url');
const status = document.getElementById('status');
const btnFetch = document.getElementById('btn-fetch');
const btnFetchText = document.getElementById('btn-fetch-text');
const fetchSpinner = document.getElementById('fetch-spinner');
const resultBox = document.getElementById('result-box');
const resultThumb = document.getElementById('result-thumb');
const resultVideo = document.getElementById('result-video');
const resultThumbPlay = document.getElementById('result-thumb-play');
const btnDownloadVideo = document.getElementById('btn-download-video');
const btnDownloadAudio = document.getElementById('btn-download-audio');
const errorBox = document.getElementById('error-box');
const errorText = document.getElementById('error-text');
const btnPaste = document.getElementById('btn-paste');
const btnClear = document.getElementById('btn-clear');
const downloadsList = document.getElementById('downloads-list');

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
  resultVideo.hidden = true;
  resultVideo.removeAttribute('src');
  resultVideo.load();
  resultThumb.hidden = false;
  resultThumbPlay.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

function showError(message) {
  hideResult();
  errorText.textContent = message;
  errorBox.hidden = false;
}

// Cada descarga activa tiene su propia tarjeta con su propia barra de
// progreso, así varias descargas simultáneas (video + audio del mismo post,
// o distintos links a la vez) no se pisan entre sí en pantalla.
function createDownloadItem(label) {
  const root = document.createElement('div');
  root.className = 'download-item';
  root.innerHTML = `
    <div class="download-item-icon">⬇</div>
    <div class="download-item-body">
      <div class="download-item-top">
        <span class="download-item-label"></span>
        <span class="download-item-status"></span>
      </div>
      <div class="download-item-bar"><div class="download-item-bar-fill"></div></div>
    </div>
    <button type="button" class="download-item-close" aria-label="Dismiss">✕</button>
  `;
  root.querySelector('.download-item-label').textContent = label;
  const statusEl = root.querySelector('.download-item-status');
  const barFillEl = root.querySelector('.download-item-bar-fill');
  const closeBtn = root.querySelector('.download-item-close');

  downloadsList.appendChild(root);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    root.remove();
  };
  closeBtn.addEventListener('click', () => {
    if (item.onClose) item.onClose();
    remove();
  });

  const item = {
    setText(text) {
      statusEl.textContent = text;
    },
    setPercent(percent) {
      barFillEl.style.width = `${Math.min(100, Math.max(0, parseFloat(percent) || 0))}%`;
    },
    setState(state) {
      root.classList.toggle('is-done', state === 'done');
      root.classList.toggle('is-error', state === 'error');
    },
    remove,
    onClose: null,
  };
  return item;
}

function setFetching(isFetching) {
  btnFetch.disabled = isFetching;
  fetchSpinner.hidden = !isFetching;
  btnFetchText.textContent = isFetching ? I18N.t('btn_fetching') : I18N.t('btn_fetch');
}

// Dentro de la barra de búsqueda: "Paste" cuando está vacía, o "Clear" +
// "Download" cuando ya hay un link escrito/pegado.
function updateInputActions() {
  const hasText = urlInput.value.trim().length > 0;
  btnPaste.hidden = hasText;
  btnClear.hidden = !hasText;
  btnFetch.hidden = !hasText;
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

  // Vista previa reproducible: si el servidor nos dio la URL directa del
  // video, la usamos; si falla en cargar (o no vino), nos quedamos con la
  // miniatura estática de siempre.
  if (data.previewUrl) {
    resultVideo.src = data.previewUrl;
    resultVideo.hidden = false;
    resultThumb.hidden = true;
    resultThumbPlay.hidden = true;
    resultVideo.onerror = () => {
      DebugLog.log('Video preview failed to load, falling back to thumbnail');
      resultVideo.hidden = true;
      resultThumb.hidden = false;
      resultThumbPlay.hidden = false;
    };
  }
}

urlInput.addEventListener('input', () => {
  updateInputActions();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchInfo, 600);
});
urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    updateInputActions();
    fetchInfo();
  }, 50);
});

btnFetch.addEventListener('click', fetchInfo);

btnClear.addEventListener('click', () => {
  urlInput.value = '';
  updateInputActions();
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
        updateInputActions();
        fetchInfo();
        return;
      }
    }
  } catch (err) {
    DebugLog.log('Clipboard read failed', err.message);
  }
  urlInput.focus();
});

updateInputActions();

btnDownloadVideo.addEventListener('click', () => download('mp4', bestVideoFormatId));
btnDownloadAudio.addEventListener('click', () => download('mp3'));

// Cada descarga usa su propio jobId y su propio EventSource, así que varias
// pueden correr a la vez sin pisarse (por ejemplo, video y audio del mismo
// post, o descargas de distintos links en paralelo).
function download(format, formatId) {
  const url = urlInput.value.trim();

  if (!url) {
    status.textContent = I18N.t('status_paste_first');
    return;
  }
  if (!INSTAGRAM_URL_RE.test(url)) {
    status.textContent = I18N.t('status_invalid_link');
    return;
  }

  status.textContent = '';

  const jobId = makeJobId();
  let target = `/api/download?url=${encodeURIComponent(url)}&format=${format}&jobId=${jobId}`;
  if (formatId) target += `&formatId=${encodeURIComponent(formatId)}`;

  DebugLog.log('Starting download', { url, format, formatId, jobId });

  const label = I18N.t(format === 'mp3' ? 'label_audio' : 'label_video');
  const item = createDownloadItem(label);
  item.setText(I18N.t('status_connecting'));

  // El servidor emite el progreso real de yt-dlp (porcentaje, velocidad, ETA)
  // por Server-Sent Events, así el estado no es solo un spinner ciego.
  const source = new EventSource(`/api/progress/${jobId}`);
  item.onClose = () => source.close();

  const stop = (finalText, state) => {
    DebugLog.log('Closing progress connection', finalText);
    source.close();
    item.setText(finalText);
    if (state) item.setState(state);
    if (state === 'done') {
      setTimeout(() => item.remove(), 4000);
    }
  };

  source.onopen = () => DebugLog.log('EventSource opened');

  source.onerror = () => {
    // EventSource dispara 'onerror' tanto en errores reales de conexión
    // como al cerrarse la conexión normalmente tras 'done' o 'error'.
    DebugLog.log('EventSource onerror (native)', `readyState=${source.readyState}`);
  };

  source.addEventListener('queued', (e) => {
    const { position, active } = JSON.parse(e.data);
    item.setText(I18N.t('status_queued', position, active));
    DebugLog.log('queued', e.data);
  });

  source.addEventListener('started', () => {
    item.setText(I18N.t('status_started'));
    DebugLog.log('started received');
  });

  source.addEventListener('progress', (e) => {
    const { percent, total, speed, eta } = JSON.parse(e.data);
    item.setPercent(percent);
    item.setText(I18N.t('status_downloading', percent, total, speed, eta));
    DebugLog.log('progress', e.data);
  });

  source.addEventListener('done', () => {
    DebugLog.log('done received');
    item.setPercent(100);
    stop(I18N.t('status_done'), 'done');
  });

  source.addEventListener('error', (e) => {
    DebugLog.log('server error event', e.data || '(no data, likely a normal close)');
    if (e.data) {
      const data = JSON.parse(e.data);
      stop(data.error || I18N.t('status_generic_error'), 'error');
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
      stop(I18N.t('status_timeout'), 'error');
    }
  }, 6 * 60 * 1000);
}
