#!/usr/bin/env bash
# Descarga el binario standalone "yt-dlp_linux" (trae su propio intérprete de
# Python empaquetado, no depende de la versión de Python del sistema) como
# parte de "npm install". No requiere sudo.
#
# Algunos hostings montan la carpeta home con restricciones que impiden
# ejecutar binarios subidos ahí ("failed to map segment from shared object"),
# aunque el archivo tenga permiso +x. Por eso probamos primero dentro del
# proyecto y, si no logra ejecutarse, probamos también en /tmp.
#
# ffmpeg se resuelve aparte con el paquete npm "ffmpeg-static" (ver server.js).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"

log() { echo "[install-deps] $1"; }

try_install() {
  local dest_dir="$1"
  local dest="$dest_dir/yt-dlp"

  if [ -x "$dest" ] && "$dest" --version >/dev/null 2>&1; then
    log "yt-dlp ya funcional en $dest"
    echo "$dest"
    return 0
  fi

  mkdir -p "$dest_dir" 2>/dev/null || return 1
  log "Probando instalar yt-dlp en $dest..."
  curl -fsSL "$YTDLP_URL" -o "$dest" 2>/dev/null || return 1
  chmod u+x "$dest" 2>/dev/null || return 1

  if "$dest" --version >/dev/null 2>&1; then
    log "yt-dlp funciona en $dest"
    echo "$dest"
    return 0
  fi

  log "yt-dlp no logró ejecutarse en $dest (posible restricción de ejecución en esa carpeta)."
  return 1
}

if try_install "$PROJECT_ROOT/bin"; then
  exit 0
fi

log "Reintentando en /tmp (algunos hostings solo permiten ejecutar binarios ahí)..."
if try_install "/tmp/yt-downloader-bin"; then
  exit 0
fi

log "No se pudo dejar yt-dlp funcional en ninguna ubicación probada."
log "El servidor seguirá buscando un 'yt-dlp' en el PATH del sistema como respaldo."
