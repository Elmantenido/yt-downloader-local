const DebugLog = (() => {
  const panel = document.getElementById('debug-panel');
  const output = document.getElementById('debug-output');
  const copyBtn = document.getElementById('debug-copy');
  const lines = [];

  function timestamp() {
    return new Date().toLocaleTimeString('es', { hour12: false });
  }

  function log(label, detail) {
    const line = detail === undefined
      ? `[${timestamp()}] ${label}`
      : `[${timestamp()}] ${label}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    lines.push(line);
    output.textContent = lines.join('\n');
    panel.hidden = false;
    output.scrollTop = output.scrollHeight;
    console.log(line);
  }

  window.addEventListener('error', (e) => {
    log('Error de JavaScript', `${e.message} (${e.filename}:${e.lineno}:${e.colno})`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    log('Promesa rechazada sin manejar', e.reason && e.reason.message ? e.reason.message : String(e.reason));
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      copyBtn.textContent = 'Copiado';
      setTimeout(() => { copyBtn.textContent = 'Copiar log'; }, 1500);
    });
  });

  return { log };
})();
