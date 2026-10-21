// HTML das telas de menu (funcionam na vertical e na horizontal).

import { VARIANTS, DEFAULT_RULES, describeRules } from '../engine/rules.js';
import { BOT_LEVELS } from '../ai/bot.js';
import { esc } from './dom.js';
import { backUrl, faceUrl } from './cardImages.js';
import { FELT_THEMES } from './cardArt.js';
import { rulesHTML } from './rulesText.js';
import { botName } from '../net/room.js';

export function logoHTML() {
  return `<div class="logo">
    <div class="logo-cards">
      <img src="${faceUrl('H01a')}" alt="" class="lc lc1"><img src="${faceUrl('S13a')}" alt="" class="lc lc2"><img src="${faceUrl('D02a')}" alt="" class="lc lc3">
    </div>
    <h1>Buraco</h1>
    <p class="tagline">entre amigos · sem anúncios</p>
  </div>`;
}

export function homeHTML({ hasSaved, savedRoom, onlineReady }) {
  return `<div class="screen home">
    ${logoHTML()}
    <div class="menu-list">
      ${hasSaved ? '<button class="btn primary" data-go="resume">Continuar partida</button>' : ''}
      ${savedRoom ? `<button class="btn primary" data-go="rejoin">Voltar para a sala ${esc(savedRoom.code)}</button>` : ''}
      <button class="btn ${hasSaved || savedRoom ? '' : 'primary'}" data-go="setup">Jogar contra bots</button>
      <button class="btn" data-go="online">Jogar online com amigos${onlineReady ? '' : ' <small>(configurar)</small>'}</button>
      <div class="btn-row">
        <button class="btn ghost" data-go="rules">Regras</button>
        <button class="btn ghost" data-go="settings">Configurações</button>
      </div>
    </div>
  </div>`;
}

// Seletor de regras, usado no jogo contra bots e na sala online.
export function rulesPickerHTML(sel, { disabled = false } = {}) {
  const v = sel.variant;
  const r = { ...DEFAULT_RULES, ...VARIANTS[v].rules, ...sel.rules };
  const dis = disabled ? 'disabled' : '';
  const seg = (name, options, value) =>
    `<div class="seg" data-field="${name}">${options
      .map(([val, label]) => `<button type="button" class="${String(value) === String(val) ? 'on' : ''}" data-val="${val}" ${dis}>${label}</button>`)
      .join('')}</div>`;
  const custom = v === 'personalizado';
  return `<div class="rules-picker">
    <label class="field-label">Modo de jogo</label>
    ${seg('variant', Object.entries(VARIANTS).map(([k, x]) => [k, x.short]), v)}
    <p class="variant-desc">${esc(VARIANTS[v].description)}</p>
    ${
      custom
        ? `<div class="custom-grid">
      <label class="field-label">Lixo</label>${seg('discardMode', [['open', 'Aberto'], ['closed', 'Fechado']], r.discardMode)}
      <label class="field-label">Trincas</label>${seg('allowSets', [[true, 'Pode'], [false, 'Não pode']], r.allowSets)}
      <label class="field-label">Para bater</label>${seg('goOutRequires', [['any', 'Qualquer canastra'], ['clean', 'Canastra limpa']], r.goOutRequires)}
      <label class="field-label">Jokers no baralho</label>${seg('jokers', [[false, 'Não'], [true, 'Sim']], r.jokers)}
      <label class="field-label">Canastra de Ás a Ás</label>${seg('aceToAce', [[true, 'Vale 1000/500'], [false, 'Normal']], r.aceToAce)}
    </div>`
        : ''
    }
    <label class="field-label">Jogo até</label>
    ${seg('target', [[1500, '1500'], [2000, '2000'], [3000, '3000'], [5000, '5000']], r.target)}
    <label class="field-label">Tempo por vez</label>
    ${seg('turnTime', [[0, 'Sem limite'], [60, '1 min'], [90, '1min30'], [120, '2 min'], [180, '3 min']], r.turnTime)}
    <p class="variant-desc">${r.turnTime ? 'Se o tempo acabar, o jogo compra (se precisar) e descarta uma carta aleatória, passando a vez.' : 'Ninguém é apressado: a vez só passa quando o jogador descarta.'}</p>
  </div>`;
}

export function setupHTML(sel) {
  const lv = (field, value) =>
    `<div class="seg small" data-field="${field}">${Object.entries(BOT_LEVELS)
      .map(([k, x]) => `<button type="button" class="${value === k ? 'on' : ''}" data-val="${k}">${x.name}</button>`)
      .join('')}</div>`;
  const four = sel.numPlayers === 4;
  return `<div class="screen setup">
    <header class="screen-head"><button class="icon-btn" data-go="home" aria-label="Voltar">‹</button><h2>Jogar contra bots</h2></header>
    <div class="screen-body">
      <label class="field-label">Jogadores</label>
      <div class="seg" data-field="numPlayers">
        <button type="button" class="${four ? '' : 'on'}" data-val="2">1 contra 1</button>
        <button type="button" class="${four ? 'on' : ''}" data-val="4">Em duplas (4)</button>
      </div>
      ${
        four
          ? `<label class="field-label">Seu parceiro</label>${lv('partner', sel.partner)}
             <label class="field-label">Adversários</label>${lv('opponents', sel.opponents)}`
          : `<label class="field-label">Adversário</label>${lv('opponents', sel.opponents)}`
      }
      ${rulesPickerHTML(sel)}
      <button class="btn primary big" data-go="startLocal">Começar partida</button>
    </div>
  </div>`;
}

export function onlineHTML({ ready, code, busy, error }) {
  if (!ready) {
    return `<div class="screen online">
      <header class="screen-head"><button class="icon-btn" data-go="home" aria-label="Voltar">‹</button><h2>Jogar online</h2></header>
      <div class="screen-body">
        <div class="notice">
          <p><b>O modo online ainda não foi configurado.</b></p>
          <p>Ele usa o plano gratuito do Firebase (do Google). É preciso criar o projeto uma vez e colar a configuração no arquivo <code>js/net/firebase-config.js</code>. O passo a passo está no arquivo <code>FIREBASE.md</code> do projeto.</p>
          <p>Enquanto isso, dá para jogar contra bots normalmente.</p>
        </div>
        <button class="btn" data-go="setup">Jogar contra bots</button>
      </div>
    </div>`;
  }
  return `<div class="screen online">
    <header class="screen-head"><button class="icon-btn" data-go="home" aria-label="Voltar">‹</button><h2>Jogar online</h2></header>
    <div class="screen-body">
      <p class="muted">Crie uma sala e mande o código para os amigos, ou entre na sala de alguém.</p>
      <button class="btn primary big" data-go="createRoom" ${busy ? 'disabled' : ''}>Criar uma sala</button>
      <div class="divider"><span>ou entre numa sala</span></div>
      <div class="join-row">
        <input id="code" class="input code-input" maxlength="5" placeholder="CÓDIGO" value="${esc(code || '')}" autocapitalize="characters" autocomplete="off">
        <button class="btn" data-go="joinRoom" ${busy ? 'disabled' : ''}>Entrar</button>
      </div>
      ${error ? `<p class="error-text">${esc(error)}</p>` : ''}
      ${busy ? '<p class="muted">Conectando…</p>' : ''}
    </div>
  </div>`;
}

export function lobbyHTML(room, { sel, editing }) {
  const host = room.isHost;
  const n = room.numPlayers;
  const me = room.mySeat();
  const seatCard = (i) => {
    const s = room.seat(i);
    const mine = i === me;
    let body;
    if (!s) {
      body = `<div class="seat-name muted">Lugar livre</div>
        <div class="seat-actions">
          ${!mine ? `<button class="btn tiny" data-seat="${i}" data-op="sit">Sentar aqui</button>` : ''}
          ${host ? `<button class="btn tiny" data-seat="${i}" data-op="bot">Colocar bot</button>` : ''}
        </div>`;
    } else if (s.kind === 'bot') {
      body = `<div class="seat-name">🤖 ${esc(botName(i))} <small>· bot</small></div>
        ${
          host
            ? `<div class="seat-actions">${Object.entries(BOT_LEVELS)
                .map(([k, x]) => `<button class="btn tiny ${s.level === k ? 'on' : ''}" data-seat="${i}" data-op="level" data-level="${k}">${x.name}</button>`)
                .join('')}<button class="btn tiny ghost" data-seat="${i}" data-op="open" aria-label="Remover bot">✕</button></div>`
            : ''
        }`;
    } else {
      const off = room.isOffline(i);
      body = `<div class="seat-name"><span class="dot ${off ? 'off' : 'on'}"></span>${esc(s.name)}${mine ? ' <small>(você)</small>' : ''}${
        room.meta && s.uid === room.meta.hostUid ? ' <small>· anfitrião</small>' : ''
      }</div>`;
    }
    return `<div class="seat-card ${mine ? 'mine' : ''}">${body}</div>`;
  };
  const teams =
    n === 4
      ? `<div class="team"><h4>Dupla 1</h4>${seatCard(0)}${seatCard(2)}</div><div class="vs">×</div><div class="team"><h4>Dupla 2</h4>${seatCard(1)}${seatCard(3)}</div>`
      : `<div class="team"><h4>Jogador 1</h4>${seatCard(0)}</div><div class="vs">×</div><div class="team"><h4>Jogador 2</h4>${seatCard(1)}</div>`;
  const full = room.freeSeats().length === 0;
  return `<div class="screen lobby">
    <header class="screen-head"><button class="icon-btn" data-go="leaveRoom" aria-label="Sair da sala">‹</button><h2>Sala</h2></header>
    <div class="screen-body">
      <div class="room-code"><span>Código da sala</span><b>${esc(room.code)}</b>
        <button class="btn" data-go="share">Convidar amigos</button></div>
      <div class="teams">${teams}</div>
      <div class="lobby-rules">
        <p><b>${esc(VARIANTS[room.meta.cfg.variant]?.name || 'Buraco')}</b> · ${esc(describeRules(room.meta.cfg))}</p>
        ${host && !editing ? '<button class="btn small ghost" data-go="editRules">Mudar regras</button>' : ''}
      </div>
      ${
        host && editing
          ? `<div class="edit-rules">
          <label class="field-label">Jogadores</label>
          <div class="seg" data-field="numPlayers"><button type="button" class="${n === 2 ? 'on' : ''}" data-val="2">1 contra 1</button><button type="button" class="${n === 4 ? 'on' : ''}" data-val="4">Em duplas (4)</button></div>
          ${rulesPickerHTML(sel)}
          <button class="btn" data-go="saveRules">Salvar regras</button></div>`
          : ''
      }
      ${
        host
          ? `<button class="btn primary big" data-go="startOnline" ${full ? '' : 'disabled'}>${full ? 'Começar partida' : 'Preencha os lugares para começar'}</button>`
          : '<p class="muted center">Aguardando o anfitrião começar a partida…</p>'
      }
    </div>
  </div>`;
}

export function rulesScreenHTML() {
  return `<div class="screen rules">
    <header class="screen-head"><button class="icon-btn" data-go="home" aria-label="Voltar">‹</button><h2>Regras do Buraco</h2></header>
    <div class="screen-body rules-text">${rulesHTML(null)}</div>
  </div>`;
}

export function settingsHTML(st) {
  const felts = Object.keys(FELT_THEMES)
    .map(
      (k) =>
        `<button type="button" class="swatch ${st.felt === k ? 'on' : ''}" data-set="felt" data-val="${k}" aria-label="Mesa ${k}"><span class="swatch-felt table-felt" data-felt="${k}"></span></button>`
    )
    .join('');
  const backs = ['blue', 'red', 'green', 'black']
    .map((k) => `<button type="button" class="back-pick ${st.back === k ? 'on' : ''}" data-set="back" data-val="${k}" aria-label="Verso ${k}"><img src="${backUrl(k)}" alt=""></button>`)
    .join('');
  const seg = (field, options) =>
    `<div class="seg small">${options
      .map(([val, label]) => `<button type="button" class="${String(st[field]) === String(val) ? 'on' : ''}" data-set="${field}" data-val="${val}">${label}</button>`)
      .join('')}</div>`;
  return `<div class="screen settings">
    <header class="screen-head"><button class="icon-btn" data-go="home" aria-label="Voltar">‹</button><h2>Configurações</h2></header>
    <div class="screen-body">
      <label class="field-label" for="setName">Seu nome</label>
      <input id="setName" class="input" maxlength="16" value="${esc(st.name)}" placeholder="Seu nome">
      <label class="field-label">Cor da mesa</label>
      <div class="swatches">${felts}</div>
      <label class="field-label">Verso das cartas</label>
      <div class="backs">${backs}</div>
      <label class="field-label">Velocidade dos bots</label>
      ${seg('botSpeed', [['lento', 'Devagar'], ['normal', 'Normal'], ['rapido', 'Rápido']])}
      <label class="field-label">Som</label>
      ${seg('sound', [[true, 'Ligado'], [false, 'Desligado']])}
      <label class="field-label">Vibração</label>
      ${seg('vibrate', [[true, 'Ligada'], [false, 'Desligada']])}
      <label class="field-label">Bots no chat</label>
      ${seg('botChat', [[true, 'Conversam'], [false, 'Ficam quietos']])}
      <p class="muted small-print">Buraco entre Amigos · sem anúncios · código aberto</p>
    </div>
  </div>`;
}
