/* Império Urbano — interface e sessão (anfitrião/cliente). */
(function () {
  'use strict';
  const IU = window.IU, Net = window.Net;
  const { Game, TILES, GROUPS, GROUP_COLORS, getPlayer, rentOf, checkBuild, checkSell, checkMortgage,
    checkUnmortgage, unmortgageCost, tradable, netWorth, JAIL_FINE } = IU;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n).toLocaleString('pt-BR');
  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const sstore = {   // sessão do cliente: por aba (não colide com o anfitrião)
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignora */ } }
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
  };

  /* ---------- estado da aplicação ---------- */
  let S = null;            // último estado do jogo recebido
  let me = null;           // meu id de jogador
  let role = null;         // 'host' | 'client'
  let session = null;      // { role, code, name, token }
  let game = null, hostNet = null, client = null;
  const connPid = new Map(), pidConn = new Map();
  let everConnected = false, retries = 0, retryTimer = null;

  // animações / UI local
  let lastMoveId = null, lastDiceId = null, lastCardId = null, firstRender = true;
  const disp = {}, walking = {}, walkId = {};
  let rolling = false, cardTimer = null;
  let modal = null;        // { type:'tile', i } | { type:'trade', ... }
  let bidDraft = '';
  let tradeDraft = null;

  /* ---------- telas ---------- */
  function show(name) {
    ['home', 'lobby', 'game'].forEach(n => { $('#screen-' + n).hidden = n !== name; });
    document.title = name === 'game' ? 'Império Urbano — partida' : 'Império Urbano — jogo de negócios online';
  }
  let toastTimer = null;
  function toast(text, ok) {
    const t = $('#toast');
    t.textContent = text; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
  }
  function homeMsg(text, info) { const m = $('#homeMsg'); m.textContent = text || ''; m.className = 'msg' + (info ? ' info' : ''); }
  function banner(text) { const b = $('#connBanner'); b.hidden = !text; b.textContent = text || ''; }

  /* ---------- sessão: anfitrião ---------- */
  function persistHost() {
    if (role !== 'host' || !game) return;
    if (game.s.phase === 'over') { store.del('iu_host'); return; }
    store.set('iu_host', { code: session.code, name: session.name, token: session.token, game: game.serialize(), t: Date.now() });
  }

  function startHost(name, resume, attempt) {
    attempt = attempt || 0;
    role = 'host';
    const code = resume ? resume.code : Net.genCode();
    session = { role: 'host', code, name, token: resume ? resume.token : Net.genToken() };
    game = new Game();
    if (resume) game.restore(resume.game);
    homeMsg('Criando sala…', true);
    hostNet = new Net.HostNet(code, {
      onReady() {
        if (resume) {
          const pidStr = Object.keys(game.tokens).find(k => game.tokens[k] === session.token);
          me = pidStr ? +pidStr : null;
          if (me == null) { homeMsg('Não foi possível retomar a sala.'); return; }
          game.P(me).on = true;
        } else {
          me = game.addPlayer(name, session.token).pid;
        }
        game.onChange = onGameChange;
        homeMsg('');
        onGameChange();
      },
      onError(e) {
        if (e.type === 'unavailable-id') {
          hostNet.close();
          if (resume && attempt < 8) { homeMsg('Retomando sala… (' + (attempt + 1) + ')', true); setTimeout(() => startHost(name, resume, attempt + 1), 2500); }
          else if (!resume) startHost(name, null, attempt + 1);
          else homeMsg('A sala ainda está ocupada. Tente novamente em instantes.');
        } else homeMsg('Não foi possível conectar ao servidor de sinalização (' + (e.type || 'erro') + '). Verifique sua internet.');
      },
      onMessage: onHostMessage,
      onClose(conn) {
        const pid = connPid.get(conn); connPid.delete(conn);
        if (pid && pidConn.get(pid) === conn) { pidConn.delete(pid); game.setOnline(pid, false); }
      }
    });
  }

  function onGameChange() {
    persistHost();
    if (hostNet) hostNet.broadcast({ t: 'state', s: game.s });
    render(game.s);
  }

  function onHostMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const r = game.addPlayer(String(msg.name || ''), String(msg.token || ''));
      if (r.error) { hostNet.send(conn, { t: 'denied', text: r.error }); return; }
      connPid.set(conn, r.pid); pidConn.set(r.pid, conn);
      hostNet.send(conn, { t: 'welcome', pid: r.pid });
      hostNet.send(conn, { t: 'state', s: game.s });
      return;
    }
    const pid = connPid.get(conn);
    if (!pid) return;
    if (msg.t === 'act' && msg.a && typeof msg.a === 'object') {
      const e = game.act(pid, msg.a);
      if (e) hostNet.send(conn, { t: 'err', text: e });
    } else if (msg.t === 'chat') game.chat(pid, msg.text);
  }

  /* ---------- sessão: cliente ---------- */
  function startClient(code, name, token) {
    role = 'client';
    session = { role: 'client', code, name, token };
    everConnected = false; retries = 0;
    homeMsg('Conectando à sala ' + code + '…', true);
    client = new Net.ClientNet(code, {
      onOpen() {
        everConnected = true; retries = 0; banner('');
        client.send({ t: 'hello', name: session.name, token: session.token });
      },
      onMessage: onClientMessage,
      onClose() { scheduleRetry('Conexão perdida. Reconectando…'); },
      onError(e) {
        if (!everConnected && retries === 0) {
          const msg = e.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.'
            : e.type === 'timeout' ? 'Tempo esgotado. Sua rede pode estar bloqueando a conexão direta.'
              : 'Não foi possível conectar (' + (e.type || 'erro') + ').';
          leaveToHome(msg, false);
        } else if (e.type === 'peer-unavailable' && retries > 20) leaveToHome('O anfitrião encerrou a sala.', true);
        else scheduleRetry('Reconectando à sala…');
      }
    });
  }

  function scheduleRetry(text) {
    if (!client || client.closed) return;
    banner(text);
    clearTimeout(retryTimer);
    if (++retries > 60) { leaveToHome('Não foi possível reconectar à sala.', true); return; }
    retryTimer = setTimeout(() => client && client.reconnect(), 2500);
  }

  function onClientMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'welcome') { me = msg.pid; sstore.set('iu_session', session); if (S) render(S); }
    else if (msg.t === 'denied') { leaveToHome(msg.text, true); }
    else if (msg.t === 'state') { S = msg.s; if (me != null) render(S); }
    else if (msg.t === 'err') toast(msg.text);
  }

  function leaveToHome(msg, clearSession) {
    if (clearSession !== false) { sstore.del('iu_session'); store.del('iu_host'); }
    clearTimeout(retryTimer);
    if (client) { client.close(); client = null; }
    if (hostNet) { hostNet.close(); hostNet = null; }
    banner('');
    S = null; me = null; role = null; game = null; firstRender = true;
    Object.keys(disp).forEach(k => { delete disp[k]; delete walking[k]; });
    lastMoveId = lastDiceId = lastCardId = null;
    show('home'); homeMsg(msg || '');
    refreshResume();
  }

  /* ---------- ações do jogador ---------- */
  function act(a) {
    if (role === 'host') { const e = game.act(me, a); if (e) toast(e); }
    else if (client) client.send({ t: 'act', a });
  }
  function sendChat(text) {
    if (role === 'host') game.chat(me, text);
    else if (client) client.send({ t: 'chat', text });
  }

  /* ---------- renderização principal ---------- */
  function render(s) {
    S = s;
    if (me == null) return;
    if (!getPlayer(s, me)) { leaveToHome('Você foi removido da sala.', true); return; }
    $('#roomTag').textContent = 'Sala ' + session.code;
    if (s.phase === 'lobby') {
      show('lobby'); renderLobby(s); firstRender = true; return;
    }
    if (!$('#board .tile')) buildBoard();
    show('game');
    handleEffects(s);
    renderBoard(s); renderPlayers(s); renderCenter(s); renderProps(s); renderLog(s); renderModal();
    firstRender = false;
  }

  /* ----- lobby ----- */
  function renderLobby(s) {
    $('#lobbyCode').textContent = session.code;
    const isHost = me === s.hostId;
    $('#lobbyList').innerHTML = s.players.map(p => `
      <li><span class="em">${p.emoji}</span><span class="nm" style="color:${p.color}">${esc(p.name)}${p.id === me ? ' (você)' : ''}</span>
        ${p.id === s.hostId ? '<span class="tag">anfitrião</span>' : ''}
        ${isHost && p.id !== me ? `<button class="btn small danger" data-act="kick" data-pid="${p.id}">Remover</button>` : ''}
      </li>`).join('');
    const bs = $('#btnStart');
    bs.hidden = !isHost; bs.disabled = s.players.length < 2;
    $('#lobbyHint').textContent = isHost
      ? (s.players.length < 2 ? 'Compartilhe o código/link e aguarde pelo menos mais 1 jogador.' : s.players.length + ' jogadores na sala. Quando todos chegarem, inicie!')
      : 'Aguardando o anfitrião iniciar a partida…';
  }

  /* ----- tabuleiro ----- */
  function tilePos(i) {
    if (i <= 10) return { r: 10, c: 10 - i };
    if (i <= 20) return { r: 20 - i, c: 0 };
    if (i <= 30) return { r: 0, c: i - 20 };
    return { r: i - 30, c: 10 };
  }
  const unit = k => (k === 0 ? 0.75 : k === 10 ? 11.25 : k + 1);   // centro da trilha (em "unidades")
  const ICONS = { go: '➡️', jail: '🔒', free: '🅿️', gojail: '👮', chance: '❓', chest: '🎁', tax: '💸', rail: '🚆' };

  function buildBoard() {
    const board = $('#board');
    board.querySelectorAll('.tile').forEach(n => n.remove());
    const frag = document.createDocumentFragment();
    TILES.forEach((t, i) => {
      const { r, c } = tilePos(i);
      const el = document.createElement('div');
      const corner = i % 10 === 0;
      const side = corner ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right';
      el.className = 'tile t-' + t.type + ' ' + side;
      el.dataset.i = i;
      el.style.gridRow = r + 1; el.style.gridColumn = c + 1;
      let html = '';
      if (t.type === 'prop') html += `<div class="band" style="background:${GROUP_COLORS[t.group]}"></div>`;
      const ic = t.type === 'util' ? (i === 12 ? '💡' : '🚰') : ICONS[t.type];
      html += `<div class="body">${ic ? `<div class="ic">${ic}</div>` : ''}<div class="nm">${esc(t.name)}</div>` +
        (t.price ? `<div class="pr">${money(t.price)}</div>` : t.amount ? `<div class="pr">${money(t.amount)}</div>` : t.type === 'go' ? '<div class="pr">Receba $200</div>' : '') + '</div>';
      el.innerHTML = html;
      frag.appendChild(el);
    });
    board.insertBefore(frag, board.firstChild);
  }

  function renderBoard(s) {
    $$('#board .tile').forEach(el => {
      const i = +el.dataset.i, t = TILES[i], pr = s.props[i];
      el.classList.toggle('mort', !!(pr && pr.m));
      el.classList.toggle('owned', !!pr);
      let own = el.querySelector('.own');
      if (pr) {
        const o = getPlayer(s, pr.o);
        el.style.setProperty('--own', o ? o.color : '#888');
        if (!own) { own = document.createElement('span'); own.className = 'own'; el.appendChild(own); }
        own.textContent = o ? o.emoji : '';
      } else if (own) { own.remove(); el.style.removeProperty('--own'); }
      if (t.type === 'prop') {
        const band = el.querySelector('.band'), h = pr ? pr.h : 0;
        const html = h === 5 ? '<span class="pip hotel"></span>' : '<span class="pip"></span>'.repeat(h);
        if (band.dataset.h !== String(h)) { band.innerHTML = html; band.dataset.h = h; }
      }
    });
    placeTokens();
  }

  function placeTokens() {
    if (!S) return;
    const layer = $('#tokens');
    const perTile = {};
    const ids = S.players.map(p => String(p.id));
    layer.querySelectorAll('.token').forEach(n => { if (!ids.includes(n.dataset.pid)) n.remove(); });
    S.players.forEach(p => {
      let el = layer.querySelector(`[data-pid="${p.id}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'token'; el.dataset.pid = p.id; layer.appendChild(el); }
      el.textContent = p.emoji; el.style.setProperty('--c', p.color);
      el.classList.toggle('out', p.out); el.classList.toggle('me', p.id === me);
      el.title = p.name;
      const at = walking[p.id] ? disp[p.id] : (disp[p.id] = p.pos);
      if (!p.out) { (perTile[at] = perTile[at] || []).push(el); }
    });
    const OFF = [[-.26, -.22], [.26, -.22], [-.26, .24], [.26, .24], [0, 0], [0, .46]];
    Object.keys(perTile).forEach(at => {
      const { r, c } = tilePos(+at), many = perTile[at].length > 1;
      perTile[at].forEach((el, k) => {
        const o = many ? OFF[k % OFF.length] : [0, 0.1];
        el.style.left = ((unit(c) + o[0]) / 12 * 100) + '%';
        el.style.top = ((unit(r) + o[1]) / 12 * 100) + '%';
      });
    });
  }

  /* ----- efeitos: dados, movimento, cartas ----- */
  const STEP_MS = 130, DICE_MS = 750;
  function isWalking() { return Object.keys(walking).some(k => walking[k]); }

  function handleEffects(s) {
    if (firstRender) {
      lastMoveId = s.move ? s.move.id : null; lastDiceId = s.diceId; lastCardId = s.cardId;
      updateDice(s.dice);
      return;
    }
    let delay = 0;
    if (s.diceId !== lastDiceId) {
      lastDiceId = s.diceId; delay = DICE_MS; rollDice(s.dice);
    }
    let animTime = 0;
    if (s.move && s.move.id !== lastMoveId) {
      lastMoveId = s.move.id;
      const m = s.move;
      if (m.kind === 'walk') {
        const steps = (m.to - m.from + 40) % 40;
        startWalk(m.pid, m.from, steps, delay);
        animTime = delay + steps * STEP_MS;
      } else if (delay) { // salto (cadeia/carta): espera os dados e só então teletransporta
        walking[m.pid] = true; disp[m.pid] = m.from; const id = walkId[m.pid] = (walkId[m.pid] || 0) + 1;
        setTimeout(() => { if (walkId[m.pid] === id) { walking[m.pid] = false; placeTokens(); renderCenter(S); } }, delay);
        animTime = delay;
      }
    }
    if (s.cardId !== lastCardId) {
      lastCardId = s.cardId;
      if (s.card) setTimeout(() => showCard(s.card), Math.max(animTime, delay) + 150);
    }
  }

  function startWalk(pid, from, steps, delay) {
    const id = walkId[pid] = (walkId[pid] || 0) + 1;
    walking[pid] = true; disp[pid] = from;
    let k = 0;
    const tick = () => {
      if (walkId[pid] !== id) return;
      k++; disp[pid] = (from + k) % 40; placeTokens();
      if (k < steps) setTimeout(tick, STEP_MS);
      else { walking[pid] = false; placeTokens(); if (S) renderCenter(S); }
    };
    setTimeout(tick, delay);
  }

  function updateDice(d) {
    $('#die1').textContent = d ? FACES[d[0] - 1] : '⚀';
    $('#die2').textContent = d ? FACES[d[1] - 1] : '⚀';
  }
  function rollDice(final) {
    rolling = true;
    const d1 = $('#die1'), d2 = $('#die2');
    d1.classList.add('rolling'); d2.classList.add('rolling');
    const iv = setInterval(() => {
      d1.textContent = FACES[Math.floor(Math.random() * 6)]; d2.textContent = FACES[Math.floor(Math.random() * 6)];
    }, 70);
    setTimeout(() => {
      clearInterval(iv); rolling = false;
      d1.classList.remove('rolling'); d2.classList.remove('rolling');
      updateDice(final);
    }, DICE_MS - 50);
  }

  function showCard(c) {
    const el = $('#cCard');
    const who = S && getPlayer(S, c.pid);
    el.className = c.deck;
    el.innerHTML = `<div class="k">${c.deck === 'chance' ? '❓ SORTE' : '🎁 CAIXA COMUNITÁRIA'}</div>
      <div>${who ? esc(who.name) + ' tirou:' : ''}</div><div class="hl">${esc(c.text)}</div>`;
    el.hidden = false;
    clearTimeout(cardTimer); cardTimer = setTimeout(() => { el.hidden = true; }, 5200);
  }

  /* ----- centro do tabuleiro ----- */
  function tileMini(i) {
    const t = TILES[i];
    return `<span class="mini">${t.group ? `<span class="sw" style="background:${GROUP_COLORS[t.group]}"></span>` : ''}<b>${esc(t.name)}</b> · ${money(t.price)}</span>`;
  }

  function renderCenter(s) {
    const ae = document.activeElement, refocus = ae && ae.id === 'bidIn';
    renderCenterInner(s);
    if (refocus) { const n = $('#bidIn'); if (n) { n.focus(); n.setSelectionRange && n.value && n.setSelectionRange(n.value.length, n.value.length); } }
  }
  function renderCenterInner(s) {
    const cur = s.players[s.turn], meP = getPlayer(s, me), mineTurn = cur && cur.id === me;
    const el = $('#cAct');
    $('#cTurn').innerHTML = s.phase === 'over' ? '' :
      `<span style="color:${cur.color}">${cur.emoji} ${esc(cur.name)}${mineTurn ? ' (você)' : ''}</span> · vez ${s.turnNo}`;
    if (!rolling) updateDice(s.dice);

    if (s.phase === 'over') {
      const w = s.winner != null ? getPlayer(s, s.winner) : null;
      el.innerHTML = `<div class="panelc win">🏆 <b>${w ? esc(w.name) : 'Ninguém'}</b> venceu a partida!</div>` +
        (me === s.hostId ? '<button class="btn primary big" data-act="again">Nova partida</button>' : '<div>Aguardando o anfitrião…</div>');
      return;
    }
    if (isWalking()) { el.innerHTML = ''; return; }

    // dívidas têm prioridade
    if (s.debts.length) {
      el.innerHTML = s.debts.map(d => {
        const dp = getPlayer(s, d.pid), to = d.to != null ? getPlayer(s, d.to) : null, mineDebt = d.pid === me;
        return `<div class="panelc warn"><div>⚠️ <b>${esc(dp.name)}</b> deve <b>${money(d.amount)}</b> ${to ? 'a <b>' + esc(to.name) + '</b>' : 'ao banco'}</div>` +
          (mineDebt ? `<div>Você tem ${money(meP.cash)}. Venda construções ou hipoteque propriedades (lista à direita).</div>
            <div class="row"><button class="btn good" data-act="payDebt" ${meP.cash < d.amount ? 'disabled' : ''}>Pagar ${money(d.amount)}</button>
            <button class="btn danger" data-act="bankrupt">Declarar falência</button></div>` : '<div>Aguardando…</div>') + '</div>';
      }).join('');
      return;
    }

    if (meP.out) { el.innerHTML = '<div class="panelc">Você está fora da partida. Continue assistindo e conversando no chat!</div>'; if (s.phase === 'auction') el.innerHTML += auctionHtml(s, meP); return; }

    switch (s.phase) {
      case 'roll': {
        if (!mineTurn) { el.innerHTML = `<div>Aguardando <b>${esc(cur.name)}</b> rolar os dados…</div>`; break; }
        if (cur.jail) {
          el.innerHTML = `<div class="panelc warn">🔒 Você está na cadeia (tentativa ${cur.jail}/3). Tire dobro para sair!</div>
            <div class="row"><button class="btn primary big" data-act="roll">🎲 Tentar dobro</button>
            <button class="btn" data-act="jailPay" ${meP.cash < JAIL_FINE ? 'disabled' : ''}>Pagar ${money(JAIL_FINE)}</button>
            ${meP.cards ? '<button class="btn" data-act="jailCard">Usar cartão de saída</button>' : ''}</div>`;
        } else {
          el.innerHTML = `<button class="btn primary big" data-act="roll">🎲 ${s.extra ? 'Rolar de novo (dobro!)' : 'Rolar dados'}</button>`;
        }
        break;
      }
      case 'buy': {
        const t = TILES[s.buy.tile];
        if (!mineTurn) { el.innerHTML = `<div><b>${esc(cur.name)}</b> está decidindo se compra ${esc(t.name)}…</div>`; break; }
        el.innerHTML = `<div>Você caiu em ${tileMini(s.buy.tile)}</div>
          <div class="row"><button class="btn good big" data-act="buy" ${meP.cash < t.price ? 'disabled' : ''}>Comprar por ${money(t.price)}</button>
          <button class="btn" data-act="decline">Leiloar</button></div>`;
        break;
      }
      case 'auction': el.innerHTML = auctionHtml(s, meP); break;
      case 'end': {
        el.innerHTML = mineTurn
          ? '<button class="btn primary big" data-act="end">Encerrar a vez ➜</button><div>Antes disso você pode construir, hipotecar ou negociar.</div>'
          : `<div>Aguardando <b>${esc(cur.name)}</b> encerrar a vez…</div>`;
        break;
      }
    }
  }

  function auctionHtml(s, meP) {
    const a = s.auction, t = TILES[a.tile], bidder = a.bidder != null ? getPlayer(s, a.bidder) : null;
    let h = `<div class="panelc"><div>🔨 Leilão: ${tileMini(a.tile)}</div>
      <div>${bidder ? `Maior lance: <b>${money(a.bid)}</b> de <b>${bidder.emoji} ${esc(bidder.name)}</b>` : 'Sem lances ainda'}</div>`;
    if (meP.out) return h + '</div>';
    if (a.passed.includes(me)) h += '<div>Você desistiu deste leilão.</div>';
    else if (meP.cash <= a.bid && a.bidder !== me) h += '<div>Você não tem dinheiro para cobrir o lance.</div>';
    else {
      const q = [10, 50, 100].map(d => `<button class="btn" data-act="bid" data-amount="${a.bid + d}" ${a.bid + d > meP.cash ? 'disabled' : ''}>+${d}</button>`).join('');
      h += `<div class="row">${q}</div>
        <div class="row"><input id="bidIn" type="number" inputmode="numeric" min="${a.bid + 1}" max="${meP.cash}" placeholder="$ valor" value="${esc(bidDraft)}">
        <button class="btn good" data-ui="bidCustom">Dar lance</button>
        <button class="btn danger" data-act="pass" ${a.bidder === me ? 'disabled' : ''}>Desistir</button></div>`;
    }
    return h + '</div>';
  }

  /* ----- jogadores ----- */
  function renderPlayers(s) {
    const isHost = me === s.hostId;
    $('#players').innerHTML = s.players.map((p, idx) => {
      const dots = s.props.map((pr, i) => (pr && pr.o === p.id ? i : -1)).filter(i => i >= 0).map(i => {
        const t = TILES[i], pr = s.props[i];
        const bg = t.group ? GROUP_COLORS[t.group] : '';
        return `<span class="dot ${t.type === 'rail' ? 'rail' : t.type === 'util' ? 'util' : ''} ${pr.m ? 'm' : ''}" style="${bg ? 'background:' + bg : ''}" data-ui="tile" data-tile="${i}" title="${esc(t.name)}${pr.h ? ' (' + (pr.h === 5 ? 'hotel' : pr.h + ' casa(s)') + ')' : ''}"></span>`;
      }).join('');
      const labels = [];
      if (p.out) labels.push('<span class="plabel bad">falido</span>');
      else {
        if (p.jail) labels.push('<span class="plabel warn">🔒 preso</span>');
        if (p.cards) labels.push(`<span class="plabel">🃏 ×${p.cards}</span>`);
        if (!p.on) labels.push('<span class="plabel bad">offline</span>');
      }
      const canTrade = !p.out && p.id !== me && !getPlayer(s, me).out && !s.trade && !s.auction && s.phase !== 'over';
      return `<div class="pc ${idx === s.turn && !p.out && s.phase !== 'over' ? 'turn' : ''} ${p.out ? 'out' : ''}" style="--c:${p.color}">
        <div class="top"><span class="em">${p.emoji}</span><span class="nm">${esc(p.name)}${p.id === me ? ' (você)' : ''}${p.id === s.hostId ? ' 👑' : ''}</span>
          <span class="cash">${money(p.cash)}</span></div>
        <div class="meta">${labels.join('')}${dots}</div>
        ${!p.out && p.id !== me ? `<div class="acts">${canTrade ? `<button class="btn small" data-ui="trade" data-pid="${p.id}">Negociar</button>` : ''}
          ${isHost ? `<button class="btn small danger" data-ui="kick" data-pid="${p.id}">Remover</button>` : ''}</div>` : ''}
        ${!p.out ? `<div class="empty" style="font-size:11px">Patrimônio ${money(netWorth(s, p.id))}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ----- minhas propriedades ----- */
  function renderProps(s) {
    const mine = s.props.map((pr, i) => (pr && pr.o === me ? i : -1)).filter(i => i >= 0);
    const box = $('#myprops');
    if (!mine.length) { box.innerHTML = '<div class="empty">Você ainda não possui propriedades.</div>'; return; }
    box.innerHTML = mine.map(i => {
      const t = TILES[i], pr = s.props[i], isProp = t.type === 'prop';
      const eb = isProp ? checkBuild(s, me, i) : 'x', es = isProp ? checkSell(s, me, i) : 'x';
      const em = pr.m ? checkUnmortgage(s, me, i) : checkMortgage(s, me, i);
      const sw = t.group ? GROUP_COLORS[t.group] : '#8a8f99';
      return `<div class="prow"><span class="sw" style="background:${sw}"></span>
        <span class="nm ${pr.m ? 'm' : ''}" data-ui="tile" data-tile="${i}" title="${esc(t.name)}">${esc(t.name)}</span>
        ${pr.h ? `<span class="h">${pr.h === 5 ? 'hotel' : '🏠'.repeat(pr.h)}</span>` : ''}
        ${isProp ? `<button class="btn" data-act="build" data-tile="${i}" ${eb ? 'disabled' : ''} title="${esc(eb || 'Construir (' + money(t.house) + ')')}">＋</button>
        <button class="btn" data-act="sell" data-tile="${i}" ${es ? 'disabled' : ''} title="${esc(es || 'Vender construção (' + money(t.house / 2) + ')')}">－</button>` : ''}
        <button class="btn" data-act="${pr.m ? 'unmortgage' : 'mortgage'}" data-tile="${i}" ${em ? 'disabled' : ''}
          title="${esc(em || (pr.m ? 'Resgatar por ' + money(unmortgageCost(t)) : 'Hipotecar e receber ' + money(t.price / 2)))}">${pr.m ? 'Resgatar' : 'Hipotecar'}</button>
      </div>`;
    }).join('');
  }

  /* ----- registro / chat ----- */
  function renderLog(s) {
    const el = $('#log');
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = s.log.map(l => {
      if (l.k === 'c') {
        const p = getPlayer(s, l.p);
        return `<div class="c"><b style="color:${p ? p.color : '#fff'}">${p ? esc(p.name) : '?'}:</b> ${esc(l.t)}</div>`;
      }
      return `<div class="e">• ${esc(l.t)}</div>`;
    }).join('');
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  /* ----- modais ----- */
  function closeModal() { modal = null; tradeDraft = null; renderModal(); }

  function renderModal() {
    const ov = $('#modal'), body = $('#modalBody');
    const meP = S && getPlayer(S, me);
    // proposta de troca recebida / enviada tem prioridade
    if (S && S.trade && meP) {
      const tr = S.trade;
      ov.dataset.k = 'trade-wait';
      if (tr.to === me) { ov.hidden = false; body.innerHTML = incomingTradeHtml(S, tr); return; }
      if (tr.from === me) {
        const to = getPlayer(S, tr.to);
        ov.hidden = false;
        body.innerHTML = `<h3>Proposta enviada</h3><p>Aguardando <b>${esc(to.name)}</b> responder…</p>
          <div class="row center"><button class="btn danger" data-act="tradeCancel">Cancelar proposta</button></div>`;
        return;
      }
    }
    if (!modal) { ov.hidden = true; ov.dataset.k = ''; return; }
    const wasComposer = ov.dataset.k === 'trade' && !ov.hidden;
    ov.hidden = false; ov.dataset.k = modal.type;
    if (modal.type === 'trade' && wasComposer && modal.shown) return;
    modal.shown = true;
    if (modal.type === 'tile') body.innerHTML = tileModalHtml(modal.i);
    else if (modal.type === 'trade') body.innerHTML = tradeComposerHtml();
    else if (modal.type === 'confirm') {
      body.innerHTML = `<h3>${esc(modal.title)}</h3><p>${esc(modal.text)}</p>
        <div class="row center"><button class="btn danger" data-ui="confirmYes">Confirmar</button><button class="btn" data-ui="close">Cancelar</button></div>`;
    }
  }

  function tileModalHtml(i) {
    const t = TILES[i], pr = S.props[i], owner = pr ? getPlayer(S, pr.o) : null;
    let h = '';
    if (t.group) h += `<div class="band" style="background:${GROUP_COLORS[t.group]}">${esc(t.name)}</div>`;
    else h += `<h3>${esc(t.name)}</h3>`;
    h += '<table>';
    if (t.type === 'prop') {
      h += `<tr><td>Preço</td><td>${money(t.price)}</td></tr><tr><td>Aluguel</td><td>${money(t.rents[0])}</td></tr>
        <tr><td>Grupo completo (sem casas)</td><td>${money(t.rents[0] * 2)}</td></tr>`;
      ['1 casa', '2 casas', '3 casas', '4 casas', 'Hotel'].forEach((n, k) => { h += `<tr><td>${n}</td><td>${money(t.rents[k + 1])}</td></tr>`; });
      h += `<tr><td>Custo por casa/hotel</td><td>${money(t.house)}</td></tr>`;
    } else if (t.type === 'rail') {
      h += `<tr><td>Preço</td><td>${money(t.price)}</td></tr><tr><td>1 estação</td><td>$25</td></tr><tr><td>2 estações</td><td>$50</td></tr><tr><td>3 estações</td><td>$100</td></tr><tr><td>4 estações</td><td>$200</td></tr>`;
    } else if (t.type === 'util') {
      h += `<tr><td>Preço</td><td>${money(t.price)}</td></tr><tr><td>1 companhia</td><td>4× dados</td></tr><tr><td>2 companhias</td><td>10× dados</td></tr>`;
    } else if (t.type === 'tax') h += `<tr><td>Pague ao banco</td><td>${money(t.amount)}</td></tr>`;
    else h += `<tr><td colspan="2">${{ go: 'Ao passar pelo Início, receba $200.', jail: 'Apenas visitando… ou cumprindo pena.', free: 'Descanse. Nada acontece aqui.', gojail: 'Vá direto para a cadeia!', chance: 'Tire uma carta de Sorte.', chest: 'Tire uma carta da Caixa Comunitária.' }[t.type] || ''}</td></tr>`;
    if (t.price) h += `<tr><td>Hipoteca</td><td>${money(t.price / 2)}</td></tr>`;
    h += '</table>';
    if (t.price) h += `<p>${owner ? `Dono: <b>${owner.emoji} ${esc(owner.name)}</b>${pr.m ? ' (hipotecada)' : ''}${pr.h ? ' · ' + (pr.h === 5 ? 'hotel' : pr.h + ' casa(s)') : ''}` : 'Sem dono.'}</p>`;
    return h + '<div class="row center"><button class="btn" data-ui="close">Fechar</button></div>';
  }

  /* troca: composição */
  function openTrade(pid) {
    tradeDraft = { to: pid, giveCash: 0, getCash: 0, give: new Set(), get: new Set() };
    modal = { type: 'trade' }; renderModal();
  }
  function tradeComposerHtml() {
    const d = tradeDraft, other = getPlayer(S, d.to), meP = getPlayer(S, me);
    const list = (pid, set, key) => {
      const items = S.props.map((pr, i) => (pr && pr.o === pid ? i : -1)).filter(i => i >= 0);
      if (!items.length) return '<div class="empty">Sem propriedades.</div>';
      return items.map(i => {
        const t = TILES[i], ok = tradable(S, pid, i);
        return `<label class="chk" title="${ok ? '' : 'Há construções no grupo'}"><input type="checkbox" data-trade="${key}" data-tile="${i}" ${set.has(i) ? 'checked' : ''} ${ok ? '' : 'disabled'}>
          <span class="sw" style="background:${t.group ? GROUP_COLORS[t.group] : '#888'}"></span>${esc(t.name)}${S.props[i].m ? ' (hip.)' : ''}</label>`;
      }).join('');
    };
    return `<h3>Negociar com ${other.emoji} ${esc(other.name)}</h3>
      <div class="cols">
        <div class="col"><h4>Você oferece</h4>
          <input type="number" min="0" max="${meP.cash}" placeholder="$ dinheiro (máx ${meP.cash})" data-tradecash="giveCash" value="${d.giveCash || ''}">
          ${list(me, d.give, 'give')}</div>
        <div class="col"><h4>Você pede</h4>
          <input type="number" min="0" max="${other.cash}" placeholder="$ dinheiro (máx ${other.cash})" data-tradecash="getCash" value="${d.getCash || ''}">
          ${list(d.to, d.get, 'get')}</div>
      </div>
      <div class="row center"><button class="btn primary" data-ui="sendTrade">Enviar proposta</button><button class="btn" data-ui="close">Cancelar</button></div>`;
  }
  function incomingTradeHtml(s, tr) {
    const from = getPlayer(s, tr.from);
    const names = arr => arr.length ? arr.map(i => `<div class="chk"><span class="sw" style="background:${TILES[i].group ? GROUP_COLORS[TILES[i].group] : '#888'}"></span>${esc(TILES[i].name)}${s.props[i] && s.props[i].m ? ' (hip.)' : ''}</div>`).join('') : '';
    return `<h3>${from.emoji} ${esc(from.name)} propõe uma troca</h3>
      <div class="cols">
        <div class="col"><h4>Você recebe</h4>${tr.giveCash ? `<b>${money(tr.giveCash)}</b>` : ''}${names(tr.giveProps)}${!tr.giveCash && !tr.giveProps.length ? '<div class="empty">Nada</div>' : ''}</div>
        <div class="col"><h4>Você entrega</h4>${tr.getCash ? `<b>${money(tr.getCash)}</b>` : ''}${names(tr.getProps)}${!tr.getCash && !tr.getProps.length ? '<div class="empty">Nada</div>' : ''}</div>
      </div>
      <div class="row center"><button class="btn good" data-act="tradeAccept">Aceitar</button><button class="btn danger" data-act="tradeReject">Recusar</button></div>`;
  }

  /* ---------- eventos globais ---------- */
  let confirmCb = null;
  function askConfirm(title, text, cb) { confirmCb = cb; modal = { type: 'confirm', title, text }; renderModal(); }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled) {
      const m = { t: a.dataset.act };
      if (a.dataset.tile != null) m.tile = +a.dataset.tile;
      if (a.dataset.amount != null) m.amount = +a.dataset.amount;
      if (a.dataset.pid != null) m.pid = +a.dataset.pid;
      act(m); return;
    }
    const u = e.target.closest('[data-ui]');
    if (u) {
      switch (u.dataset.ui) {
        case 'tile': modal = { type: 'tile', i: +u.dataset.tile }; renderModal(); break;
        case 'close': closeModal(); break;
        case 'trade': openTrade(+u.dataset.pid); break;
        case 'bidCustom': {
          const v = $('#bidIn'); if (v && v.value) act({ t: 'bid', amount: +v.value }); break;
        }
        case 'sendTrade': {
          const d = tradeDraft; if (!d) break;
          act({ t: 'tradeOffer', to: d.to, giveCash: d.giveCash, getCash: d.getCash, giveProps: [...d.give], getProps: [...d.get] });
          closeModal(); break;
        }
        case 'kick': {
          const p = getPlayer(S, +u.dataset.pid);
          askConfirm('Remover jogador', 'Remover ' + p.name + ' da partida? As propriedades dele voltam ao banco.', () => act({ t: 'kick', pid: p.id }));
          break;
        }
        case 'resign': askConfirm('Desistir da partida', 'Tem certeza? Você perderá tudo e sairá da partida.', () => act({ t: 'resign' })); break;
        case 'leave': askConfirm('Sair', role === 'host' ? 'Você é o anfitrião: se sair, a sala será encerrada para todos.' : 'Sair da sala?', () => { leaveToHome('', true); }); break;
        case 'confirmYes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      }
      return;
    }
    if (e.target.id === 'modal') { if (!(S && S.trade && (S.trade.to === me || S.trade.from === me))) closeModal(); }
    if (e.target.closest('#cCard')) $('#cCard').hidden = true;
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'bidIn') bidDraft = t.value;
    if (t.dataset && t.dataset.tradecash) tradeDraft[t.dataset.tradecash] = Math.max(0, Math.floor(+t.value || 0));
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.trade && tradeDraft) {
      const set = t.dataset.trade === 'give' ? tradeDraft.give : tradeDraft.get;
      if (t.checked) set.add(+t.dataset.tile); else set.delete(+t.dataset.tile);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'bidIn') { e.preventDefault(); const v = e.target.value; if (v) act({ t: 'bid', amount: +v }); }
    if (e.key === 'Escape' && modal) closeModal();
  });
  // clique nas casas do tabuleiro
  $('#board').addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (t) { modal = { type: 'tile', i: +t.dataset.i }; renderModal(); }
  });
  $('#chatForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#chatIn').value.trim();
    if (v) { sendChat(v); $('#chatIn').value = ''; }
  });

  /* ---------- tela inicial ---------- */
  function getName() {
    const n = $('#inName').value.trim();
    if (!n) { homeMsg('Digite seu nome primeiro.'); $('#inName').focus(); return null; }
    store.set('iu_name', n);
    return n;
  }
  $('#btnCreate').addEventListener('click', () => { const n = getName(); if (n) startHost(n, null); });
  $('#btnJoin').addEventListener('click', joinFromForm);
  $('#inCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinFromForm(); });
  $('#inCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  function joinFromForm() {
    const n = getName(); if (!n) return;
    const code = $('#inCode').value.trim().toUpperCase();
    if (code.length !== 5) { homeMsg('O código tem 5 caracteres.'); return; }
    startClient(code, n, Net.genToken());
  }

  $('#btnStart').addEventListener('click', () => act({ t: 'start' }));
  $('#btnLeaveLobby').addEventListener('click', () => { leaveToHome('', true); });
  $('#btnCopyCode').addEventListener('click', () => copy(session.code, 'Código copiado!'));
  $('#btnCopyLink').addEventListener('click', () => copy(location.origin + location.pathname + '?sala=' + session.code, 'Link copiado!'));
  function copy(text, okMsg) {
    const done = () => toast(okMsg, true);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast(text));
    else toast(text);
  }

  function refreshResume() {
    const box = $('#resume'), h = store.get('iu_host'), c = sstore.get('iu_session');
    if (c && c.role === 'client') {
      box.hidden = false;
      box.innerHTML = `<div>Voltar para a sala <b>${esc(c.code)}</b> como <b>${esc(c.name)}</b>?</div><div class="row center"><button class="btn primary small" id="btnResume">Reconectar</button><button class="btn small" id="btnForget">Descartar</button></div>`;
      $('#btnResume').onclick = () => startClient(c.code, c.name, c.token);
      $('#btnForget').onclick = () => { sstore.del('iu_session'); refreshResume(); };
    } else if (h && Date.now() - h.t < 12 * 3600e3) {
      box.hidden = false;
      box.innerHTML = `<div>Você tem uma sala aberta: <b>${esc(h.code)}</b></div><div class="row center"><button class="btn primary small" id="btnResume">Retomar sala</button><button class="btn small" id="btnForget">Descartar</button></div>`;
      $('#btnResume').onclick = () => startHost(h.name, h);
      $('#btnForget').onclick = () => { store.del('iu_host'); refreshResume(); };
    } else box.hidden = true;
  }

  (function init() {
    $('#inName').value = store.get('iu_name') || '';
    const q = new URLSearchParams(location.search).get('sala');
    if (q) { $('#inCode').value = q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); (!$('#inName').value ? $('#inName') : $('#btnJoin')).focus(); }
    show('home'); refreshResume();
  })();
})();
