// Falas dos bots no chat: reagem a lances da partida e respondem às pessoas.
// Tudo com probabilidade e intervalo mínimo, para não virar spam.

import { teamOf } from '../engine/game.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const LINES = {
  myCanastra: ['Canastra! 😎', 'Olha a canastra aí!', 'Essa ficou bonita!', 'Mais uma pra conta!'],
  myCleanCanastra: ['Limpinha! ✨', 'Canastra limpa, minha gente!', 'Sem curinga nenhum! 😎'],
  theirCanastra: ['Ih, lá vem eles...', 'Calma que o jogo tá só começando.', 'Hmm, tão jogando bem, hein?'],
  morto: ['Peguei o morto!', 'Morto na mão, agora vai!', 'Bora com o morto!'],
  partnerMorto: ['Boa, parceiro!', 'Isso! Pegamos o morto!'],
  bigPileTaken: ['Levou o lixo todo, hein?', 'Que lixão!', 'Eita, quanta carta!'],
  iTookPile: ['Obrigado pelo presente! 😄', 'Lixo bom esse!'],
  weWentOut: ['Batemos! 🎉', 'Bati! Contem as cartas aí! 😄', 'Fechou a rodada!'],
  theyWentOut: ['Ah não, fiquei com carta na mão...', 'Poxa, bateram rápido!', 'Essa doeu.'],
  wonGame: ['Bom jogo, pessoal! 🏆', 'Valeu pela partida!'],
  lostGame: ['Bom jogo! Quero revanche.', 'Parabéns! Na próxima eu ganho.'],
};

const REPLIES = [
  { re: /\b(oi|ol[aá]|e a[ií]|boa noite|bom dia|boa tarde|salve)\b/i, lines: ['Oi! Boa sorte pra todos 🍀', 'E aí! Bora jogar.', 'Olá! Que vença o melhor 😄'] },
  { re: /(parab[eé]ns|mandou bem|boa jogada|\bboa\b|arrasou)/i, lines: ['Valeu! 😄', 'Obrigado!', 'Sorte de principiante 😅'] },
  { re: /(k{3,}|haha|hehe|\brs\b|😂|🤣)/i, lines: ['Kkkkk', 'Hahaha', '😂'] },
  { re: /(azar|droga|ruim|aff|poxa)/i, lines: ['Calma, a sorte vira!', 'Faz parte 😅', 'Respira e vai!'] },
  { re: /(r[aá]pido|demora|anda|vai logo)/i, lines: ['Calma, tô pensando! 🤔', 'Já vai, já vai!'] },
  { re: /(bom jogo|\bbj\b|gg)/i, lines: ['Bom jogo! 🤝', 'Valeu, foi divertido!'] },
  { re: /\?$/, lines: ['Sei não, hein...', 'Hmm, boa pergunta 🤔', 'Talvez!'] },
];
const GENERIC = ['Haha', 'Vamos ver...', 'Foco no jogo! 😅', 'Pode ser!', '👍'];

function botsOf(state, team) {
  const out = [];
  for (let s = 0; s < state.numPlayers; s++) if (state.players[s].bot && (team == null || teamOf(s, state.numPlayers) === team)) out.push(s);
  return out;
}

// Falas em reação ao último lance (prev -> next). Devolve no máximo 2 falas.
export function eventLines(prev, next, rng = Math.random) {
  if (!prev || !next || next.seq === prev.seq || !next.lastEvent) return [];
  const ev = next.lastEvent;
  const n = next.numPlayers;
  const out = [];
  const say = (seat, key, chance) => {
    if (seat == null || !next.players[seat] || !next.players[seat].bot) return;
    if (rng() < chance) out.push({ seat, text: pick(LINES[key], rng) });
  };
  const teamBot = (team, prefer) => {
    const bots = botsOf(next, team);
    if (prefer != null && bots.includes(prefer)) return prefer;
    return bots.length ? pick(bots, rng) : null;
  };
  const actorTeam = ev.seat != null ? teamOf(ev.seat, n) : null;

  if (next.phase === 'gameOver' && prev.phase !== 'gameOver') {
    say(teamBot(next.winner), 'wonGame', 0.8);
    say(teamBot(1 - next.winner), 'lostGame', 0.6);
  } else if (ev.type === 'goOut') {
    say(teamBot(actorTeam, ev.seat), 'weWentOut', 0.7);
    say(teamBot(1 - actorTeam), 'theyWentOut', 0.5);
  } else if ((ev.type === 'addToMeld' && ev.canastra) || (ev.type === 'meld' && ev.cards && ev.cards.length >= 7)) {
    const m = next.melds[actorTeam].find((x) => x.id === ev.meldId);
    say(teamBot(actorTeam, ev.seat), m && m.clean ? 'myCleanCanastra' : 'myCanastra', 0.6);
    say(teamBot(1 - actorTeam), 'theirCanastra', 0.3);
  } else if (ev.type === 'morto') {
    if (next.players[ev.seat].bot) say(ev.seat, 'morto', 0.5);
    else say(teamBot(actorTeam), 'partnerMorto', 0.4);
  } else if (ev.type === 'takeDiscard' && ev.cards && ev.cards.length >= 6) {
    say(ev.seat, 'iTookPile', 0.3);
    say(teamBot(1 - actorTeam), 'bigPileTaken', 0.35);
  }
  return out.slice(0, 2);
}

// Resposta de um bot à mensagem de uma pessoa (ou null).
export function replyLine(msg, state, rng = Math.random) {
  const bots = botsOf(state, null);
  if (!bots.length || !msg || msg.bot) return null;
  // em duplas, o parceiro responde com mais frequência
  const partner = state.numPlayers === 4 ? (msg.seat + 2) % 4 : -1;
  const seat = bots.includes(partner) && rng() < 0.6 ? partner : pick(bots, rng);
  const rule = REPLIES.find((r) => r.re.test(msg.text));
  if (rule) return rng() < 0.85 ? { seat, text: pick(rule.lines, rng) } : null;
  return rng() < 0.3 ? { seat, text: pick(GENERIC, rng) } : null;
}
