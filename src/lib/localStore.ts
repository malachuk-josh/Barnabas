"use client";

// A small IndexedDB wrapper: the device's own copy of your bookmarks,
// collections and notes, plus the outbox of changes not yet on the server.
// No dependency — three object stores and a handful of promises.

const DB_NAME = "barnabas-word";
const DB_VERSION = 2;

/** Snapshot of server-shaped state, so the reader can paint before any fetch. */
export const STATE_STORE = "state";
/** Notes, one record per book: { book, notes: { "ch:v": text } } */
export const NOTES_STORE = "notes";
/** Changes waiting for a connection, applied in the order they were made.
 *  Keyed on "seq", deliberately not "id": collection ops carry an id of
 *  their own, and a keyPath of "id" silently used it as the primary key. */
export const OUTBOX_STORE = "outbox";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("no indexedDB"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          db.createObjectStore(NOTES_STORE);
        }
        // v1 keyed the outbox on "id"; recreate it on "seq"
        if (db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.deleteObjectStore(OUTBOX_STORE);
        }
        db.createObjectStore(OUTBOX_STORE, {
          keyPath: "seq",
          autoIncrement: true,
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export function getLocal<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>)
    .then((v) => v ?? null)
    .catch(() => null);
}

export function putLocal(
  store: string,
  key: IDBValidKey,
  value: unknown
): Promise<void> {
  return run(store, "readwrite", (s) => s.put(value, key))
    .then(() => undefined)
    .catch(() => undefined);
}

// Where ops go when IndexedDB won't take them — Safari private mode, a full
// disk, storage blocked by settings. Losing the write silently would be the
// worst outcome: the change is on screen and nothing is coming for it. These
// last only as long as the tab, which is honest and far better than nothing.
const memoryQueue: (SyncOp & { seq: number })[] = [];
let memorySeq = -1;

/** Queue a change for the server. */
export async function pushOutbox(op: SyncOp): Promise<void> {
  try {
    // autoIncrement fills in "seq"; the op keeps every field it came with
    await run(OUTBOX_STORE, "readwrite", (s) => s.add(op));
  } catch {
    // negative seqs can never collide with IndexedDB's positive ones
    memoryQueue.push({ ...op, seq: memorySeq-- });
  }
}

export function readOutbox(): Promise<(SyncOp & { seq: number })[]> {
  return run<(SyncOp & { seq: number })[]>(
    OUTBOX_STORE,
    "readonly",
    (s) => s.getAll() as IDBRequest<(SyncOp & { seq: number })[]>
  )
    .catch(() => [])
    .then((rows) => [...memoryQueue, ...rows]);
}

export async function dropOutbox(seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  for (const seq of seqs) {
    if (seq >= 0) continue;
    const at = memoryQueue.findIndex((op) => op.seq === seq);
    if (at >= 0) memoryQueue.splice(at, 1);
  }
  const stored = seqs.filter((seq) => seq >= 0);
  if (stored.length === 0) return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, "readwrite");
      const store = tx.objectStore(OUTBOX_STORE);
      for (const seq of stored) store.delete(seq);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // leaving them queued is safe: every op is idempotent
  }
}

/**
 * Every book's notes this device is holding, keyed by book number.
 *
 * The reader stores one record per book, so there is no single place that
 * knows what you have written across the whole Bible. The journal needs
 * exactly that, and needs it offline, so read the keys and the values in one
 * transaction — getAll() alone loses which book each record belongs to.
 */
export async function readAllNotes(): Promise<
  Record<number, Record<string, string>>
> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, "readonly");
      const store = tx.objectStore(NOTES_STORE);
      const keys = store.getAllKeys();
      const values = store.getAll();
      tx.oncomplete = () => {
        const out: Record<number, Record<string, string>> = {};
        keys.result.forEach((key, i) => {
          const book = Number(key);
          const value = values.result[i] as Record<string, string>;
          if (book && value) out[book] = value;
        });
        resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return {};
  }
}

/** Forget everything this device holds — used when the account changes. */
export async function clearLocalData(): Promise<void> {
  memoryQueue.length = 0;
  for (const store of [STATE_STORE, NOTES_STORE, OUTBOX_STORE]) {
    await run(store, "readwrite", (s) => s.clear()).catch(() => undefined);
  }
}

/** Every change the app can make to your own data, as a replayable record. */
export type SyncOp =
  | { kind: "bookmark.set"; key: string; t: number; l?: string; c?: string; o?: number; ts: number }
  | { kind: "bookmark.del"; key: string; ts: number }
  | { kind: "collection.set"; id: string; name: string; ts: number }
  | { kind: "collection.del"; id: string; ts: number }
  | { kind: "note.set"; book: number; ref: string; text: string; ts: number }
  | { kind: "plan.set"; id: string; done: number; on?: string; ts: number }
  | { kind: "plan.del"; id: string; ts: number };
