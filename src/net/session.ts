// An online match between two friends. Neither device streams the fight: both
// simulate it from the same seed and builds (the sim is deterministic), so only
// the picks, the seed and a result hash cross the network. The host is the
// referee: it owns the match state, the timers and the official result.
import { randomSeed } from '../core/rng';
import { sanitizeBuild, type CharacterBuild } from '../sim/loadout';
import { validSkins } from '../gear/skins';
import { cleanName } from '../character/profile';
import { judgeRound } from './judge';
import { GuestLink, HostLink, type Channel } from './link';
import {
  matchWinner, newRoomCode, PICK_SECONDS, PICK_SECONDS_FIRST, PROTOCOL, randomId,
  type GuestMsg, type Msg, type Side, type Snapshot,
} from './protocol';
import type { Verdict } from './verdict';

/**
 * waiting: hosting, nobody has joined yet. connecting: joining. open: playing.
 * lost: the link dropped and is being restored. left: the rival quit.
 * error: couldn't start (see `error`).
 */
export type ConnState = 'starting' | 'waiting' | 'connecting' | 'open' | 'lost' | 'left' | 'error';
export type SessionError = 'offline' | 'browser' | 'no-room' | 'full' | 'version' | 'taken';

/** Grace after the pick timer before the host locks a silent guest in with their last build. */
const GUEST_GRACE = 4000;
/** Slack on top of a fight's length before the host stops waiting for a slow watcher. */
const WATCH_SLACK = 60;
const STORE_KEY = 'cb.online';
/** A saved match older than this isn't resumed after a reload. */
const RESUME_WINDOW = 15 * 60 * 1000;

interface Saved {
  role: 'host' | 'guest';
  code: string;
  matchId?: string;
  snap?: Snapshot;
  locked?: [CharacterBuild | null, CharacterBuild | null];
  savedAt: number;
}

export function savedMatch(): Saved | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null') as Saved | null;
    if (!s || Date.now() - s.savedAt > RESUME_WINDOW) return null;
    return s;
  } catch {
    return null;
  }
}

function persist(s: Saved | null): void {
  try {
    if (s) sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORE_KEY);
  } catch { /* private mode: no resume after reload */ }
}

/** Strict copy of a build that came over the wire (or from storage). */
export function cleanBuild(raw: unknown, fallback: CharacterBuild): CharacterBuild {
  const b = sanitizeBuild(raw, fallback);
  return { ...b, name: cleanName(b.name) || fallback.name, skins: validSkins(b.skins) };
}

export abstract class OnlineSession {
  abstract readonly role: 'host' | 'guest';
  abstract readonly you: Side;
  snap: Snapshot | null = null;
  conn: ConnState = 'starting';
  error: SessionError | null = null;
  /** performance.now() time the pick timer runs out (Infinity while frozen). */
  pickDeadline = Infinity;
  /** Local verdicts per round (this device's own simulation). */
  readonly verdicts = new Map<number, Verdict>();
  onChange: () => void = () => {};
  /** The build being edited right now: locked in automatically when the timer runs out. */
  draft: CharacterBuild;
  protected judged = new Set<string>();
  protected timer = 0;
  protected closed = false;

  constructor(public code: string, protected readonly me: CharacterBuild) {
    this.draft = me;
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  get rival(): Side { return this.you === 0 ? 1 : 0; }

  abstract lock(build: CharacterBuild): void;
  abstract unlock(): void;
  abstract finishedWatching(round: number): void;
  abstract rematch(): void;
  protected abstract judgedRound(round: number, v: Verdict): void;
  protected abstract sendBye(): void;

  protected tick(): void {
    const s = this.snap;
    if (!s || s.phase !== 'pick' || s.ready[this.you] || this.conn !== 'open') return;
    if (performance.now() >= this.pickDeadline) this.lock(this.draft);
  }

  /** Both devices simulate every round once, off the main thread, to compare results. */
  protected judgeIfNeeded(): void {
    const s = this.snap;
    if (!s || s.phase !== 'fight') return;
    const key = `${s.id}:${s.round}`;
    if (this.judged.has(key)) return;
    this.judged.add(key);
    const round = s.round;
    void judgeRound(s.seed, s.builds).then((v) => {
      if (this.closed || this.snap?.id !== s.id) return;
      this.verdicts.set(round, v);
      this.judgedRound(round, v);
    });
  }

  leave(): void {
    if (this.closed) return;
    this.sendBye();
    this.close();
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    persist(null);
  }

  protected emit(): void {
    if (!this.closed) this.onChange();
  }
}

// -----------------------------------------------------------------------------
// Host: the referee
// -----------------------------------------------------------------------------

export class HostSession extends OnlineSession {
  readonly role = 'host';
  readonly you = 0 as const;
  private link: HostLink | null = null;
  private remote: Channel | null = null;
  private locked: [CharacterBuild | null, CharacterBuild | null] = [null, null];
  /** performance.now() deadline for the pick timer, and what was left when it froze. */
  private deadline = 0;
  private frozenLeft = 0;
  private watchBy = Infinity;
  private guestVerdicts = new Map<number, { hash: string; checks: string[] }>();

  constructor(me: CharacterBuild, private readonly resume?: Saved) {
    super(resume?.code ?? newRoomCode(), me);
    if (resume?.snap) {
      this.snap = resume.snap;
      this.locked = resume.locked ?? [null, null];
      this.frozenLeft = resume.snap.pickLeft;
      this.snap.held = true;
      this.draft = resume.snap.builds[0];
      if (this.snap.phase === 'fight') this.watchBy = performance.now() + 90_000;
    }
  }

  async start(): Promise<void> {
    this.conn = 'starting';
    this.emit();
    // A fresh room retries on a code clash; a resumed one waits for the broker to free its old id.
    for (let attempt = 0; attempt < 8 && !this.closed; attempt++) {
      try {
        this.link = await HostLink.open(this.code, {
          message: (ch, m) => this.onMessage(ch, m),
          closed: (ch) => this.onClosed(ch),
          server: () => {},
        });
        if (this.closed) { this.link.close(); return; }
        this.conn = this.snap ? 'lost' : 'waiting';
        this.publish();
        this.judgeIfNeeded();
        return;
      } catch (e) {
        const why = (e as Error).message;
        if (why === 'taken' && !this.resume) { this.code = newRoomCode(); continue; }
        if (why === 'taken') { await new Promise((r) => setTimeout(r, 2500)); continue; }
        this.fail(why === 'browser' ? 'browser' : 'offline');
        return;
      }
    }
    if (!this.closed) this.fail('offline');
  }

  private fail(e: SessionError): void {
    this.conn = 'error';
    this.error = e;
    this.emit();
  }

  /** Re-opens the room after a failed start. */
  retry(): void {
    if (this.closed || this.conn !== 'error') return;
    this.error = null;
    void this.start();
  }

  private onMessage(ch: Channel, raw: Msg): void {
    if (this.closed) return;
    const m = raw as GuestMsg | Msg;
    if (m.t === 'hello') { this.onHello(ch, m); return; }
    if (ch !== this.remote) return;
    const s = this.snap;
    if (!s) return;
    switch (m.t) {
      case 'lock':
        if (s.phase === 'pick' && m.round === s.round && !s.ready[1]) this.lockSide(1, cleanBuild(m.build, s.builds[1]));
        break;
      case 'unlock':
        if (s.phase === 'pick' && m.round === s.round && s.ready[1]) { s.ready[1] = false; this.locked[1] = null; this.publish(); }
        break;
      case 'verdict':
        if (typeof m.hash === 'string') {
          this.guestVerdicts.set(m.round, { hash: m.hash, checks: Array.isArray(m.checks) ? m.checks.map(String) : [] });
          this.compare(m.round);
        }
        break;
      case 'done':
        if (m.round === s.round && s.phase === 'fight') { s.done[1] = true; this.advance(); }
        break;
      case 'rematch':
        if (m.id === s.id) { s.rematch[1] = true; s.done[1] = true; this.maybeRematch(); }
        break;
      case 'bye':
        this.remote?.drop();
        this.remote = null;
        this.conn = 'left';
        persist(null);
        this.emit();
        break;
    }
  }

  private onHello(ch: Channel, m: Extract<GuestMsg, { t: 'hello' }>): void {
    const reject = (reason: 'version' | 'full') => {
      ch.send({ t: 'reject', reason, version: __APP_VERSION__ });
      setTimeout(() => ch.drop(), 800);
    };
    if (m.proto !== PROTOCOL || m.version !== __APP_VERSION__) { reject('version'); return; }
    if (this.conn === 'left') { reject('full'); return; }
    const s = this.snap;
    if (s && m.matchId !== s.id) { reject('full'); return; }
    if (this.remote && this.remote !== ch) this.remote.drop();
    this.remote = ch;
    this.conn = 'open';
    if (!s) this.newMatch([this.me, cleanBuild(m.build, this.me)], PICK_SECONDS_FIRST);
    else this.thaw();
    this.publish();
  }

  private onClosed(ch: Channel): void {
    if (ch !== this.remote || this.closed) return;
    this.remote = null;
    if (this.conn === 'left') return;
    this.conn = 'lost';
    this.freeze();
    this.publish();
  }

  /** The guest is away: stop the pick clock so they don't come back to a lost round. */
  private freeze(): void {
    const s = this.snap;
    if (!s || s.held) return;
    s.held = true;
    this.frozenLeft = Math.max(0, this.deadline - performance.now());
  }

  private thaw(): void {
    const s = this.snap;
    if (!s || !s.held) return;
    s.held = false;
    // At least a few seconds to get bearings after reconnecting.
    this.deadline = performance.now() + Math.max(this.frozenLeft, 8000);
    if (s.phase === 'fight' && this.watchBy !== Infinity) this.watchBy = Math.max(this.watchBy, performance.now() + 30_000);
  }

  private newMatch(builds: [CharacterBuild, CharacterBuild], pickSeconds: number): void {
    this.snap = {
      id: randomId(), round: 1, phase: 'pick', builds, ready: [false, false], pickLeft: 0, seed: 0,
      results: [], done: [false, false], rematch: [false, false], held: false,
    };
    this.locked = [null, null];
    this.guestVerdicts.clear();
    this.verdicts.clear();
    this.draft = builds[0];
    this.deadline = performance.now() + pickSeconds * 1000;
    this.watchBy = Infinity;
  }

  protected tick(): void {
    super.tick();
    const s = this.snap;
    if (!s || this.closed) return;
    const now = performance.now();
    if (s.phase === 'pick' && !s.held && !s.ready[1] && now >= this.deadline + GUEST_GRACE) {
      // The guest didn't answer in time: they fight with what they had last round.
      this.lockSide(1, s.builds[1]);
    }
    if (s.phase === 'fight' && !s.held && now >= this.watchBy) this.advance(true);
  }

  private lockSide(side: Side, build: CharacterBuild): void {
    const s = this.snap!;
    this.locked[side] = build;
    s.ready[side] = true;
    if (s.ready[0] && s.ready[1]) {
      s.phase = 'fight';
      s.seed = randomSeed();
      s.builds = [this.locked[0]!, this.locked[1]!];
      s.done = [false, false];
      this.watchBy = Infinity;
      this.judgeIfNeeded();
    }
    this.publish();
  }

  protected judgedRound(round: number, v: Verdict): void {
    const s = this.snap!;
    if (s.results.some((r) => r.round === round)) return;
    s.results.push({ round, winner: v.winner, reason: v.reason });
    // Time to watch it at normal speed (intro + fight + KO) plus reading the results.
    this.watchBy = performance.now() + (v.time + WATCH_SLACK) * 1000;
    this.compare(round);
    this.advance();
    this.publish();
  }

  /** Flags a round whose two simulations disagree. The host's result stands. */
  private compare(round: number): void {
    const mine = this.verdicts.get(round), theirs = this.guestVerdicts.get(round);
    const r = this.snap?.results.find((x) => x.round === round);
    if (!mine || !theirs || !r || r.desync !== undefined) return;
    r.desync = mine.hash !== theirs.hash;
    if (r.desync) {
      const at = mine.checks.findIndex((c, i) => c !== theirs.checks[i]);
      console.warn(`[online] round ${round} desync: host ${mine.hash} guest ${theirs.hash}; first divergence at check ${at}`);
    }
    this.publish();
  }

  /** After both watched the fight (or the slow one ran out of time): next round or the end. */
  private advance(force = false): void {
    const s = this.snap!;
    if (s.phase !== 'fight' || !s.results.some((r) => r.round === s.round)) return;
    if (!force && !(s.done[0] && s.done[1])) { this.publish(); return; }
    if (matchWinner(s.results) !== -1) {
      s.phase = 'over';
    } else {
      s.round++;
      s.phase = 'pick';
      s.ready = [false, false];
      s.done = [false, false];
      this.locked = [null, null];
      this.draft = s.builds[0];
      this.deadline = performance.now() + PICK_SECONDS * 1000;
    }
    this.watchBy = Infinity;
    this.publish();
  }

  private maybeRematch(): void {
    const s = this.snap!;
    if (s.rematch[0] && s.rematch[1]) this.newMatch([s.builds[0], s.builds[1]], PICK_SECONDS);
    else this.advance();
    this.publish();
  }

  lock(build: CharacterBuild): void {
    const s = this.snap;
    if (!s || s.phase !== 'pick' || s.ready[0]) return;
    this.lockSide(0, cleanBuild(build, s.builds[0]));
  }

  unlock(): void {
    const s = this.snap;
    if (!s || s.phase !== 'pick' || !s.ready[0]) return;
    s.ready[0] = false;
    this.locked[0] = null;
    this.publish();
  }

  finishedWatching(round: number): void {
    const s = this.snap;
    if (!s || s.round !== round || s.phase !== 'fight' || s.done[0]) return;
    s.done[0] = true;
    this.advance();
  }

  rematch(): void {
    const s = this.snap;
    if (!s || s.rematch[0] || matchWinner(s.results) === -1) return;
    s.rematch[0] = true;
    s.done[0] = true;
    this.maybeRematch();
  }

  protected sendBye(): void {
    this.remote?.send({ t: 'bye' });
  }

  private publish(): void {
    const s = this.snap;
    if (s) {
      s.pickLeft = s.phase !== 'pick' ? 0 : s.held ? this.frozenLeft : Math.max(0, this.deadline - performance.now());
      this.pickDeadline = s.phase === 'pick' && !s.held ? this.deadline : Infinity;
      this.remote?.send({ t: 'state', s });
      if (this.conn !== 'left') persist({ role: 'host', code: this.code, snap: s, locked: this.locked, savedAt: Date.now() });
    } else if (this.conn === 'waiting') {
      persist(null);
    }
    this.emit();
  }

  close(): void {
    super.close();
    const link = this.link;
    // Let a goodbye leave before the connection goes.
    setTimeout(() => { this.remote?.drop(); link?.close(); }, 300);
  }
}

// -----------------------------------------------------------------------------
// Guest
// -----------------------------------------------------------------------------

export class GuestSession extends OnlineSession {
  readonly role = 'guest';
  readonly you = 1 as const;
  private link: GuestLink;
  private ch: Channel | null = null;
  /** A lock or unlock the host hasn't confirmed yet (shown right away, resent if lost). */
  private pending: { round: number; ready: boolean } | null = null;

  constructor(code: string, me: CharacterBuild, resume?: Saved) {
    super(code, me);
    const matchId = resume?.matchId;
    this.link = new GuestLink(code, {
      open: (ch) => {
        this.ch = ch;
        ch.send({ t: 'hello', proto: PROTOCOL, version: __APP_VERSION__, matchId: this.snap?.id ?? matchId, build: this.me });
      },
      message: (m) => this.onMessage(m),
      lost: () => {
        this.ch = null;
        if (this.conn === 'open') { this.conn = 'lost'; this.emit(); }
      },
      noRoom: () => this.fail('no-room'),
      offline: (why) => { if (this.conn !== 'open' && this.conn !== 'lost') this.fail(why); },
    }, !!matchId);
    this.conn = matchId ? 'lost' : 'connecting';
  }

  async start(): Promise<void> {
    await this.link.start();
  }

  private fail(e: SessionError): void {
    if (this.closed) return;
    this.conn = 'error';
    this.error = e;
    this.emit();
  }

  retry(): void {
    if (this.closed) return;
    this.error = null;
    this.conn = this.snap ? 'lost' : 'connecting';
    this.link.again();
    this.emit();
  }

  private onMessage(m: Msg): void {
    if (this.closed) return;
    if (m.t === 'state') {
      const s = m.s;
      if (!s || typeof s !== 'object' || !Array.isArray(s.builds)) return;
      s.builds = [cleanBuild(s.builds[0], this.me), cleanBuild(s.builds[1], this.me)];
      const newMatch = this.snap?.id !== s.id;
      if (newMatch) this.verdicts.clear();
      const newRound = newMatch || this.snap?.round !== s.round || this.snap?.phase !== s.phase;
      if (newRound && s.phase === 'pick') this.draft = s.builds[1];
      const p = this.pending;
      if (p && (s.phase !== 'pick' || p.round !== s.round || s.ready[1] === p.ready)) this.pending = null;
      else if (p) {
        s.ready[1] = p.ready;
        this.send(p.ready ? { t: 'lock', round: s.round, build: this.draft } : { t: 'unlock', round: s.round });
      }
      this.snap = s;
      this.conn = 'open';
      this.error = null;
      this.pickDeadline = s.phase === 'pick' && !s.held ? performance.now() + s.pickLeft : Infinity;
      persist({ role: 'guest', code: this.code, matchId: s.id, savedAt: Date.now() });
      this.judgeIfNeeded();
      // A verdict computed before a reconnect still has to reach the host.
      const v = this.verdicts.get(s.round);
      if (v && s.phase === 'fight') this.sendVerdict(s.round, v);
      this.emit();
    } else if (m.t === 'reject') {
      this.fail(m.reason === 'version' ? 'version' : 'full');
      this.link.close();
    } else if (m.t === 'bye') {
      this.conn = 'left';
      persist(null);
      this.link.close();
      this.emit();
    }
  }

  private send(m: GuestMsg | Msg): void {
    this.ch?.send(m);
  }

  private sendVerdict(round: number, v: Verdict): void {
    this.send({ t: 'verdict', round, hash: v.hash, checks: v.checks });
  }

  protected judgedRound(round: number, v: Verdict): void {
    this.sendVerdict(round, v);
    this.emit();
  }

  lock(build: CharacterBuild): void {
    const s = this.snap;
    if (!s || s.phase !== 'pick' || s.ready[1]) return;
    s.ready[1] = true;
    this.draft = build;
    this.pending = { round: s.round, ready: true };
    this.send({ t: 'lock', round: s.round, build });
    this.emit();
  }

  unlock(): void {
    const s = this.snap;
    if (!s || s.phase !== 'pick' || !s.ready[1]) return;
    s.ready[1] = false;
    this.pending = { round: s.round, ready: false };
    this.send({ t: 'unlock', round: s.round });
    this.emit();
  }

  finishedWatching(round: number): void {
    const s = this.snap;
    if (!s || s.round !== round || s.phase !== 'fight' || s.done[1]) return;
    s.done[1] = true;
    this.send({ t: 'done', round });
    this.emit();
  }

  rematch(): void {
    const s = this.snap;
    if (!s || s.rematch[1] || matchWinner(s.results) === -1) return;
    s.rematch[1] = true;
    this.send({ t: 'rematch', id: s.id });
    this.emit();
  }

  protected sendBye(): void {
    this.send({ t: 'bye' });
  }

  close(): void {
    super.close();
    setTimeout(() => this.link.close(), 300);
  }
}
