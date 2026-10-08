import type { CharacterBuild } from '../sim/loadout';

/** Bumped when messages change shape; peers on different protocols refuse to pair. */
export const PROTOCOL = 1;
/** Victories needed to take the match (best of five). */
export const WINS_NEEDED = 3;
/** Seconds to pick a build: longer for the first round. */
export const PICK_SECONDS_FIRST = 60;
export const PICK_SECONDS = 40;

export type Side = 0 | 1;

export interface RoundResult {
  round: number;
  winner: Side | -1;
  reason: 'ko' | 'time';
  /** Both devices simulated the round and their results differed (the host's counts). */
  desync?: boolean;
}

/**
 * The whole match as the host sees it, sent to the guest on every change.
 * Side 0 is the host (blue corner), side 1 the guest (red corner).
 */
export interface Snapshot {
  id: string;
  round: number;
  phase: 'pick' | 'fight' | 'over';
  /** While picking: the builds each side fought with last (their starting build in round 1).
   *  While fighting: the builds locked in for this round. */
  builds: [CharacterBuild, CharacterBuild];
  ready: [boolean, boolean];
  /** Milliseconds of picking left when this snapshot was sent. */
  pickLeft: number;
  seed: number;
  results: RoundResult[];
  /** Finished watching this round's fight. */
  done: [boolean, boolean];
  rematch: [boolean, boolean];
  /** The guest is disconnected: the pick timer is frozen. */
  held: boolean;
}

export type GuestMsg =
  | { t: 'hello'; proto: number; version: string; matchId?: string; build: CharacterBuild }
  | { t: 'lock'; round: number; build: CharacterBuild }
  | { t: 'unlock'; round: number }
  | { t: 'verdict'; round: number; hash: string; checks: string[] }
  | { t: 'done'; round: number }
  | { t: 'rematch'; id: string };

export type HostMsg =
  | { t: 'state'; s: Snapshot }
  | { t: 'reject'; reason: 'version' | 'full'; version: string };

export type CommonMsg = { t: 'ping' } | { t: 'pong' } | { t: 'bye' };

export type Msg = GuestMsg | HostMsg | CommonMsg;

/** Cheap shape check on anything that arrives from the network. */
export function asMsg(raw: unknown): Msg | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = (raw as { t?: unknown }).t;
  return typeof t === 'string' ? (raw as Msg) : null;
}

export function scoreOf(results: RoundResult[], uptoRound = Infinity): [number, number] {
  const s: [number, number] = [0, 0];
  for (const r of results) if (r.round <= uptoRound && r.winner !== -1) s[r.winner]++;
  return s;
}

export function matchWinner(results: RoundResult[], uptoRound = Infinity): Side | -1 {
  const [a, b] = scoreOf(results, uptoRound);
  return a >= WINS_NEEDED ? 0 : b >= WINS_NEEDED ? 1 : -1;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function newRoomCode(): string {
  let s = '';
  const r = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[r[i] % CODE_CHARS.length];
  return s;
}

/** Upper-cases a typed code and drops anything that can't be in one. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);
}

export function randomId(): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return r[0].toString(36) + r[1].toString(36);
}
