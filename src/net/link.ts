// Peer-to-peer transport: WebRTC data channels through PeerJS. PeerJS's free public
// broker only introduces the two browsers (signalling); match traffic then flows
// directly between them, relayed by its TURN servers when NATs block a direct path.
// Loaded on demand so offline play never downloads it.
import type { DataConnection, Peer, PeerError, PeerOptions } from 'peerjs';
import { asMsg, type Msg } from './protocol';

const ID_PREFIX = 'clashborn-';
export const peerIdFor = (code: string) => ID_PREFIX + code;

const PING_EVERY = 2000;
/** Silence this long means the other side is gone (closed tab, lost signal). */
const SILENCE_LIMIT = 9000;
/** A channel that hasn't opened by now never will. */
const OPEN_LIMIT = 15000;

const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

let peerModule: Promise<typeof import('peerjs')> | null = null;
const loadPeer = () => (peerModule ??= import('peerjs'));

function peerOptions(): PeerOptions {
  const o: PeerOptions = { debug: 1, config: { iceServers: ICE } };
  // ?peer=http://localhost:9000/ points at a self-hosted PeerServer (local testing).
  const custom = new URLSearchParams(location.search).get('peer');
  if (custom) {
    try {
      const u = new URL(custom);
      Object.assign(o, { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80), path: u.pathname, secure: u.protocol === 'https:' });
    } catch { /* ignore a malformed override */ }
  }
  return o;
}

interface ChannelEvents {
  open(ch: Channel): void;
  message(ch: Channel, m: Msg): void;
  closed(ch: Channel): void;
}

/** One data connection, with a heartbeat that notices a silent drop within seconds. */
export class Channel {
  open = false;
  private closed = false;
  private heard = performance.now();
  private sent = 0;
  private readonly born = performance.now();
  private readonly timer: number;

  constructor(private readonly conn: DataConnection, private readonly ev: ChannelEvents) {
    conn.on('open', () => {
      if (this.closed) return;
      this.open = true;
      this.heard = performance.now();
      ev.open(this);
    });
    conn.on('data', (d) => {
      this.heard = performance.now();
      const m = asMsg(d);
      if (!m || this.closed) return;
      if (m.t === 'ping') this.send({ t: 'pong' });
      else if (m.t !== 'pong') ev.message(this, m);
    });
    conn.on('close', () => this.close());
    conn.on('error', () => this.close());
    conn.on('iceStateChanged', (s) => { if (s === 'failed' || s === 'closed') this.close(); });
    this.timer = window.setInterval(() => this.beat(), 1000);
  }

  private beat(): void {
    const now = performance.now();
    if (!this.open) {
      if (now - this.born > OPEN_LIMIT) this.close();
      return;
    }
    if (now - this.heard > SILENCE_LIMIT) { this.close(); return; }
    if (now - this.sent > PING_EVERY) this.send({ t: 'ping' });
  }

  send(m: Msg): void {
    if (!this.open || this.closed) return;
    this.sent = performance.now();
    try { this.conn.send(m); } catch { /* the close handler will follow */ }
  }

  /** Closes without telling anyone (used when a newer channel replaces this one). */
  drop(): void {
    this.closed = true;
    clearInterval(this.timer);
    try { this.conn.close(); } catch { /* already gone */ }
  }

  close(): void {
    if (this.closed) return;
    this.drop();
    this.ev.closed(this);
  }
}

export interface HostEvents {
  message(ch: Channel, m: Msg): void;
  closed(ch: Channel): void;
  /** Connection to the broker: needed for a rival to (re)join, not for an open channel. */
  server(ok: boolean): void;
}

/** The host's end: owns the room's id at the broker and accepts channels from guests. */
export class HostLink {
  private destroyed = false;
  private retry = 0;

  private constructor(private readonly peer: Peer, ev: HostEvents) {
    peer.on('connection', (conn) => {
      new Channel(conn, { open: () => {}, message: ev.message, closed: ev.closed });
    });
    peer.on('disconnected', () => {
      if (this.destroyed) return;
      ev.server(false);
      this.scheduleReconnect();
    });
    peer.on('open', () => { if (!this.destroyed) ev.server(true); });
    peer.on('error', (e: PeerError<string>) => {
      if (this.destroyed) return;
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { ev.server(false); this.scheduleReconnect(); }
    });
  }

  private scheduleReconnect(): void {
    clearTimeout(this.retry);
    this.retry = window.setTimeout(() => {
      if (this.destroyed || this.peer.destroyed) return;
      if (this.peer.disconnected) {
        try { this.peer.reconnect(); } catch { /* try again below */ }
        this.scheduleReconnect();
      }
    }, 3000);
  }

  /**
   * Claims the room code at the broker. Rejects with 'taken' when someone already
   * holds it, or 'offline' when the broker can't be reached.
   */
  static async open(code: string, ev: HostEvents): Promise<HostLink> {
    const { Peer } = await loadPeer();
    return new Promise<HostLink>((resolve, reject) => {
      const peer = new Peer(peerIdFor(code), peerOptions());
      let settled = false;
      const fail = (why: string) => { if (settled) return; settled = true; peer.destroy(); reject(new Error(why)); };
      const timer = setTimeout(() => fail('offline'), 15000);
      peer.once('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new HostLink(peer, ev));
      });
      peer.on('error', (e: PeerError<string>) => {
        if (settled) return;
        clearTimeout(timer);
        fail(e.type === 'unavailable-id' ? 'taken' : e.type === 'browser-incompatible' ? 'browser' : 'offline');
      });
    });
  }

  close(): void {
    this.destroyed = true;
    clearTimeout(this.retry);
    this.peer.destroy();
  }
}

export interface GuestEvents {
  open(ch: Channel): void;
  message(m: Msg): void;
  /** The channel dropped; the link keeps trying to get back. */
  lost(): void;
  /** No room with that code (only before the first successful connection). */
  noRoom(): void;
  /** The broker is unreachable or WebRTC is unavailable. */
  offline(why: 'offline' | 'browser'): void;
}

/** The guest's end: connects to the room and keeps reconnecting after a drop. */
export class GuestLink {
  private peer: Peer | null = null;
  private ch: Channel | null = null;
  private retryTimer = 0;
  private destroyed = false;
  private everOpen = false;
  private misses = 0;

  constructor(private readonly code: string, private readonly ev: GuestEvents, resuming: boolean) {
    // A guest coming back after a reload keeps trying even if the room is briefly gone.
    this.everOpen = resuming;
  }

  async start(): Promise<void> {
    let mod: typeof import('peerjs');
    try { mod = await loadPeer(); } catch { this.ev.offline('offline'); return; }
    if (this.destroyed) return;
    const peer = new mod.Peer(peerOptions());
    this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => this.retry(3000));
    peer.on('error', (e: PeerError<string>) => this.onError(e.type));
  }

  private connect(): void {
    const peer = this.peer;
    if (this.destroyed || !peer || peer.destroyed || peer.disconnected) return;
    this.ch?.drop();
    const conn = peer.connect(peerIdFor(this.code), { reliable: true, serialization: 'json' });
    this.ch = new Channel(conn, {
      open: (ch) => {
        if (ch !== this.ch) return;
        this.everOpen = true;
        this.misses = 0;
        this.ev.open(ch);
      },
      message: (ch, m) => { if (ch === this.ch) this.ev.message(m); },
      closed: (ch) => {
        if (ch !== this.ch) return;
        this.ch = null;
        if (ch.open) this.ev.lost();
        this.retry(1500);
      },
    });
  }

  private onError(type: string): void {
    if (this.destroyed) return;
    if (type === 'peer-unavailable') {
      this.misses++;
      if (!this.everOpen && this.misses >= 2) { this.ev.noRoom(); return; }
      this.ch?.drop();
      this.ch = null;
      this.retry(2500);
    } else if (type === 'browser-incompatible') {
      this.ev.offline('browser');
    } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(type)) {
      if (!this.everOpen) this.ev.offline('offline');
      this.retry(3000);
    } else {
      this.retry(2500);
    }
  }

  private retry(delay: number): void {
    clearTimeout(this.retryTimer);
    if (this.destroyed) return;
    this.retryTimer = window.setTimeout(() => {
      const peer = this.peer;
      if (this.destroyed || !peer || this.ch?.open) return;
      if (peer.destroyed) { void this.start(); return; }
      if (peer.disconnected) { try { peer.reconnect(); } catch { this.retry(3000); } return; }
      this.connect();
    }, delay);
  }

  /** Tries again right away (the player pressed Retry). */
  again(): void {
    this.misses = 0;
    this.retry(0);
  }

  close(): void {
    this.destroyed = true;
    clearTimeout(this.retryTimer);
    this.ch?.drop();
    this.peer?.destroy();
  }
}
