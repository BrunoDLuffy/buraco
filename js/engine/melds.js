// Validação de jogos (sequências e trincas).
// Um jogo é analisado sempre como um todo: ao acrescentar cartas, a posição do curinga é recalculada.

import { isJoker, rankOf, suitOf, isWild, cardPoints } from './cards.js';

const fail = (reason) => ({ ok: false, reason });

// Sequência: 3+ cartas do mesmo naipe em ordem. Ás pode ser baixo (A-2-3) ou alto (Q-K-A);
// as duas pontas só numa sequência completa de Ás a Ás. Um 2 do mesmo naipe na posição dele é carta natural.
function analyzeSeq(cards, cfg) {
  const jokers = cards.filter(isJoker);
  const nonJ = cards.filter((c) => !isJoker(c));
  const nonTwo = nonJ.filter((c) => rankOf(c) !== 2);
  if (nonTwo.length === 0) return fail('Sequência precisa de cartas naturais');
  const suit = suitOf(nonTwo[0]);
  if (nonTwo.some((c) => suitOf(c) !== suit)) return fail('Sequência precisa ser toda do mesmo naipe');

  const twos = nonJ.filter((c) => rankOf(c) === 2);
  const twosSame = twos.filter((c) => suitOf(c) === suit);
  const aces = nonTwo.filter((c) => rankOf(c) === 1);
  const others = nonTwo.filter((c) => rankOf(c) !== 1);
  if (aces.length > 2) return fail('Ases demais');

  const otherRanks = others.map(rankOf);
  if (new Set(otherRanks).size !== otherRanks.length) return fail('Carta repetida na sequência');

  const aceOptions = aces.length === 0 ? [[]] : aces.length === 1 ? [[1], [14]] : [[1, 14]];
  const twoOptions = twosSame.length ? [1, 0] : [0];
  let best = null;

  for (const natTwo of twoOptions) {
    for (const aceAssign of aceOptions) {
      const placed = new Map(); // posição -> carta
      others.forEach((c) => placed.set(rankOf(c), c));
      if (natTwo) placed.set(2, twosSame[0]);
      let dup = false;
      aceAssign.forEach((pos, i) => {
        if (placed.has(pos)) dup = true;
        placed.set(pos, aces[i]);
      });
      if (dup || placed.size !== others.length + natTwo + aces.length) continue;

      const wilds = [...jokers, ...twos.filter((c) => !(natTwo && c === twosSame[0]))];
      if (wilds.length > cfg.maxWilds) continue;
      const positions = [...placed.keys()];
      const min = Math.min(...positions);
      const max = Math.max(...positions);
      const gaps = max - min + 1 - positions.length;
      if (gaps > wilds.length) continue;
      const extra = wilds.length - gaps;
      if (extra > min - 1 + (14 - max)) continue;

      // Monta a ordem de exibição, do menor para o maior.
      const ordered = [];
      let wi = 0;
      let low = min;
      let high = max;
      let extraLeft = extra;
      // curinga sobrando vai para a ponta de cima (ou de baixo, se já chegou no Ás alto)
      const extraHigh = Math.min(extraLeft, 14 - max);
      const extraLow = extraLeft - extraHigh;
      low = min - extraLow;
      high = max + extraHigh;
      for (let p = low; p <= high; p++) {
        if (placed.has(p)) ordered.push(placed.get(p));
        else ordered.push(wilds[wi++]);
      }
      const res = {
        ok: true,
        type: 'seq',
        suit,
        cards: ordered,
        wildCards: wilds,
        wilds: wilds.length,
        clean: wilds.length === 0,
        low,
        high,
      };
      if (!best || res.wilds < best.wilds) best = res;
    }
  }
  return best || fail('Essas cartas não formam uma sequência');
}

// Trinca: 3+ cartas do mesmo valor (naipes quaisquer). O 2 sempre conta como curinga aqui.
function analyzeSet(cards, cfg) {
  const naturals = cards.filter((c) => !isWild(c));
  const wilds = cards.filter((c) => isWild(c));
  if (naturals.length < 2) return fail('Trinca precisa de cartas naturais');
  const r = rankOf(naturals[0]);
  if (naturals.some((c) => rankOf(c) !== r)) return fail('Trinca precisa de cartas do mesmo valor');
  if (wilds.length > cfg.maxWilds) return fail('Curingas demais');
  const order = { S: 0, H: 1, C: 2, D: 3 };
  const sorted = naturals.slice().sort((a, b) => order[suitOf(a)] - order[suitOf(b)]);
  return {
    ok: true,
    type: 'set',
    rank: r,
    cards: [...sorted, ...wilds],
    wildCards: wilds,
    wilds: wilds.length,
    clean: wilds.length === 0,
  };
}

// Analisa um conjunto de cartas como jogo. forceType: 'seq' | 'set' | undefined.
export function analyzeMeld(cards, cfg, forceType) {
  if (cards.length < 3) return fail('Um jogo precisa de pelo menos 3 cartas');
  if (new Set(cards).size !== cards.length) return fail('Carta duplicada');
  let best = null;
  let reason = null;
  if (forceType !== 'set') {
    const r = analyzeSeq(cards, cfg);
    if (r.ok) best = r;
    else reason = r.reason;
  }
  if (cfg.allowSets && forceType !== 'seq') {
    const r = analyzeSet(cards, cfg);
    if (r.ok && (!best || r.wilds < best.wilds)) best = r;
    else if (!r.ok && !best && forceType === 'set') reason = r.reason;
  }
  if (!best) {
    if (!cfg.allowSets && !forceType && cards.filter((c) => !isWild(c)).every((c, _, a) => rankOf(c) === rankOf(a[0])))
      return fail('Trincas não são permitidas neste modo');
    return fail(reason || 'Jogo inválido');
  }
  return finish(best, cfg);
}

function finish(res, cfg) {
  const n = res.cards.length;
  res.canastra = n >= 7;
  res.aceToAce = res.type === 'seq' && n === 14 && cfg.aceToAce;
  res.points = res.cards.reduce((s, c) => s + cardPoints(c), 0);
  return res;
}

export function canastraBonus(meld, cfg) {
  if (meld.cards.length < 7) return 0;
  if (meld.aceToAce) return meld.clean ? cfg.aceCleanBonus : cfg.aceDirtyBonus;
  return meld.clean ? cfg.cleanBonus : cfg.dirtyBonus;
}
