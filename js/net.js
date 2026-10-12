/* Camada de rede: cliente <-> servidor (anfitrião) <-> cliente, sobre WebRTC via PeerJS.
   O navegador do anfitrião é o servidor autoritativo; cada jogador mantém uma conexão com ele. */
(function (root) {
  'use strict';
  const PREFIX = 'iurb-';
  const OPTS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  };
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function genCode() {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return c;
  }
  function genToken() {
    const a = new Uint8Array(12);
    (root.crypto || root.msCrypto).getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---- servidor (anfitrião) ---- */
  class HostNet {
    constructor(code, h) {
      this.code = code; this.conns = new Set();
      this.peer = new Peer(PREFIX + code, OPTS);
      this.peer.on('open', () => h.onReady());
      this.peer.on('error', e => h.onError(e));
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* ignora */ } });
      this.peer.on('connection', conn => {
        this.conns.add(conn);
        conn.on('data', d => h.onMessage(conn, d));
        conn.on('close', () => { this.conns.delete(conn); h.onClose(conn); });
        conn.on('error', () => { /* o evento close cuida do resto */ });
      });
    }
    send(conn, msg) { if (conn && conn.open) conn.send(msg); }
    broadcast(msg) { this.conns.forEach(c => { if (c.open) c.send(msg); }); }
    close() { try { this.peer.destroy(); } catch (e) { /* ignora */ } }
  }

  /* ---- cliente ---- */
  class ClientNet {
    constructor(code, h) {
      this.code = code; this.h = h; this.closed = false;
      this.connect();
    }
    connect() {
      const h = this.h;
      this.cleanup();
      const peer = this.peer = new Peer(undefined, OPTS);
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened && this.peer === peer && !this.closed) h.onError({ type: 'timeout' });
      }, 15000);
      peer.on('open', () => {
        if (this.peer !== peer) return;
        const conn = this.conn = peer.connect(PREFIX + this.code, { reliable: true });
        conn.on('open', () => { opened = true; clearTimeout(timer); h.onOpen(); });
        conn.on('data', d => h.onMessage(d));
        conn.on('close', () => { clearTimeout(timer); if (!this.closed && this.conn === conn) h.onClose(); });
        conn.on('error', () => { /* close cuida */ });
      });
      peer.on('error', e => { clearTimeout(timer); if (this.peer === peer && !this.closed) h.onError(e); });
    }
    cleanup() {
      const p = this.peer; this.peer = null; this.conn = null;
      if (p) { try { p.destroy(); } catch (e) { /* ignora */ } }
    }
    send(m) { if (this.conn && this.conn.open) this.conn.send(m); }
    reconnect() { if (!this.closed) this.connect(); }
    close() { this.closed = true; this.cleanup(); }
  }

  root.Net = { HostNet, ClientNet, genCode, genToken };
})(window);
