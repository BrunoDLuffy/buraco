// Partida no próprio aparelho: 1 pessoa contra bots (os bots rodam aqui mesmo).
// Também serve de base para o anfitrião da partida online.

import { newGame, applyAction, getView } from '../engine/game.js';
import { botAction } from '../ai/bot.js';
import { eventLines, replyLine } from '../ai/botChat.js';
import { LocalChat } from '../net/chat.js';

const SPEED = { lento: 1.6, normal: 1, rapido: 0.45 };

export class LocalGame {
  // players: [{ name, bot }] — bot null = pessoa
  // chat: canal de mensagens (LocalChat ou RoomChat). botChat: bots falam no chat.
  constructor({ cfg, players, humanSeat = 0, seed, state, speed = 'normal', onSave, chat, botChat = true }) {
    this.state = state || newGame({ cfg, players, seed: seed ?? Math.floor(Math.random() * 2 ** 31) });
    this.mySeat = humanSeat;
    this.listeners = new Set();
    this.timer = null;
    this.speed = typeof speed === 'number' ? speed : (SPEED[speed] ?? 1);
    this.onSave = onSave;
    this.destroyed = false;
    this.isHost = true;
    this.chat = chat || new LocalChat();
    this.botChat = botChat;
    this.chatTimers = new Set();
    this.createdAt = Date.now();
    // tempo por vez
    this.turnTimer = null;
    this.timerKey = null;
    this.deadline = null;
    this.lastBotLine = 0;
    // responde às mensagens novas de pessoas (ignora o histórico que já existia)
    let known = null;
    this.unsubChat = this.chat.subscribe((msgs) => {
      if (known === null) {
        known = new Set(msgs.map((m) => m.id));
        return;
      }
      for (const m of msgs) {
        if (known.has(m.id)) continue;
        known.add(m.id);
        if (m.bot || !this.botChat || (m.t && m.t < this.createdAt - 3000)) continue;
        const p = this.state.players[m.seat];
        if (!p || p.bot) continue;
        const line = replyLine(m, this.state);
        if (line) this.botSay(line, 1200 + Math.random() * 1500, true);
      }
    });
  }

  // Mensagem desta pessoa no chat.
  chatSend(text) {
    const p = this.state.players[this.mySeat];
    return this.chat.send({ seat: this.mySeat, name: p ? p.name : 'Jogador', text });
  }

  botSay({ seat, text }, delay, isReply = false) {
    if (this.destroyed) return;
    const now = Date.now();
    // reações a lances têm um intervalo mínimo; respostas a pessoas não
    if (!isReply && now - this.lastBotLine < 7000) return;
    if (!isReply) this.lastBotLine = now;
    const timer = setTimeout(() => {
      this.chatTimers.delete(timer);
      if (this.destroyed) return;
      const p = this.state.players[seat];
      if (p && p.bot) this.chat.send({ seat, name: p.name, text, bot: true });
    }, delay);
    this.chatTimers.add(timer);
  }

  reactInChat(prev, next) {
    if (!this.botChat) return;
    eventLines(prev, next).forEach((line, i) => this.botSay(line, 700 + i * 1300 + Math.random() * 600));
  }

  start() {
    this.emit();
    this.scheduleBots();
  }

  setSpeed(speed) {
    this.speed = typeof speed === 'number' ? speed : (SPEED[speed] ?? 1);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  view() {
    return { ...getView(this.state, this.mySeat), turnEndsIn: this.turnEndsIn() };
  }

  // Liga o relógio quando começa a vez de uma pessoa (bots não precisam).
  updateTurnTimer() {
    const s = this.state;
    const T = (s.cfg && s.cfg.turnTime) || 0;
    const active = !this.destroyed && T > 0 && (s.phase === 'draw' || s.phase === 'play') && !s.players[s.turn].bot;
    const key = active ? `${s.round}:${s.turnNo}` : null;
    if (key === this.timerKey) return;
    clearTimeout(this.turnTimer);
    this.timerKey = key;
    this.deadline = null;
    if (!key) return;
    this.deadline = Date.now() + T * 1000;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(key), T * 1000 + 50);
  }

  turnEndsIn() {
    return this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
  }

  // Acabou o tempo: o motor compra (se precisar) e descarta uma carta aleatória.
  onTurnTimeout(key) {
    if (this.destroyed || key !== this.timerKey) return;
    const seat = this.state.turn;
    const r = applyAction(this.state, seat, { type: 'timeout' });
    if (!r.ok) {
      console.error('Não deu para passar a vez por tempo', r.error);
      return;
    }
    const prev = this.state;
    this.state = r.state;
    this.reactInChat(prev, this.state);
    this.emit();
    this.scheduleBots();
  }

  emit() {
    this.updateTurnTimer();
    const v = this.view();
    for (const fn of this.listeners) fn(v);
    if (this.onSave) this.onSave(this.state);
  }

  // Jogada de uma pessoa (deste aparelho).
  async act(action) {
    return this.apply(this.mySeat, action);
  }

  apply(seat, action) {
    const r = applyAction(this.state, seat, action);
    if (!r.ok) return r;
    const prev = this.state;
    this.state = r.state;
    this.reactInChat(prev, this.state);
    this.emit();
    this.scheduleBots();
    return { ok: true };
  }

  isBotSeat(seat) {
    return !!this.state.players[seat].bot;
  }

  scheduleBots() {
    clearTimeout(this.timer);
    if (this.destroyed) return;
    const s = this.state;
    if (s.phase !== 'draw' && s.phase !== 'play') return;
    const seat = s.turn;
    if (!this.isBotSeat(seat)) return;
    const delay = (s.phase === 'draw' ? 850 : 650) * this.speed;
    this.timer = setTimeout(() => this.botStep(seat), delay);
  }

  botStep(seat) {
    if (this.destroyed) return;
    const s = this.state;
    if (s.turn !== seat || (s.phase !== 'draw' && s.phase !== 'play')) return;
    const view = getView(s, seat);
    const tryAction = (a) => {
      const r = applyAction(s, seat, a);
      return r.ok ? { ok: true, view: getView(r.state, seat) } : r;
    };
    let action = null;
    try {
      action = botAction(view, s.players[seat].bot, tryAction);
    } catch (e) {
      console.error('Erro no bot', e);
    }
    let r = action ? applyAction(s, seat, action) : { ok: false };
    if (!r.ok) r = this.fallback(s, seat);
    if (!r.ok) {
      console.error('Bot sem jogada válida', action, r.error);
      return;
    }
    this.reactInChat(s, r.state);
    this.state = r.state;
    this.emit();
    this.scheduleBots();
  }

  // Se o bot errar (não deveria), faz a jogada mais simples possível.
  fallback(s, seat) {
    let r = applyAction(s, seat, { type: 'draw' });
    if (r.ok) return r;
    for (const c of s.hands[seat]) {
      r = applyAction(s, seat, { type: 'discard', card: c });
      if (r.ok) return r;
    }
    return r;
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    clearTimeout(this.turnTimer);
    this.chatTimers.forEach(clearTimeout);
    this.unsubChat && this.unsubChat();
    this.listeners.clear();
  }
}
