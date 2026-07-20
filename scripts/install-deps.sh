#!/usr/bin/env bash
# Descarga yt-dlp dentro del propio proyecto (carpeta bin/) como parte de
# "npm install". No requiere sudo ni permisos de sistema: sirve tanto para un
# VPS con acceso root como para hosting compartido/paneles web sin terminal.
#
# Usamos el binario standalone "yt-dlp_linux": trae su propio intérprete de
# Python empaquetado, así que no depende de la versión de Python del sistema
# (varios hostings traen Python 3.6, mientras que yt-dlp moderno requiere 3.10+).
#
# ffmpeg se resuelve aparte con el paquete npm "ffmpeg-static" (ver server.js).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_ROOT/bin"
YTDLP_BIN="$BIN_DIR/yt-dlp"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"

log() { echo "[install-deps] $1"; }

# No basta con que exista y sea ejecutable: verificamos que de verdad corra,
# porque una instalación previa rota (p. ej. la versión que necesitaba
# Python del sistema) no debe quedarse ahí bloqueando la reinstalación.
if [ -x "$YTDLP_BIN" ] && "$YTDLP_BIN" --version >/dev/null 2>&1; then
  log "yt-dlp local ya presente y funcional en $YTDLP_BIN"
  exit 0
fi

mkdir -p "$BIN_DIR"

log "Descargando yt-dlp (standalone, sin depender de Python del sistema) a $YTDLP_BIN..."
if curl -fsSL "$YTDLP_URL" -o "$YTDLP_BIN"; then
  chmod u+x "$YTDLP_BIN"
  if "$YTDLP_BIN" --version >/dev/null 2>&1; then
    log "yt-dlp instalado y verificado correctamente."
  else
    log "yt-dlp se descargó pero no logró ejecutarse. Revisa los registros del servidor al iniciar."
  fi
else
  log "No se pudo descargar yt-dlp (¿sin acceso a internet saliente desde el hosting?)."
  log "El servidor seguirá buscando un 'yt-dlp' en el PATH del sistema como respaldo."
fi
