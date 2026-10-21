// Pequenos utilitários de DOM.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

let toastTimer = null;
export function toast(msg, kind = 'info', ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), ms);
}

export function vibrate(ms = 15) { // ms pode ser um número ou um padrão [vibra, pausa, vibra]
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* sem vibração */
  }
}
