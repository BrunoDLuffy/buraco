// Texto de regras em português. Se receber a configuração da partida, destaca as regras ativas.

import { VARIANTS, formatTurnTime } from '../engine/rules.js';

export function rulesHTML(cfg) {
  const active = cfg
    ? `<div class="rules-active"><b>Nesta partida:</b> lixo ${cfg.discardMode === 'open' ? 'aberto' : 'fechado'}, ${
        cfg.allowSets ? 'trincas permitidas' : 'sem trincas'
      }, para bater precisa de ${cfg.goOutRequires === 'clean' ? 'canastra limpa' : 'qualquer canastra'}${cfg.jokers ? ', com jokers' : ''}, jogo até ${cfg.target} pontos, ${cfg.turnTime ? formatTurnTime(cfg.turnTime) + ' por vez' : 'sem limite de tempo'}.</div>`
    : '';
  return `${active}
  <h3>O básico</h3>
  <p>Dois baralhos (104 cartas). Cada jogador recebe 11 cartas e ficam separados dois <b>mortos</b> de 11 cartas. Em 4 pessoas, quem senta de frente é parceiro.</p>
  <p>Na sua vez: <b>1)</b> compre uma carta do monte <i>ou</i> pegue o lixo; <b>2)</b> baixe jogos ou encaixe cartas nos jogos da sua dupla; <b>3)</b> descarte uma carta no lixo.</p>
  <h3>Jogos</h3>
  <p><b>Sequência:</b> 3 ou mais cartas seguidas do mesmo naipe (ex.: 5♥ 6♥ 7♥). O Ás pode ser baixo (A-2-3) ou alto (Q-K-A).</p>
  <p><b>Trinca:</b> 3 ou mais cartas do mesmo valor (ex.: 9♠ 9♥ 9♦), só nos modos que permitem.</p>
  <p><b>Curinga:</b> o 2 (e o joker, se estiver no baralho) substitui qualquer carta. Só 1 curinga por jogo. Um 2 do mesmo naipe no lugar certo (A-2-3) conta como carta normal.</p>
  <p><b>Canastra:</b> jogo com 7 cartas ou mais. <b>Limpa</b> (sem curinga) vale +200; <b>suja</b> (com curinga) vale +100. Canastra de Ás a Ás (14 cartas): +1000 limpa, +500 suja.</p>
  <h3>Morto e batida</h3>
  <p>Quem fica sem cartas primeiro pega o morto da dupla. Se acabou as cartas baixando jogos, continua jogando com o morto; se foi no descarte, joga com ele na próxima vez.</p>
  <p><b>Bater</b> é ficar sem cartas depois que a dupla já pegou o morto. Para bater, a dupla precisa de pelo menos uma canastra (limpa, em alguns modos). Bater vale +100 e encerra a rodada.</p>
  <p>Se o monte acabar e não houver mais morto, a rodada termina sem batida.</p>
  <h3>Tempo por vez</h3>
  <p>Se a partida tiver limite de tempo e ele acabar, o jogo compra uma carta por você (se ainda não comprou) e descarta uma carta aleatória, passando a vez. Serve para a partida não travar quando alguém sai do celular.</p>
  <h3>Pontos das cartas</h3>
  <p>Ás 15 · 2 (curinga) 10 · 8 a K 10 · 3 a 7 vale 5 · Joker 20. As cartas baixadas somam; as que ficaram na mão descontam. A dupla que não pegou o morto perde 100.</p>
  <h3>Modos de jogo</h3>
  ${Object.entries(VARIANTS)
    .map(([, v]) => `<p><b>${v.name}:</b> ${v.description}</p>`)
    .join('')}
  <h3>Como jogar aqui</h3>
  <p>Toque nas cartas para selecionar. <b>Baixar</b> cria um jogo novo com as selecionadas. Para encaixar, selecione as cartas e toque no seu jogo na mesa. Para descartar, selecione 1 carta e toque em <b>Descartar</b>. O botão <b>?</b> dá uma dica.</p>`;
}
