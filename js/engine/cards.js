// Cartas: cada carta é uma string de 4 caracteres: naipe + valor (2 dígitos) + cópia.
// Ex.: "H13a" = K de copas, "S01b" = Ás de espadas, "X00a" = coringa (joker).
// Naipes: S espadas, H copas, D ouros, C paus. Valores: 01=A ... 11=J, 12=Q, 13=K.

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_NAMES = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const suitOf = (id) => id[0];
export const rankOf = (id) => Number(id.slice(1, 3));
export const isJoker = (id) => id[0] === 'X';
export const isRed = (id) => id[0] === 'H' || id[0] === 'D';

// No buraco, os 2 (e os jokers, se estiverem no baralho) são curingas.
export const isWild = (id) => isJoker(id) || rankOf(id) === 2;

export function cardLabel(id) {
  if (isJoker(id)) return 'Coringa';
  return RANK_LABELS[rankOf(id)] + SUIT_SYMBOLS[suitOf(id)];
}

// Pontos de cada carta (padrão brasileiro).
export function cardPoints(id) {
  if (isJoker(id)) return 20;
  const r = rankOf(id);
  if (r === 1) return 15;
  if (r === 2) return 10;
  if (r <= 7) return 5;
  return 10;
}

export function makeDeck(cfg) {
  const deck = [];
  for (const copy of ['a', 'b']) {
    for (const s of SUITS) {
      for (let r = 1; r <= 13; r++) deck.push(s + String(r).padStart(2, '0') + copy);
    }
  }
  if (cfg && cfg.jokers) deck.push('X00a', 'X00b', 'X00c', 'X00d');
  return deck;
}

// Gerador pseudoaleatório com semente (mulberry32), para partidas reproduzíveis.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ordena a mão: por naipe e valor, curingas no fim.
export function sortHand(hand, mode = 'suit') {
  const suitOrder = { S: 0, H: 1, C: 2, D: 3, X: 9 };
  const key = (id) => {
    const wild = isWild(id) ? 1 : 0;
    const r = rankOf(id) === 1 ? 14 : rankOf(id);
    if (mode === 'rank') return wild * 1000 + r * 10 + suitOrder[suitOf(id)];
    return wild * 1000 + suitOrder[suitOf(id)] * 20 + r;
  };
  return hand.slice().sort((x, y) => key(x) - key(y) || (x < y ? -1 : 1));
}
