require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const pLimit = require('p-limit');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');

// Cada descarga lanza yt-dlp + ffmpeg (CPU y ancho de banda pesados). Sin
// límite, muchas descargas simultáneas saturarían el servidor. Las que
// excedan el límite esperan en cola en vez de arrancar todas a la vez.
// Ajustable según los recursos del VPS con la variable de entorno.
const DOWNLOAD_CONCURRENCY = parseInt(process.env.DOWNLOAD_CONCURRENCY || '4', 10);
const downloadLimit = pLimit(DOWNLOAD_CONCURRENCY);

// Si yt-dlp se queda colgado (p. ej. por una conexión de red caída), sin
// timeout el proceso ocuparía un cupo de la cola para siempre.
const FORMATS_TIMEOUT_MS = 2 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const app = express();
const PORT = process.env.PORT || 3000;

// contentSecurityPolicy desactivado: el HTML usa atributos onclick="" inline,
// que la CSP por defecto de helmet bloquearía. El resto de protecciones
// (X-Frame-Options, X-Content-Type-Options, etc.) quedan activas.
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);

// Sin usuario/contraseña configurados, cualquiera con la IP puede usar el
// servidor como descargador gratuito (consumiendo tu ancho de banda y CPU).
// Se activa solo si se definen ambas variables de entorno.
if (process.env.APP_USERNAME && process.env.APP_PASSWORD) {
  app.use(
    basicAuth({
      users: { [process.env.APP_USERNAME]: process.env.APP_PASSWORD },
      challenge: true,
      realm: 'Instagram Downloader',
    })
  );
  console.log('[startup] Autenticación activada (APP_USERNAME/APP_PASSWORD).');
} else {
  console.warn(
    '[startup] ADVERTENCIA: sin APP_USERNAME/APP_PASSWORD configurados, el servidor queda ABIERTO a cualquiera. ' +
    'Defínelos como variables de entorno antes de exponerlo en una IP pública.'
  );
}

// Límite de peticiones por IP: no evita que alguien autenticado abuse, pero
// frena scripts que intenten martillar el servidor con muchas peticiones.
const formatsRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const downloadRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const INSTAGRAM_URL_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\//i;
const PROGRESS_RE = /\[download\]\s+([\d.]+)% of\s+([\d.]+\w+) at\s+([\d.]+\w+\/s|Unknown speed) ETA\s+([\d:]+|Unknown)/;

function worksAsExecutable(binPath) {
  if (!fs.existsSync(binPath)) return false;
  try {
    fs.chmodSync(binPath, 0o755);
  } catch (err) {
    // seguimos e intentamos igual: puede que ya tenga permisos suficientes
  }
  const result = spawnSync(binPath, ['--version']);
  return !result.error && result.status === 0;
}

// yt-dlp no se puede instalar vía npm de forma confiable. scripts/install-deps.sh
// lo descarga sin sudo, primero dentro del proyecto y, si esa carpeta no
// permite ejecutar binarios (algunos hostings restringen esto: "failed to map
// segment from shared object"), en /tmp como respaldo. Probamos ambas rutas
// en el mismo orden y, si ninguna sirve, caemos al PATH del sistema.
const YTDLP_CANDIDATES = [
  // Carpeta creada a mano por el usuario (fuera del pipeline de build/deploy,
  // que en algunos hostings viene con restricciones extra de ejecución).
  // Se configura con la variable de entorno YTDLP_EXTRA_DIR.
  process.env.YTDLP_EXTRA_DIR ? path.join(process.env.YTDLP_EXTRA_DIR, 'yt-dlp') : null,
  path.join(__dirname, 'bin', 'yt-dlp'),
  '/tmp/yt-downloader-bin/yt-dlp',
].filter(Boolean);
const YTDLP_BIN = YTDLP_CANDIDATES.find(worksAsExecutable) || 'yt-dlp';

if (ffmpegPath) {
  try {
    fs.chmodSync(ffmpegPath, 0o755);
  } catch (err) {
    console.warn(`[startup] No se pudo poner ${ffmpegPath} como ejecutable: ${err.message}`);
  }
}
const FFMPEG_LOCATION_ARGS = ffmpegPath ? ['--ffmpeg-location', ffmpegPath] : [];

// jobId -> SSE response, para avisarle al navegador el progreso real de yt-dlp.
const progressClients = new Map();

// La raíz redirige a /en en vez de servir el mismo HTML en dos URLs: sin
// esto, "/" y "/en" serían contenido duplicado para buscadores como Google.
app.get('/', (req, res) => {
  res.redirect(301, '/en');
});

app.use(express.static(path.join(__dirname, 'public')));

// El idioma se decide por la ruta, no solo por un botón que cambia texto en
// el lugar: así cada idioma (/en, /es, /fr...) es una URL real que se puede
// compartir o guardar en favoritos. Todas sirven el mismo index.html;
// i18n.js aplica el idioma correcto en el navegador según la ruta.
const LANGUAGE_CODES = [
  'ar', 'bn', 'cs', 'de', 'en', 'es', 'fa', 'fr', 'hi', 'it', 'ja', 'ko',
  'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sv', 'tr', 'vi', 'zh', 'id', 'ms', 'th',
];
app.get(LANGUAGE_CODES.map((code) => `/${code}`), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/progress/:jobId', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  progressClients.set(req.params.jobId, res);

  req.on('close', () => {
    progressClients.delete(req.params.jobId);
  });
});

function sendProgress(jobId, event, data) {
  const client = progressClients.get(jobId);
  if (!client) return;
  client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (event === 'done' || event === 'error') {
    client.end();
    progressClients.delete(jobId);
  }
}

app.get('/api/formats', formatsRateLimit, (req, res) => {
  const { url } = req.query;
  console.log(`[formats] solicitado url=${url}`);

  if (typeof url !== 'string' || !INSTAGRAM_URL_RE.test(url)) {
    return res.status(400).json({ error: 'Invalid link. It must be an Instagram post, reel, or story URL.' });
  }

  const proc = spawn(YTDLP_BIN, ['-J', '--no-playlist', '--no-warnings', url], { timeout: FORMATS_TIMEOUT_MS });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  proc.on('error', (err) => {
    res.status(500).json({ error: 'Could not start yt-dlp: ' + err.message });
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.log(`[formats] yt-dlp salió con código ${code}: ${stderr.slice(-500)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not fetch video information.', detail: stderr.slice(-2000) });
      }
      return;
    }

    try {
      const info = JSON.parse(stdout);

      // Nos quedamos con la mejor variante (preferimos avc1/H.264 por
      // compatibilidad, igual que en /api/download) de cada combinación
      // altura+fps, ya que un mismo video puede traer, por ejemplo, 1080p30 y 1080p60.
      const byResolution = new Map();
      for (const f of info.formats || []) {
        if (!f.height || !f.vcodec || f.vcodec === 'none') continue;
        const key = `${f.height}@${f.fps || 0}`;
        const current = byResolution.get(key);
        const isAvc1 = f.vcodec.startsWith('avc1');
        const currentIsAvc1 = current && current.vcodec.startsWith('avc1');
        if (!current || (isAvc1 && !currentIsAvc1)) {
          byResolution.set(key, f);
        }
      }

      const sortedFormats = Array.from(byResolution.values())
        .sort((a, b) => b.height - a.height || (b.fps || 0) - (a.fps || 0));

      // URL directa del CDN de Instagram para la mejor calidad, para que el
      // navegador pueda reproducir una vista previa antes de descargar. A
      // diferencia de YouTube, Instagram no ató estas URLs a la IP que las
      // resolvió (no vimos ese bloqueo en todo el proyecto), así que sirven
      // tal cual para cualquier visitante.
      const previewUrl = sortedFormats[0]?.url || null;

      const qualities = sortedFormats
        .map((f) => {
          // Algunos formatos no traen filesize ni filesize_approx. En ese
          // caso estimamos el tamaño a partir del bitrate y la duración.
          let filesize = f.filesize || f.filesize_approx || null;
          if (!filesize && f.tbr && info.duration) {
            filesize = Math.round((f.tbr * 1000 / 8) * info.duration);
          }

          return {
            formatId: f.format_id,
            height: f.height,
            fps: f.fps || null,
            width: f.width || null,
            label: f.width && f.height
              ? `${f.width}x${f.height} · ${f.fps || 30} fps`
              : `${f.height}p${f.fps ? ` · ${f.fps} fps` : ''}`,
            filesize,
            filesizeApprox: !(f.filesize),
          };
        });

      res.json({ title: info.title, thumbnail: info.thumbnail, previewUrl, qualities });
    } catch (err) {
      console.log(`[formats] error al parsear info: ${err.message}`);
      res.status(500).json({ error: 'Could not read the video information.' });
    }
  });
});

app.get('/api/download', downloadRateLimit, (req, res) => {
  const { url, format, jobId, quality, formatId } = req.query;
  console.log(`[download] solicitado url=${url} format=${format}`);

  if (typeof url !== 'string' || !INSTAGRAM_URL_RE.test(url)) {
    console.log('[download] rechazado: URL no válida');
    const error = 'Invalid link. It must be an Instagram post, reel, or story URL.';
    if (jobId) sendProgress(jobId, 'error', { error });
    return res.status(400).json({ error });
  }
  if (format !== 'mp4' && format !== 'mp3') {
    console.log('[download] rechazado: formato no válido');
    const error = 'Invalid format. Use mp4 or mp3.';
    if (jobId) sendProgress(jobId, 'error', { error });
    return res.status(400).json({ error });
  }

  if (jobId && downloadLimit.activeCount >= DOWNLOAD_CONCURRENCY) {
    const position = downloadLimit.pendingCount + 1;
    console.log(`[download] en cola (posición ${position}, ${downloadLimit.activeCount} activas)`);
    sendProgress(jobId, 'queued', { position, active: downloadLimit.activeCount });
  }

  downloadLimit(() => runDownload({ url, format, jobId, quality, formatId, res }));
});

function runDownload({ url, format, jobId, quality, formatId, res }) {
  // p-limit solo libera el cupo de concurrencia cuando esta promesa se
  // resuelve, así que se resuelve al final de cada camino posible (éxito,
  // error de spawn, código de salida distinto de cero, envío completado).
  return new Promise((resolveJob) => {
  if (jobId) sendProgress(jobId, 'started', {});

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-'));
  const outputTemplate = path.join(tmpDir, '%(title).150B.%(ext)s');

  // Se prefiere video H.264 (avc1) + audio AAC: yt-dlp por defecto puede elegir
  // AV1/VP9 si pesan menos, pero esos códecs no los reproducen QuickTime ni
  // muchos reproductores de Windows/macOS (se ve/escucha como "sin video").
  const isSafeId = /^[\w.-]+$/.test(formatId || '');
  const heightFilter = /^\d{2,4}$/.test(quality) ? `[height=${quality}]` : '';
  const videoFormat = isSafeId
    // formatId viene de /api/formats: es el itag exacto que el usuario vio en
    // la cuadrícula (resolución + fps), así que lo respetamos tal cual.
    ? `${formatId}+ba[acodec^=mp4a]/${formatId}+ba`
    : heightFilter
      ? `bv*${heightFilter}[vcodec^=avc1]+ba[acodec^=mp4a]/bv*${heightFilter}+ba/bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*+ba/b`
      : 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*+ba/b';

  const args = format === 'mp4'
    ? ['-f', videoFormat, '--merge-output-format', 'mp4', '--no-playlist', '--newline', ...FFMPEG_LOCATION_ARGS, '-o', outputTemplate, url]
    : ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--no-playlist', '--newline', ...FFMPEG_LOCATION_ARGS, '-o', outputTemplate, url];

  const proc = spawn(YTDLP_BIN, args, { timeout: DOWNLOAD_TIMEOUT_MS });

  let stderr = '';
  let stdoutBuffer = '';

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();

    for (const line of lines) {
      const match = line.match(PROGRESS_RE);
      if (match && jobId) {
        sendProgress(jobId, 'progress', {
          percent: match[1],
          total: match[2],
          speed: match[3],
          eta: match[4],
        });
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  proc.on('error', (err) => {
    cleanup(tmpDir);
    if (jobId) sendProgress(jobId, 'error', { error: 'Could not start yt-dlp: ' + err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not start yt-dlp: ' + err.message });
    }
    resolveJob();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.log(`[download] yt-dlp salió con código ${code}: ${stderr.slice(-500)}`);
      cleanup(tmpDir);
      const error = 'The download failed.';
      const detail = stderr.slice(-500);
      if (jobId) sendProgress(jobId, 'error', { error, detail });
      if (!res.headersSent) {
        res.status(500).json({ error, detail: stderr.slice(-2000) });
      }
      resolveJob();
      return;
    }

    const files = fs.readdirSync(tmpDir);
    const resultFile = files.find((f) => f.endsWith(`.${format}`)) || files[0];

    if (!resultFile) {
      console.log('[download] yt-dlp terminó bien pero no generó archivo');
      cleanup(tmpDir);
      const error = 'No file was generated.';
      if (jobId) sendProgress(jobId, 'error', { error });
      if (!res.headersSent) {
        res.status(500).json({ error });
      }
      resolveJob();
      return;
    }

    console.log(`[download] enviando archivo ${resultFile}`);
    if (jobId) sendProgress(jobId, 'done', {});
    const filePath = path.join(tmpDir, resultFile);
    res.download(filePath, resultFile, (err) => {
      if (err) console.log(`[download] error al enviar el archivo: ${err.message}`);
      else console.log('[download] envío completado');
      cleanup(tmpDir);
      resolveJob();
    });
  });
  });
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

function checkDependency(bin, versionFlag) {
  const result = spawnSync(bin, [versionFlag]);
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : (result.stderr || '').toString().trim();
    console.warn(`[startup] ADVERTENCIA: "${bin}" no funciona en este servidor (${reason}). Las descargas fallarán hasta que se resuelva.`);
    return false;
  }
  console.log(`[startup] ${bin} OK (${String(result.stdout).trim().split('\n')[0]})`);
  return true;
}

checkDependency(YTDLP_BIN, '--version');
checkDependency(ffmpegPath || 'ffmpeg', '-version');

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
