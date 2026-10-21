// Chat da mesa. Mensagem: { id, seat, name, text, t, bot }
// LocalChat guarda as mensagens no aparelho (partida contra bots).
// RoomChat usa o banco da sala online (rooms/<CÓDIGO>/chat).

export const MAX_CHAT_LEN = 200;
const KEEP = 120;

export function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT_LEN);
}

class BaseChat {
  constructor() {
    this.msgs = [];
    this.listeners = new Set();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.msgs);
    return () => this.listeners.delete(fn);
  }
  emit() {
    if (this.msgs.length > KEEP) this.msgs.splice(0, this.msgs.length - KEEP);
    for (const fn of this.listeners) fn(this.msgs);
  }
  dispose() {
    this.listeners.clear();
  }
}

export class LocalChat extends BaseChat {
  constructor() {
    super();
    this.seq = 0;
  }
  send({ seat, name, text, bot = false }) {
    const t = cleanText(text);
    if (!t) return;
    this.msgs = [...this.msgs, { id: 'm' + ++this.seq, seat, name, text: t, t: Date.now(), bot }];
    this.emit();
  }
}

export class RoomChat extends BaseChat {
  constructor(db, base) {
    super();
    this.db = db;
    this.path = `${base}/chat`;
    this.unsub = db.onChildAdded(this.path, (key, v) => {
      if (!v || typeof v.text !== 'string') return;
      this.msgs = [...this.msgs, { id: key, seat: Number(v.seat), name: String(v.name || ''), text: cleanText(v.text), t: v.t || 0, bot: !!v.bot }];
      this.emit();
    });
  }
  send({ seat, name, text, bot = false }) {
    const t = cleanText(text);
    if (!t) return;
    return this.db.push(this.path, { uid: this.db.uid, seat, sk: 's' + seat, name: String(name || '').slice(0, 24), text: t, t: Date.now(), bot });
  }
  dispose() {
    super.dispose();
    this.unsub && this.unsub();
  }
}
