// Simulação com bots aleatórios para detectar travamentos e erros na lógica.  Uso: node tests/sim.js [partidas]
const IU = require('../js/game.js');
const { Game, TILES } = IU;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

function playOne(nPlayers, maxSteps) {
  const g = new Game();
  for (let i = 0; i < nPlayers; i++) g.addPlayer('Bot' + i, 'tok' + i);
  let e = g.act(1, { t: 'start' });
  if (e) throw new Error('start: ' + e);
  const s = g.s;
  const stats = { auctions: 0, trades: 0, bankrupt: 0, builds: 0, debts: 0 };
  for (let step = 0; step < maxSteps && s.phase !== 'over'; step++) {
    // invariantes
    s.players.forEach(p => { if (p.cash < 0) throw new Error('cash negativo ' + p.name + ' ' + p.cash); });
    s.props.forEach((pr, i) => { if (pr && (pr.h < 0 || pr.h > 5)) throw new Error('casas inválidas'); if (pr && !s.players.find(p => p.id === pr.o)) throw new Error('dono inexistente'); });
    const cur = s.players[s.turn];
    if (cur.out && s.phase !== 'auction') throw new Error('turno de jogador eliminado');
    const alive = s.players.filter(p => !p.out);

    // ações paralelas aleatórias (trocas, construção, hipoteca) — não podem corromper o estado
    if (Math.random() < 0.15) {
      const p = pick(alive);
      const mine = s.props.map((pr, i) => (pr && pr.o === p.id ? i : -1)).filter(i => i >= 0);
      if (mine.length) {
        const i = pick(mine);
        const r = Math.random();
        const er = g.act(p.id, { t: r < 0.4 ? 'build' : r < 0.6 ? 'sell' : r < 0.8 ? 'mortgage' : 'unmortgage', tile: i });
        if (!er && r < 0.4) stats.builds++;
      }
    }
    if (Math.random() < 0.05 && !s.trade) {
      const a = pick(alive), b = pick(alive);
      if (a.id !== b.id) {
        const ap = s.props.map((pr, i) => (pr && pr.o === a.id ? i : -1)).filter(i => i >= 0);
        const bp = s.props.map((pr, i) => (pr && pr.o === b.id ? i : -1)).filter(i => i >= 0);
        const er = g.act(a.id, { t: 'tradeOffer', to: b.id, giveCash: rnd(200), giveProps: ap.length ? [pick(ap)] : [], getCash: rnd(100), getProps: bp.length ? [pick(bp)] : [] });
        if (!er) { stats.trades++; g.act(b.id, { t: Math.random() < 0.5 ? 'tradeAccept' : 'tradeReject' }); if (s.trade) g.act(a.id, { t: 'tradeCancel' }); }
      }
    }
    if (Math.random() < 0.0005) { const p = pick(alive); g.act(p.id, { t: 'resign' }); stats.bankrupt++; continue; }
    if (s.phase === 'over') break;

    if (s.debts.length) {
      stats.debts++;
      const d = s.debts[0], p = g.P(d.pid);
      if (g.act(p.id, { t: 'payDebt' }) === null) continue;
      // levantar dinheiro
      let done = false;
      for (const i of s.props.keys()) {
        if (s.props[i] && s.props[i].o === p.id) {
          if (g.act(p.id, { t: 'sell', tile: i }) === null) { done = true; break; }
          if (g.act(p.id, { t: 'mortgage', tile: i }) === null) { done = true; break; }
        }
      }
      if (!done) { g.act(p.id, { t: 'bankrupt' }); stats.bankrupt++; }
      continue;
    }
    switch (s.phase) {
      case 'roll': {
        if (cur.jail) { const r = Math.random(); if (r < 0.2) g.act(cur.id, { t: 'jailPay' }); else if (r < 0.3) g.act(cur.id, { t: 'jailCard' }); }
        e = g.act(cur.id, { t: 'roll' }); if (e) throw new Error('roll: ' + e); break;
      }
      case 'buy': g.act(cur.id, { t: Math.random() < 0.7 ? 'buy' : 'decline' }); break;
      case 'auction': {
        stats.auctions++;
        const a = s.auction;
        const p = pick(alive);
        if (Math.random() < 0.5) g.act(p.id, { t: 'bid', amount: a.bid + 1 + rnd(60) });
        else g.act(p.id, { t: 'pass' });
        if (stats.auctions % 40 === 0) alive.forEach(q => g.act(q.id, { t: 'pass' })); // garante fim
        break;
      }
      case 'end': e = g.act(cur.id, { t: 'end' }); if (e) throw new Error('end: ' + e); break;
      default: throw new Error('fase inesperada ' + s.phase);
    }
  }
  return { over: s.phase === 'over', turns: s.turnNo, stats, winner: s.winner };
}

const N = +process.argv[2] || 100;
let finished = 0, agg = { auctions: 0, trades: 0, bankrupt: 0, builds: 0, debts: 0 }, turns = 0;
for (let i = 0; i < N; i++) {
  const r = playOne(2 + rnd(5), 60000);
  if (r.over) finished++;
  turns += r.turns;
  for (const k in agg) agg[k] += r.stats[k];
}
console.log(`partidas: ${N}, terminadas: ${finished}, turnos médios: ${Math.round(turns / N)}`, agg);
if (finished < N * 0.9) { console.error('MUITAS PARTIDAS NÃO TERMINARAM'); process.exit(1); }
