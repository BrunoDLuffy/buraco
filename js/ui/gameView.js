// Tela da partida (sempre na horizontal). Recebe um "controlador" (local ou online) e desenha a visão dele.
//
// Controlador: { mySeat, subscribe(fn), act(action) -> Promise<{ok, error}>, view() }

import { faceUrl, miniUrl, backUrl } from './cardImages.js';
import { sortHand, cardLabel, isWild } from '../engine/cards.js';
import { analyzeMeld } from '../engine/melds.js';
import { teamOf } from '../engine/game.js';
import { VARIANTS, describeRules } from '../engine/rules.js';
import { BOT_LEVELS, findAdds, findNewMelds, botAction } from '../ai/bot.js';
import { sfx } from './sound.js';
import { esc, toast, vibrate } from './dom.js';
import { rulesHTML } from './rulesText.js';

export function mountGame(root, controller, opts) {
  const { settings, onExit, onRematch, online = null } = opts;
  const ui = {
    selected: new Set(),
    sortMode: settings.sortMode || 'suit',
    pickMeldForDiscard: false,
    busy: false,
    lastSeq: -1,
    lastRoundShown: 0,
    hint: new Set(),
    overlay: null, // 'menu' | 'round' | 'rules' | 'confirmExit'
    roundDismissed: 0,
    chatOpen: false,
    unread: 0,
    msgs: [],
    bubbles: new Map(), // assento -> { text, timer }
  };
  let view = null;

  root.innerHTML = `
  <div class="game table-rim" data-felt="${esc(settings.felt)}">
    <div class="table-felt g-felt">
      <div class="g-top">
        <div class="g-top-left">
          <button class="icon-btn" data-act="menu" aria-label="Menu">${menuIcon()}</button>
          <button class="icon-btn chat-btn" data-act="chat" aria-label="Conversa da mesa">${chatIcon()}<span class="chat-unread hidden"></span></button>
          <div class="g-top-seat" data-rel="top"></div>
        </div>
        <div class="peek peek-top" data-peek="top"></div>
        <div class="g-score"></div>
      </div>
      <div class="peek peek-left" data-peek="left"></div>
      <div class="peek peek-right" data-peek="right"></div>
      <div class="g-zone g-zone-opp"><div class="g-zone-label">Eles</div><div class="g-melds" data-team="opp"></div></div>
      <div class="g-center">
        <div class="g-side" data-rel="left"></div>
        <div class="g-piles">
          <button class="g-stock" data-act="stock" aria-label="Comprar do monte"></button>
          <div class="g-mortos"></div>
          <button class="g-discard" data-act="discardPile" aria-label="Lixo"></button>
        </div>
        <div class="g-side" data-rel="right"></div>
      </div>
      <div class="g-status"><span class="g-status-text"></span><span class="g-timer hidden" role="timer" aria-label="Tempo restante da vez"></span></div>
      <div class="g-zone g-zone-mine"><div class="g-zone-label">Nós</div><div class="g-melds" data-team="mine"></div></div>
      <div class="g-bottom">
        <div class="g-hand"></div>
        <div class="g-actions">
          <button class="g-btn primary" data-act="meld">Baixar</button>
          <button class="g-btn" data-act="discard">Descartar</button>
          <div class="g-btn-row">
            <button class="g-btn small" data-act="sort" title="Ordenar">${sortIcon()}</button>
            <button class="g-btn small" data-act="hint" title="Dica">?</button>
          </div>
        </div>
      </div>
      <div class="chat-panel hidden" role="dialog" aria-label="Conversa da mesa">
        <div class="chat-head"><b>Conversa da mesa</b><button class="chat-close" data-act="chatClose" aria-label="Fechar conversa">×</button></div>
        <div class="chat-list" aria-live="polite"></div>
        <div class="chat-quick">${QUICK_PHRASES.map((q) => `<button type="button" data-act="chatQuick" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="chat-form">
          <input id="chatInput" class="chat-input" maxlength="200" placeholder="Escreva uma mensagem" autocomplete="off" enterkeyhint="send">
          <button class="g-btn primary" type="submit">Enviar</button>
        </form>
      </div>
      <div class="g-overlay hidden"></div>
    </div>
  </div>`;

  const el = {
    game: root.querySelector('.game'),
    top: root.querySelector('[data-rel="top"]'),
    left: root.querySelector('[data-rel="left"]'),
    right: root.querySelector('[data-rel="right"]'),
    score: root.querySelector('.g-score'),
    oppMelds: root.querySelector('[data-team="opp"]'),
    myMelds: root.querySelector('[data-team="mine"]'),
    oppLabel: root.querySelector('.g-zone-opp .g-zone-label'),
    myLabel: root.querySelector('.g-zone-mine .g-zone-label'),
    stock: root.querySelector('.g-stock'),
    mortos: root.querySelector('.g-mortos'),
    discard: root.querySelector('.g-discard'),
    status: root.querySelector('.g-status-text'),
    timer: root.querySelector('.g-timer'),
    hand: root.querySelector('.g-hand'),
    actions: root.querySelector('.g-actions'),
    overlay: root.querySelector('.g-overlay'),
    peekTop: root.querySelector('[data-peek="top"]'),
    peekLeft: root.querySelector('[data-peek="left"]'),
    peekRight: root.querySelector('[data-peek="right"]'),
    chatPanel: root.querySelector('.chat-panel'),
    chatList: root.querySelector('.chat-list'),
    chatInput: root.querySelector('.chat-input'),
    chatForm: root.querySelector('.chat-form'),
    chatUnread: root.querySelector('.chat-unread'),
  };

  // ---------- helpers ----------
  const n = () => view.numPlayers;
  const rel = (seat) => (seat - view.mySeat + n()) % n();
  const seatAt = (r) => (view.mySeat + r) % n();
  const myTurn = () => view && view.turn === view.mySeat && (view.phase === 'draw' || view.phase === 'play');
  const playerName = (seat) => (seat === view.mySeat ? 'Você' : view.players[seat].name);
  const teamName = (team) => {
    if (n() === 2) return team === view.myTeam ? 'Você' : view.players[team].name;
    return team === view.myTeam ? 'Nós' : 'Eles';
  };

  function seatBadge(seat) {
    if (seat == null) return '';
    const p = view.players[seat];
    const team = teamOf(seat, n());
    const turn = view.turn === seat && (view.phase === 'draw' || view.phase === 'play');
    const off = online && online.isOffline(seat);
    const bubble = ui.bubbles.get(seat);
    const partner = n() === 4 && team === view.myTeam && seat !== view.mySeat;
    const avatar = p.bot ? botIcon() : esc((p.name || '?').trim().charAt(0).toUpperCase());
    return `<div class="seat-badge ${turn ? 'turn' : ''} ${team === view.myTeam ? 'ally' : 'foe'} ${off ? 'offline' : ''}">
      <div class="avatar">${avatar}</div>
      <div class="seat-info"><b>${esc(p.name)}</b><span>${partner ? 'parceiro' : 'adversário'}${p.bot ? ' · bot ' + (BOT_LEVELS[p.bot]?.name || '').toLowerCase() : ''}${off ? ' · offline' : ''}</span></div>
      ${turn ? '<div class="thinking"><i></i><i></i><i></i></div>' : ''}
      ${off && online.isHost ? `<button class="badge-btn" data-act="replaceBot" data-seat-r="${seat}">pôr bot</button>` : ''}
      ${bubble ? `<div class="bubble">${esc(bubble.text)}</div>` : ''}
    </div>`;
  }

  // Verso das cartas de cada jogador, saindo da borda da tela. Sem número: dá para contar.
  function peekHTML(seat) {
    const count = view.handCounts[seat];
    const back = backUrl(settings.back);
    let imgs = '';
    for (let i = 0; i < count; i++) imgs += `<img src="${back}" alt="" draggable="false" style="--i:${i}">`;
    return `<div class="peek-stack" style="--n:${count}">${imgs}</div>`;
  }

  function renderPeek(elPeek, seat, vertical) {
    if (seat == null) {
      elPeek.innerHTML = '';
      return;
    }
    const turn = view.turn === seat && (view.phase === 'draw' || view.phase === 'play');
    elPeek.classList.toggle('turn', turn);
    elPeek.setAttribute('aria-label', `Cartas na mão de ${view.players[seat].name}`);
    elPeek.innerHTML = peekHTML(seat);
    const count = view.handCounts[seat];
    // espaçamento: cabe no espaço disponível, mas sempre dá para contar as cartas
    requestAnimationFrame(() => {
      const img = elPeek.querySelector('img');
      if (!img) return;
      const short = img.offsetWidth;
      let avail;
      if (vertical) avail = elPeek.clientHeight;
      else avail = el.game.clientWidth * 0.28;
      const step = count > 1 ? Math.max(4, Math.min(short * 0.34, (avail - short) / (count - 1))) : 0;
      elPeek.style.setProperty('--pstep', step + 'px');
    });
  }

  function renderSeats() {
    const N = n();
    if (N === 4) {
      el.top.innerHTML = seatBadge(seatAt(2));
      el.left.innerHTML = seatBadge(seatAt(1));
      el.right.innerHTML = seatBadge(seatAt(3));
      renderPeek(el.peekTop, seatAt(2), false);
      renderPeek(el.peekLeft, seatAt(1), true);
      renderPeek(el.peekRight, seatAt(3), true);
    } else {
      el.top.innerHTML = seatBadge(seatAt(1));
      el.left.innerHTML = '';
      el.right.innerHTML = '';
      renderPeek(el.peekTop, seatAt(1), false);
      renderPeek(el.peekLeft, null, true);
      renderPeek(el.peekRight, null, true);
    }
  }

  function meldHTML(m, mine, flashId) {
    const isCanastra = m.cards.length >= 7;
    const cls = ['meld', mine ? 'mine' : '', isCanastra ? 'canastra' : '', isCanastra ? (m.clean ? 'clean' : 'dirty') : '', m.id === flashId ? 'flash' : '']
      .filter(Boolean)
      .join(' ');
    const imgs = m.cards.map((c) => `<img src="${miniUrl(c)}" alt="${esc(cardLabel(c))}" class="${c === m.wild ? 'wild' : ''}" draggable="false">`).join('');
    const tag = isCanastra ? `<span class="meld-tag">${m.aceToAce ? 'Ás a Ás' : m.clean ? 'Limpa' : 'Suja'}</span>` : '';
    return `<div class="${cls}" data-meld="${m.id}">${imgs}${tag}</div>`;
  }

  // ---------- render ----------
  function render() {
    if (!view) return;
    const N = n();
    const flashId = view.lastEvent && (view.lastEvent.type === 'meld' || view.lastEvent.type === 'addToMeld' || view.lastEvent.type === 'takeDiscard') ? view.lastEvent.meldId : null;

    // jogadores
    renderSeats();
    el.game.classList.toggle('two-players', N === 2);
    el.game.classList.toggle('four-players', N === 4);

    // placar
    const my = view.myTeam;
    const op = 1 - my;
    el.score.innerHTML = `
      <div class="score-line"><span class="ally">${esc(teamName(my))} <b>${view.scores[my]}</b></span><span class="foe">${esc(teamName(op))} <b>${view.scores[op]}</b></span></div>
      <div class="score-sub">Rodada ${view.round} · ${esc(VARIANTS[view.cfg.variant]?.short || '')} · até ${view.cfg.target}</div>`;
    el.oppLabel.textContent = teamName(op);
    el.myLabel.textContent = teamName(my);
    el.oppLabel.classList.toggle('morto', view.tookMorto[op]);
    el.myLabel.classList.toggle('morto', view.tookMorto[my]);
    el.oppLabel.title = view.tookMorto[op] ? 'Já pegou o morto' : '';
    el.myLabel.title = view.tookMorto[my] ? 'Já pegou o morto' : '';

    // jogos na mesa
    el.oppMelds.innerHTML = view.melds[op].map((m) => meldHTML(m, false, flashId)).join('') || '<div class="empty-zone">Nenhum jogo ainda</div>';
    el.myMelds.innerHTML = view.melds[my].map((m) => meldHTML(m, true, flashId)).join('') || '<div class="empty-zone">Seus jogos aparecem aqui</div>';

    // monte, mortos e lixo
    const canDraw = myTurn() && view.phase === 'draw';
    el.stock.innerHTML = view.stockCount
      ? `<img src="${backUrl(settings.back)}" alt="" draggable="false"><span class="pile-count">${view.stockCount}</span>`
      : `<div class="pile-empty">vazio</div>`;
    el.stock.classList.toggle('active', canDraw);
    el.mortos.innerHTML = Array.from({ length: view.mortosLeft }, () => `<img src="${backUrl(settings.back)}" alt="" draggable="false">`).join('') + (view.mortosLeft ? '<span class="pile-label">morto</span>' : '');
    renderDiscard(canDraw);

    // status
    el.status.innerHTML = statusText();

    renderHand();
    renderActions();
    renderOverlay();
  }

  function renderDiscard(canDraw) {
    const d = view.discard;
    // anima a carta de cima só quando ela acabou de chegar
    const topKey = d.length + ':' + (d[d.length - 1] || '');
    const isNew = ui.lastTopKey !== undefined && ui.lastTopKey !== topKey && view.lastEvent && view.lastEvent.type === 'discard';
    ui.lastTopKey = topKey;
    el.discard.classList.toggle('active', canDraw && d.length > 0);
    el.discard.classList.toggle('closed', view.cfg.discardMode === 'closed');
    if (!d.length) {
      el.discard.innerHTML = '<div class="pile-empty">lixo</div>';
      return;
    }
    if (view.cfg.discardMode === 'closed') {
      el.discard.innerHTML = `<div class="discard-stack">${d.length > 1 ? '<img class="under" src="' + backUrl(settings.back) + '" alt="">' : ''}<img src="${faceUrl(d[d.length - 1])}" alt="${esc(cardLabel(d[d.length - 1]))}" draggable="false" class="${isNew ? 'new' : ''}"></div><span class="pile-count">${d.length}</span>`;
      return;
    }
    el.discard.innerHTML = `<div class="discard-fan" style="--count:${d.length}">${d
      .map((c, i) => `<img src="${faceUrl(c)}" alt="${esc(cardLabel(c))}" draggable="false" class="${i === d.length - 1 && isNew ? 'new' : ''}">`)
      .join('')}</div><span class="pile-count">${d.length}</span>`;
    // espaçamento do leque de acordo com o espaço disponível
    requestAnimationFrame(() => {
      const fan = el.discard.querySelector('.discard-fan');
      if (!fan) return;
      // largura da carta pela altura do lixo (a imagem pode ainda não ter carregado)
      const cw = el.discard.clientHeight * 0.714 || 40;
      const avail = el.discard.parentElement.getBoundingClientRect().right - el.discard.getBoundingClientRect().left - 12;
      const step = d.length > 1 ? Math.max(8, Math.min(cw * 0.42, (avail - cw) / (d.length - 1))) : 0;
      fan.style.setProperty('--fan-step', step + 'px');
    });
  }

  function statusText() {
    if (view.phase === 'roundOver' || view.phase === 'gameOver') return 'Fim da rodada';
    if (myTurn()) {
      if (ui.pickMeldForDiscard) return '<b>Toque no jogo</b> onde a carta do lixo vai entrar';
      if (view.phase === 'draw')
        return view.cfg.discardMode === 'open'
          ? '<b>Sua vez:</b> compre do monte ou pegue o lixo'
          : '<b>Sua vez:</b> compre do monte, ou selecione cartas que formem jogo com a carta do lixo e toque no lixo';
      return '<b>Sua vez:</b> baixe jogos e descarte uma carta';
    }
    const last = describeEvent(view.lastEvent);
    return `Vez de <b>${esc(view.players[view.turn].name)}</b>${last ? ' · ' + last : ''}`;
  }

  function describeEvent(ev) {
    if (!ev || ev.seat == null) return '';
    const who = esc(playerName(ev.seat));
    switch (ev.type) {
      case 'draw':
        return `${who} comprou do monte`;
      case 'takeDiscard':
        return `${who} pegou o lixo (${ev.cards.length})`;
      case 'meld':
        return `${who} baixou um jogo`;
      case 'addToMeld':
        return ev.canastra ? `${who} fez canastra!` : `${who} encaixou carta`;
      case 'discard':
        return ev.timeout
          ? `${who} demorou: o jogo descartou ${esc(cardLabel(ev.card))}`
          : `${who} descartou ${esc(cardLabel(ev.card))}`;
      case 'morto':
        return `${who} pegou o morto`;
      default:
        return '';
    }
  }

  function handOrder() {
    return sortHand(view.hand, ui.sortMode);
  }

  function renderHand() {
    const cards = handOrder();
    // limpa seleção de cartas que saíram da mão
    for (const c of [...ui.selected]) if (!view.hand.includes(c)) ui.selected.delete(c);
    const fresh = new Set();
    if (view.lastEvent && view.lastEvent.seat === view.mySeat && view.turn === view.mySeat) {
      if (view.lastEvent.type === 'draw' && view.lastDrawn) fresh.add(view.lastDrawn);
      if (view.lastEvent.type === 'takeDiscard') view.lastEvent.cards.forEach((c) => fresh.add(c));
    }
    el.hand.innerHTML = cards
      .map(
        (c) =>
          `<button class="hcard ${ui.selected.has(c) ? 'sel' : ''} ${fresh.has(c) ? 'fresh' : ''} ${ui.hint.has(c) ? 'hint' : ''} ${isWild(c) ? 'wild' : ''}" data-card="${c}" aria-label="${esc(cardLabel(c))}"><img src="${faceUrl(c)}" alt="" draggable="false"></button>`
      )
      .join('');
    layoutHand();
  }

  function layoutHand() {
    const count = view ? view.hand.length : 0;
    if (!count) return;
    const W = el.hand.clientWidth;
    const first = el.hand.querySelector('.hcard');
    const cw = first ? first.getBoundingClientRect().width : 60;
    let step = count > 1 ? (W - cw - 6) / (count - 1) : cw;
    step = Math.min(step, cw * 0.78);
    step = Math.max(step, cw * 0.36);
    el.hand.style.setProperty('--step', step + 'px');
    el.hand.style.setProperty('--cw', cw + 'px');
  }

  function renderActions() {
    const playing = myTurn() && view.phase === 'play';
    const sel = ui.selected.size;
    const btn = (a) => el.actions.querySelector(`[data-act="${a}"]`);
    btn('meld').disabled = !(playing && sel >= 3) || ui.busy;
    btn('discard').disabled = !(playing && sel === 1) || ui.busy;
    btn('hint').disabled = !myTurn();
    el.game.classList.toggle('my-turn', myTurn());
    el.game.classList.toggle('has-sel', sel > 0);
  }

  // ---------- overlays ----------
  function renderOverlay() {
    const o = el.overlay;
    let html = '';
    const roundOver = view.phase === 'roundOver' || view.phase === 'gameOver';
    if (ui.overlay === 'menu') html = menuHTML();
    else if (ui.overlay === 'rules') html = `<div class="panel wide"><h2>Regras</h2><div class="rules-scroll">${rulesHTML(view.cfg)}</div><div class="panel-actions"><button class="btn" data-act="closeOverlay">Fechar</button></div></div>`;
    else if (ui.overlay === 'confirmExit')
      html = `<div class="panel"><h2>Sair da partida?</h2><p>${online ? 'Você sai da sala. Se for o anfitrião, a partida para para todos.' : 'A partida fica salva e você pode continuar depois.'}</p><div class="panel-actions"><button class="btn" data-act="closeOverlay">Voltar</button><button class="btn danger" data-act="exit">Sair</button></div></div>`;
    else if (roundOver && ui.roundDismissed !== view.round) html = roundHTML();
    o.classList.toggle('hidden', !html);
    if (o.dataset.html !== html) {
      o.innerHTML = html;
      o.dataset.html = html;
    }
  }

  function menuHTML() {
    return `<div class="panel">
      <h2>Menu</h2>
      <p class="muted">${esc(describeRules(view.cfg))}</p>
      <div class="menu-list">
        <button class="btn" data-act="closeOverlay">Continuar jogando</button>
        <button class="btn" data-act="showRules">Ver regras</button>
        <button class="btn" data-act="toggleSound">${settings.sound ? 'Som: ligado' : 'Som: desligado'}</button>
        <button class="btn danger" data-act="confirmExit">Sair da partida</button>
      </div></div>`;
  }

  function roundHTML() {
    const r = view.roundResult;
    if (!r) return '';
    const my = view.myTeam;
    const op = 1 - my;
    const row = (label, key) =>
      `<tr><td>${label}</td><td>${fmt(r.teams[my][key])}</td><td>${fmt(r.teams[op][key])}</td></tr>`;
    const over = view.phase === 'gameOver';
    const won = over && view.winner === my;
    let title;
    if (over) title = won ? 'Vitória! 🏆' : 'Fim de jogo';
    else if (r.outTeam == null) title = 'O monte acabou';
    else title = r.outTeam === my ? (r.outSeat === view.mySeat ? 'Você bateu!' : `${esc(view.players[r.outSeat].name)} bateu!`) : `${esc(view.players[r.outSeat].name)} bateu`;
    const canNext = !online || online.isHost;
    const next = over
      ? `<button class="btn" data-act="exit">Menu</button>${onRematch ? '<button class="btn primary" data-act="rematch">Jogar de novo</button>' : ''}`
      : canNext
        ? '<button class="btn primary" data-act="nextRound">Próxima rodada</button>'
        : '<p class="muted">Aguardando o anfitrião começar a próxima rodada…</p>';
    return `<div class="panel round-panel ${over ? (won ? 'won' : 'lost') : ''}">
      <h2>${title}</h2>
      ${over ? `<p class="final">${esc(teamName(view.winner))} venceu${view.winner === my && n() === 2 ? '' : ''} por ${view.scores[view.winner]} a ${view.scores[1 - view.winner]}</p>` : ''}
      <table class="score-table">
        <thead><tr><th>Rodada ${r.round}</th><th class="ally">${esc(teamName(my))}</th><th class="foe">${esc(teamName(op))}</th></tr></thead>
        <tbody>
          ${row('Cartas baixadas', 'meldPoints')}
          ${row('Canastras', 'bonus')}
          ${row('Batida', 'goOut')}
          ${row('Cartas na mão', 'handPoints')}
          ${row('Morto', 'morto')}
          <tr class="total"><td>Total da rodada</td><td>${fmt(r.teams[my].total)}</td><td>${fmt(r.teams[op].total)}</td></tr>
          <tr class="grand"><td>Placar</td><td>${r.scores[my]}</td><td>${r.scores[op]}</td></tr>
        </tbody>
      </table>
      <div class="panel-actions">${next}</div>
    </div>`;
  }

  const fmt = (x) => (x > 0 ? '+' + x : String(x));

  // ---------- ações ----------
  async function send(action) {
    if (ui.busy) return { ok: false };
    ui.busy = true;
    renderActions();
    let r;
    try {
      r = await controller.act(action);
    } catch (e) {
      r = { ok: false, error: e.message || 'Erro de conexão' };
    }
    ui.busy = false;
    if (!r.ok && r.error) {
      toast(r.error, 'error');
      if (settings.sound) sfx.error();
      if (settings.vibrate) vibrate(40);
    }
    if (view) renderActions();
    return r;
  }

  function selectedCards() {
    return handOrder().filter((c) => ui.selected.has(c));
  }

  async function onStock() {
    if (!myTurn() || view.phase !== 'draw') return;
    ui.pickMeldForDiscard = false;
    await send({ type: 'draw' });
  }

  async function onDiscardPile() {
    if (!myTurn() || view.phase !== 'draw' || !view.discard.length) {
      if (view.cfg.discardMode === 'open' && view.discard.length > 3) ui.overlay = null;
      return;
    }
    if (view.cfg.discardMode === 'open') {
      ui.selected.clear();
      await send({ type: 'takeDiscard' });
      return;
    }
    // fechado
    const sel = selectedCards();
    const top = view.discard[view.discard.length - 1];
    if (sel.length >= 2) {
      const res = analyzeMeld([top, ...sel], view.cfg);
      if (!res.ok) {
        // talvez encaixe num jogo existente junto com as selecionadas
        const fits = view.melds[view.myTeam].filter((m) => analyzeMeld([...m.cards, top, ...sel], view.cfg, m.type).ok);
        if (fits.length === 1) {
          const r = await send({ type: 'takeDiscard', meldId: fits[0].id, cards: sel });
          if (r.ok) ui.selected.clear();
          return;
        }
        toast('A carta do lixo (' + cardLabel(top) + ') não forma jogo com as cartas selecionadas', 'error');
        return;
      }
      const r = await send({ type: 'takeDiscard', cards: sel });
      if (r.ok) ui.selected.clear();
      return;
    }
    const fits = view.melds[view.myTeam].filter((m) => analyzeMeld([...m.cards, top, ...sel], view.cfg, m.type).ok);
    if (fits.length === 1) {
      const r = await send({ type: 'takeDiscard', meldId: fits[0].id, cards: sel });
      if (r.ok) ui.selected.clear();
    } else if (fits.length > 1) {
      ui.pickMeldForDiscard = true;
      render();
    } else {
      toast('Para pegar o lixo fechado, selecione 2 cartas da mão que formem jogo com ' + cardLabel(top), 'info', 3600);
    }
  }

  async function onMeldTap(meldId) {
    if (!myTurn()) return;
    const sel = selectedCards();
    if (ui.pickMeldForDiscard) {
      ui.pickMeldForDiscard = false;
      const r = await send({ type: 'takeDiscard', meldId, cards: sel });
      if (r.ok) ui.selected.clear();
      return;
    }
    if (view.phase !== 'play') return;
    if (!sel.length) {
      toast('Selecione cartas da mão e toque no jogo para encaixar', 'info');
      return;
    }
    const r = await send({ type: 'addToMeld', meldId, cards: sel });
    if (r.ok) ui.selected.clear();
  }

  async function onMeld() {
    const sel = selectedCards();
    if (sel.length < 3) return;
    const res = analyzeMeld(sel, view.cfg);
    if (!res.ok) {
      toast(res.reason, 'error');
      if (settings.sound) sfx.error();
      return;
    }
    const r = await send({ type: 'meld', cards: sel });
    if (r.ok) ui.selected.clear();
  }

  async function onDiscard() {
    const sel = selectedCards();
    if (sel.length !== 1) return;
    const r = await send({ type: 'discard', card: sel[0] });
    if (r.ok) ui.selected.clear();
  }

  function onHint() {
    if (!myTurn()) return;
    ui.hint.clear();
    if (view.phase === 'draw') {
      toast(view.cfg.discardMode === 'open' ? 'Compre do monte ou pegue o lixo se ele tiver cartas que combinam com as suas' : 'Compre do monte, a menos que a carta do lixo forme jogo com 2 cartas suas');
      return;
    }
    const adds = findAdds(view.hand, view.melds[view.myTeam], view.cfg);
    if (adds.length) {
      ui.hint.add(adds[0].card);
      toast(`${cardLabel(adds[0].card)} encaixa num jogo seu`);
    } else {
      const melds = findNewMelds(view.hand, view.cfg);
      if (melds.length) {
        melds[0].cards.forEach((c) => ui.hint.add(c));
        toast('Essas cartas formam um jogo');
      } else {
        const a = botAction({ ...view, phase: 'play' }, 'medio', () => ({ ok: true }));
        if (a && a.type === 'discard') {
          ui.hint.add(a.card);
          toast(`Sugestão de descarte: ${cardLabel(a.card)}`);
        }
      }
    }
    renderHand();
    setTimeout(() => {
      ui.hint.clear();
      if (view) renderHand();
    }, 3000);
  }

  // ---------- eventos ----------
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-card],[data-meld],[data-act]');
    if (!t || !view) return;
    if (t.dataset.card) {
      const c = t.dataset.card;
      if (ui.selected.has(c)) ui.selected.delete(c);
      else ui.selected.add(c);
      if (settings.sound) sfx.card();
      t.classList.toggle('sel', ui.selected.has(c));
      renderActions();
      return;
    }
    if (t.dataset.meld) {
      const id = Number(t.dataset.meld);
      if (t.classList.contains('mine')) await onMeldTap(id);
      return;
    }
    switch (t.dataset.act) {
      case 'stock':
        return onStock();
      case 'discardPile':
        return onDiscardPile();
      case 'meld':
        return onMeld();
      case 'discard':
        return onDiscard();
      case 'sort':
        ui.sortMode = ui.sortMode === 'suit' ? 'rank' : 'suit';
        settings.sortMode = ui.sortMode;
        opts.onSettingsChange && opts.onSettingsChange(settings);
        toast(ui.sortMode === 'suit' ? 'Ordenado por naipe' : 'Ordenado por valor', 'info', 1200);
        return renderHand();
      case 'hint':
        return onHint();
      case 'menu':
        ui.overlay = 'menu';
        return renderOverlay();
      case 'closeOverlay':
        ui.overlay = null;
        return renderOverlay();
      case 'showRules':
        ui.overlay = 'rules';
        return renderOverlay();
      case 'toggleSound':
        settings.sound = !settings.sound;
        opts.onSettingsChange && opts.onSettingsChange(settings);
        return renderOverlay();
      case 'confirmExit':
        ui.overlay = 'confirmExit';
        return renderOverlay();
      case 'exit':
        return onExit && onExit();
      case 'nextRound':
        ui.roundDismissed = 0;
        return send({ type: 'newRound' });
      case 'rematch':
        return onRematch && onRematch();
      case 'chat':
        return ui.chatOpen ? closeChat() : openChat();
      case 'chatClose':
        return closeChat();
      case 'chatQuick':
        return sendChat(t.dataset.text);
      case 'replaceBot':
        if (online && online.replaceWithBot) {
          online.replaceWithBot(Number(t.dataset.seatR), 'medio');
          toast('Um bot assumiu o lugar até o fim da partida');
        }
        return;
    }
  });

  // ---------- chat ----------
  function chatMsgHTML(m) {
    const mine = m.seat === view.mySeat;
    const team = teamOf(m.seat, n());
    return `<div class="chat-msg ${mine ? 'mine' : ''} ${team === view.myTeam ? 'ally' : 'foe'}"><b>${esc(mine ? 'Você' : m.name)}</b><span>${esc(m.text)}</span></div>`;
  }

  function renderChat() {
    if (!view) return;
    el.chatList.innerHTML = ui.msgs.length
      ? ui.msgs.map(chatMsgHTML).join('')
      : '<p class="chat-empty">Nenhuma mensagem ainda. Mande um oi para a mesa!</p>';
    el.chatList.scrollTop = el.chatList.scrollHeight;
    el.chatUnread.textContent = ui.unread > 9 ? '9+' : String(ui.unread);
    el.chatUnread.classList.toggle('hidden', !ui.unread);
  }

  function openChat() {
    ui.chatOpen = true;
    ui.unread = 0;
    for (const [, b] of ui.bubbles) clearTimeout(b.timer);
    ui.bubbles.clear();
    el.chatPanel.classList.remove('hidden');
    renderChat();
    if (view) renderSeats();
    // no computador já deixa pronto para digitar; no celular espera o toque (o teclado cobre a mesa)
    if (!matchMedia('(pointer: coarse)').matches) el.chatInput.focus();
  }

  function closeChat() {
    ui.chatOpen = false;
    el.chatPanel.classList.add('hidden');
    el.chatInput.blur();
    renderChat();
  }

  async function sendChat(text) {
    const t = String(text || '').trim();
    if (!t || !controller.chatSend) return;
    try {
      await controller.chatSend(t);
    } catch {
      toast('Não deu para enviar a mensagem', 'error');
    }
  }

  el.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = el.chatInput.value;
    el.chatInput.value = '';
    sendChat(t);
  });

  function showBubble(m) {
    const prev = ui.bubbles.get(m.seat);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      ui.bubbles.delete(m.seat);
      if (view) renderSeats();
    }, 4500);
    ui.bubbles.set(m.seat, { text: m.text, timer });
    if (view) renderSeats();
  }

  let chatKnown = null;
  const unsubChat = controller.chat
    ? controller.chat.subscribe((msgs) => {
        ui.msgs = msgs;
        if (chatKnown === null) {
          chatKnown = new Set(msgs.map((m) => m.id));
        } else {
          for (const m of msgs) {
            if (chatKnown.has(m.id)) continue;
            chatKnown.add(m.id);
            if (view && m.seat === view.mySeat) continue;
            if (!ui.chatOpen) {
              ui.unread++;
              showBubble(m);
              if (settings.sound) sfx.chat();
            }
          }
        }
        renderChat();
      })
    : null;
  if (!controller.chat) root.querySelector('.chat-btn').classList.add('hidden');

  const onResize = () => {
    if (view) {
      layoutHand();
      renderDiscard(myTurn() && view.phase === 'draw');
      renderSeats();
    }
  };
  window.addEventListener('resize', onResize);

  // ---------- assinatura ----------
  // ---------- relógio da vez ----------
  function tickTimer() {
    if (!view) return;
    const playing = view.phase === 'draw' || view.phase === 'play';
    if (!ui.deadline || !playing) {
      el.timer.classList.add('hidden');
      return;
    }
    const left = Math.max(0, Math.ceil((ui.deadline - Date.now()) / 1000));
    const m = Math.floor(left / 60);
    const sec = String(left % 60).padStart(2, '0');
    el.timer.textContent = `⏱ ${m}:${sec}`;
    el.timer.classList.remove('hidden');
    el.timer.classList.toggle('low', left <= 10);
    el.timer.classList.toggle('mine', view.turn === view.mySeat);
    if (left <= 10 && left > 0 && myTurn() && !ui.warned) {
      ui.warned = true;
      toast('Seu tempo está acabando! Se acabar, o jogo descarta uma carta por você.', 'error', 3500);
      if (settings.sound) sfx.turn();
      if (settings.vibrate) vibrate([60, 60, 60]);
    }
  }
  const timerInterval = setInterval(tickTimer, 250);

  const unsub = controller.subscribe((v) => {
    const prev = view;
    view = v;
    // relógio: só recomeça quando muda a vez
    const key = `${v.round}:${v.turnNo}`;
    if (key !== ui.timerKey || v.turnEndsIn == null) {
      ui.timerKey = key;
      ui.warned = false;
      ui.deadline = v.turnEndsIn != null ? Date.now() + v.turnEndsIn : null;
    }
    if (ui.lastSeq !== v.seq) {
      ui.lastSeq = v.seq;
      playEventSound(prev, v);
    }
    if (!myTurn()) ui.pickMeldForDiscard = false;
    render();
    tickTimer();
  });

  function playEventSound(prev, v) {
    const ev = v.lastEvent;
    if (!ev || !prev) return;
    const s = settings.sound;
    if (ev.type === 'discard' && ev.timeout && ev.seat === v.mySeat) {
      ui.selected.clear();
      toast(`Seu tempo acabou: o jogo descartou ${cardLabel(ev.card)} por você.`, 'error', 4000);
    }
    if (ev.type === 'morto') {
      if (s) sfx.morto();
      toast(`${ev.seat === v.mySeat ? 'Você pegou' : v.players[ev.seat].name + ' pegou'} o morto!`, 'info');
    } else if (ev.type === 'addToMeld' && ev.canastra) {
      if (s) sfx.canastra();
      const team = teamOf(ev.seat, v.numPlayers);
      const m = v.melds[team].find((x) => x.id === ev.meldId);
      toast(`${team === v.myTeam ? 'Canastra' : 'Canastra deles'}${m ? (m.clean ? ' limpa' : ' suja') : ''}!`, 'info');
    } else if (ev.type === 'goOut') {
      if (s) (teamOf(ev.seat, v.numPlayers) === v.myTeam ? sfx.win : sfx.turn)();
    } else if (ev.type === 'takeDiscard') {
      if (s) sfx.pile();
    } else if (ev.type === 'meld' || ev.type === 'addToMeld') {
      if (s) sfx.meld();
    } else if (ev.type === 'draw') {
      if (s) sfx.draw();
    } else if (ev.type === 'discard') {
      if (s) sfx.card();
    }
    if (v.phase === 'gameOver' && prev.phase !== 'gameOver' && s && v.winner === v.myTeam) setTimeout(sfx.win, 400);
    if (v.turn === v.mySeat && prev.turn !== v.mySeat && v.phase === 'draw') {
      if (s) setTimeout(sfx.turn, 250);
      if (settings.vibrate) vibrate(20);
    }
  }

  return {
    destroy() {
      clearInterval(timerInterval);
      unsub && unsub();
      unsubChat && unsubChat();
      for (const [, b] of ui.bubbles) clearTimeout(b.timer);
      window.removeEventListener('resize', onResize);
      root.innerHTML = '';
    },
    relayout: onResize,
  };
}

const QUICK_PHRASES = ['Boa! 👏', 'Vamos lá, parceiro!', 'Kkkkk', 'Que azar 😅', 'Pensando… 🤔', 'Bom jogo!'];

function chatIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
}

function menuIcon() {
  return '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
}
function sortIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function botIcon() {
  return '<svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden="true"><path d="M12 2.5v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="2.6" r="1.5" fill="#fff"/><rect x="4.5" y="6.5" width="15" height="12" rx="3.5" fill="#fff"/><rect x="2.5" y="10.5" width="2" height="4" rx="1" fill="#fff"/><rect x="19.5" y="10.5" width="2" height="4" rx="1" fill="#fff"/><circle cx="9.3" cy="11.6" r="1.7" fill="#1e2b33"/><circle cx="14.7" cy="11.6" r="1.7" fill="#1e2b33"/><path d="M9 15.4h6" stroke="#1e2b33" stroke-width="1.5" stroke-linecap="round"/></svg>';
}
