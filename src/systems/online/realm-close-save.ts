// The save a realm character leaves with when its tab is closed.
//
// A closing page cannot pack a save: packing is asynchronous, and the page is gone before it finishes. Unpacked, a save
// is far over the browser's keepalive quota. So the save is composed and packed ahead, on a short timer and as the page
// is hidden, and nothing is sent until the page goes. Then the packed save goes with keepalive, and the service releases
// the seat in the same update (the account service's `x-realm-leave` header). No separate leave goes, so the release can
// never land before the save.
//
// A save whose packed size is over the budget cannot go at close. While a character's save is over it, the realm is
// saved about once a minute instead, and only when the save changed since the last that landed (the session's idle
// skip). At close such a character sends the plain keepalive leave.
import { canGzip, gzipText } from '../../net/realm/realmSaveCodec.js';
import { realmSaveWithHeld } from '../realmSaves.js';

/** The browser lets a page have 64 KiB of keepalive bodies in flight. The page's other keepalive bodies at close
 *  (Renown's report, a held death's tombstone) are small JSON, each under 1 KiB, so 4 KiB is left for them. */
export const REALM_CLOSE_SAVE_BUDGET = 60 * 1024;
/** How often a save under the budget is composed and packed: the most play a closed tab can lose. */
export const REALM_CLOSE_STAGE_MS = 15_000;
/** How often a save over the budget is checked and, when it changed, saved to the realm. */
export const REALM_OVER_BUDGET_SAVE_MS = 60_000;

/** The parts of the realm session (systems/realmSaves.js createRealmSession) this module uses. */
export interface RealmCloseSession {
  readonly seq: number;
  readonly lost: string | null;
  checkpoint(text: string, summary: unknown): Promise<unknown>;
  idle<T>(fn: () => T): T;
  leave(opts: { keepalive: boolean; closing: ClosingSave | null }): Promise<unknown>;
  rejoin(): Promise<unknown>;
}

/** A packed save ready to go at close, composed while the record stood at `seq`. */
export interface ClosingSave {
  seq: number;
  bytes: Uint8Array;
  summary: unknown;
}

/** The page's document as this module reads it (no DOM types: Node's tests type-check this file too). */
export type PageDocument = EventTarget & { visibilityState?: string };

export interface RealmCloseHost {
  session: RealmCloseSession;
  /** Composes the save the next checkpoint would send and hands it to `sink`; answers false where no checkpoint may
   *  go now (the gate the periodic checkpoint asks, the death screen). */
  compose: (sink: (snap: unknown) => unknown) => unknown;
  /** The spoils records the pack holds, named in the save so the next boot does not hand them again. */
  held: () => unknown;
  summary: () => unknown;
  /** Runs before the seat goes as the page goes: a death held for a Resurrect is decided first. */
  pageGone?: () => void;
  win?: EventTarget | null;
  doc?: PageDocument | null;
  pack?: (text: string) => Promise<Uint8Array>;
  later?: (fn: () => void, ms: number) => void;
  budget?: number;
}

export interface RealmCloseWatch {
  /** Composes and packs the save now (the timer's and the hidden page's step). */
  stage(): Promise<void>;
  /** The page goes: the closing save with the seat's release, or the plain leave. */
  close(): void;
  /** The packed save that would go at close now, or null. */
  readonly closing: ClosingSave | null;
  readonly overBudget: boolean;
}

/** A timer that never holds a Node process open (a test that stands a session), as a browser's never does. */
function laterWithoutHold(fn: () => void, ms: number): void {
  const timer: unknown = setTimeout(fn, ms);
  (timer as { unref?: () => void }).unref?.();
}

/** Watches a realm session's page and keeps its closing save ready. */
export function watchRealmClose(host: RealmCloseHost): RealmCloseWatch {
  const session = host.session;
  const win = host.win === undefined ? globalThis : host.win;
  const doc = host.doc === undefined ? ((globalThis as { document?: PageDocument }).document ?? null) : host.doc;
  const pack = host.pack ?? gzipText;
  const later = host.later ?? laterWithoutHold;
  const budget = host.budget ?? REALM_CLOSE_SAVE_BUDGET;
  let staged: ClosingSave | null = null;
  let overBudget = false;
  let staging = false;

  function composeNow(): { text: string; summary: unknown } | null {
    let snap: unknown = null;
    const allowed = host.compose((composed) => {
      snap = composed;
      return null;
    });
    if (!allowed || snap == null) return null;
    return { text: realmSaveWithHeld(snap, host.held()), summary: host.summary() };
  }

  async function stage(): Promise<void> {
    if (staging || session.lost || !canGzip()) return;
    staging = true;
    try {
      const seq = session.seq;
      const save = composeNow();
      if (!save) return;
      const bytes = await pack(save.text);
      // A save that landed or a trade that moved the record while this one packed makes it older than the record.
      if (session.seq !== seq || session.lost) return;
      overBudget = bytes.byteLength > budget;
      staged = overBudget ? null : { seq, bytes, summary: save.summary };
      // Sent only if it differs from the last save that landed: the idle skip answers an unchanged one.
      if (overBudget) void session.idle(() => session.checkpoint(save.text, save.summary));
    } catch (e) {
      console.warn('[realm] the closing save was not packed', e);
    } finally {
      staging = false;
    }
  }

  function closingNow(): ClosingSave | null {
    if (overBudget || !staged || staged.seq !== session.seq) return null;
    return staged;
  }

  function close(): void {
    host.pageGone?.();
    void session.leave({ keepalive: true, closing: closingNow() });
  }

  function tick(): void {
    // A session left as the page went may come back from the back-forward cache; any other end is final.
    if (session.lost && session.lost !== 'left') return;
    void stage().finally(() => {
      later(tick, overBudget ? REALM_OVER_BUDGET_SAVE_MS : REALM_CLOSE_STAGE_MS);
    });
  }

  // pagehide comes after the unload guard's "Leave site?" is answered, so a player who stays never reaches it.
  win?.addEventListener('pagehide', close);
  win?.addEventListener('pageshow', (e: Event) => {
    if ((e as Event & { persisted?: boolean }).persisted) void session.rejoin();
  });
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') void stage();
  });
  later(tick, REALM_CLOSE_STAGE_MS);

  return {
    stage,
    close,
    get closing() {
      return closingNow();
    },
    get overBudget() {
      return overBudget;
    },
  };
}
