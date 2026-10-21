// Ponto de entrada: navegação entre telas, partida contra bots e salas online.

import { buildRules, VARIANTS } from './engine/rules.js';
import { tableFeltCSS } from './ui/cardArt.js';
import { loadSettings, saveSettings, storeGet, storeSet } from './settings.js';
import { homeHTML, setupHTML, onlineHTML, lobbyHTML, rulesScreenHTML, settingsHTML } from './ui/menus.js';
import { mountGame } from './ui/gameView.js';
import { LocalGame } from './controllers/local.js';
import { Room, HostController, ClientController, botName, normalizeCode } from './net/room.js';
import { firebaseConfig } from './net/firebase-config.js';
import { setSoundEnabled } from './ui/sound.js';
import { toast, esc } from './ui/dom.js';

const SAVE_LOCAL = 'buraco.localGame.v1';
const SAVE_ROOM = 'buraco.room.v1';
const SAVE_SETUP = 'buraco.setup.v1';

const params = new URLSearchParams(location.search);
const TEST_ONLINE = params.has('teste-online'); // banco em memória, para testar telas sem Firebase

const appEl = document.getElementById('app');
const style = document.createElement('style');
style.textContent = tableFeltCSS('green');
document.head.appendChild(style);

const app = {
  screen: 'home',
  settings: loadSettings(),
  setup: { numPlayers: 4, partner: 'medio', opponents: 'medio', variant: 'aberto', rules: {}, ...storeGet(SAVE_SETUP, {}) },
  online: { name: '', code: normalizeCode(params.get('sala')), busy: false, error: '' },
  db: null,
  room: null,
  roomUnsub: null,
  lobbySel: null,
  editing: false,
  gameUI: null,
  controller: null,
};
app.online.name = app.settings.name;
setSoundEnabled(app.settings.sound);

function persistSettings() {
  saveSettings(app.settings);
  setSoundEnabled(app.settings.sound);
}

const onlineReady = () => TEST_ONLINE || !!firebaseConfig;

// ---------------- navegação ----------------

function show(screen) {
  app.screen = screen;
  document.body.classList.toggle('in-game', screen === 'game');
  if (screen !== 'game') leaveGameMode();
  render();
  window.scrollTo(0, 0);
}

function render() {
  switch (app.screen) {
    case 'home':
      appEl.innerHTML = homeHTML({ hasSaved: !!storeGet(SAVE_LOCAL), savedRoom: onlineReady() ? storeGet(SAVE_ROOM) : null, onlineReady: onlineReady() });
      break;
    case 'setup':
      appEl.innerHTML = setupHTML(app.setup);
      break;
    case 'online':
      appEl.innerHTML = onlineHTML({ ready: onlineReady(), ...app.online });
      break;
    case 'lobby':
      if (app.room && app.room.meta) appEl.innerHTML = lobbyHTML(app.room, { sel: app.lobbySel, editing: app.editing });
      break;
    case 'rules':
      appEl.innerHTML = rulesScreenHTML();
      break;
    case 'settings':
      appEl.innerHTML = settingsHTML(app.settings);
      break;
  }
}

// Seletores de opção (botões segmentados)
function applySeg(target, field, raw) {
  let val = raw;
  if (raw === 'true') val = true;
  else if (raw === 'false') val = false;
  else if (/^\d+$/.test(raw)) val = Number(raw);
  if (['variant', 'numPlayers', 'partner', 'opponents'].includes(field)) {
    target[field] = val;
    if (field === 'variant') {
      // ao trocar de modo, mantém só a pontuação e o tempo por vez
      const { target: t, turnTime } = target.rules;
      target.rules = {};
      if (t != null) target.rules.target = t;
      if (turnTime != null) target.rules.turnTime = turnTime;
    }
  } else {
    target.rules = { ...target.rules, [field]: val };
  }
}

appEl.addEventListener('click', async (e) => {
  if (app.screen === 'game') return;
  const segBtn = e.target.closest('.seg [data-val]');
  if (segBtn && segBtn.closest('[data-field]')) {
    const field = segBtn.closest('[data-field]').dataset.field;
    const target = app.screen === 'lobby' ? app.lobbySel : app.setup;
    applySeg(target, field, segBtn.dataset.val);
    if (app.screen === 'setup') storeSet(SAVE_SETUP, app.setup);
    render();
    return;
  }
  const setBtn = e.target.closest('[data-set]');
  if (setBtn) {
    const k = setBtn.dataset.set;
    let v = setBtn.dataset.val;
    if (v === 'true') v = true;
    if (v === 'false') v = false;
    app.settings[k] = v;
    persistSettings();
    render();
    return;
  }
  const seatBtn = e.target.closest('[data-seat]');
  if (seatBtn && app.room) {
    await seatOp(Number(seatBtn.dataset.seat), seatBtn.dataset.op, seatBtn.dataset.level);
    return;
  }
  const go = e.target.closest('[data-go]');
  if (!go) return;
  const where = go.dataset.go;
  switch (where) {
    case 'home':
    case 'setup':
    case 'rules':
    case 'settings':
      return show(where);
    case 'online':
      return show('online');
    case 'resume':
      return resumeLocal();
    case 'startLocal':
      return askName(startLocal);
    case 'createRoom':
      return askName(createRoom);
    case 'joinRoom':
      if (app.online.code.length !== 5) {
        app.online.error = 'O código da sala tem 5 letras/números';
        return render();
      }
      return askName(joinRoom);
    case 'rejoin':
      return rejoin();
    case 'share':
      return shareRoom();
    case 'editRules':
      app.editing = true;
      app.lobbySel = { variant: app.room.meta.cfg.variant || 'aberto', rules: pickRuleFields(app.room.meta.cfg), numPlayers: app.room.numPlayers };
      return render();
    case 'saveRules':
      app.editing = false;
      await app.room.setRules({ variant: app.lobbySel.variant, rules: app.lobbySel.rules, numPlayers: app.lobbySel.numPlayers });
      return render();
    case 'startOnline':
      return startOnline();
    case 'leaveRoom':
      return leaveRoom();
  }
});

appEl.addEventListener('input', (e) => {
  if (e.target.id === 'setName') {
    app.settings.name = e.target.value.trim().slice(0, 16);
    app.online.name = app.settings.name;
    persistSettings();
  }
  if (e.target.id === 'code') {
    const c = normalizeCode(e.target.value);
    if (e.target.value !== c) e.target.value = c;
    app.online.code = c;
  }
});

function pickRuleFields(cfg) {
  const { discardMode, allowSets, goOutRequires, jokers, aceToAce, target, turnTime } = cfg;
  return cfg.variant === 'personalizado'
    ? { discardMode, allowSets, goOutRequires, jokers, aceToAce, target, turnTime }
    : { target, turnTime };
}

function myName() {
  return app.settings.name || 'Você';
}

// Pede o nome da pessoa antes de entrar na partida (vem preenchido com o último usado).
function askName(next) {
  document.querySelector('.modal.name-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal name-modal';
  modal.innerHTML = `<form class="panel" novalidate>
      <h2>Como você se chama?</h2>
      <p>Seu nome aparece para os outros jogadores na mesa.</p>
      <input id="askName" class="input" maxlength="16" placeholder="Seu nome" autocomplete="nickname" enterkeyhint="go" value="${esc(app.settings.name)}">
      <p class="error-text hidden">Digite seu nome para entrar.</p>
      <button class="btn primary" type="submit">Entrar na partida</button>
      <button class="btn ghost" type="button" data-cancel>Voltar</button>
    </form>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form');
  const input = modal.querySelector('#askName');
  const err = modal.querySelector('.error-text');
  const close = () => modal.remove();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) {
      err.classList.remove('hidden');
      input.focus();
      return;
    }
    app.settings.name = name;
    app.online.name = name;
    persistSettings();
    close();
    next();
  });
  modal.querySelector('[data-cancel]').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

// ---------------- partida no aparelho ----------------

function startLocal() {
  const s = app.setup;
  const cfg = buildRules(s.variant, s.rules);
  let players;
  if (s.numPlayers === 4) {
    players = [
      { name: myName(), bot: null },
      { name: botName(1), bot: s.opponents },
      { name: botName(2), bot: s.partner },
      { name: botName(3), bot: s.opponents },
    ];
  } else {
    players = [
      { name: myName(), bot: null },
      { name: botName(1), bot: s.opponents },
    ];
  }
  launchLocal({ cfg, players });
}

function launchLocal({ cfg, players, state }) {
  const ctrl = new LocalGame({
    cfg,
    players,
    state,
    humanSeat: 0,
    speed: app.settings.botSpeed,
    botChat: app.settings.botChat !== false,
    onSave: (st) => storeSet(SAVE_LOCAL, st.phase === 'gameOver' ? null : { state: st }),
  });
  mountGameScreen(ctrl, {
    onExit: () => {
      ctrl.destroy();
      show('home');
    },
    onRematch: () => {
      ctrl.destroy();
      launchLocal({ cfg: ctrl.state.cfg, players: ctrl.state.players });
    },
  });
}

function resumeLocal() {
  const saved = storeGet(SAVE_LOCAL);
  if (!saved || !saved.state) return show('home');
  launchLocal({ state: saved.state, cfg: saved.state.cfg, players: saved.state.players });
}

// ---------------- tela do jogo (sempre na horizontal) ----------------

function mountGameScreen(controller, { onExit, onRematch, online = null }) {
  if (app.gameUI) app.gameUI.destroy();
  app.controller = controller;
  appEl.innerHTML = '<div class="stage"></div>';
  show('game');
  const stage = appEl.querySelector('.stage');
  fitStage();
  app.gameUI = mountGame(stage, controller, {
    settings: app.settings,
    online,
    onExit: () => {
      app.gameUI && app.gameUI.destroy();
      app.gameUI = null;
      app.controller = null;
      onExit();
    },
    onRematch,
    onSettingsChange: () => persistSettings(),
  });
  controller.start();
  enterGameMode();
}

function fitStage() {
  const stage = appEl.querySelector('.stage');
  if (!stage) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const portrait = h > w * 1.05;
  const W = portrait ? h : w;
  const H = portrait ? w : h;
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  stage.style.transform = portrait ? `translateX(${w}px) rotate(90deg)` : 'none';
  stage.style.setProperty('--W', W + 'px');
  stage.style.setProperty('--H', H + 'px');
  stage.classList.toggle('rotated', portrait);
  if (app.gameUI) app.gameUI.relayout();
}

window.addEventListener('resize', () => {
  if (app.screen === 'game') fitStage();
});
window.addEventListener('orientationchange', () => setTimeout(fitStage, 200));

// Tenta tela cheia + travar na horizontal (funciona no Android; no iPhone a tela gira via CSS).
async function enterGameMode() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer: coarse)').matches) await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch {
    /* não suportado: a tela gira por CSS */
  }
  setTimeout(fitStage, 300);
}

function leaveGameMode() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  } catch {
    /* ignorado */
  }
}

// ---------------- online ----------------

async function getDb() {
  if (app.db) return app.db;
  if (TEST_ONLINE) {
    const { MemoryHub } = await import('./net/memoryDb.js');
    app.db = new MemoryHub().client('teste-' + Math.random().toString(36).slice(2, 7));
    return app.db;
  }
  const { createFirebaseDb } = await import('./net/firebaseDb.js');
  app.db = await createFirebaseDb(firebaseConfig);
  return app.db;
}

async function withBusy(fn) {
  app.online.busy = true;
  app.online.error = '';
  render();
  try {
    await fn();
  } catch (e) {
    console.error(e);
    app.online.error = friendlyError(e);
    app.online.busy = false;
    if (app.screen === 'online') render();
    else toast(app.online.error, 'error');
    return;
  }
  app.online.busy = false;
}

function friendlyError(e) {
  const m = (e && e.message) || String(e);
  if (/permission|PERMISSION/i.test(m)) return 'O Firebase recusou o acesso. Confira as regras do banco (FIREBASE.md).';
  if (/network|Failed to fetch|offline/i.test(m)) return 'Sem conexão com a internet.';
  if (/auth\/(operation-not-allowed|admin-restricted)/.test(m)) return 'Ative o login "Anônimo" no Firebase Authentication (FIREBASE.md).';
  return m;
}

async function createRoom() {
  await withBusy(async () => {
    const db = await getDb();
    const s = app.setup;
    const room = await Room.create(db, { name: app.settings.name, variant: s.variant, rules: s.rules, numPlayers: s.numPlayers });
    enterLobby(room);
  });
}

async function joinRoom() {
  await withBusy(async () => {
    const db = await getDb();
    const room = await Room.join(db, app.online.code, app.settings.name);
    enterRoom(room);
  });
}

async function rejoin() {
  const saved = storeGet(SAVE_ROOM);
  if (!saved) return show('home');
  app.screen = 'online';
  await withBusy(async () => {
    const db = await getDb();
    let room;
    try {
      room = await Room.join(db, saved.code, app.settings.name || 'Jogador');
    } catch (e) {
      storeSet(SAVE_ROOM, null);
      throw e;
    }
    enterRoom(room);
  });
}

// Entra na sala no estado em que ela estiver (sala de espera ou partida em andamento).
async function enterRoom(room) {
  if (room.meta.status === 'playing') {
    storeSet(SAVE_ROOM, { code: room.code });
    app.room = room;
    watchRoom(room);
    if (room.isHost) {
      const priv = await room.db.get(`${room.base}/private`);
      startHost(room, priv ? JSON.parse(priv) : null);
    } else if (room.mySeat() >= 0) startClient(room);
    return;
  }
  enterLobby(room);
}

function enterLobby(room) {
  app.room = room;
  app.editing = false;
  storeSet(SAVE_ROOM, { code: room.code });
  watchRoom(room);
  show('lobby');
}

function watchRoom(room) {
  app.roomUnsub && app.roomUnsub();
  let lastStatus = room.meta.status;
  app.roomUnsub = room.onChange((r) => {
    const status = r.meta ? r.meta.status : 'closed';
    if (status === 'closed') {
      if (!r.isHost) toast('O anfitrião encerrou a sala', 'info', 4000);
      dropRoom();
      return;
    }
    if (status === 'playing' && lastStatus !== 'playing' && !r.isHost && app.screen !== 'game') {
      lastStatus = status;
      if (r.mySeat() >= 0) startClient(r);
      return;
    }
    lastStatus = status;
    if (app.screen === 'lobby' && !app.editing) render();
  });
}

function dropRoom() {
  app.roomUnsub && app.roomUnsub();
  app.roomUnsub = null;
  if (app.controller) app.controller.destroy();
  if (app.gameUI) app.gameUI.destroy();
  app.gameUI = null;
  app.controller = null;
  if (app.room) app.room.dispose();
  app.room = null;
  storeSet(SAVE_ROOM, null);
  show('home');
}

async function leaveRoom() {
  const room = app.room;
  if (room) {
    try {
      await room.close();
    } catch (e) {
      console.warn(e);
    }
  }
  dropRoom();
}

async function seatOp(i, op, level) {
  const room = app.room;
  try {
    if (op === 'sit') await room.claimSeat(i, app.settings.name || 'Jogador');
    else if (op === 'bot') await room.setBot(i, 'medio');
    else if (op === 'level') await room.setBot(i, level);
    else if (op === 'open') await room.openSeat(i);
  } catch (e) {
    toast(friendlyError(e), 'error');
  }
}

async function shareRoom() {
  const url = `${location.origin}${location.pathname}?sala=${app.room.code}`;
  const text = `Bora jogar Buraco? Entre na sala ${app.room.code}: ${url}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Buraco entre Amigos', text, url });
    else {
      await navigator.clipboard.writeText(text);
      toast('Convite copiado! Cole no WhatsApp.');
    }
  } catch {
    /* compartilhamento cancelado */
  }
}

async function startOnline() {
  const room = app.room;
  try {
    room.playersFromSeats();
  } catch (e) {
    return toast(e.message, 'error');
  }
  startHost(room, null);
}

function startHost(room, state) {
  const ctrl = new HostController(room, { state, speed: app.settings.botSpeed, botChat: app.settings.botChat !== false });
  mountGameScreen(ctrl, {
    online: ctrl,
    onExit: () => leaveRoom(),
    onRematch: () => {
      ctrl.destroy();
      startHost(room, null);
    },
  });
}

function startClient(room) {
  const ctrl = new ClientController(room);
  mountGameScreen(ctrl, {
    online: ctrl,
    onExit: () => leaveRoom(),
  });
}

// ---------------- início ----------------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (app.online.code) show('online');
else show('home');

// Para depuração no console
window.__buraco = { app, VARIANTS };
