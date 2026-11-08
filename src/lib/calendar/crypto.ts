import { sessionSecret } from "../config";

/** AES-GCM encryption for calendar tokens at rest, keyed from SESSION_SECRET. */

let keyPromise: Promise<CryptoKey> | null = null;

function key() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const secret = sessionSecret();
      const material = new Uint8Array([...secret, ...new TextEncoder().encode(":calendar-tokens")]);
      const digest = await crypto.subtle.digest("SHA-256", material);
      return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
    })();
  }
  return keyPromise;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function open(sealed: string): Promise<string> {
  const [iv, data] = sealed.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(data));
  return new TextDecoder().decode(plain);
}

/** For tests: forget the cached key. */
export function resetKey() {
  keyPromise = null;
}
