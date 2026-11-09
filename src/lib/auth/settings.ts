import { getJSON, setJSON } from "../store";

/** Who may create an account by signing in. "invite": only people the owner added. "code": anyone with the church access code. */
export type JoinPolicy = "invite" | "code";
export const JOIN_POLICIES: readonly JoinPolicy[] = ["invite", "code"];

type AuthSettings = { join: JoinPolicy; setBy?: string; setAt?: number };
const key = (churchId: string) => `authsettings:${churchId}`;

export async function joinPolicy(churchId: string): Promise<JoinPolicy> {
  const s = await getJSON<AuthSettings>(key(churchId));
  return s?.join === "code" ? "code" : "invite";
}

export async function setJoinPolicy(churchId: string, join: JoinPolicy, setBy: string) {
  await setJSON(key(churchId), { join, setBy, setAt: Date.now() } satisfies AuthSettings);
}
