// Bots de Buraco: fácil, médio e difícil.
// O bot só usa o que um jogador de verdade saberia (a "visão" do seu assento).
// A cada chamada, botAction devolve UMA jogada; o controlador chama de novo até a vez acabar.
//
// tryAction(action) -> { ok, view } simula a jogada no motor (para checar se é permitida).

import { analyzeMeld } from '../engine/melds.js';
import { isWild, rankOf, suitOf, cardPoints, isJoker } from '../engine/cards.js';

export const BOT_LEVELS = {
  facil: { name: 'Fácil' },
  medio: { name: 'Médio' },
  dificil: { name: 'Difícil' },
};

// ---------- busca de jogos ----------

// Posições naturais de uma carta numa sequência do naipe (Ás vale 1 e 14).
function seqPositions(c) {
  const r = rankOf(c);
  return r === 1 ? [1, 14] : [r];
}

// Encontra sequências possíveis (só cartas naturais, ou com 1 curinga tapando um buraco/ponta).
export function findNewMelds(cards, cfg, { useWild = false } = {}) {
  const out = [];
  const naturals = cards.filter((c) => !isWild(c) || (!isJoker(c) && rankOf(c) === 2));
  const wilds = cards.filter(isWild);
  for (const suit of ['S', 'H', 'D', 'C']) {
    const bypos = new Map();
    for (const c of naturals) {
      if (suitOf(c) !== suit) continue;
      for (const p of seqPositions(c)) if (!bypos.has(p)) bypos.set(p, c);
    }
    // segmentos consecutivos
    let run = [];
    const flush = () => {
      if (run.length >= 3) out.push({ cards: dedupe(run), wild: false });
      run = [];
    };
    for (let p = 1; p <= 14; p++) {
      if (bypos.has(p) && !run.includes(bypos.get(p))) run.push(bypos.get(p));
      else flush();
    }
    flush();
    if (useWild && wilds.length) {
      // dois naturais + curinga (buraco no meio ou na ponta)
      for (let p = 1; p <= 13; p++) {
        const a = bypos.get(p);
        if (!a) continue;
        for (const d of [1, 2]) {
          const b = bypos.get(p + d);
          if (!b || a === b) continue;
          const w = wilds.find((x) => x !== a && x !== b);
          if (w) out.push({ cards: [a, b, w], wild: true });
        }
      }
    }
  }
  if (cfg.allowSets) {
    const byRank = new Map();
    for (const c of cards) {
      if (isWild(c)) continue;
      const r = rankOf(c);
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(c);
    }
    for (const [, group] of byRank) {
      if (group.length >= 3) out.push({ cards: group.slice(), wild: false });
      else if (useWild && group.length === 2 && wilds.length) out.push({ cards: [...group, wilds[0]], wild: true });
    }
  }
  // valida tudo com o analisador oficial
  return out
    .map((m) => ({ ...m, res: analyzeMeld(m.cards, cfg) }))
    .filter((m) => m.res.ok)
    .sort((a, b) => b.cards.length - a.cards.length || Number(a.wild) - Number(b.wild));
}

function dedupe(arr) {
  return [...new Set(arr)];
}

// Cartas da mão que encaixam em jogos já na mesa.
export function findAdds(hand, melds, cfg, { useWild = false } = {}) {
  const out = [];
  for (const m of melds) {
    for (const c of hand) {
      if (isWild(c) && !useWild) {
        // 2 do mesmo naipe pode entrar como natural numa sequência (ex.: A-2-3)
        if (isJoker(c) || m.type !== 'seq') continue;
      }
      const res = analyzeMeld([...m.cards, c], cfg, m.type);
      if (!res.ok) continue;
      if (!useWild && res.wilds > (m.wild ? 1 : 0)) continue; // não queremos sujar sem querer
      out.push({ meld: m, card: c, res, makesCanastra: m.cards.length === 6, dirties: m.clean && !res.clean });
    }
  }
  return out;
}

// ---------- avaliação ----------

function teamCanastras(melds, cleanOnly) {
  return melds.filter((m) => m.cards.length >= 7 && (!cleanOnly || m.clean)).length;
}

// Quanto uma carta "vale guardar" na mão: vizinhas do mesmo naipe, pares para trinca, curingas.
function keepValue(card, hand, cfg) {
  if (isWild(card)) return 100;
  let v = 0;
  const s = suitOf(card);
  const ps = seqPositions(card);
  for (const o of hand) {
    if (o === card || isWild(o)) continue;
    if (suitOf(o) === s) {
      for (const p of ps) {
        for (const q of seqPositions(o)) {
          const d = Math.abs(p - q);
          if (d === 1) v += 6;
          else if (d === 2) v += 3;
        }
      }
    }
    if (cfg.allowSets && rankOf(o) === rankOf(card) && o !== card) v += 4;
  }
  return v;
}

// Perigo de descartar: a carta encaixa nos jogos do adversário ou perto de cartas que sabemos que ele tem.
function dangerValue(card, view, level) {
  const n = view.numPlayers;
  const nextSeat = (view.mySeat + 1) % n;
  const oppTeam = n === 4 ? nextSeat % 2 : nextSeat;
  let d = 0;
  if (isWild(card)) return 30;
  for (const m of view.melds[oppTeam]) {
    const res = analyzeMeld([...m.cards, card], view.cfg, m.type);
    if (res.ok) d += m.cards.length >= 6 ? 14 : 9;
  }
  if (level === 'dificil') {
    const known = view.known[nextSeat] || [];
    for (const o of known) {
      if (isWild(o)) continue;
      if (suitOf(o) === suitOf(card) && Math.abs(rankOf(o) - rankOf(card)) <= 2) d += 4;
      if (view.cfg.allowSets && rankOf(o) === rankOf(card)) d += 3;
    }
  }
  return d;
}

// Simula pegar o lixo aberto: quantas cartas a mais conseguiríamos baixar.
function meldableCount(cards, melds, cfg) {
  let pool = cards.slice();
  let used = 0;
  const table = melds.map((m) => ({ ...m, cards: m.cards.slice() }));
  for (let guard = 0; guard < 30; guard++) {
    const adds = findAdds(pool, table, cfg);
    if (adds.length) {
      const a = adds[0];
      a.meld.cards = a.res.cards;
      pool.splice(pool.indexOf(a.card), 1);
      used++;
      continue;
    }
    const nm = findNewMelds(pool, cfg);
    if (!nm.length) break;
    const m = nm[0];
    table.push({ id: -guard, type: m.res.type, cards: m.res.cards, clean: m.res.clean, wild: null });
    pool = pool.filter((c) => !m.cards.includes(c));
    used += m.cards.length;
  }
  return used;
}

// ---------- decisão ----------

export function botAction(view, level, tryAction, rng = Math.random) {
  if (view.phase === 'draw') return decideDraw(view, level, tryAction, rng);
  if (view.phase === 'play') return decidePlay(view, level, tryAction, rng);
  return null;
}

function decideDraw(view, level, tryAction, rng) {
  const { cfg, discard, hand } = view;
  const myMelds = view.melds[view.myTeam];
  if (discard.length && cfg.discardMode === 'open') {
    const base = meldableCount(hand, myMelds, cfg);
    const withPile = meldableCount([...hand, ...discard], myMelds, cfg);
    const gain = withPile - base;
    let take;
    if (level === 'facil') take = (gain >= 1 && rng() < 0.6) || (discard.length >= 6 && rng() < 0.3);
    else if (level === 'medio') take = gain >= 1 || discard.length >= 4;
    else {
      // difícil: pesa o ganho contra o risco de ficar com cartas na mão se os adversários baterem logo
      const oppTeam = 1 - view.myTeam;
      const oppNear = (view.tookMorto[oppTeam] || view.mortosLeft === 0) && teamCanastras(view.melds[oppTeam], cfg.goOutRequires === 'clean') > 0;
      const pts = discard.reduce((s, c) => s + cardPoints(c), 0);
      const score = gain * 12 + discard.length * 3 + (discard.some(isWild) ? 25 : 0) - (oppNear ? pts * 0.6 : 0);
      take = score > 25;
    }
    if (take && tryAction({ type: 'takeDiscard' }).ok) return { type: 'takeDiscard' };
    return { type: 'draw' };
  }
  if (discard.length && cfg.discardMode === 'closed') {
    const option = findClosedTake(view);
    const want = option && (level !== 'facil' || rng() < 0.7) && (level !== 'dificil' || discard.length >= 2 || !option.dirty);
    if (want && tryAction(option.action).ok) return option.action;
  }
  return { type: 'draw' };
}

// Lixo fechado: procura um jeito de usar a carta do topo.
function findClosedTake(view) {
  const { cfg, hand, discard } = view;
  const top = discard[discard.length - 1];
  const myMelds = view.melds[view.myTeam];
  const options = [];
  for (const m of myMelds) {
    const res = analyzeMeld([...m.cards, top], cfg, m.type);
    if (res.ok) options.push({ action: { type: 'takeDiscard', meldId: m.id, cards: [] }, dirty: m.clean && !res.clean, size: 0 });
  }
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const res = analyzeMeld([top, hand[i], hand[j]], cfg);
      if (res.ok) options.push({ action: { type: 'takeDiscard', cards: [hand[i], hand[j]] }, dirty: !res.clean, size: 3 });
    }
  }
  options.sort((a, b) => Number(a.dirty) - Number(b.dirty) || b.size - a.size);
  return options[0] || null;
}

function decidePlay(view, level, tryAction, rng) {
  const { cfg, hand } = view;
  const team = view.myTeam;
  const myMelds = view.melds[team];
  const mortoAvailable = !view.tookMorto[team] && view.mortosLeft > 0;
  const cleanNeeded = cfg.goOutRequires === 'clean';
  const haveGoOutCanastra = teamCanastras(myMelds, cleanNeeded) > 0;
  const rushing = hand.length <= 4; // perto de pegar o morto ou de bater: usa tudo
  const wildCount = hand.filter(isWild).length;

  const attempt = (action) => {
    const r = tryAction(action);
    if (!r.ok) return null;
    // difícil: pensa antes de bater se ainda está muito atrás nesta rodada
    if (level === 'dificil' && r.view && r.view.phase !== 'play' && r.view.phase !== 'draw' && !shouldGoOut(view)) return null;
    return action;
  };

  // Fácil às vezes "esquece" de baixar jogos.
  const skipChance = level === 'facil' ? 0.25 : 0;

  // 1) Encaixar cartas naturais nos jogos da dupla
  const adds = findAdds(hand, myMelds, cfg);
  adds.sort((a, b) => Number(b.makesCanastra) - Number(a.makesCanastra));
  for (const a of adds) {
    if (rng() < skipChance) continue;
    const act = attempt({ type: 'addToMeld', meldId: a.meld.id, cards: [a.card] });
    if (act) return act;
  }

  // 2) Baixar jogos novos sem curinga
  const melds = findNewMelds(hand, cfg);
  for (const m of melds) {
    if (rng() < skipChance) continue;
    const act = attempt({ type: 'meld', cards: m.cards });
    if (act) return act;
  }

  // 3) Uso de curingas
  if (wildCount > 0) {
    const wildAdds = findAdds(hand, myMelds, cfg, { useWild: true }).filter((a) => isWild(a.card));
    for (const a of wildAdds) {
      const ok =
        level === 'facil' ||
        rushing ||
        (a.makesCanastra && (!cleanNeeded || !a.dirties || teamCanastras(myMelds, true) > 0)) ||
        (level === 'medio' && wildCount >= 2 && !a.dirties);
      if (ok) {
        const act = attempt({ type: 'addToMeld', meldId: a.meld.id, cards: [a.card] });
        if (act) return act;
      }
    }
    const wildMelds = findNewMelds(hand, cfg, { useWild: true }).filter((m) => m.wild);
    for (const m of wildMelds) {
      const ok = level === 'facil' || rushing || wildCount >= 2 || hand.length >= 14;
      if (ok) {
        const act = attempt({ type: 'meld', cards: m.cards });
        if (act) return act;
      }
    }
  }

  // 4) Descarte
  return chooseDiscard(view, level, tryAction, rng, { mortoAvailable, haveGoOutCanastra });
}

function shouldGoOut(view) {
  const me = view.myTeam;
  const opp = 1 - me;
  const tablePts = (t) =>
    view.melds[t].reduce((s, m) => s + m.cards.reduce((x, c) => x + cardPoints(c), 0) + (m.cards.length >= 7 ? (m.clean ? 200 : 100) : 0), 0);
  const oppNear = (view.tookMorto[opp] || view.mortosLeft === 0) && teamCanastras(view.melds[opp], false) > 0;
  // Bate se não estiver muito atrás nesta rodada, se o adversário também está perto de bater, ou se o monte está acabando.
  return tablePts(me) + 100 >= tablePts(opp) - 150 || oppNear || view.stockCount < 10;
}

function chooseDiscard(view, level, tryAction, rng) {
  const { hand, cfg } = view;
  const late = view.stockCount < 15;
  const scored = hand.map((c) => {
    let score = keepValue(c, hand, cfg);
    if (level !== 'facil') {
      const w = cfg.discardMode === 'open' ? 0.6 : 1;
      score += dangerValue(c, view, level) * w;
    }
    if (level === 'dificil' && late) score -= cardPoints(c) / 3; // perto do fim, livra-se de cartas que valem muito
    // cartas que encaixam nos nossos jogos (mas não puderam ser baixadas) valem guardar
    for (const m of view.melds[view.myTeam]) {
      if (analyzeMeld([...m.cards, c], cfg, m.type).ok) score += 8;
    }
    if (c === view.lastDrawn) score += 0.5;
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score);
  let order = scored.map((x) => x.c);
  if (level === 'facil') {
    // escolhe meio aleatório entre as piores
    const k = Math.max(1, Math.ceil(order.length / 2));
    const pick = order.filter((c) => !isWild(c)).slice(0, k);
    if (pick.length) {
      const c = pick[Math.floor(rng() * pick.length)];
      order = [c, ...order.filter((x) => x !== c)];
    }
  }
  for (const c of order) {
    const a = { type: 'discard', card: c };
    if (tryAction(a).ok) return a;
  }
  return { type: 'discard', card: hand[0] };
}
