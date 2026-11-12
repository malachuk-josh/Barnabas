"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { Link } from "@/lib/network/types";
import { networkPost } from "./client";
import { churchInitials } from "./LibrarySearch";

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

  const connected = links.filter((l) => l.status === "connected").length;
  return (
    <div className="mesa-conn">
      <div className="mesa-conn-main">
        <section className="fin-card mesa-conn-list" aria-labelledby="mesa-conn-h">
          <div className="fin-card-head">
            <h2 id="mesa-conn-h">Your connections</h2>
            {links.length > 0 && <span className="small muted">{connected} connected</span>}
          </div>
          {links.length === 0 ? (
            <EmptyState compact title="No connections yet">
              {me} isn&apos;t connected to any church. Connecting takes an invite code from one church and a yes from an administrator at each.
            </EmptyState>
          ) : (
            <ul className="mesa-churches">
              {links.map((l) => (
                <li key={l.peer}>
                  <span className="mesa-church-mark" aria-hidden="true">
                    {churchInitials(l.peerName)}
                  </span>
                  <span className="mesa-church-text">
                    <strong>{l.peerName}</strong>
                    <span className={`mesa-status is-${l.status}`}>{STATUS[l.status]}</span>
                  </span>
                  {admin && (
                    <span className="mesa-church-actions">
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
                        <button className="btn btn-sm btn-quiet" type="button" disabled={busy} onClick={() => void run({ action: "disconnect", peer: l.peer })}>
                          {l.status === "connected" ? "Disconnect" : "Cancel request"}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mesa-boundary" aria-label="What connected churches see">
          <div>
            <h3>What connected churches see</h3>
            <p className="small">Only what each church chooses to share: sermon series, service templates, co-laborer training, event ideas and needs.</p>
          </div>
          <div>
            <h3>What they never see</h3>
            <p className="small">People, rosters, giving, shepherding or anything about children. Names and contact details are removed before anything leaves.</p>
          </div>
        </section>
      </div>
      <section className="fin-card mesa-connect" data-no-pull aria-labelledby="mesa-connect-h">
        <h2 id="mesa-connect-h">Connect with a church</h2>
        {!admin ? (
          <p className="small muted">An administrator of your church makes and accepts connections. Ask them if there&apos;s a church you&apos;d like to share with.</p>
        ) : (
          <>
            <ol className="mesa-steps">
              <li>
                <h3>Invite a church</h3>
                <p className="small muted">Make a code and give it to a leader at the other church, by phone or email. It works once, for seven days.</p>
                {code ? (
                  <div className="mesa-code" aria-live="polite">
                    <code>{code.code}</code>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(code.code).then(() => setNote("Code copied."), () => undefined);
                      }}
                    >
                      Copy
                    </button>
                    <span className="small muted">Expires {new Date(code.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. It won&apos;t be shown again.</span>
                  </div>
                ) : (
                  <button className="btn" type="button" disabled={busy} onClick={() => void run({ action: "invite" }, (r) => setCode(r as { code: string; expiresAt: number }))}>
                    Make an invite code
                  </button>
                )}
              </li>
              <li>
                <h3>Or enter a code you were given</h3>
                <p className="small muted">Their administrator approves the request next.</p>
                <div className="mesa-redeem">
                  <input type="text" aria-label="Invite code" value={redeem} onChange={(e) => setRedeem(e.target.value.toUpperCase())} placeholder="MESA-XXXX-XXXX-XXXX" />
                  <button className="btn btn-primary" type="button" disabled={busy || redeem.trim().length < 6} onClick={() => void run({ action: "redeem", code: redeem }, (r) => { setNote(`Request sent to ${String(r.peerName)}. Their administrator approves it next.`); setRedeem(""); })}>
                    Ask to connect
                  </button>
                </div>
              </li>
            </ol>
            {!hasExample && (
              <p className="small muted mesa-example">
                Want to see how it works first?{" "}
                <button className="linklike" type="button" disabled={busy} onClick={() => void run({ action: "example" })}>
                  Add a fictional example church
                </button>{" "}
                with three sample resources. Remove it any time.
              </p>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="notice success" role="status">{note}</p>}
      </section>
    </div>
  );
}
