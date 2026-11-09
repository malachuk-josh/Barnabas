/**
 * MEMBER SIGN-IN SEAM (not built in this pass). The member app (/m) is public and read-only apart from
 * its forms. Member sign-in by email link plugs in here once the People database and Resend are in:
 *
 *   1. POST /api/s/member/link {email}: look the email up in People (`personByEmail` in ./public.ts reads
 *      src/lib/people), and if it's a member, send a one-time link through the Resend email sender in
 *      src/lib/messages (token: 32 random bytes, stored by its SHA-256 hash, 15 minutes).
 *   2. GET /m/signin/{token}: verify, then set a separate `barnabas_member` cookie (never the leader
 *      session cookie), signed with SESSION_SECRET, scoped to path /m.
 *   3. memberSession() below reads that cookie; member-only tabs (directory, giving history, serving
 *      sign-ups) check it on the server.
 *
 * Until then it always returns null, and nothing in the member app depends on who is looking.
 */
export type MemberSession = { churchId: string; personId: string; name: string };

export async function memberSession(): Promise<MemberSession | null> {
  return null;
}
