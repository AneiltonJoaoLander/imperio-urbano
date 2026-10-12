/* Império Urbano — lógica do jogo (roda no anfitrião; também usada pela UI para validações).
   Funciona no navegador (window.IU) e no Node (module.exports) para testes. */
(function (root) {
  'use strict';

  const GROUP_COLORS = {
    brown: '#8d5a3b', lblue: '#8fd3f4', pink: '#e0569e', orange: '#f5983a',
    red: '#dc3b34', yellow: '#f4d63a', green: '#2fa05a', dblue: '#2b4bb0'
  };
  const PROP = (name, group, price, rents, house) => ({ type: 'prop', name, group, price, rents, house });
  const RAIL = name => ({ type: 'rail', name, price: 200 });
  const UTIL = name => ({ type: 'util', name, price: 150 });

  const TILES = [
    { type: 'go', name: 'Início' },
    PROP('Vila Nova', 'brown', 60, [2, 10, 30, 90, 160, 250], 50),
    { type: 'chest', name: 'Caixa Comunitária' },
    PROP('Beco do Sol', 'brown', 60, [4, 20, 60, 180, 320, 450], 50),
    { type: 'tax', name: 'Imposto de Renda', amount: 200 },
    RAIL('Estação Norte'),
    PROP('Rua das Flores', 'lblue', 100, [6, 30, 90, 270, 400, 550], 50),
    { type: 'chance', name: 'Sorte' },
    PROP('Av. do Porto', 'lblue', 100, [6, 30, 90, 270, 400, 550], 50),
    PROP('Praça Central', 'lblue', 120, [8, 40, 100, 300, 450, 600], 50),
    { type: 'jail', name: 'Cadeia' },
    PROP('Rua das Palmeiras', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
    UTIL('Companhia Elétrica'),
    PROP('Av. Atlântica', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
    PROP('Av. Brasil', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
    RAIL('Estação Leste'),
    PROP('Alameda Verde', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
    { type: 'chest', name: 'Caixa Comunitária' },
    PROP('Rua do Comércio', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
    PROP('Av. Copacabana', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
    { type: 'free', name: 'Parada Livre' },
    PROP('Rua da Liberdade', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
    { type: 'chance', name: 'Sorte' },
    PROP('Av. Paulista', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
    PROP('Av. Ipiranga', 'red', 240, [20, 100, 300, 750, 925, 1100], 150),
    RAIL('Estação Sul'),
    PROP('Rua Oscar Freire', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
    PROP('Av. Faria Lima', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
    UTIL('Companhia de Águas'),
    PROP('Av. Berrini', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
    { type: 'gojail', name: 'Vá para a Cadeia' },
    PROP('Rua Bela Vista', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
    PROP('Av. das Nações', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
    { type: 'chest', name: 'Caixa Comunitária' },
    PROP('Av. Beira-Mar', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200),
    RAIL('Estação Oeste'),
    { type: 'chance', name: 'Sorte' },
    PROP('Av. Vieira Souto', 'dblue', 350, [35, 175, 500, 1100, 1300, 1500], 200),
    { type: 'tax', name: 'Taxa de Luxo', amount: 100 },
    PROP('Av. Boa Viagem', 'dblue', 400, [50, 200, 600, 1400, 1700, 2000], 200)
  ];
  const GROUPS = {};
  TILES.forEach((t, i) => { if (t.group) (GROUPS[t.group] = GROUPS[t.group] || []).push(i); });
  const RAILS = [5, 15, 25, 35];
  const UTILS = [12, 28];
  const START_CASH = 1500, GO_BONUS = 200, JAIL_FINE = 50, MAX_PLAYERS = 6;

  const CARDS = {
    chance: [
      { text: 'Avance até o Início e receba $200.', t: 'goto', to: 0 },
      { text: 'Avance até a Av. Ipiranga. Se passar pelo Início, receba $200.', t: 'goto', to: 24 },
      { text: 'Avance até a Rua das Palmeiras. Se passar pelo Início, receba $200.', t: 'goto', to: 11 },
      { text: 'Faça uma viagem até a Estação Norte. Se passar pelo Início, receba $200.', t: 'goto', to: 5 },
      { text: 'Avance até a estação mais próxima. Se tiver dono, pague o dobro do aluguel.', t: 'nearest', kind: 'rail' },
      { text: 'Avance até a estação mais próxima. Se tiver dono, pague o dobro do aluguel.', t: 'nearest', kind: 'rail' },
      { text: 'Avance até a companhia mais próxima. Se tiver dono, pague 10× o valor dos dados.', t: 'nearest', kind: 'util' },
      { text: 'O banco paga dividendos de $50.', t: 'cash', n: 50 },
      { text: 'Você ganhou um empréstimo vencido: receba $150.', t: 'cash', n: 150 },
      { text: 'Multa por excesso de velocidade: pague $15.', t: 'cash', n: -15 },
      { text: 'Volte 3 casas.', t: 'back', n: 3 },
      { text: 'Vá direto para a Cadeia. Não passe pelo Início.', t: 'jail' },
      { text: 'Saída livre da Cadeia. Guarde este cartão.', t: 'jailfree' },
      { text: 'Reparos nas propriedades: pague $25 por casa e $100 por hotel.', t: 'repairs', house: 25, hotel: 100 },
      { text: 'Você foi eleito síndico! Pague $50 a cada jogador.', t: 'payEach', n: 50 }
    ],
    chest: [
      { text: 'Erro do banco a seu favor: receba $200.', t: 'cash', n: 200 },
      { text: 'Honorários médicos: pague $50.', t: 'cash', n: -50 },
      { text: 'Venda de ações: receba $50.', t: 'cash', n: 50 },
      { text: 'Restituição do imposto de renda: receba $20.', t: 'cash', n: 20 },
      { text: 'Seguro de vida vence: receba $100.', t: 'cash', n: 100 },
      { text: 'Despesas hospitalares: pague $100.', t: 'cash', n: -100 },
      { text: 'Taxa escolar: pague $50.', t: 'cash', n: -50 },
      { text: 'Consultoria: receba $25.', t: 'cash', n: 25 },
      { text: 'Você ganhou o 2º lugar num concurso de beleza: receba $10.', t: 'cash', n: 10 },
      { text: 'Você herdou $100.', t: 'cash', n: 100 },
      { text: 'Feliz aniversário! Receba $10 de cada jogador.', t: 'eachPays', n: 10 },
      { text: 'Vá direto para a Cadeia. Não passe pelo Início.', t: 'jail' },
      { text: 'Saída livre da Cadeia. Guarde este cartão.', t: 'jailfree' },
      { text: 'Reparos nas ruas: pague $40 por casa e $115 por hotel.', t: 'repairs', house: 40, hotel: 115 }
    ]
  };

  const EMOJIS = ['🚗', '🎩', '🐕', '🚢', '👢', '🛵'];
  const PCOLORS = ['#e63946', '#3a86ff', '#2ec4b6', '#ffbe0b', '#8338ec', '#fb5607'];

  /* ---------- helpers puros (usados também pela UI) ---------- */
  const getPlayer = (s, pid) => s.players.find(p => p.id === pid);
  const ownsAll = (s, pid, g) => GROUPS[g].every(i => s.props[i] && s.props[i].o === pid);
  const groupHouses = (s, g) => GROUPS[g].map(i => (s.props[i] ? s.props[i].h : 0));
  const groupBuilt = (s, g) => GROUPS[g].some(i => s.props[i] && s.props[i].h > 0);
  const unmortgageCost = t => Math.ceil(t.price * 0.55);

  function rentOf(s, i, dice, opts) {
    opts = opts || {};
    const t = TILES[i], pr = s.props[i];
    if (!pr || pr.m) return 0;
    if (t.type === 'prop') {
      if (pr.h > 0) return t.rents[pr.h];
      return ownsAll(s, pr.o, t.group) ? t.rents[0] * 2 : t.rents[0];
    }
    if (t.type === 'rail') {
      const n = RAILS.filter(j => s.props[j] && s.props[j].o === pr.o).length;
      return 25 * Math.pow(2, n - 1) * (opts.rail2 ? 2 : 1);
    }
    if (t.type === 'util') {
      const n = UTILS.filter(j => s.props[j] && s.props[j].o === pr.o).length;
      return dice * (opts.utilTen || n >= 2 ? 10 : 4);
    }
    return 0;
  }

  function checkBuild(s, pid, i) {
    const t = TILES[i], pr = s.props[i], pl = getPlayer(s, pid);
    if (t.type !== 'prop') return 'Só dá para construir em terrenos.';
    if (!pr || pr.o !== pid) return 'Esta propriedade não é sua.';
    if (!ownsAll(s, pid, t.group)) return 'Você precisa ter todo o grupo de cor.';
    if (GROUPS[t.group].some(j => s.props[j].m)) return 'Há propriedade hipotecada neste grupo.';
    if (pr.h >= 5) return 'Já tem hotel.';
    if (pr.h > Math.min.apply(null, groupHouses(s, t.group))) return 'Construa de forma uniforme no grupo.';
    if (pl.cash < t.house) return 'Dinheiro insuficiente.';
    return null;
  }
  function checkSell(s, pid, i) {
    const t = TILES[i], pr = s.props[i];
    if (t.type !== 'prop' || !pr || pr.o !== pid) return 'Esta propriedade não é sua.';
    if (pr.h < 1) return 'Não há construções aqui.';
    if (pr.h < Math.max.apply(null, groupHouses(s, t.group))) return 'Venda de forma uniforme no grupo.';
    return null;
  }
  function checkMortgage(s, pid, i) {
    const t = TILES[i], pr = s.props[i];
    if (!pr || pr.o !== pid) return 'Esta propriedade não é sua.';
    if (pr.m) return 'Já está hipotecada.';
    if (t.type === 'prop' && groupBuilt(s, t.group)) return 'Venda as construções do grupo antes.';
    return null;
  }
  function checkUnmortgage(s, pid, i) {
    const t = TILES[i], pr = s.props[i], pl = getPlayer(s, pid);
    if (!pr || pr.o !== pid) return 'Esta propriedade não é sua.';
    if (!pr.m) return 'Não está hipotecada.';
    if (pl.cash < unmortgageCost(t)) return 'Dinheiro insuficiente.';
    return null;
  }
  function tradable(s, pid, i) {
    const t = TILES[i], pr = s.props[i];
    if (!pr || pr.o !== pid) return false;
    if (t.type === 'prop' && groupBuilt(s, t.group)) return false;
    return true;
  }
  function netWorth(s, pid) {
    const pl = getPlayer(s, pid);
    let w = pl.cash;
    s.props.forEach((pr, i) => {
      if (pr && pr.o === pid) {
        const t = TILES[i];
        w += pr.m ? t.price / 2 : t.price;
        if (t.type === 'prop') w += pr.h * t.house;
      }
    });
    return w;
  }

  const rnd6 = () => 1 + Math.floor(Math.random() * 6);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- Jogo ---------- */
  class Game {
    constructor() {
      this.tokens = {};   // pid -> token secreto de reconexão (não vai para os clientes)
      this.decks = {};    // baralhos embaralhados (não vão para os clientes)
      this.nid = 1;
      this.mv = 0;
      this.onChange = null;
      this.s = this.blank();
    }

    blank() {
      return {
        phase: 'lobby', players: [], props: new Array(40).fill(null), turn: 0, turnNo: 0,
        doubles: 0, extra: false, dice: null, diceId: 0, move: null,
        buy: null, auction: null, debts: [], trade: null, card: null, cardId: 0,
        log: [], winner: null, hostId: null
      };
    }

    serialize() { return JSON.stringify({ s: this.s, tokens: this.tokens, decks: this.decks, nid: this.nid, mv: this.mv }); }
    restore(str) {
      const o = JSON.parse(str);
      this.s = o.s; this.tokens = o.tokens; this.decks = o.decks; this.nid = o.nid; this.mv = o.mv;
      this.s.players.forEach(p => { p.on = false; });
    }

    P(pid) { return getPlayer(this.s, pid); }
    cur() { return this.s.players[this.s.turn]; }
    say(text) { this.s.log.push({ k: 'e', t: text }); if (this.s.log.length > 120) this.s.log.shift(); }
    chat(pid, text) {
      const p = this.P(pid); text = String(text || '').trim().slice(0, 200);
      if (!p || !text) return;
      this.s.log.push({ k: 'c', p: pid, t: text });
      if (this.s.log.length > 120) this.s.log.shift();
      if (this.onChange) this.onChange();
    }
    emit() { if (this.onChange) this.onChange(); }

    /* ----- jogadores / sala ----- */
    addPlayer(name, token) {
      const s = this.s;
      const known = Object.keys(this.tokens).find(k => this.tokens[k] === token && this.P(+k));
      if (known) { const p = this.P(+known); p.on = true; if (name) p.name = String(name).slice(0, 16); this.emit(); return { pid: p.id }; }
      if (s.phase !== 'lobby') return { error: 'A partida já começou.' };
      if (s.players.length >= MAX_PLAYERS) return { error: 'Sala cheia (máx. 6 jogadores).' };
      const used = s.players.map(p => p.slot);
      let slot = 0; while (used.includes(slot)) slot++;
      const p = {
        id: this.nid++, slot, name: String(name || 'Jogador').trim().slice(0, 16) || 'Jogador',
        emoji: EMOJIS[slot], color: PCOLORS[slot], cash: START_CASH, pos: 0, jail: 0, cards: 0, out: false, on: true
      };
      s.players.push(p);
      this.tokens[p.id] = token;
      if (s.hostId == null) s.hostId = p.id;
      this.say(p.name + ' entrou na sala.');
      this.emit();
      return { pid: p.id };
    }

    setOnline(pid, on) {
      const s = this.s, p = this.P(pid);
      if (!p) return;
      if (s.phase === 'lobby' && !on && pid !== s.hostId) {
        s.players = s.players.filter(x => x.id !== pid);
        delete this.tokens[pid];
        this.say(p.name + ' saiu da sala.');
      } else {
        p.on = on;
        if (s.auction) this.checkAuction();
      }
      this.emit();
    }

    start() {
      const s = this.s;
      s.phase = 'roll';
      s.turn = Math.floor(Math.random() * s.players.length);
      s.turnNo = 1;
      s.props = new Array(40).fill(null);
      s.players.forEach(p => { Object.assign(p, { cash: START_CASH, pos: 0, jail: 0, cards: 0, out: false }); });
      this.decks = {
        chance: { order: shuffle(CARDS.chance.map((_, i) => i)), i: 0 },
        chest: { order: shuffle(CARDS.chest.map((_, i) => i)), i: 0 }
      };
      s.log = []; s.winner = null; s.debts = []; s.trade = null; s.auction = null; s.buy = null; s.card = null; s.move = null;
      this.say('A partida começou! ' + this.cur().name + ' joga primeiro.');
    }

    /* ----- ação genérica ----- */
    act(pid, m) {
      let err;
      try { err = this._act(pid, m); } catch (e) { console.error(e); err = 'Erro interno: ' + e.message; }
      if (!err) this.emit();
      return err || null;
    }

    _act(pid, m) {
      const s = this.s, p = this.P(pid);
      if (!p) return 'Jogador desconhecido.';
      const isHost = pid === s.hostId;

      if (s.phase === 'lobby') {
        if (m.t === 'start') {
          if (!isHost) return 'Só o anfitrião pode iniciar.';
          if (s.players.length < 2) return 'São necessários pelo menos 2 jogadores.';
          this.start(); return null;
        }
        if (m.t === 'kick') {
          if (!isHost || m.pid === pid) return 'Não permitido.';
          const q = this.P(m.pid); if (!q) return 'Jogador não encontrado.';
          s.players = s.players.filter(x => x.id !== m.pid); delete this.tokens[m.pid];
          this.say(q.name + ' foi removido da sala.'); return null;
        }
        return 'A partida ainda não começou.';
      }
      if (s.phase === 'over') {
        if (m.t === 'again' && isHost) {
          s.players = s.players.filter(x => x.on || x.id === s.hostId);
          s.phase = 'lobby'; s.winner = null; s.log = []; s.props = new Array(40).fill(null);
          s.players.forEach(x => { Object.assign(x, { cash: START_CASH, pos: 0, jail: 0, cards: 0, out: false }); });
          this.say('Nova partida! Aguardando o anfitrião iniciar.'); return null;
        }
        return 'A partida terminou.';
      }
      if (p.out) return 'Você já está fora da partida.';

      const mine = this.cur().id === pid;
      const BLOCKED_BY_DEBT = ['roll', 'buy', 'decline', 'end', 'jailPay', 'jailCard', 'bid', 'pass', 'build', 'unmortgage'];
      if (s.debts.length && BLOCKED_BY_DEBT.includes(m.t)) return 'Há uma dívida pendente. Resolva-a primeiro.';

      switch (m.t) {
        case 'roll':
          if (!mine || s.phase !== 'roll') return 'Agora não é possível rolar os dados.';
          this.roll(p); return null;

        case 'jailPay':
          if (!mine || s.phase !== 'roll' || !p.jail) return 'Indisponível.';
          if (p.cash < JAIL_FINE) return 'Dinheiro insuficiente.';
          p.cash -= JAIL_FINE; p.jail = 0; this.say(p.name + ' pagou $' + JAIL_FINE + ' e saiu da cadeia.'); return null;

        case 'jailCard':
          if (!mine || s.phase !== 'roll' || !p.jail || p.cards < 1) return 'Indisponível.';
          p.cards--; p.jail = 0; this.say(p.name + ' usou o cartão de saída livre.'); return null;

        case 'buy': {
          if (!mine || s.phase !== 'buy') return 'Nada para comprar.';
          const t = TILES[s.buy.tile];
          if (p.cash < t.price) return 'Dinheiro insuficiente.';
          p.cash -= t.price; s.props[s.buy.tile] = { o: pid, h: 0, m: false };
          this.say(p.name + ' comprou ' + t.name + ' por $' + t.price + '.');
          s.buy = null; this.afterLand(); return null;
        }
        case 'decline':
          if (!mine || s.phase !== 'buy') return 'Nada para recusar.';
          this.say(p.name + ' recusou a compra de ' + TILES[s.buy.tile].name + '.');
          this.startAuction(s.buy.tile); s.buy = null; return null;

        case 'bid': {
          const a = s.auction;
          if (!a || s.phase !== 'auction') return 'Não há leilão.';
          if (a.passed.includes(pid)) return 'Você já desistiu deste leilão.';
          const amt = Math.floor(+m.amount);
          if (!(amt > a.bid)) return 'O lance precisa ser maior que $' + a.bid + '.';
          if (amt > p.cash) return 'Dinheiro insuficiente.';
          a.bid = amt; a.bidder = pid; this.say(p.name + ' deu um lance de $' + amt + '.');
          this.checkAuction(); return null;
        }
        case 'pass': {
          const a = s.auction;
          if (!a || s.phase !== 'auction') return 'Não há leilão.';
          if (a.bidder === pid) return 'Você tem o maior lance.';
          if (!a.passed.includes(pid)) a.passed.push(pid);
          this.checkAuction(); return null;
        }
        case 'end':
          if (!mine || s.phase !== 'end') return 'Ainda não é possível encerrar a vez.';
          this.nextTurn(); return null;

        case 'build': {
          if (s.auction) return 'Aguarde o leilão.';
          const e = checkBuild(s, pid, m.tile); if (e) return e;
          const t = TILES[m.tile]; p.cash -= t.house; s.props[m.tile].h++;
          this.say(p.name + ' construiu em ' + t.name + (s.props[m.tile].h === 5 ? ' (hotel).' : '.')); return null;
        }
        case 'sell': {
          const e = checkSell(s, pid, m.tile); if (e) return e;
          const t = TILES[m.tile]; p.cash += t.house / 2; s.props[m.tile].h--;
          this.say(p.name + ' vendeu uma construção em ' + t.name + '.'); return null;
        }
        case 'mortgage': {
          const e = checkMortgage(s, pid, m.tile); if (e) return e;
          const t = TILES[m.tile]; p.cash += t.price / 2; s.props[m.tile].m = true;
          this.say(p.name + ' hipotecou ' + t.name + '.'); return null;
        }
        case 'unmortgage': {
          if (s.auction) return 'Aguarde o leilão.';
          const e = checkUnmortgage(s, pid, m.tile); if (e) return e;
          const t = TILES[m.tile]; p.cash -= unmortgageCost(t); s.props[m.tile].m = false;
          this.say(p.name + ' resgatou ' + t.name + '.'); return null;
        }
        case 'payDebt': {
          const d = s.debts.find(x => x.pid === pid);
          if (!d) return 'Você não tem dívidas.';
          if (p.cash < d.amount) return 'Dinheiro insuficiente: venda construções ou hipoteque propriedades.';
          p.cash -= d.amount; if (d.to != null && this.P(d.to)) this.P(d.to).cash += d.amount;
          s.debts.splice(s.debts.indexOf(d), 1);
          this.say(p.name + ' quitou a dívida de $' + d.amount + '.'); return null;
        }
        case 'bankrupt': {
          const d = s.debts.find(x => x.pid === pid);
          if (!d) return 'Você não tem dívidas.';
          this.eliminate(p, d.to, 'faliu'); return null;
        }
        case 'resign': {
          const d = s.debts.find(x => x.pid === pid);
          this.eliminate(p, d ? d.to : null, 'desistiu'); return null;
        }
        case 'kick': {
          if (!isHost) return 'Só o anfitrião pode remover jogadores.';
          const q = this.P(m.pid); if (!q || q.out || q.id === pid) return 'Não permitido.';
          const d = s.debts.find(x => x.pid === q.id);
          this.eliminate(q, d ? d.to : null, 'foi removido'); return null;
        }

        case 'tradeOffer': return this.tradeOffer(p, m);
        case 'tradeAccept': return this.tradeAccept(p);
        case 'tradeReject':
          if (!s.trade || s.trade.to !== pid) return 'Sem proposta.';
          this.say(p.name + ' recusou a proposta de ' + this.P(s.trade.from).name + '.'); s.trade = null; return null;
        case 'tradeCancel':
          if (!s.trade || s.trade.from !== pid) return 'Sem proposta.';
          s.trade = null; return null;
      }
      return 'Ação desconhecida.';
    }

    /* ----- dados e movimento ----- */
    roll(p) {
      const s = this.s;
      const d1 = rnd6(), d2 = rnd6(), sum = d1 + d2, dbl = d1 === d2;
      s.dice = [d1, d2]; s.diceId++;
      this.say(p.name + ' tirou ' + d1 + ' e ' + d2 + (dbl ? ' (dobro!)' : '') + '.');
      if (p.jail) {
        s.extra = false;
        if (dbl) { p.jail = 0; this.say(p.name + ' tirou dobro e saiu da cadeia!'); this.walk(p, sum); this.landOn(p); }
        else if (p.jail >= 3) {
          p.jail = 0; this.say(p.name + ' cumpriu 3 tentativas e pagou a fiança de $' + JAIL_FINE + '.');
          this.charge(p, JAIL_FINE, null); this.walk(p, sum); this.landOn(p);
        } else { p.jail++; s.phase = 'end'; this.say(p.name + ' continua preso.'); }
        return;
      }
      if (dbl) {
        s.doubles++;
        if (s.doubles >= 3) { this.say(p.name + ' tirou 3 dobros seguidos e foi para a cadeia!'); this.sendToJail(p); s.phase = 'end'; return; }
        s.extra = true;
      } else s.extra = false;
      this.walk(p, sum); this.landOn(p);
    }

    walk(p, steps) {
      const from = p.pos, to = (p.pos + steps + 40) % 40;
      if (steps > 0 && to < from) { p.cash += GO_BONUS; this.say(p.name + ' passou pelo Início e recebeu $' + GO_BONUS + '.'); }
      p.pos = to;
      this.s.move = { pid: p.id, from, to, kind: steps > 0 ? 'walk' : 'jump', id: ++this.mv };
    }
    moveTo(p, to, collect) {
      const from = p.pos;
      if (collect && to <= from) { p.cash += GO_BONUS; this.say(p.name + ' passou pelo Início e recebeu $' + GO_BONUS + '.'); }
      p.pos = to;
      this.s.move = { pid: p.id, from, to, kind: ((to - from + 40) % 40) <= 12 ? 'walk' : 'jump', id: ++this.mv };
    }
    sendToJail(p) {
      const from = p.pos; p.pos = 10; p.jail = 1; this.s.extra = false;
      this.s.move = { pid: p.id, from, to: 10, kind: 'jump', id: ++this.mv };
      this.say(p.name + ' foi para a cadeia.');
    }

    charge(p, amt, to) {
      if (amt <= 0) return true;
      if (p.cash >= amt) { p.cash -= amt; if (to != null && this.P(to)) this.P(to).cash += amt; return true; }
      this.s.debts.push({ pid: p.id, amount: amt, to: to == null ? null : to });
      this.say(p.name + ' deve $' + amt + (to != null ? ' a ' + this.P(to).name : ' ao banco') + ' e precisa levantar dinheiro.');
      return false;
    }

    landOn(p, opts) {
      const s = this.s, i = p.pos, t = TILES[i];
      switch (t.type) {
        case 'prop': case 'rail': case 'util': {
          const pr = s.props[i];
          if (!pr) {
            if (p.cash >= t.price) { s.phase = 'buy'; s.buy = { tile: i }; return; }
            this.say(p.name + ' não tem dinheiro para ' + t.name + ': vai a leilão.');
            this.startAuction(i); return;
          }
          if (pr.o !== p.id && !pr.m) {
            const sum = s.dice ? s.dice[0] + s.dice[1] : 7;
            const r = rentOf(s, i, sum, opts);
            this.say(p.name + ' pagou $' + r + ' de aluguel a ' + this.P(pr.o).name + ' (' + t.name + ').');
            this.charge(p, r, pr.o);
          }
          break;
        }
        case 'tax': this.say(p.name + ' pagou ' + t.name + ' ($' + t.amount + ').'); this.charge(p, t.amount, null); break;
        case 'chance': this.draw(p, 'chance'); return;
        case 'chest': this.draw(p, 'chest'); return;
        case 'gojail': this.sendToJail(p); break;
      }
      this.afterLand();
    }

    afterLand() {
      const s = this.s, p = this.cur();
      if (p.out) { this.nextTurn(); return; }
      s.phase = (s.extra && !p.jail) ? 'roll' : 'end';
    }

    draw(p, deckName) {
      const s = this.s, d = this.decks[deckName], list = CARDS[deckName];
      if (d.i >= d.order.length) { d.order = shuffle(list.map((_, i) => i)); d.i = 0; }
      const c = list[d.order[d.i++]];
      s.card = { deck: deckName, text: c.text, pid: p.id }; s.cardId++;
      this.say(p.name + ' tirou uma carta: ' + c.text);
      switch (c.t) {
        case 'cash': if (c.n >= 0) p.cash += c.n; else this.charge(p, -c.n, null); break;
        case 'goto': this.moveTo(p, c.to, true); this.landOn(p); return;
        case 'back': this.walk(p, -c.n); this.landOn(p); return;
        case 'jail': this.sendToJail(p); break;
        case 'jailfree': p.cards++; break;
        case 'repairs': {
          let h = 0, H = 0;
          s.props.forEach((pr, i) => { if (pr && pr.o === p.id && TILES[i].type === 'prop') { if (pr.h === 5) H++; else h += pr.h; } });
          const total = h * c.house + H * c.hotel;
          if (total) this.charge(p, total, null); break;
        }
        case 'eachPays': s.players.forEach(q => { if (!q.out && q.id !== p.id) this.charge(q, c.n, p.id); }); break;
        case 'payEach': s.players.forEach(q => { if (!q.out && q.id !== p.id) this.charge(p, c.n, q.id); }); break;
        case 'nearest': {
          const list2 = c.kind === 'rail' ? RAILS : UTILS;
          let to = list2.find(x => x > p.pos); if (to == null) to = list2[0];
          this.moveTo(p, to, true);
          this.landOn(p, c.kind === 'rail' ? { rail2: true } : { utilTen: true }); return;
        }
      }
      this.afterLand();
    }

    /* ----- leilão ----- */
    startAuction(tile) {
      const s = this.s;
      s.auction = { tile, bid: 0, bidder: null, passed: [] };
      s.phase = 'auction'; s.buy = null;
      this.say('Leilão de ' + TILES[tile].name + '!');
      this.checkAuction();
    }
    checkAuction() {
      const s = this.s, a = s.auction;
      if (!a) return;
      const eligible = s.players.filter(q => !q.out && q.on && !a.passed.includes(q.id) && (q.id === a.bidder || q.cash > a.bid));
      if (a.bidder != null) {
        if (eligible.every(q => q.id === a.bidder)) {
          const w = this.P(a.bidder), t = TILES[a.tile];
          w.cash -= a.bid; s.props[a.tile] = { o: w.id, h: 0, m: false };
          this.say(w.name + ' arrematou ' + t.name + ' por $' + a.bid + '.');
          s.auction = null; this.afterLand();
        }
      } else if (eligible.length === 0) {
        this.say('Ninguém quis ' + TILES[a.tile].name + '. Continua sem dono.');
        s.auction = null; this.afterLand();
      }
    }

    /* ----- turnos / fim ----- */
    nextTurn() {
      const s = this.s;
      if (this.checkWin()) return;
      s.doubles = 0; s.extra = false; s.buy = null;
      let i = s.turn;
      do { i = (i + 1) % s.players.length; } while (s.players[i].out);
      s.turn = i; s.phase = 'roll'; s.turnNo++;
    }
    checkWin() {
      const s = this.s, alive = s.players.filter(p => !p.out);
      if (alive.length <= 1 && s.players.length > 1) {
        s.phase = 'over'; s.winner = alive[0] ? alive[0].id : null;
        s.auction = null; s.buy = null; s.debts = []; s.trade = null;
        if (alive[0]) this.say('🏆 ' + alive[0].name + ' venceu a partida!');
        return true;
      }
      return false;
    }

    eliminate(p, creditor, verb) {
      const s = this.s, wasCur = this.cur().id === p.id;
      const cr = creditor != null ? this.P(creditor) : null;
      const heir = cr && !cr.out ? cr : null;
      this.say(p.name + ' ' + verb + (heir ? ' e entregou tudo a ' + heir.name + '.' : ' e devolveu tudo ao banco.'));
      s.props.forEach((pr, i) => {
        if (pr && pr.o === p.id) s.props[i] = heir ? { o: heir.id, h: 0, m: pr.m } : null;
      });
      if (heir) { heir.cash += p.cash; heir.cards += p.cards; }
      p.cash = 0; p.cards = 0; p.out = true; p.jail = 0;
      s.debts = s.debts.filter(d => d.pid !== p.id);
      s.debts.forEach(d => { if (d.to === p.id) d.to = null; });
      if (s.trade && (s.trade.from === p.id || s.trade.to === p.id)) s.trade = null;
      if (this.checkWin()) return;
      if (s.auction) {
        if (!s.auction.passed.includes(p.id)) s.auction.passed.push(p.id);
        if (s.auction.bidder === p.id) { s.auction.bidder = null; s.auction.bid = 0; }
        this.checkAuction();
        return;
      }
      if (wasCur) { s.buy = null; this.nextTurn(); }
    }

    /* ----- negociações ----- */
    tradeOffer(p, m) {
      const s = this.s;
      if (s.auction) return 'Aguarde o leilão terminar.';
      if (s.trade) return 'Já existe uma proposta em andamento.';
      const q = this.P(m.to);
      if (!q || q.out || q.id === p.id) return 'Jogador inválido.';
      const gc = Math.max(0, Math.floor(+m.giveCash || 0)), rc = Math.max(0, Math.floor(+m.getCash || 0));
      const gp = (m.giveProps || []).map(Number), rp = (m.getProps || []).map(Number);
      if (!gc && !rc && !gp.length && !rp.length) return 'Proposta vazia.';
      const e = this.checkTrade(p.id, gc, gp) || this.checkTrade(q.id, rc, rp);
      if (e) return e;
      s.trade = { from: p.id, to: q.id, giveCash: gc, giveProps: gp, getCash: rc, getProps: rp };
      this.say(p.name + ' propôs uma troca a ' + q.name + '.');
      return null;
    }
    checkTrade(pid, cash, props) {
      const pl = this.P(pid);
      if (cash > pl.cash) return pl.name + ' não tem dinheiro suficiente.';
      for (const i of props) if (!(i >= 0 && i < 40) || !tradable(this.s, pid, i)) return 'Propriedade inválida na troca (construções impedem a troca do grupo).';
      return null;
    }
    tradeAccept(p) {
      const s = this.s, tr = s.trade;
      if (!tr || tr.to !== p.id) return 'Sem proposta para você.';
      const a = this.P(tr.from);
      const e = this.checkTrade(a.id, tr.giveCash, tr.giveProps) || this.checkTrade(p.id, tr.getCash, tr.getProps);
      if (e) { s.trade = null; return 'A proposta não é mais válida: ' + e; }
      a.cash += tr.getCash - tr.giveCash; p.cash += tr.giveCash - tr.getCash;
      tr.giveProps.forEach(i => { s.props[i].o = p.id; });
      tr.getProps.forEach(i => { s.props[i].o = a.id; });
      this.say(a.name + ' e ' + p.name + ' fecharam negócio!');
      s.trade = null; return null;
    }
  }

  const API = {
    Game, TILES, GROUPS, GROUP_COLORS, RAILS, UTILS, CARDS, EMOJIS, PCOLORS,
    getPlayer, ownsAll, groupBuilt, rentOf, checkBuild, checkSell, checkMortgage, checkUnmortgage,
    unmortgageCost, tradable, netWorth, JAIL_FINE, GO_BONUS, MAX_PLAYERS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.IU = API;
})(typeof window !== 'undefined' ? window : globalThis);
