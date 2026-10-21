import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRules } from '../js/engine/rules.js';
import { newGame, applyAction, getView, teamOf } from '../js/engine/game.js';
import { botAction } from '../js/ai/bot.js';
import { makeRng } from '../js/engine/cards.js';

// Joga uma partida inteira só com bots. Devolve o estado final.
export function playGame({ variant = 'aberto', levels, seed = 1, target = 1500, maxSteps = 60000 }) {
  const cfg = buildRules(variant, { target });
  const players = levels.map((l, i) => ({ name: 'Bot' + i, bot: l }));
  let s = newGame({ cfg, players, seed });
  const rng = makeRng(seed * 31 + 7);
  let steps = 0;
  let fallbacks = 0;
  while (s.phase !== 'gameOver' && steps < maxSteps) {
    steps++;
    if (s.phase === 'roundOver') {
      s = applyAction(s, 0, { type: 'newRound' }).state;
      continue;
    }
    const seat = s.turn;
    const view = getView(s, seat);
    const tryAction = (a) => {
      const r = applyAction(s, seat, a);
      return r.ok ? { ok: true, view: getView(r.state, seat) } : r;
    };
    const action = botAction(view, players[seat].bot, tryAction, rng);
    let r = applyAction(s, seat, action);
    if (!r.ok) {
      fallbacks++;
      r = applyAction(s, seat, { type: 'draw' });
      if (!r.ok) for (const c of s.hands[seat]) if ((r = applyAction(s, seat, { type: 'discard', card: c })).ok) break;
      if (!r.ok) throw new Error('Bot travou: ' + JSON.stringify(action) + ' ' + r.error);
    }
    s = r.state;
  }
  return { s, steps, fallbacks };
}

for (const variant of ['aberto', 'fechado', 'stbl']) {
  test(`bots terminam partidas (${variant}, 4 jogadores)`, () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { s, fallbacks } = playGame({ variant, levels: ['medio', 'facil', 'dificil', 'medio'], seed });
      assert.equal(s.phase, 'gameOver', `partida ${seed} não terminou`);
      assert.equal(fallbacks, 0);
      // conservação de cartas
      const total =
        s.stock.length + s.discard.length + s.mortos.flat().length + s.hands.flat().length + s.melds.flat().reduce((x, m) => x + m.cards.length, 0);
      assert.equal(total, 104);
    }
  });
  test(`bots terminam partidas (${variant}, 2 jogadores)`, () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { s } = playGame({ variant, levels: ['dificil', 'facil'], seed });
      assert.equal(s.phase, 'gameOver');
    }
  });
}

test('difícil ganha do fácil na maioria das vezes', () => {
  let wins = 0;
  const N = 16;
  for (let seed = 1; seed <= N; seed++) {
    // alterna quem começa
    const hardFirst = seed % 2 === 0;
    const levels = hardFirst ? ['dificil', 'facil', 'dificil', 'facil'] : ['facil', 'dificil', 'facil', 'dificil'];
    const { s } = playGame({ variant: 'aberto', levels, seed: seed + 100, target: 1000 });
    const hardTeam = hardFirst ? 0 : 1;
    if (s.winner === hardTeam) wins++;
  }
  assert.ok(wins >= N * 0.6, `difícil venceu só ${wins}/${N}`);
});

void teamOf;
