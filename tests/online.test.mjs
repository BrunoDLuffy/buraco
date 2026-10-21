import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryHub } from '../js/net/memoryDb.js';
import { Room, HostController, ClientController } from '../js/net/room.js';
import { botAction } from '../js/ai/bot.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function until(cond, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado');
    await tick(1);
  }
}

test('sala: criar, entrar, bots, começar e jogar até o fim', async () => {
  const hub = new MemoryHub();
  const hostDb = hub.client('uid-host');
  const guestDb = hub.client('uid-guest');

  const room = await Room.create(hostDb, { name: 'Ana', variant: 'aberto', rules: { target: 400 }, numPlayers: 4 });
  assert.equal(room.code.length, 5);
  assert.ok(room.isHost);
  assert.equal(room.mySeat(), 0);

  const guestRoom = await Room.join(guestDb, room.code.toLowerCase(), 'Beto');
  assert.equal(guestRoom.mySeat(), 1);
  assert.ok(!guestRoom.isHost);

  // convidado troca para o lugar 2 (parceiro da Ana)
  await guestRoom.claimSeat(2, 'Beto');
  await until(() => room.seat(2) && !room.seat(1));
  assert.equal(guestRoom.mySeat(), 2);

  // começar sem todos os lugares preenchidos falha
  assert.throws(() => room.playersFromSeats(), /Preencha/);
  await room.setBot(1, 'medio');
  await room.setBot(3, 'dificil');
  await until(() => room.seat(1) && room.seat(3));

  const host = new HostController(room, { speed: 0 });
  await host.start();
  await until(() => guestRoom.meta.status === 'playing');

  const client = new ClientController(guestRoom);
  let clientView = null;
  client.subscribe((v) => (clientView = v));
  client.start();
  await until(() => clientView);
  assert.equal(clientView.hand.length, 11);
  assert.equal(clientView.mySeat, 2);
  assert.equal(clientView.myTeam, 0);
  // a visão pública não carrega a mão de ninguém
  const pub = JSON.parse(await guestDb.get(`rooms/${room.code}/public`));
  assert.deepEqual(pub.hand, []);

  // jogada inválida do convidado volta com erro
  const bad = await client.act({ type: 'draw' });
  assert.equal(bad.ok, false);

  // Ana (anfitriã) e Beto (convidado) jogam com a lógica do bot médio.
  let hostView = null;
  host.subscribe((v) => (hostView = v));
  hostView = host.view();
  const autoPlay = async (ctrl, getView) => {
    const v = getView();
    if (!v || v.turn !== ctrl.mySeat || (v.phase !== 'draw' && v.phase !== 'play')) return false;
    let a = botAction(v, 'medio', () => ({ ok: true }));
    let r = await ctrl.act(a);
    if (!r.ok) {
      r = await ctrl.act({ type: 'draw' });
      if (!r.ok) for (const c of v.hand) if ((r = await ctrl.act({ type: 'discard', card: c })).ok) break;
    }
    return true;
  };
  let rounds = 0;
  for (let i = 0; i < 20000; i++) {
    const hv = host.view();
    if (hv.phase === 'gameOver') break;
    if (hv.phase === 'roundOver') {
      rounds++;
      await host.act({ type: 'newRound' });
      continue;
    }
    const acted = (await autoPlay(host, () => host.view())) || (await autoPlay(client, () => client.lastView));
    if (!acted) await tick(1);
  }
  assert.equal(host.view().phase, 'gameOver');
  await until(() => client.lastView && client.lastView.phase === 'gameOver');
  assert.ok(rounds >= 0);

  // anfitrião encerra a sala
  host.destroy();
  client.destroy();
  await room.close();
  await until(() => guestRoom.meta && guestRoom.meta.status === 'closed');
  guestRoom.dispose();
});

test('anfitrião pode retomar a partida a partir do estado salvo', async () => {
  const hub = new MemoryHub();
  const db = hub.client('h');
  const room = await Room.create(db, { name: 'Ana', numPlayers: 2 });
  await room.setBot(1, 'facil');
  await until(() => room.seat(1));
  const host = new HostController(room, { speed: 0 });
  await host.start();
  await host.act({ type: 'draw' });
  host.destroy();
  const saved = JSON.parse(await db.get(`rooms/${room.code}/private`));
  assert.equal(saved.hands[0].length, 12);
  const host2 = new HostController(room, { state: saved, speed: 0 });
  await host2.start();
  assert.equal(host2.view().phase, 'play');
  host2.destroy();
  room.dispose();
});

test('jogador que cai aparece offline e pode virar bot', async () => {
  const hub = new MemoryHub();
  const hostDb = hub.client('h');
  const gDb = hub.client('g');
  const room = await Room.create(hostDb, { name: 'Ana', numPlayers: 2 });
  const groom = await Room.join(gDb, room.code, 'Beto');
  await until(() => room.seat(1) && room.presence.g);
  const host = new HostController(room, { speed: 0 });
  await host.start();
  gDb._disconnect();
  await until(() => room.isOffline(1));
  host.replaceWithBot(1, 'medio');
  assert.equal(host.game.state.players[1].bot, 'medio');
  host.destroy();
  room.dispose();
  groom.dispose();
});
