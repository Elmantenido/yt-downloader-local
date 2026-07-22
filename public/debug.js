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

  function markCopied() {
    copyBtn.textContent = 'Copiado';
    setTimeout(() => { copyBtn.textContent = 'Copiar log'; }, 1500);
  }

  copyBtn.addEventListener('click', () => {
    const text = lines.join('\n');

    // navigator.clipboard solo existe en contextos seguros (HTTPS o
    // localhost); por IP+HTTP plano el navegador ni siquiera define la API.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(markCopied);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      markCopied();
    } finally {
      textarea.remove();
    }
  });

  return { log };
})();
