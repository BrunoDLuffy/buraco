// Banco de dados em memória com a mesma interface do adaptador do Firebase.
// Serve para testes automáticos (e para simular vários jogadores num só aparelho).

const split = (p) => p.split('/').filter(Boolean);
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export class MemoryHub {
  constructor() {
    this.data = {};
    this.listeners = new Set(); // { path, cb, kind, seen }
    this.pushSeq = 0;
    this.disconnectOps = new Map(); // uid -> [fn]
  }

  read(path) {
    let cur = this.data;
    for (const k of split(path)) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }

  write(path, value) {
    const keys = split(path);
    if (!keys.length) {
      this.data = value ?? {};
      return;
    }
    let cur = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (value == null) delete cur[last];
    else cur[last] = clone(value);
    this.prune(this.data);
  }

  prune(obj) {
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === 'object') {
        this.prune(obj[k]);
        if (!Object.keys(obj[k]).length) delete obj[k];
      }
    }
  }

  notify(changedPath) {
    const ch = split(changedPath).join('/');
    for (const l of [...this.listeners]) {
      const lp = l.path;
      const related = ch === lp || ch.startsWith(lp + '/') || lp.startsWith(ch + '/') || ch === '';
      if (!related) continue;
      if (l.kind === 'value') {
        const val = this.read(lp);
        const json = JSON.stringify(val);
        if (json === l.last) continue;
        l.last = json;
        setTimeout(() => l.active && l.cb(clone(val)), 0);
      } else {
        const val = this.read(lp) || {};
        for (const k of Object.keys(val)) {
          if (l.seen.has(k)) continue;
          l.seen.add(k);
          const v = clone(val[k]);
          setTimeout(() => l.active && l.cb(k, v), 0);
        }
      }
    }
  }

  client(uid) {
    const hub = this;
    const ops = [];
    hub.disconnectOps.set(uid, ops);
    return {
      uid,
      async get(p) {
        return clone(hub.read(p));
      },
      async set(p, v) {
        hub.write(p, v);
        hub.notify(p);
      },
      async update(p, values) {
        for (const [k, v] of Object.entries(values)) hub.write(p + '/' + k, v);
        hub.notify(p);
      },
      async remove(p) {
        hub.write(p, null);
        hub.notify(p);
      },
      async push(p, v) {
        const key = 'k' + String(++hub.pushSeq).padStart(8, '0');
        hub.write(p + '/' + key, v);
        hub.notify(p + '/' + key);
        return key;
      },
      on(p, cb) {
        const l = { path: split(p).join('/'), cb, kind: 'value', last: undefined, active: true };
        hub.listeners.add(l);
        const val = hub.read(p);
        l.last = JSON.stringify(val);
        setTimeout(() => l.active && cb(clone(val)), 0);
        return () => {
          l.active = false;
          hub.listeners.delete(l);
        };
      },
      onChildAdded(p, cb) {
        const l = { path: split(p).join('/'), cb, kind: 'child', seen: new Set(), active: true };
        hub.listeners.add(l);
        hub.notify(p);
        return () => {
          l.active = false;
          hub.listeners.delete(l);
        };
      },
      onDisconnectRemove(p) {
        ops.push(() => {
          hub.write(p, null);
          hub.notify(p);
        });
      },
      onConnection(cb) {
        setTimeout(() => cb(true), 0);
        return () => {};
      },
      // só para testes: simula a queda da conexão
      _disconnect() {
        ops.splice(0).forEach((fn) => fn());
      },
    };
  }
}
