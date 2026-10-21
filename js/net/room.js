// Salas online. Quem cria a sala é o "anfitrião": o aparelho dele roda o jogo (e os bots)
// e publica o estado no Firebase. Os outros só enviam jogadas e recebem a mesa atualizada.
//
// Estrutura no banco (rooms/<CÓDIGO>/...):
//   meta       { hostUid, status: 'lobby'|'playing'|'closed', numPlayers, cfg, createdAt }
//   seats/sN   { kind: 'human', uid, name } | { kind: 'bot', level }
//   presence/<uid>  true enquanto a pessoa está conectada
//   public     estado visível para todos (texto JSON)
//   hands/sN   mão do jogador N (texto JSON) — as regras do banco só deixam o dono ler
//   actions/*  jogadas enviadas pelos convidados
//   errors/<uid>  resposta de jogada inválida
//   private    estado completo (só o anfitrião lê), para retomar se o app fechar

import { LocalGame } from '../controllers/local.js';
import { getView, teamOf } from '../engine/game.js';
import { buildRules } from '../engine/rules.js';
import { RoomChat } from './chat.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const seatKey = (i) => 's' + i;

export function makeCode(rng = Math.random) {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return c;
}

export function normalizeCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

export class Room {
  constructor(db, code) {
    this.db = db;
    this.code = code;
    this.base = `rooms/${code}`;
    this.meta = null;
    this.seats = {};
    this.presence = {};
    this.listeners = new Set();
    this.unsubs = [];
    this.ready = false;
  }

  static async create(db, { name, variant = 'aberto', rules = {}, numPlayers = 4 }) {
    let code;
    for (let i = 0; i < 8; i++) {
      code = makeCode();
      if (!(await db.get(`rooms/${code}/meta`))) break;
    }
    const cfg = buildRules(variant, rules);
    await db.set(`rooms/${code}/meta`, { hostUid: db.uid, status: 'lobby', numPlayers, cfg, createdAt: Date.now() });
    await db.set(`rooms/${code}/seats/s0`, { kind: 'human', uid: db.uid, name });
    const room = new Room(db, code);
    await room.open();
    return room;
  }

  static async join(db, rawCode, name) {
    const code = normalizeCode(rawCode);
    const meta = await db.get(`rooms/${code}/meta`);
    if (!meta) throw new Error('Sala não encontrada. Confira o código.');
    if (meta.status === 'closed') throw new Error('Essa sala já foi encerrada.');
    const room = new Room(db, code);
    await room.open();
    if (room.mySeat() < 0 && meta.status === 'lobby') {
      const free = room.freeSeats();
      if (free.length) await room.claimSeat(free[0], name);
    }
    if (room.mySeat() < 0 && meta.status !== 'lobby' && !room.isHost) throw new Error('A partida dessa sala já começou.');
    return room;
  }

  async open() {
    const db = this.db;
    let gotMeta = false;
    let gotSeats = false;
    await new Promise((resolve) => {
      const check = () => gotMeta && gotSeats && resolve();
      this.unsubs.push(
        db.on(`${this.base}/meta`, (v) => {
          this.meta = v;
          gotMeta = true;
          check();
          this.changed();
        })
      );
      this.unsubs.push(
        db.on(`${this.base}/seats`, (v) => {
          this.seats = v || {};
          gotSeats = true;
          check();
          this.changed();
        })
      );
    });
    this.unsubs.push(
      db.on(`${this.base}/presence`, (v) => {
        this.presence = v || {};
        this.changed();
      })
    );
    // presença: marca online e remove automaticamente quando a conexão cai
    this.unsubs.push(
      db.onConnection((connected) => {
        if (!connected) return;
        db.set(`${this.base}/presence/${db.uid}`, true);
        db.onDisconnectRemove(`${this.base}/presence/${db.uid}`);
      })
    );
    this.ready = true;
  }

  // Chat da mesa (criado na primeira vez que alguém precisa dele).
  getChat() {
    if (!this.chat) this.chat = new RoomChat(this.db, this.base);
    return this.chat;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    if (!this.ready) return;
    for (const fn of this.listeners) fn(this);
  }

  get isHost() {
    return !!this.meta && this.meta.hostUid === this.db.uid;
  }

  get numPlayers() {
    return (this.meta && this.meta.numPlayers) || 4;
  }

  seat(i) {
    return this.seats[seatKey(i)] || null;
  }

  mySeat() {
    for (let i = 0; i < this.numPlayers; i++) {
      const s = this.seat(i);
      if (s && s.kind === 'human' && s.uid === this.db.uid) return i;
    }
    return -1;
  }

  freeSeats() {
    const out = [];
    for (let i = 0; i < this.numPlayers; i++) if (!this.seat(i)) out.push(i);
    return out;
  }

  isOffline(i) {
    const s = this.seat(i);
    return !!s && s.kind === 'human' && !this.presence[s.uid];
  }

  async claimSeat(i, name) {
    if (this.seat(i)) throw new Error('Esse lugar já está ocupado');
    const prev = this.mySeat();
    await this.db.set(`${this.base}/seats/${seatKey(i)}`, { kind: 'human', uid: this.db.uid, name });
    if (prev >= 0) await this.db.remove(`${this.base}/seats/${seatKey(prev)}`);
    await this.waitFor(() => this.mySeat() === i);
  }

  // Espera a confirmação do banco chegar pelos ouvintes.
  waitFor(cond, ms = 5000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const loop = () => {
        if (cond() || Date.now() - t0 > ms) resolve(cond());
        else setTimeout(loop, 20);
      };
      loop();
    });
  }

  async setBot(i, level) {
    await this.db.set(`${this.base}/seats/${seatKey(i)}`, { kind: 'bot', level });
  }

  async openSeat(i) {
    await this.db.remove(`${this.base}/seats/${seatKey(i)}`);
  }

  async setRules({ variant, rules, numPlayers }) {
    const cfg = buildRules(variant, rules);
    await this.db.update(`${this.base}/meta`, { cfg, numPlayers });
    if (numPlayers === 2) {
      await this.db.remove(`${this.base}/seats/s2`);
      await this.db.remove(`${this.base}/seats/s3`);
    }
  }

  // Monta a lista de jogadores a partir dos lugares. Erro se faltar alguém.
  playersFromSeats() {
    const players = [];
    for (let i = 0; i < this.numPlayers; i++) {
      const s = this.seat(i);
      if (!s) throw new Error('Preencha todos os lugares (com pessoas ou bots) antes de começar');
      players.push(s.kind === 'bot' ? { name: botName(i, s.level), bot: s.level } : { name: s.name || 'Jogador', bot: null });
    }
    return players;
  }

  async close() {
    if (this.isHost) {
      await this.db.update(`${this.base}/meta`, { status: 'closed' });
      // apaga a sala logo depois, para não acumular lixo no banco
      const db = this.db;
      const base = this.base;
      setTimeout(() => db.remove(base).catch(() => {}), 2500);
    }
    else {
      const me = this.mySeat();
      if (me >= 0 && this.meta && this.meta.status === 'lobby') await this.db.remove(`${this.base}/seats/${seatKey(me)}`);
    }
    await this.db.remove(`${this.base}/presence/${this.db.uid}`);
    this.dispose();
  }

  dispose() {
    this.unsubs.forEach((u) => u && u());
    this.unsubs = [];
    this.listeners.clear();
    if (this.chat) this.chat.dispose();
    this.chat = null;
  }
}

const BOT_NAMES = ['Zeca', 'Dona Lurdes', 'Tião', 'Cida', 'Juca', 'Neusa'];
export function botName(i) {
  return BOT_NAMES[i % BOT_NAMES.length];
}

// ---------------- Anfitrião ----------------

export class HostController {
  constructor(room, { state = null, speed = 'normal', botChat = true } = {}) {
    this.room = room;
    this.db = room.db;
    this.isHost = true;
    const players = state ? state.players : room.playersFromSeats();
    this.game = new LocalGame({
      cfg: state ? state.cfg : room.meta.cfg,
      players,
      humanSeat: room.mySeat(),
      state,
      speed,
      onSave: (s) => this.publish(s),
      chat: room.getChat(),
      botChat,
    });
    this.chat = this.game.chat;
    this.mySeat = room.mySeat();
    this.processing = Promise.resolve();
    this.unsubActions = null;
  }

  async start() {
    await this.db.update(this.room.base, { 'meta/status': 'playing', errors: null, actions: null });
    this.game.start();
    this.unsubActions = this.db.onChildAdded(`${this.room.base}/actions`, (key, val) => {
      this.processing = this.processing.then(() => this.handleRemote(key, val));
    });
  }

  publish(s) {
    const updates = {
      public: JSON.stringify({ ...getView(s, -1), turnEndsIn: this.game ? this.game.turnEndsIn() : null }),
      private: JSON.stringify(s),
    };
    for (let i = 0; i < s.numPlayers; i++) {
      updates['hands/' + seatKey(i)] = JSON.stringify({ hand: s.hands[i], lastDrawn: s.turn === i ? s.lastDrawn : null });
    }
    this.db.update(this.room.base, updates);
  }

  async handleRemote(key, val) {
    try {
      if (!val) return;
      const seat = Number(val.seat);
      const s = this.room.seat(seat);
      let action = null;
      try {
        action = JSON.parse(val.a);
      } catch {
        /* jogada malformada */
      }
      let res;
      if (!s || s.kind !== 'human' || s.uid !== val.uid || !action) res = { ok: false, error: 'Jogada não autorizada' };
      else if (action.type === 'newRound') res = { ok: false, error: 'Só o anfitrião começa a próxima rodada' };
      else if (action.type === 'timeout') res = { ok: false, error: 'Jogada não autorizada' };
      else res = this.game.apply(seat, action);
      if (!res.ok) await this.db.set(`${this.room.base}/errors/${val.uid}`, { id: val.id || null, msg: res.error, t: Date.now() });
    } finally {
      await this.db.remove(`${this.room.base}/actions/${key}`);
    }
  }

  // Coloca um bot no lugar de quem caiu, para a partida seguir.
  replaceWithBot(seat, level = 'medio') {
    const st = structuredClone(this.game.state);
    st.players[seat] = { ...st.players[seat], bot: level, name: st.players[seat].name + ' (bot)' };
    this.game.state = st;
    this.room.setBot(seat, level);
    this.game.emit();
    this.game.scheduleBots();
  }

  subscribe(fn) {
    return this.game.subscribe(fn);
  }

  view() {
    return this.game.view();
  }

  act(action) {
    return Promise.resolve(this.game.act(action));
  }

  chatSend(text) {
    return this.game.chatSend(text);
  }

  isOffline(seat) {
    return this.room.isOffline(seat);
  }

  destroy() {
    this.game.destroy();
    this.unsubActions && this.unsubActions();
  }
}

// ---------------- Convidado ----------------

export class ClientController {
  constructor(room) {
    this.room = room;
    this.db = room.db;
    this.isHost = false;
    this.mySeat = room.mySeat();
    this.listeners = new Set();
    this.pub = null;
    this.hand = null;
    this.waiting = new Map(); // id -> { resolve, seq, timer }
    this.lastView = null;
    this.chat = room.getChat();
    const base = room.base;
    this.unsubs = [
      this.db.on(`${base}/public`, (v) => {
        this.pub = v ? JSON.parse(v) : null;
        this.pubAt = Date.now(); // para descontar o tempo que já passou desde que a mesa chegou
        this.emit();
      }),
      this.db.on(`${base}/hands/${seatKey(this.mySeat)}`, (v) => {
        this.hand = v ? JSON.parse(v) : null;
        this.emit();
      }),
      this.db.on(`${base}/errors/${this.db.uid}`, (v) => {
        if (!v || !v.id) return;
        const w = this.waiting.get(v.id);
        if (w) this.finish(v.id, { ok: false, error: v.msg });
      }),
    ];
  }

  start() {
    this.emit();
  }

  view() {
    if (!this.pub || !this.hand) return null;
    const seat = this.mySeat;
    return {
      ...this.pub,
      mySeat: seat,
      myTeam: teamOf(seat, this.pub.numPlayers),
      hand: this.hand.hand,
      lastDrawn: this.hand.lastDrawn,
      turnEndsIn: this.pub.turnEndsIn == null ? null : Math.max(0, this.pub.turnEndsIn - (Date.now() - this.pubAt)),
    };
  }

  emit() {
    const v = this.view();
    if (!v) return;
    // A mão e a mesa chegam separadas; só mostra quando a mão bate com a contagem pública.
    if (v.hand.length !== v.handCounts[this.mySeat]) return;
    this.lastView = v;
    for (const fn of this.listeners) fn(v);
    for (const [id, w] of this.waiting) if (v.seq > w.seq) this.finish(id, { ok: true });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    if (this.lastView) fn(this.lastView);
    return () => this.listeners.delete(fn);
  }

  finish(id, result) {
    const w = this.waiting.get(id);
    if (!w) return;
    clearTimeout(w.timer);
    this.waiting.delete(id);
    w.resolve(result);
  }

  act(action) {
    const id = Math.random().toString(36).slice(2, 10);
    const seq = this.pub ? this.pub.seq : -1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(id, { ok: false, error: 'Sem resposta do anfitrião. Ele está conectado?' }), 12000);
      this.waiting.set(id, { resolve, seq, timer });
      this.db.push(`${this.room.base}/actions`, { uid: this.db.uid, seat: this.mySeat, id, a: JSON.stringify(action), t: Date.now() });
    });
  }

  isOffline(seat) {
    return this.room.isOffline(seat);
  }

  chatSend(text) {
    const p = this.pub && this.pub.players[this.mySeat];
    const s = this.room.seat(this.mySeat);
    return this.chat.send({ seat: this.mySeat, name: (p && p.name) || (s && s.name) || 'Jogador', text });
  }

  destroy() {
    this.unsubs.forEach((u) => u && u());
    this.listeners.clear();
    for (const id of [...this.waiting.keys()]) this.finish(id, { ok: false });
  }
}
