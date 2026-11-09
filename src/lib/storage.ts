/**
 * localStorage, for a browser that may not let you have it.
 *
 * Reading `window.localStorage` is not a safe expression. Firefox and Chrome
 * throw a SecurityError outright when storage is blocked by policy — a
 * strict-privacy profile, a cross-origin iframe, Safari with cookies denied,
 * an embedded webview. Not "returns null": throws, on the property access
 * itself, before any key is named.
 *
 * That mattered here more than it usually does, because the throw sites were
 * a language provider and a fetch helper that sit above and beneath the whole
 * app. One SecurityError in a provider's effect and React unmounts the tree:
 * every reader in that browser got a blank page and no way to guess why.
 *
 * So: one door, and it never throws. A read that cannot happen is `null`,
 * which every caller already had to handle for the first-visit case; a write
 * that cannot happen is dropped, which costs a preference and not the app.
 */

/** Read a key, or null if storage is unavailable, empty, or unreadable. */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key. Silently does nothing where storage is denied or full. */
export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // denied, or over quota — the preference is lost, the app is not
  }
}

/** Remove a key. Silently does nothing where storage is denied. */
export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nothing to be done, and nothing that needs saying
  }
}

/** Whether storage can actually be used — for the rare caller that must know. */
export function storageAvailable(): boolean {
  try {
    const probe = "__communion_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
