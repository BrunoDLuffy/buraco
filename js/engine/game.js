// Motor do jogo: estado da partida e aplicação de jogadas.
// Funções puras: applyAction devolve um novo estado (o antigo não é alterado).

import { makeDeck, makeRng, shuffle, cardPoints } from './cards.js';
import { analyzeMeld, canastraBonus } from './melds.js';

export class RuleError extends Error {}
const rule = (cond, msg) => {
  if (!cond) throw new RuleError(msg);
};

export const teamOf = (seat, n) => (n === 4 ? seat % 2 : seat);
export const nextSeat = (seat, n) => (seat + 1) % n;

// players: [{ name, bot: null | 'facil' | 'medio' | 'dificil' }]
export function newGame({ cfg, players, seed }) {
  const n = players.length;
  rule(n === 2 || n === 4, 'O jogo é para 2 ou 4 jogadores');
  const s = {
    v: 1,
    cfg,
    numPlayers: n,
    players: players.map((p) => ({ name: p.name, bot: p.bot || null })),
    seed: seed >>> 0,
    scores: [0, 0],
    history: [],
    round: 0,
    dealer: n - 2, // dealRound avança: o primeiro a jogar é o assento 0
    seq: 0,
    log: [],
    winner: null,
  };
  return dealRound(s);
}

function dealRound(s) {
  const { cfg, numPlayers: n } = s;
  const rng = makeRng((s.seed + s.round * 7919) >>> 0);
  const deck = shuffle(makeDeck(cfg), rng);
  s.round += 1;
  s.turnNo = (s.turnNo || 0) + 1; // conta as vezes; muda sempre que a vez passa
  s.dealer = nextSeat(s.dealer, n);
  s.turn = nextSeat(s.dealer, n);
  s.phase = 'draw';
  s.hands = [];
  for (let i = 0; i < n; i++) s.hands.push(deck.splice(0, cfg.handSize));
  s.mortos = [deck.splice(0, cfg.mortoSize), deck.splice(0, cfg.mortoSize)];
  s.discard = [deck.pop()];
  s.stock = deck;
  s.melds = [[], []];
  s.tookMorto = [false, false];
  s.known = Array.from({ length: n }, () => []);
  s.nextMeldId = 1;
  s.wentOut = null;
  s.roundResult = null;
  s.lastDrawn = null;
  s.lastEvent = { type: 'deal', seat: s.dealer };
  pushLog(s, { type: 'deal', seat: s.dealer, round: s.round });
  return s;
}

function pushLog(s, ev) {
  s.log.push({ ...ev, seq: s.seq });
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}

function removeFromHand(hand, cards) {
  for (const c of cards) {
    const i = hand.indexOf(c);
    rule(i >= 0, 'Essa carta não está na sua mão');
    hand.splice(i, 1);
  }
}

function forget(s, seat, cards) {
  const k = s.known[seat];
  for (const c of cards) {
    const i = k.indexOf(c);
    if (i >= 0) k.splice(i, 1);
  }
}

export function teamHasCanastra(s, team, cleanOnly) {
  return s.melds[team].some((m) => m.cards.length >= 7 && (!cleanOnly || m.clean));
}

export function canGoOut(s, team) {
  const mortoOk = s.tookMorto[team] || s.mortos.length === 0;
  return mortoOk && teamHasCanastra(s, team, s.cfg.goOutRequires === 'clean');
}

export function goOutBlocker(s, team) {
  if (!s.tookMorto[team] && s.mortos.length > 0) return 'Sua dupla ainda não pegou o morto';
  if (!teamHasCanastra(s, team, s.cfg.goOutRequires === 'clean'))
    return s.cfg.goOutRequires === 'clean'
      ? 'Para bater, é preciso ter uma canastra limpa'
      : 'Para bater, é preciso ter pelo menos uma canastra';
  return null;
}

// Quando a mão fica vazia: pega o morto (se ainda houver para a dupla) ou bate.
function handleEmptyHand(s, seat, viaDiscard) {
  const team = teamOf(seat, s.numPlayers);
  if (!s.tookMorto[team] && s.mortos.length > 0) {
    s.hands[seat] = s.mortos.shift();
    s.tookMorto[team] = true;
    pushLog(s, { type: 'morto', seat, direct: !viaDiscard });
    s.lastEvent = { type: 'morto', seat, direct: !viaDiscard };
    return 'morto';
  }
  const blocker = goOutBlocker(s, team);
  rule(!blocker, blocker + ' — você precisa ficar com pelo menos uma carta');
  rule(viaDiscard || s.cfg.goOutWithoutDiscard, 'Para bater, você precisa descartar a última carta');
  endRound(s, team, seat);
  return 'out';
}

// Depois de baixar cartas no meio da vez. Se sobrar só 1 carta, ela terá de ser descartada;
// então isso só vale se esse descarte for permitido (pegar o morto ou bater).
function afterMeld(s, seat) {
  const hand = s.hands[seat];
  if (hand.length === 0) {
    handleEmptyHand(s, seat, false);
    return;
  }
  if (hand.length === 1) {
    const team = teamOf(seat, s.numPlayers);
    const mortoAvailable = !s.tookMorto[team] && s.mortos.length > 0;
    rule(
      mortoAvailable || canGoOut(s, team),
      (goOutBlocker(s, team) || 'Não dá para bater ainda') + ' — fique com pelo menos 2 cartas (uma para descartar)'
    );
  }
}

function makeMeld(s, res) {
  return {
    id: s.nextMeldId++,
    type: res.type,
    cards: res.cards,
    wild: res.wildCards.length ? res.wildCards[0] : null,
    clean: res.clean,
    aceToAce: !!res.aceToAce,
  };
}

function findMeld(s, team, meldId) {
  const m = s.melds[team].find((x) => x.id === meldId);
  rule(m, 'Jogo não encontrado na mesa da sua dupla');
  return m;
}

function updateMeld(m, res) {
  m.cards = res.cards;
  m.wild = res.wildCards.length ? res.wildCards[0] : null;
  m.clean = res.clean;
  m.aceToAce = !!res.aceToAce;
}

export function applyAction(state, seat, action) {
  try {
    const s = structuredClone(state);
    doAction(s, seat, action);
    s.seq += 1;
    return { ok: true, state: s };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}

function doAction(s, seat, a) {
  const { cfg, numPlayers: n } = s;
  if (a.type === 'newRound') {
    rule(s.phase === 'roundOver', 'A rodada ainda não acabou');
    dealRound(s);
    return;
  }
  rule(s.phase === 'draw' || s.phase === 'play', 'A rodada não está em andamento');
  rule(s.turn === seat, 'Não é a sua vez');
  const team = teamOf(seat, n);
  const hand = s.hands[seat];

  switch (a.type) {
    case 'draw': {
      rule(s.phase === 'draw', 'Você já comprou nesta vez');
      if (s.stock.length === 0 && s.mortos.length > 0) {
        s.stock = s.mortos.shift();
        pushLog(s, { type: 'mortoToStock', seat });
      }
      rule(s.stock.length > 0, 'O monte acabou');
      const c = s.stock.pop();
      hand.push(c);
      s.lastDrawn = c;
      s.phase = 'play';
      s.lastEvent = { type: 'draw', seat };
      pushLog(s, { type: 'draw', seat });
      return;
    }
    case 'takeDiscard': {
      rule(s.phase === 'draw', 'Você já comprou nesta vez');
      rule(s.discard.length > 0, 'O lixo está vazio');
      if (cfg.discardMode === 'open') {
        const taken = s.discard.splice(0);
        hand.push(...taken);
        s.known[seat].push(...taken);
        s.lastDrawn = null;
        s.phase = 'play';
        s.lastEvent = { type: 'takeDiscard', seat, cards: taken };
        pushLog(s, { type: 'takeDiscard', seat, count: taken.length });
        return;
      }
      // Lixo fechado: a carta de cima precisa ir para um jogo na hora.
      const top = s.discard[s.discard.length - 1];
      const fromHand = a.cards || [];
      for (const c of fromHand) rule(hand.includes(c), 'Essa carta não está na sua mão');
      let meldId;
      if (a.meldId != null) {
        const m = findMeld(s, team, a.meldId);
        const res = analyzeMeld([...m.cards, top, ...fromHand], cfg, m.type);
        rule(res.ok, 'A carta do lixo não encaixa nesse jogo: ' + res.reason);
        removeFromHand(hand, fromHand);
        updateMeld(m, res);
        meldId = m.id;
      } else {
        rule(fromHand.length >= 2, 'Escolha pelo menos 2 cartas da mão para formar um jogo com a carta do lixo');
        const res = analyzeMeld([top, ...fromHand], cfg);
        rule(res.ok, 'A carta do lixo não forma jogo com essas cartas: ' + res.reason);
        removeFromHand(hand, fromHand);
        const m = makeMeld(s, res);
        s.melds[team].push(m);
        meldId = m.id;
      }
      forget(s, seat, fromHand);
      const rest = s.discard.slice(0, -1);
      s.discard = [];
      hand.push(...rest);
      s.known[seat].push(...rest);
      s.lastDrawn = null;
      s.phase = 'play';
      s.lastEvent = { type: 'takeDiscard', seat, cards: [top, ...rest], meldId };
      pushLog(s, { type: 'takeDiscard', seat, count: rest.length + 1 });
      afterMeld(s, seat);
      return;
    }
    case 'meld': {
      rule(s.phase === 'play', 'Compre uma carta primeiro');
      const cards = a.cards || [];
      for (const c of cards) rule(hand.includes(c), 'Essa carta não está na sua mão');
      const res = analyzeMeld(cards, cfg);
      rule(res.ok, res.reason);
      removeFromHand(hand, cards);
      forget(s, seat, cards);
      const m = makeMeld(s, res);
      s.melds[team].push(m);
      s.lastEvent = { type: 'meld', seat, meldId: m.id, cards };
      pushLog(s, { type: 'meld', seat, count: cards.length });
      afterMeld(s, seat);
      return;
    }
    case 'addToMeld': {
      rule(s.phase === 'play', 'Compre uma carta primeiro');
      const cards = a.cards || [];
      rule(cards.length > 0, 'Escolha as cartas');
      for (const c of cards) rule(hand.includes(c), 'Essa carta não está na sua mão');
      const m = findMeld(s, team, a.meldId);
      const wasCanastra = m.cards.length >= 7;
      const res = analyzeMeld([...m.cards, ...cards], cfg, m.type);
      rule(res.ok, 'Não encaixa nesse jogo: ' + res.reason);
      removeFromHand(hand, cards);
      forget(s, seat, cards);
      updateMeld(m, res);
      s.lastEvent = { type: 'addToMeld', seat, meldId: m.id, cards, canastra: !wasCanastra && m.cards.length >= 7 };
      pushLog(s, { type: 'addToMeld', seat, count: cards.length, canastra: s.lastEvent.canastra, clean: m.clean });
      afterMeld(s, seat);
      return;
    }
    case 'discard': {
      rule(s.phase === 'play', 'Compre uma carta primeiro');
      rule(hand.includes(a.card), 'Essa carta não está na sua mão');
      removeFromHand(hand, [a.card]);
      forget(s, seat, [a.card]);
      s.discard.push(a.card);
      s.lastEvent = { type: 'discard', seat, card: a.card };
      pushLog(s, { type: 'discard', seat, card: a.card });
      if (hand.length === 0 && handleEmptyHand(s, seat, true) === 'out') return;
      // Acabou o monte e não sobrou morto: a rodada termina sem batida.
      if (s.stock.length === 0 && s.mortos.length === 0) {
        endRound(s, null, null);
        return;
      }
      s.turn = nextSeat(seat, n);
      s.turnNo = (s.turnNo || 0) + 1;
      s.phase = 'draw';
      s.lastDrawn = null;
      return;
    }
    case 'timeout': {
      // Tempo da vez esgotado: compra (se ainda não comprou) e descarta uma carta aleatória.
      if (s.phase === 'draw') doAction(s, seat, { type: 'draw' });
      const rng = makeRng((s.seed ^ Math.imul(s.seq + 1, 2654435761)) >>> 0);
      let lastErr = null;
      for (const card of shuffle(s.hands[seat], rng)) {
        const trial = structuredClone(s);
        try {
          doAction(trial, seat, { type: 'discard', card });
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
          lastErr = e;
          continue;
        }
        Object.assign(s, trial);
        if (s.lastEvent && s.lastEvent.type === 'discard') s.lastEvent.timeout = true;
        const last = s.log[s.log.length - 1];
        if (last && last.type === 'discard') last.timeout = true;
        return;
      }
      throw lastErr || new RuleError('Nenhum descarte possível');
    }
    default:
      throw new RuleError('Jogada desconhecida');
  }
}

export function scoreRound(s, outTeam) {
  const { cfg, numPlayers: n } = s;
  const teams = [0, 1].map((team) => {
    const melds = s.melds[team];
    const meldPoints = melds.reduce((sum, m) => sum + m.cards.reduce((x, c) => x + cardPoints(c), 0), 0);
    const bonus = melds.reduce((sum, m) => sum + canastraBonus(m, cfg), 0);
    let handPoints = 0;
    for (let seat = 0; seat < n; seat++) {
      if (teamOf(seat, n) === team) handPoints += s.hands[seat].reduce((x, c) => x + cardPoints(c), 0);
    }
    const goOut = outTeam === team ? cfg.goOutBonus : 0;
    const morto = s.tookMorto[team] ? 0 : -cfg.noMortoPenalty;
    const canastras = melds.filter((m) => m.cards.length >= 7).length;
    return {
      meldPoints,
      bonus,
      goOut,
      handPoints: -handPoints,
      morto,
      canastras,
      total: meldPoints + bonus + goOut - handPoints + morto,
    };
  });
  return teams;
}

function endRound(s, outTeam, outSeat) {
  const teams = scoreRound(s, outTeam);
  s.wentOut = outTeam;
  s.scores = s.scores.map((sc, i) => sc + teams[i].total);
  s.roundResult = { round: s.round, outTeam, outSeat, teams, scores: s.scores.slice() };
  s.history.push({ round: s.round, totals: teams.map((t) => t.total), outTeam });
  s.phase = 'roundOver';
  s.lastEvent = { type: outTeam == null ? 'stockOut' : 'goOut', seat: outSeat };
  pushLog(s, { type: outTeam == null ? 'stockOut' : 'goOut', seat: outSeat });
  const [a, b] = s.scores;
  if ((a >= s.cfg.target || b >= s.cfg.target) && a !== b) {
    s.phase = 'gameOver';
    s.winner = a > b ? 0 : 1;
  }
}

// Visão de um jogador: tudo que ele pode saber. seat = -1 para a visão pública (sem mão).
export function getView(s, seat) {
  const n = s.numPlayers;
  return {
    cfg: s.cfg,
    numPlayers: n,
    players: s.players,
    mySeat: seat,
    myTeam: seat >= 0 ? teamOf(seat, n) : -1,
    round: s.round,
    dealer: s.dealer,
    turn: s.turn,
    phase: s.phase,
    hand: seat >= 0 ? s.hands[seat].slice() : [],
    handCounts: s.hands.map((h) => h.length),
    melds: s.melds,
    discard: s.discard,
    stockCount: s.stock.length,
    mortosLeft: s.mortos.length,
    tookMorto: s.tookMorto,
    known: s.known,
    scores: s.scores,
    history: s.history,
    roundResult: s.roundResult,
    winner: s.winner,
    lastEvent: s.lastEvent,
    lastDrawn: seat === s.turn ? s.lastDrawn : null,
    turnNo: s.turnNo,
    log: s.log,
    seq: s.seq,
  };
}
