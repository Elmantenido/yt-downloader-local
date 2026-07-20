#!/usr/bin/env bash
# Descarga yt-dlp dentro del propio proyecto (carpeta bin/) como parte de
# "npm install". No requiere sudo ni permisos de sistema: sirve tanto para un
# VPS con acceso root como para hosting compartido/paneles web sin terminal.
# ffmpeg se resuelve aparte con el paquete npm "ffmpeg-static" (ver server.js).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_ROOT/bin"
YTDLP_BIN="$BIN_DIR/yt-dlp"

log() { echo "[install-deps] $1"; }

if [ -x "$YTDLP_BIN" ]; then
  log "yt-dlp local ya presente en $YTDLP_BIN"
  exit 0
fi

mkdir -p "$BIN_DIR"

log "Descargando yt-dlp a $YTDLP_BIN..."
if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$YTDLP_BIN"; then
  chmod u+x "$YTDLP_BIN"
  log "yt-dlp instalado correctamente."
else
  log "No se pudo descargar yt-dlp (¿sin acceso a internet saliente desde el hosting?)."
  log "El servidor seguirá buscando un 'yt-dlp' en el PATH del sistema como respaldo."
fi
