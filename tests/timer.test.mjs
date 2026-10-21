import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, describeRules, formatTurnTime } from '../js/engine/rules.js';
import { newGame, applyAction } from '../js/engine/game.js';
import { LocalGame } from '../js/controllers/local.js';
import { MemoryHub } from '../js/net/memoryDb.js';
import { Room, HostController, ClientController } from '../js/net/room.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado');
    await tick(5);
  }
}

function fresh(n = 4) {
  return newGame({ cfg: buildRules('aberto'), players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), seed: 7 });
}

test('padrão é 1min30 por vez e aparece na descrição', () => {
  assert.equal(buildRules('aberto').turnTime, 90);
  assert.equal(buildRules('aberto', { turnTime: 0 }).turnTime, 0);
  assert.match(describeRules(buildRules('aberto')), /1min30 por vez/);
  assert.match(describeRules(buildRules('aberto', { turnTime: 0 })), /sem limite de tempo/);
  assert.equal(formatTurnTime(120), '2 min');
});

test('tempo esgotado antes de comprar: compra, descarta uma carta e passa a vez', () => {
  const s = fresh();
  const before = s.turnNo;
  const r = applyAction(s, 0, { type: 'timeout' });
  assert.ok(r.ok, r.error);
  const t = r.state;
  assert.equal(t.turn, 1);
  assert.equal(t.phase, 'draw');
  assert.equal(t.hands[0].length, 11); // comprou 1, descartou 1
  assert.equal(t.discard.length, 2);
  assert.ok(t.lastEvent.timeout);
  assert.equal(t.lastEvent.type, 'discard');
  assert.equal(t.turnNo, before + 1);
});

test('tempo esgotado depois de comprar: só descarta', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  const r = applyAction(s, 0, { type: 'timeout' });
  assert.ok(r.ok);
  assert.equal(r.state.hands[0].length, 11);
  assert.equal(r.state.turn, 1);
});

test('tempo esgotado só vale para quem está na vez', () => {
  assert.ok(!applyAction(fresh(), 2, { type: 'timeout' }).ok);
});

test('descarte por tempo da última carta pega o morto', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  s.hands[0] = ['H05a'];
  const r = applyAction(s, 0, { type: 'timeout' });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.hands[0].length, 11);
  assert.ok(r.state.tookMorto[0]);
});

test('partida local: a vez da pessoa passa sozinha quando o tempo acaba', async () => {
  const game = new LocalGame({
    cfg: buildRules('aberto', { turnTime: 0.08 }), // 80 ms, só para o teste
    players: [{ name: 'Ana' }, { name: 'Zeca', bot: 'medio' }],
    speed: 1000, // bot lento: queremos ver só o relógio da pessoa
    botChat: false,
  });
  game.start();
  assert.equal(game.state.turn, 0);
  const v = game.view();
  assert.ok(v.turnEndsIn > 0 && v.turnEndsIn <= 80);
  await until(() => game.state.turn === 1, 2000);
  assert.ok(game.state.lastEvent.timeout);
  // vez do bot: sem relógio
  assert.equal(game.view().turnEndsIn, null);
  game.destroy();
});

test('sem limite de tempo: o relógio não liga', () => {
  const game = new LocalGame({ cfg: buildRules('aberto', { turnTime: 0 }), players: [{ name: 'Ana' }, { name: 'Zeca', bot: 'medio' }], speed: 1000 });
  game.start();
  assert.equal(game.view().turnEndsIn, null);
  game.destroy();
});

test('online: convidado vê o relógio e não pode forçar o tempo esgotado', async () => {
  const hub = new MemoryHub();
  const room = await Room.create(hub.client('h'), { name: 'Ana', numPlayers: 2, rules: { turnTime: 60 } });
  const groom = await Room.join(hub.client('g'), room.code, 'Beto');
  const host = new HostController(room, { speed: 1000, botChat: false });
  await host.start();
  await until(() => groom.meta.status === 'playing');
  const client = new ClientController(groom);
  client.start();
  await until(() => client.lastView);
  const v = client.view();
  assert.ok(v.turnEndsIn > 50000 && v.turnEndsIn <= 60000);
  // é a vez da Ana (anfitriã); o convidado tenta encerrar a vez dela
  const r = await client.act({ type: 'timeout' });
  assert.equal(r.ok, false);
  assert.equal(host.game.state.turn, 0);
  host.destroy();
  client.destroy();
  room.dispose();
  groom.dispose();
});
