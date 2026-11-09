import { getJSON, kv, setJSON } from "../store";
import { hashPassword, verifyPassword, type PasswordHash } from "./password";

/**
 * The internal password store: one hashed credential per leader at `cred:{church}:{leaderId}`, kept apart
 * from the leader record and profile and never put in a session. Nothing here returns a hash or a password
 * to a caller outside this module, except whether one exists and whether it must be replaced.
 */
type Credential = PasswordHash & {
  setAt: number;
  /** Set by the owner as a temporary password: the leader must choose their own at next sign-in. */
  mustChangePassword?: boolean;
};

export const credKey = (churchId: string, leaderId: string) => `cred:${churchId}:${leaderId}`;

export async function setPassword(churchId: string, leaderId: string, password: string, opts: { temporary?: boolean } = {}) {
  const hash = await hashPassword(password);
  const cred: Credential = { ...hash, setAt: Date.now(), ...(opts.temporary ? { mustChangePassword: true } : {}) };
  await setJSON(credKey(churchId, leaderId), cred);
}

export type CredentialState = { hasPassword: boolean; mustChangePassword: boolean };

export async function credentialState(churchId: string, leaderId: string): Promise<CredentialState> {
  const cred = await getJSON<Credential>(credKey(churchId, leaderId));
  return { hasPassword: Boolean(cred), mustChangePassword: Boolean(cred?.mustChangePassword) };
}

/** "none" when no password is set; otherwise whether it matched. */
export async function checkStoredPassword(churchId: string, leaderId: string, password: string): Promise<"none" | "match" | "mismatch"> {
  const cred = await getJSON<Credential>(credKey(churchId, leaderId));
  if (!cred) return "none";
  return (await verifyPassword(password, cred)) ? "match" : "mismatch";
}

export async function deletePassword(churchId: string, leaderId: string) {
  await kv().del(credKey(churchId, leaderId));
}
