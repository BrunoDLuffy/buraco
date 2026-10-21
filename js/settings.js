// Preferências do jogador, salvas no aparelho.

const KEY = 'buraco.settings.v1';

export const DEFAULT_SETTINGS = {
  name: '',
  felt: 'green',
  back: 'blue',
  sound: true,
  vibrate: true,
  botSpeed: 'normal', // lento | normal | rapido
  sortMode: 'suit',
  botChat: true, // bots mandam mensagens no chat
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível */
  }
}

export function storeGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function storeSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento indisponível */
  }
}
