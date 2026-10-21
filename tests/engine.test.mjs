import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMeld, canastraBonus } from '../js/engine/melds.js';
import { buildRules } from '../js/engine/rules.js';
import { newGame, applyAction, getView, teamOf } from '../js/engine/game.js';
import { makeDeck } from '../js/engine/cards.js';

const cfg = buildRules('aberto');
const stbl = buildRules('stbl');

test('baralho tem 104 cartas, 108 com jokers', () => {
  assert.equal(makeDeck(cfg).length, 104);
  assert.equal(new Set(makeDeck({ jokers: true })).size, 108);
});

test('sequência limpa simples', () => {
  const r = analyzeMeld(['H05a', 'H03a', 'H04b'], cfg);
  assert.ok(r.ok);
  assert.equal(r.type, 'seq');
  assert.deepEqual(r.cards, ['H03a', 'H04b', 'H05a']);
  assert.ok(r.clean);
});

test('naipe misturado é inválido', () => {
  assert.ok(!analyzeMeld(['H05a', 'S06a', 'H07a'], cfg).ok);
});

test('curinga preenche buraco e suja o jogo', () => {
  const r = analyzeMeld(['H05a', 'S02a', 'H07a'], cfg);
  assert.ok(r.ok);
  assert.deepEqual(r.cards, ['H05a', 'S02a', 'H07a']);
  assert.ok(!r.clean);
});

test('dois curingas não pode', () => {
  assert.ok(!analyzeMeld(['H05a', 'S02a', 'C02a', 'H08a'], cfg).ok);
});

test('2 do mesmo naipe na posição dele é natural', () => {
  const r = analyzeMeld(['H01a', 'H02a', 'H03a'], cfg);
  assert.ok(r.ok && r.clean);
  const r2 = analyzeMeld(['H02a', 'H03a', 'H04a'], cfg);
  assert.ok(r2.ok && r2.clean);
});

test('2 do mesmo naipe fora do lugar é curinga', () => {
  const r = analyzeMeld(['H05a', 'H02a', 'H07a'], cfg);
  assert.ok(r.ok && !r.clean);
});

test('Ás alto e baixo', () => {
  assert.ok(analyzeMeld(['S12a', 'S13a', 'S01a'], cfg).ok);
  assert.ok(analyzeMeld(['S01a', 'S02a', 'S03a'], cfg).ok);
  assert.ok(!analyzeMeld(['S13a', 'S01a', 'S02a', 'S03a'], cfg).ok);
});

test('não dá a volta K-A-2 sem curinga', () => {
  const r = analyzeMeld(['S13a', 'S01a', 'S03a'], cfg);
  assert.ok(!r.ok);
});

test('canastra de Ás a Ás', () => {
  const cards = ['S01a', 'S02a', 'S03a', 'S04a', 'S05a', 'S06a', 'S07a', 'S08a', 'S09a', 'S10a', 'S11a', 'S12a', 'S13a', 'S01b'];
  const r = analyzeMeld(cards, cfg);
  assert.ok(r.ok && r.clean && r.aceToAce);
  assert.equal(canastraBonus(r, cfg), 1000);
});

test('canastra limpa e suja', () => {
  const clean = analyzeMeld(['D03a', 'D04a', 'D05a', 'D06a', 'D07a', 'D08a', 'D09a'], cfg);
  assert.equal(canastraBonus(clean, cfg), 200);
  const dirty = analyzeMeld(['D03a', 'D04a', 'D05a', 'C02b', 'D07a', 'D08a', 'D09a'], cfg);
  assert.equal(canastraBonus(dirty, cfg), 100);
});

test('trinca permitida no aberto, proibida no STBL', () => {
  assert.ok(analyzeMeld(['S09a', 'H09a', 'D09b'], cfg).ok);
  const r = analyzeMeld(['S09a', 'H09a', 'D09b'], stbl);
  assert.ok(!r.ok);
  assert.match(r.reason, /Trincas/);
});

test('trinca com curinga', () => {
  const r = analyzeMeld(['S09a', 'H09a', 'D02b'], cfg);
  assert.ok(r.ok && r.type === 'set' && !r.clean);
});

test('carta repetida na sequência', () => {
  assert.ok(!analyzeMeld(['H05a', 'H05b', 'H06a'], stbl).ok);
});

function fresh(variant = 'aberto', n = 4) {
  const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i }));
  return newGame({ cfg: buildRules(variant), players, seed: 42 });
}

test('distribuição', () => {
  const s = fresh();
  assert.equal(s.hands.length, 4);
  s.hands.forEach((h) => assert.equal(h.length, 11));
  assert.equal(s.mortos.length, 2);
  assert.equal(s.discard.length, 1);
  assert.equal(s.stock.length, 108 - 4 - 44 - 22 - 1);
  assert.equal(s.turn, 0);
});

test('vez errada e compra dupla', () => {
  const s = fresh();
  assert.ok(!applyAction(s, 1, { type: 'draw' }).ok);
  const r = applyAction(s, 0, { type: 'draw' });
  assert.ok(r.ok);
  assert.equal(r.state.hands[0].length, 12);
  assert.ok(!applyAction(r.state, 0, { type: 'draw' }).ok);
});

test('descartar passa a vez', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  const card = s.hands[0][0];
  const r = applyAction(s, 0, { type: 'discard', card });
  assert.ok(r.ok);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.discard.at(-1), card);
});

test('lixo aberto: pega tudo', () => {
  let s = fresh('aberto');
  const before = s.discard.length;
  const r = applyAction(s, 0, { type: 'takeDiscard' });
  assert.ok(r.ok);
  assert.equal(r.state.hands[0].length, 11 + before);
  assert.equal(r.state.discard.length, 0);
});

test('lixo fechado: precisa usar a carta do topo', () => {
  let s = fresh('fechado');
  assert.ok(!applyAction(s, 0, { type: 'takeDiscard' }).ok);
  // monta uma situação controlada
  s.discard = ['H09a', 'S04a', 'H07a'];
  s.hands[0] = ['H05a', 'H06a', 'C10a', 'C11a'];
  const r = applyAction(s, 0, { type: 'takeDiscard', cards: ['H05a', 'H06a'] });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.melds[0].length, 1);
  assert.deepEqual(r.state.melds[0][0].cards, ['H05a', 'H06a', 'H07a']);
  assert.deepEqual(r.state.hands[0].sort(), ['C10a', 'C11a', 'H09a', 'S04a']);
});

test('ficar sem cartas pega o morto', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  s.hands[0] = ['H05a', 'H06a', 'H07a'];
  const r = applyAction(s, 0, { type: 'meld', cards: ['H05a', 'H06a', 'H07a'] });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.hands[0].length, 11);
  assert.ok(r.state.tookMorto[0]);
  assert.equal(r.state.phase, 'play');
});

test('não pode bater sem canastra', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  s.tookMorto[0] = true;
  s.hands[0] = ['H05a', 'H06a', 'H07a'];
  const r = applyAction(s, 0, { type: 'meld', cards: ['H05a', 'H06a', 'H07a'] });
  assert.ok(!r.ok);
});

test('batida com canastra e pontuação', () => {
  let s = fresh();
  s = applyAction(s, 0, { type: 'draw' }).state;
  s.tookMorto[0] = true;
  s.melds[0] = [{ id: 99, type: 'seq', cards: ['D03a', 'D04a', 'D05a', 'D06a', 'D07a', 'D08a', 'D09a'], wild: null, clean: true }];
  s.hands[0] = ['H05a'];
  s.hands[2] = ['S13a']; // parceiro: -10
  const r = applyAction(s, 0, { type: 'discard', card: 'H05a' });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.phase, 'roundOver');
  const t0 = r.state.roundResult.teams[0];
  assert.equal(t0.meldPoints, 5 * 5 + 10 + 10); // 3..7 valem 5, 8 e 9 valem 10
  assert.equal(t0.bonus, 200);
  assert.equal(t0.goOut, 100);
  assert.equal(t0.handPoints, -10);
  const t1 = r.state.roundResult.teams[1];
  assert.equal(t1.morto, -100);
});

test('STBL exige canastra limpa para bater', () => {
  let s = fresh('stbl');
  s = applyAction(s, 0, { type: 'draw' }).state;
  s.tookMorto[0] = true;
  s.melds[0] = [{ id: 99, type: 'seq', cards: ['D03a', 'D04a', 'D05a', 'C02a', 'D07a', 'D08a', 'D09a'], wild: 'C02a', clean: false }];
  s.hands[0] = ['H05a'];
  const r = applyAction(s, 0, { type: 'discard', card: 'H05a' });
  assert.ok(!r.ok);
  assert.match(r.error, /limpa/);
});

test('visão esconde as outras mãos', () => {
  const s = fresh();
  const v = getView(s, 1);
  assert.equal(v.hand.length, 11);
  assert.deepEqual(v.hand, s.hands[1]);
  assert.equal(v.handCounts.length, 4);
  assert.equal(JSON.stringify(v).includes(JSON.stringify(s.hands[0])), false);
  assert.equal(teamOf(2, 4), 0);
});
