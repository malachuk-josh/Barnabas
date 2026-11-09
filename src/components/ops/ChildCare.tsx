import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { inboxHref } from "@/components/inbox/MessageParent";
import { friendlyDate } from "@/lib/dates";
import type { MyFamily } from "@/lib/kids/parents";
import type { Profile } from "@/lib/profile";

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** A member's Child care page: their own children and today's status, and a way to reach the kids team. */
export function ChildCare({ profile, date, families, kidsTeam }: { profile: Profile; date: string; families: MyFamily[]; kidsTeam: string[] }) {
  const message = kidsTeam.length ? (
    <Link className="btn btn-primary" href={inboxHref(kidsTeam)}>
      Message the kids team
    </Link>
  ) : null;
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Child care</span>
          <h1>Your children</h1>
          <p className="muted">Where your children are today, {friendlyDate(date)}. The kids team can message you here during a service, and you can message them.</p>
        </div>
        {message}
      </div>
      {families.length === 0 ? (
        <div className="card stack" style={{ maxWidth: 560 }}>
          <p>We haven&apos;t found your family in the kids records yet.</p>
          <p className="muted small">The kids team links families by a parent&apos;s email. Send them a message and they&apos;ll add yours, so you can see when your children are checked in.</p>
          {message && <div>{message}</div>}
        </div>
      ) : (
        <div className="fin-grid child-care">
          {families.map((f, i) => (
            <section key={i} className="fin-card">
              <h2>{f.name} family</h2>
              {f.children.length ? (
                <ul className="kids-roster child-care-list">
                  {f.children.map((c, j) => (
                    <li key={j}>
                      <strong>{c.firstName}</strong>
                      {c.status ? (
                        c.status.state === "in" ? (
                          <span className="small">
                            <span className="pill pill-ok">Checked in</span> {c.status.room} · since {time(c.status.checkedInAt)}
                          </span>
                        ) : (
                          <span className="small muted">Picked up at {time(c.status.checkedOutAt ?? c.status.checkedInAt)}</span>
                        )
                      ) : (
                        <span className="small muted">Not checked in today</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No children on file for this family yet.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
