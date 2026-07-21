const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i;
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

app.use(express.static(path.join(__dirname, 'public')));

// Endpoint temporal de diagnóstico: ayuda a encontrar, desde la perspectiva
// real del proceso Node en el hosting, una carpeta donde sí se puedan
// ejecutar binarios. Se puede borrar una vez resuelto el problema de hosting.
app.get('/api/debug-paths', (req, res) => {
  const sourceCandidate = YTDLP_CANDIDATES.find((c) => fs.existsSync(c));
  const testDirs = [
    os.homedir(),
    path.join(os.homedir(), 'ytdlp-bin'),
    path.join(os.homedir(), 'nodejs'),
    path.join(os.homedir(), 'nodejs', 'ytdlp-bin'),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', 'ytdlp-bin'),
    os.tmpdir(),
  ];

  const results = testDirs.map((dir) => {
    const entry = { dir };
    try {
      entry.exists = fs.existsSync(dir);
      if (!entry.exists) {
        fs.mkdirSync(dir, { recursive: true });
        entry.created = true;
      }
      entry.listing = fs.readdirSync(dir).slice(0, 30);

      if (sourceCandidate) {
        const testFile = path.join(dir, 'yt-dlp-exec-test');
        fs.copyFileSync(sourceCandidate, testFile);
        fs.chmodSync(testFile, 0o755);
        const result = spawnSync(testFile, ['--version']);
        entry.executable = !result.error && result.status === 0;
        entry.execError = result.error ? result.error.message : (result.stderr || '').toString().trim().slice(0, 200);
        fs.rmSync(testFile, { force: true });
      } else {
        entry.executable = null;
        entry.note = 'No hay ningún binario yt-dlp descargado todavía para copiar y probar.';
      }
    } catch (err) {
      entry.error = err.message;
    }
    return entry;
  });

  res.json({
    homedir: os.homedir(),
    cwd: process.cwd(),
    dirname: __dirname,
    ytdlpExtraDirEnv: process.env.YTDLP_EXTRA_DIR || null,
    currentYtdlpBin: YTDLP_BIN,
    results,
  });
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

app.get('/api/formats', (req, res) => {
  const { url } = req.query;
  console.log(`[formats] solicitado url=${url}`);

  if (typeof url !== 'string' || !YOUTUBE_URL_RE.test(url)) {
    return res.status(400).json({ error: 'Enlace de YouTube no válido.' });
  }

  const proc = spawn(YTDLP_BIN, ['-J', '--no-playlist', '--no-warnings', url]);

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  proc.on('error', (err) => {
    res.status(500).json({ error: 'No se pudo iniciar yt-dlp: ' + err.message });
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.log(`[formats] yt-dlp salió con código ${code}: ${stderr.slice(-500)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo obtener información del video.', detail: stderr.slice(-2000) });
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

      const qualities = Array.from(byResolution.values())
        .sort((a, b) => b.height - a.height || (b.fps || 0) - (a.fps || 0))
        .map((f) => ({
          formatId: f.format_id,
          height: f.height,
          fps: f.fps || null,
          width: f.width || null,
          label: f.width && f.height
            ? `${f.width}x${f.height} · ${f.fps || 30} fps`
            : `${f.height}p${f.fps ? ` · ${f.fps} fps` : ''}`,
          filesize: f.filesize || f.filesize_approx || null,
        }));

      res.json({ title: info.title, thumbnail: info.thumbnail, qualities });
    } catch (err) {
      console.log(`[formats] error al parsear info: ${err.message}`);
      res.status(500).json({ error: 'No se pudo leer la información del video.' });
    }
  });
});

app.get('/api/download', (req, res) => {
  const { url, format, jobId, quality, formatId } = req.query;
  console.log(`[download] solicitado url=${url} format=${format}`);

  if (typeof url !== 'string' || !YOUTUBE_URL_RE.test(url)) {
    console.log('[download] rechazado: URL no válida');
    const error = 'Enlace de YouTube no válido.';
    if (jobId) sendProgress(jobId, 'error', { error });
    return res.status(400).json({ error });
  }
  if (format !== 'mp4' && format !== 'mp3') {
    console.log('[download] rechazado: formato no válido');
    const error = 'Formato no válido. Usa mp4 o mp3.';
    if (jobId) sendProgress(jobId, 'error', { error });
    return res.status(400).json({ error });
  }

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

  const proc = spawn(YTDLP_BIN, args);

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
    if (jobId) sendProgress(jobId, 'error', { error: 'No se pudo iniciar yt-dlp: ' + err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo iniciar yt-dlp: ' + err.message });
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.log(`[download] yt-dlp salió con código ${code}: ${stderr.slice(-500)}`);
      cleanup(tmpDir);
      const error = 'Falló la descarga.';
      const detail = stderr.slice(-500);
      if (jobId) sendProgress(jobId, 'error', { error, detail });
      if (!res.headersSent) {
        res.status(500).json({ error, detail: stderr.slice(-2000) });
      }
      return;
    }

    const files = fs.readdirSync(tmpDir);
    const resultFile = files.find((f) => f.endsWith(`.${format}`)) || files[0];

    if (!resultFile) {
      console.log('[download] yt-dlp terminó bien pero no generó archivo');
      cleanup(tmpDir);
      const error = 'No se generó ningún archivo.';
      if (jobId) sendProgress(jobId, 'error', { error });
      if (!res.headersSent) {
        res.status(500).json({ error });
      }
      return;
    }

    console.log(`[download] enviando archivo ${resultFile}`);
    if (jobId) sendProgress(jobId, 'done', {});
    const filePath = path.join(tmpDir, resultFile);
    res.download(filePath, resultFile, (err) => {
      if (err) console.log(`[download] error al enviar el archivo: ${err.message}`);
      else console.log('[download] envío completado');
      cleanup(tmpDir);
    });
  });
});

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
