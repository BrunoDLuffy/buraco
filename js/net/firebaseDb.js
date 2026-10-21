// Adaptador do Firebase Realtime Database (plano gratuito "Spark").
// Carrega o SDK oficial direto do CDN do Google só quando alguém vai jogar online.

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

let cached = null;

export function createFirebaseDb(config) {
  if (!cached) cached = connect(config).catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

async function connect(config) {
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-database.js'),
  ]);
  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  // Login anônimo: cada aparelho ganha um id fixo, sem precisar de conta.
  const cred = await authMod.signInAnonymously(auth);
  const db = dbMod.getDatabase(app);
  const ref = (p) => dbMod.ref(db, p);

  return {
    uid: cred.user.uid,
    get: async (p) => (await dbMod.get(ref(p))).val(),
    set: (p, v) => dbMod.set(ref(p), v),
    update: (p, v) => dbMod.update(ref(p), v),
    remove: (p) => dbMod.remove(ref(p)),
    push: async (p, v) => {
      const r = dbMod.push(ref(p), v);
      await r;
      return r.key;
    },
    on: (p, cb) =>
      dbMod.onValue(
        ref(p),
        (snap) => cb(snap.val()),
        (err) => console.warn('Firebase (leitura negada?)', p, err.message)
      ),
    onChildAdded: (p, cb) => dbMod.onChildAdded(ref(p), (snap) => cb(snap.key, snap.val())),
    onDisconnectRemove: (p) => dbMod.onDisconnect(ref(p)).remove(),
    onConnection: (cb) => dbMod.onValue(ref('.info/connected'), (s) => cb(!!s.val())),
  };
}
