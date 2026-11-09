"use client";

// Local-first writes. Every change lands in IndexedDB and the outbox first,
// so the UI never waits on a network it may not have; the outbox drains to
// /api/sync whenever there is a connection. Operations state intent rather
// than a delta, so replaying a batch that half-landed is safe.

import { api } from "@/lib/client";
import {
  clearLocalData,
  dropOutbox,
  getLocal,
  putLocal,
  pushOutbox,
  readOutbox,
  STATE_STORE,
  NOTES_STORE,
  type SyncOp,
} from "@/lib/localStore";

export interface BmEntry {
  t: number;
  l?: string;
  c?: string;
  /** where it sits when its collection has been put in an order by hand */
  o?: number;
}
export interface BmCollection {
  name: string;
  share?: string;
}
export interface LocalState {
  bookmarks: Record<string, BmEntry>;
  collections: Record<string, BmCollection>;
  /** reading-plan progress: { planId: days completed } */
  plans: Record<string, number>;
  /** which account this copy belongs to */
  who?: string;
}

const STATE_KEY = "bookmarks";

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let pending = 0;
let flushing: Promise<LocalState | null> | null = null;
let lastFlushFailed = false;
/** Who the server says we are, and when it last said so. */
let identity: string | null = null;
let identityAt = 0;
/** Long enough to spare a round trip per keystroke, short enough to notice. */
const IDENTITY_TTL = 30_000;

function announce() {
  for (const fn of listeners) fn(pending);
}

/** Watch how many changes are still waiting to reach the server. */
export function onPendingChange(fn: Listener): () => void {
  listeners.add(fn);
  fn(pending);
  return () => listeners.delete(fn);
}

export function pendingCount(): number {
  return pending;
}

async function refreshPending() {
  pending = (await readOutbox()).length;
  announce();
}

/**
 * Settle who this device's data belongs to, before anything is sent.
 *
 * This has to happen first. The outbox is a list of changes with no owner
 * written on it — flushing it under a different session would file one
 * person's notes into another person's account, and the reply would then
 * overwrite the first person's copy. So: ask who we are, and if the answer
 * differs from whoever this device was holding data for, drop that data
 * (including the queue) rather than send it somewhere it does not belong.
 *
 * Throws when the server can't be reached, which is what stops a flush.
 */
export async function ensureIdentity(): Promise<string> {
  // The answer goes stale: someone can sign in, or out, without this module
  // ever unloading. Trusting a cached identity across that is exactly how one
  // person's queue ends up in another person's account.
  if (identity && Date.now() - identityAt < IDENTITY_TTL) return identity;
  const res = await api<{ who: string }>("/api/sync");
  identity = res.who;
  identityAt = Date.now();
  const local = await readLocalState();
  if (local?.who && local.who !== res.who) {
    await clearLocalData();
    // (Communion also cleared its service worker's API cache here; Barnabas
    // has no service worker, so there is nothing else to clear.)
    await refreshPending();
  }
  return res.who;
}

/** Reconcile against a `who` that came back with some other response. */
export async function adoptIdentity(who: string | undefined): Promise<boolean> {
  if (!who) return false;
  if (!identity) {
    identity = who;
    identityAt = Date.now();
  }
  const local = await readLocalState();
  if (!local || !local.who || local.who === who) return false;
  await clearLocalData();
  await refreshPending();
  return true;
}

/** The device's own copy — instant, and all there is when offline. */
export function readLocalState(): Promise<LocalState | null> {
  return getLocal<LocalState>(STATE_STORE, STATE_KEY);
}

/**
 * Merge into the device's copy. Callers pass only what they changed: a
 * handler that adds a collection holds a bookmarks value from before some
 * other handler's update, and writing both would put the stale one back.
 * The owner stamp is preserved — an ownerless snapshot is one the identity
 * check can't recognise as somebody else's.
 */
export async function writeLocalState(
  state: Partial<LocalState>
): Promise<void> {
  const prev = await readLocalState();
  return putLocal(STATE_STORE, STATE_KEY, {
    bookmarks: state.bookmarks ?? prev?.bookmarks ?? {},
    collections: state.collections ?? prev?.collections ?? {},
    plans: state.plans ?? prev?.plans ?? {},
    who: state.who ?? identity ?? prev?.who,
  });
}

export function readLocalNotes(book: number): Promise<Record<string, string> | null> {
  return getLocal<Record<string, string>>(NOTES_STORE, book);
}

export { readAllNotes as readLocalNotesAll } from "@/lib/localStore";

export function writeLocalNotes(
  book: number,
  notes: Record<string, string>
): Promise<void> {
  return putLocal(NOTES_STORE, book, notes);
}

/** Record a change locally and try to send it. Never throws, never blocks. */
export async function enqueue(op: SyncOp): Promise<void> {
  await pushOutbox(op);
  await refreshPending();
  void flush();
}

/** The server rejects a batch larger than this, so send it in slices. */
const BATCH = 200;

/**
 * Drain the outbox. Ops are sent in batches and each batch's rows are dropped
 * only once the server has taken them, so nothing is lost if the connection
 * dies partway. Returns the reconciled state if anything was sent.
 */
export function flush(): Promise<LocalState | null> {
  // the guard and the assignment must not be separated by an await, or two
  // callers both pass it and send the same ops twice
  if (flushing) return flushing.then(() => null);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve(null);
  }
  flushing = (async (): Promise<LocalState | null> => {
    let result: LocalState | null = null;
    try {
      // never send a queue without knowing whose account it lands in
      await ensureIdentity();
      for (;;) {
        const queued = (await readOutbox()).slice(0, BATCH);
        if (queued.length === 0) break;
        const ops = queued.map(({ seq: _seq, ...op }) => op);
        const res = await api<{
          who?: string;
          applied: number;
          rejected: number;
          bookmarks: Record<string, BmEntry>;
          collections: Record<string, BmCollection>;
          plans: Record<string, number>;
        }>("/api/sync", {
          method: "POST",
          // The clock this reader actually lives in. Sent here because the
          // outbox drains from every device constantly, so it stays current
          // when somebody travels — and because reminders are worth nothing
          // if they announce a Wednesday session at the wrong hour. It was
          // only ever recorded when a plan reminder was set, which left it
          // unknown for most people and UTC for everyone else.
          body: { ops, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
        });
        // only drop this batch — anything queued meanwhile keeps its place
        await dropOutbox(queued.map((o) => o.seq));
        result = {
          bookmarks: res.bookmarks,
          collections: res.collections,
          plans: res.plans,
          who: res.who,
        };
      }
      if (result) {
        // A change made while the request was in flight is still queued, so
        // the server's answer does not know about it. Writing it as-is would
        // erase it from this device until the next flush; leave the snapshot
        // alone and let that flush reconcile.
        if ((await readOutbox()).length === 0) await writeLocalState(result);
        else result = null;
      }
    } catch {
      // still offline, or the server said no: the queue keeps its place
      lastFlushFailed = true;
    } finally {
      flushing = null;
      await refreshPending();
    }
    if (result) lastFlushFailed = false;
    return result;
  })();
  return flushing;
}

/** True when the last attempt to reach the server failed outright. */
export function flushFailed(): boolean {
  return lastFlushFailed;
}

let wired = false;

/** Flush on reconnect, on returning to the app, and once at startup. */
export function startSync(): () => void {
  void refreshPending();
  if (wired) return () => {};
  wired = true;
  const recheck = () => {
    identityAt = 0; // whoever we were, confirm it before sending anything
    void flush();
  };
  const onOnline = recheck;
  const onVisible = () => {
    if (document.visibilityState === "visible") recheck();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  void flush();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    wired = false;
  };
}
