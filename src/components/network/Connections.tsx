"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { Link } from "@/lib/network/types";
import { networkPost } from "./client";

const STATUS: Record<Link["status"], string> = { connected: "Connected", awaiting_them: "Waiting for their administrator", awaiting_us: "Asking to connect with you" };

export function Connections({ links, admin, me }: { links: Link[]; admin: boolean; me: string }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [redeem, setRedeem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasExample = links.some((l) => l.example);

  async function run(body: unknown, after?: (r: Record<string, unknown>) => void) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await networkPost(body);
      after?.(r);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fin-grid-2">
      <section className="fin-card stack">
        <h2>Your connections</h2>
        {links.length === 0 ? (
          <EmptyState compact title="No connections yet">
            {me} isn&apos;t connected to any church. Connecting takes an invite code from one church and a yes from an administrator at each.
          </EmptyState>
        ) : (
          <ul className="list">
            {links.map((l) => (
              <li key={l.peer} className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{l.peerName}</strong>
                  <span className={`badge${l.status === "connected" ? " badge-ok" : " badge-warn"}`}>{STATUS[l.status]}</span>
                </div>
                {admin && (
                  <div className="row">
                    {l.status === "awaiting_us" && (
                      <>
                        <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void run({ action: "answer", peer: l.peer, approve: true })}>
                          Approve
                        </button>
                        <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void run({ action: "answer", peer: l.peer, approve: false })}>
                          Decline
                        </button>
                      </>
                    )}
                    {l.status !== "awaiting_us" && (
                      <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void run({ action: "disconnect", peer: l.peer })}>
                        {l.status === "connected" ? "Disconnect" : "Cancel request"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">Connected churches see what each of you chooses to share, and nothing else: no people, rosters, giving or care.</p>
      </section>
      <section className="fin-card stack" data-no-pull>
        <h2>Connect with a church</h2>
        {!admin ? (
          <p className="small muted">An administrator of your church makes and accepts connections. Ask them if there&apos;s a church you&apos;d like to share with.</p>
        ) : (
          <>
            <div className="stack" style={{ gap: 8 }}>
              <h3>1. Invite a church</h3>
              <p className="small muted">Make a code and give it to a leader at the other church (by phone or email). It works once, for seven days.</p>
              {code ? (
                <p className="mesa-code" aria-live="polite">
                  <code>{code.code}</code>
                  <span className="small muted">Expires {new Date(code.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. It won&apos;t be shown again.</span>
                </p>
              ) : (
                <button className="btn" type="button" disabled={busy} onClick={() => void run({ action: "invite" }, (r) => setCode(r as { code: string; expiresAt: number }))}>
                  Make an invite code
                </button>
              )}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <h3>2. Or enter a code you were given</h3>
              <div className="row">
                <input type="text" aria-label="Invite code" value={redeem} onChange={(e) => setRedeem(e.target.value.toUpperCase())} placeholder="MESA-XXXX-XXXX-XXXX" style={{ flex: "1 1 200px", width: "auto" }} />
                <button className="btn btn-primary" type="button" disabled={busy || redeem.trim().length < 6} onClick={() => void run({ action: "redeem", code: redeem }, (r) => { setNote(`Request sent to ${String(r.peerName)}. Their administrator approves it next.`); setRedeem(""); })}>
                  Ask to connect
                </button>
              </div>
            </div>
            {!hasExample && (
              <div className="stack" style={{ gap: 8 }}>
                <h3>See how it works</h3>
                <p className="small muted">Add a clearly fictional example church with three sample resources. Remove it any time.</p>
                <button className="btn" type="button" disabled={busy} onClick={() => void run({ action: "example" })}>
                  Add Example church (demo)
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="notice success" role="status">{note}</p>}
      </section>
    </div>
  );
}
