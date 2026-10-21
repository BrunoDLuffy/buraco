import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalChat, cleanText } from '../js/net/chat.js';
import { eventLines, replyLine } from '../js/ai/botChat.js';
import { LocalGame } from '../js/controllers/local.js';
import { buildRules } from '../js/engine/rules.js';
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

test('texto do chat é limpo e limitado', () => {
  assert.equal(cleanText('  oi   gente  '), 'oi gente');
  assert.equal(cleanText('x'.repeat(500)).length, 200);
  const c = new LocalChat();
  let got = [];
  c.subscribe((m) => (got = m));
  c.send({ seat: 0, name: 'Ana', text: '   ' });
  assert.equal(got.length, 0);
  c.send({ seat: 0, name: 'Ana', text: 'oi' });
  assert.equal(got.length, 1);
  assert.equal(got[0].text, 'oi');
});

test('bots reagem a canastra e respondem um oi', () => {
  const players = [{ name: 'Ana' }, { name: 'Zeca', bot: 'medio' }, { name: 'Tião', bot: 'medio' }, { name: 'Cida', bot: 'facil' }];
  const always = () => 0;
  const prev = { seq: 1, numPlayers: 4, players, melds: [[], []], phase: 'play' };
  const next = {
    seq: 2,
    numPlayers: 4,
    players,
    phase: 'play',
    melds: [[{ id: 5, cards: Array(7).fill('H05a'), clean: true }], []],
    lastEvent: { type: 'addToMeld', seat: 0, meldId: 5, canastra: true },
  };
  const lines = eventLines(prev, next, always);
  assert.ok(lines.length >= 1);
  assert.equal(lines[0].seat, 2); // o parceiro (bot) comemora
  const r = replyLine({ seat: 0, text: 'Oi gente!' }, { numPlayers: 4, players }, always);
  assert.ok(r && players[r.seat].bot);
  // bot não responde bot
  assert.equal(replyLine({ seat: 1, text: 'oi', bot: true }, { numPlayers: 4, players }, always), null);
});

test('partida local: mensagem da pessoa aparece e pode ter resposta de bot', async () => {
  const game = new LocalGame({
    cfg: buildRules('aberto'),
    players: [{ name: 'Ana' }, { name: 'Zeca', bot: 'medio' }],
    speed: 1000, // bots bem lentos: só o chat importa aqui
  });
  let msgs = [];
  game.chat.subscribe((m) => (msgs = m));
  game.chatSend('Oi, boa noite!');
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].name, 'Ana');
  game.destroy();
});

test('sala online: anfitrião e convidado trocam mensagens', async () => {
  const hub = new MemoryHub();
  const hostDb = hub.client('h');
  const gDb = hub.client('g');
  const room = await Room.create(hostDb, { name: 'Ana', numPlayers: 2 });
  const groom = await Room.join(gDb, room.code, 'Beto');
  const host = new HostController(room, { speed: 1000, botChat: false });
  await host.start();
  await until(() => groom.meta.status === 'playing');
  const client = new ClientController(groom);
  client.start();
  await until(() => client.lastView);

  let hostMsgs = [];
  let clientMsgs = [];
  host.chat.subscribe((m) => (hostMsgs = m));
  client.chat.subscribe((m) => (clientMsgs = m));
  await client.chatSend('Oi Ana!');
  await host.chatSend('Oi Beto!');
  await until(() => hostMsgs.length === 2 && clientMsgs.length === 2);
  assert.deepEqual(
    clientMsgs.map((m) => [m.seat, m.name, m.text]),
    [
      [1, 'Beto', 'Oi Ana!'],
      [0, 'Ana', 'Oi Beto!'],
    ]
  );
  host.destroy();
  client.destroy();
  room.dispose();
  groom.dispose();
});


