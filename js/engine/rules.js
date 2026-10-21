// Modos de jogo (variantes) e opções de regra.
// Cada modo é só um conjunto de opções; o modo "Personalizado" deixa o grupo ajustar tudo.

export const DEFAULT_RULES = {
  discardMode: 'open', // 'open' = lixo aberto (pega o lixo todo); 'closed' = fechado (precisa usar a carta do topo)
  allowSets: true, // trincas (3+ cartas do mesmo valor) são permitidas?
  goOutRequires: 'any', // 'any' = qualquer canastra; 'clean' = precisa de canastra limpa para bater
  jokers: false, // coloca os 4 jokers no baralho como curingas extras
  aceToAce: true, // canastra de Ás a Ás (14 cartas) vale bônus especial
  maxWilds: 1, // curingas por jogo
  goOutWithoutDiscard: true, // pode bater baixando todas as cartas, sem descartar
  target: 3000, // pontos para vencer a partida
  turnTime: 90, // segundos por vez (0 = sem limite). Acabou o tempo: descarta uma carta aleatória
  handSize: 11,
  mortoSize: 11,
  // pontuação
  cleanBonus: 200,
  dirtyBonus: 100,
  aceCleanBonus: 1000,
  aceDirtyBonus: 500,
  goOutBonus: 100,
  noMortoPenalty: 100,
};

export const VARIANTS = {
  aberto: {
    name: 'Buraco Aberto',
    short: 'Aberto',
    description:
      'Lixo aberto: no seu turno você pode pegar o lixo inteiro, sem condição. Trincas valem. Bate com qualquer canastra.',
    rules: { discardMode: 'open', allowSets: true, goOutRequires: 'any' },
  },
  fechado: {
    name: 'Buraco Fechado',
    short: 'Fechado',
    description:
      'Lixo fechado: só dá para pegar o lixo se a carta de cima entrar na hora num jogo seu. Trincas valem. Bate com qualquer canastra.',
    rules: { discardMode: 'closed', allowSets: true, goOutRequires: 'any' },
  },
  stbl: {
    name: 'Buraco STBL',
    short: 'STBL',
    description:
      'Sem Trinca, Bate Limpo: só sequências do mesmo naipe, e para bater a dupla precisa de uma canastra limpa. Lixo aberto.',
    rules: { discardMode: 'open', allowSets: false, goOutRequires: 'clean' },
  },
  personalizado: {
    name: 'Personalizado',
    short: 'Personal.',
    description: 'Monte as regras do seu jeito.',
    rules: {},
  },
};

export function buildRules(variant = 'aberto', overrides = {}) {
  const base = VARIANTS[variant] ? VARIANTS[variant].rules : {};
  const clean = Object.fromEntries(Object.entries(overrides || {}).filter(([, v]) => v !== undefined && v !== null));
  return { ...DEFAULT_RULES, ...base, ...clean, variant: VARIANTS[variant] ? variant : 'aberto' };
}

export function describeRules(cfg) {
  return [
    cfg.discardMode === 'open' ? 'Lixo aberto' : 'Lixo fechado',
    cfg.allowSets ? 'com trincas' : 'sem trincas',
    cfg.goOutRequires === 'clean' ? 'bate com canastra limpa' : 'bate com qualquer canastra',
    cfg.jokers ? 'com jokers' : null,
    cfg.turnTime ? `${formatTurnTime(cfg.turnTime)} por vez` : 'sem limite de tempo',
    `até ${cfg.target} pontos`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatTurnTime(sec) {
  if (!sec) return 'Sem limite';
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}min${String(r).padStart(2, '0')}` : `${m} min`;
}
