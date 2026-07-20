#!/usr/bin/env bash
# Instala yt-dlp y ffmpeg si no están disponibles en el sistema. Pensado para
# correr en un VPS Linux (Debian/Ubuntu) como parte de "npm install".
# No falla el despliegue si algo no se puede instalar: solo avisa. El
# servidor (server.js) igual verifica y advierte al iniciar si faltan.
set -uo pipefail

YTDLP_BIN="/usr/local/bin/yt-dlp"

log() { echo "[install-deps] $1"; }

can_sudo() {
  [ "$(id -u)" = "0" ] && return 0
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null && return 0
  return 1
}

as_root() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  else
    sudo "$@"
  fi
}

if command -v ffmpeg >/dev/null 2>&1; then
  log "ffmpeg ya está instalado: $(command -v ffmpeg)"
elif command -v apt-get >/dev/null 2>&1 && can_sudo; then
  log "Instalando ffmpeg con apt-get..."
  as_root apt-get update -y && as_root apt-get install -y ffmpeg
else
  log "No se pudo instalar ffmpeg automáticamente (falta apt-get o permisos de sudo)."
  log "Instálalo manualmente, por ejemplo: sudo apt install -y ffmpeg"
fi

if command -v yt-dlp >/dev/null 2>&1; then
  log "yt-dlp ya está instalado: $(command -v yt-dlp)"
elif can_sudo; then
  log "Descargando yt-dlp a $YTDLP_BIN..."
  as_root curl -sL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$YTDLP_BIN" \
    && as_root chmod a+rx "$YTDLP_BIN" \
    && log "yt-dlp instalado."
else
  log "No se pudo instalar yt-dlp automáticamente (sin permisos de sudo)."
  log "Instálalo manualmente, por ejemplo:"
  log "  sudo curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o $YTDLP_BIN && sudo chmod a+rx $YTDLP_BIN"
fi
