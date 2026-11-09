import Link from "next/link";
import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { TalkIcon } from "@/components/icons";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { PersonForm } from "@/components/people/PersonForm";
import { ArchiveButton, HouseholdEditor, Notes } from "@/components/people/PersonPanels";
import { addDays, daysBetween, friendlyDate, today } from "@/lib/dates";
import { radarNow } from "@/lib/engine/briefing";
import { TERMS } from "@/lib/language";
import { formatPhone } from "@/lib/messages/phone";
import { gathering } from "@/lib/ops/gatherings";
import { displayName, isActive } from "@/lib/people/native";
import { peopleFor, personView } from "@/lib/people/service";
import { MEMBER_LABELS, ROLE_LABELS } from "@/lib/people/types";
import { loadServe } from "@/lib/serve/service";

export const dynamic = "force-dynamic";

/** "March 4, 1980"; a birthday stored without a year (1900) reads "March 4". */
const fmt = (iso?: string) => (!iso ? undefined : new Date(`${iso.startsWith("1900-") ? `2000${iso.slice(4)}` : iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: iso.startsWith("1900-") ? undefined : "numeric", timeZone: "UTC" }));

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The next time a mm-dd comes round, and how many days away it is. */
function nextBirthday(mmdd: string, now: string) {
  const year = Number(now.slice(0, 4));
  let date = `${year}-${mmdd}`;
  if (date < now) date = `${year + 1}-${mmdd}`;
  return { date, days: daysBetween(now, date) };
}

/** Weeks of attendance to draw as dots, oldest first. */
const WEEKS = 12;

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { id } = await params;
  const { actor, book } = await peopleFor(leader);
  const p = book.people.find((x) => x.id === id);
  if (!p) notFound();
  if (p.mergedInto) redirect(`/people/${p.mergedInto}`);
  const editing = (await searchParams).edit === "1" && actor.edit;
  const v = personView(book, actor, p);
  const household = p.householdId ? book.households.find((h) => h.id === p.householdId) : undefined;
  const members = household ? book.people.filter((x) => x.householdId === household.id && isActive(x)) : [];
  const now = today();
  const since = addDays(now, -7 * WEEKS);
  const present = book.attendance.filter((a) => a.personId === p.id && a.present);
  const attended = present.filter((a) => a.date > since);
  const lastSeen = [...present].sort((a, b) => b.date.localeCompare(a.date))[0];
  const notes = actor.notes ? book.notes.filter((n) => n.personId === p.id && (!n.private || actor.privateNotes)).sort((a, b) => b.at - a.at) : [];
  const directory = book.people.filter(isActive).map((x) => ({ id: x.id, name: displayName(x) })).sort((a, b) => a.name.localeCompare(b.name));

  // One dot per week, oldest first: filled when they were at worship or a group that week.
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const end = addDays(now, -7 * (WEEKS - 1 - i));
    const start = addDays(end, -6);
    const here = attended.some((a) => a.date >= start && a.date <= end);
    return { start, end, here };
  });
  const tracking = book.attendance.some((a) => a.present && a.date > since);

  // Serving: their teams and next date from the rosters, and the weariness watch, read only when they serve.
  const serve = await loadServe(leader.churchId).catch(() => null);
  const roles = serve?.volunteers.filter((x) => x.personId === p.id) ?? [];
  const teams = serve ? serve.teams.filter((t) => roles.some((r) => r.teamIds.includes(t.id))).map((t) => t.name) : [];
  const roleIds = new Set(roles.map((r) => r.id));
  const nextServing = serve?.assignments
    .filter((a) => roleIds.has(a.volunteerId) && a.status !== "declined" && a.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextTeam = nextServing ? serve?.teams.find((t) => t.id === nextServing.teamId)?.name : undefined;
  const watch = roles.length ? (await radarNow(now, leader.churchId).catch(() => null))?.radar.find((r) => r.personId === p.id && r.band !== "ok") : undefined;

  const birthday = v.birthday ? nextBirthday(v.birthday, now) : null;
  const phone = v.contact?.phone;
  const email = v.contact?.email;

  return (
    <PeopleFrame
      profile={profile}
      edit={actor.edit}
      tabs={false}
      eyebrow={<Link href={p.archivedAt ? "/people?archived=1" : "/people"}>{p.archivedAt ? "Archived people" : "People"}</Link>}
      lead={
        <span className="person-avatar" aria-hidden="true">
          {initials(v.name)}
        </span>
      }
      title={v.name}
      intro={
        <span className="person-meta">
          <span className={`status-tag status-${p.status}`}>{MEMBER_LABELS[p.status]}</span>
          {p.archivedAt && <span className="status-tag">Archived</span>}
          {[p.membershipDate && `Member since ${fmt(p.membershipDate)}`, household?.name].filter(Boolean).join(" · ")}
        </span>
      }
      actions={
        actor.edit && !editing ? (
          <>
            <Link className="btn" href={`/people/${p.id}?edit=1`}>
              Edit
            </Link>
            <ArchiveButton id={p.id} archived={Boolean(p.archivedAt)} />
          </>
        ) : undefined
      }
    >
      {editing ? (
        <PersonForm person={p} households={book.households.filter((h) => !h.archivedAt).map((h) => ({ id: h.id, name: h.name }))} fields={book.fields} />
      ) : (
        <div className="person">
          <div className="person-actions">
            <Link className="btn btn-primary" href={`/?ask=${encodeURIComponent(`Tell me about ${v.name}.`)}`}>
              <TalkIcon />
              Ask Barnabas
            </Link>
            {phone && (
              <a className="btn" href={`tel:${phone}`}>
                Call
              </a>
            )}
            {phone && (
              <a className="btn" href={`sms:${phone}`}>
                Text
              </a>
            )}
            {email && (
              <a className="btn" href={`mailto:${email}`}>
                Email
              </a>
            )}
          </div>

          <dl className="fact-strip">
            <div>
              <dt>Last here</dt>
              <dd>{lastSeen ? short(lastSeen.date) : "Not recorded"}</dd>
            </div>
            <div>
              <dt>Last {WEEKS} weeks</dt>
              <dd className="tabular">
                {attended.length} {attended.length === 1 ? "time" : "times"}
              </dd>
            </div>
            <div>
              <dt>Groups</dt>
              <dd className="tabular">{v.groups.length || "None yet"}</dd>
            </div>
            <div>
              <dt>Birthday</dt>
              <dd>{birthday ? (birthday.days === 0 ? "Today" : birthday.days <= 30 ? `${short(birthday.date)} · in ${birthday.days} days` : short(birthday.date)) : "–"}</dd>
            </div>
          </dl>

          <div className="person-grid">
            <div className="stack person-col" style={{ gap: 16 }}>
              <section className="fin-card pc-att" aria-labelledby="att-head">
                <h2 id="att-head">Attendance</h2>
                {tracking || present.length ? (
                  <>
                    <ol className="week-dots" aria-label={`Each of the last ${WEEKS} weeks, oldest first`}>
                      {weeks.map((w) => (
                        <li key={w.end} className={w.here ? "here" : undefined} title={`Week of ${short(w.start)}: ${w.here ? "here" : "not recorded"}`}>
                          <span className="sr-only">
                            Week of {short(w.start)}: {w.here ? "here" : "not recorded"}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="small muted">
                      {lastSeen ? `Last on ${friendlyDate(lastSeen.date)}${lastSeen.gathering ? ` (${gathering(lastSeen.gathering)?.label})` : ""}.` : "No attendance recorded yet."}
                    </p>
                  </>
                ) : (
                  <p className="small muted">The church isn&apos;t recording attendance yet. Take it under People › Attendance.</p>
                )}
              </section>

              <section className="fin-card pc-details" aria-labelledby="details-head">
                <h2 id="details-head">Details</h2>
                <dl className="ppl-dl">
                  {v.contact ? (
                    <>
                      <dt>Email</dt><dd>{v.contact.email ?? "–"}</dd>
                      <dt>Mobile</dt><dd>{formatPhone(v.contact.phone) || "–"}</dd>
                      {v.contact.homePhone && (<><dt>Home phone</dt><dd>{v.contact.homePhone}</dd></>)}
                      {v.contact.address && (<><dt>Address</dt><dd>{[v.contact.address.street, v.contact.address.city, [v.contact.address.state, v.contact.address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</dd></>)}
                      <dt>Birthday</dt><dd>{fmt(v.contact.birthdate) ?? "–"}</dd>
                      {v.contact.anniversary && (<><dt>Anniversary</dt><dd>{fmt(v.contact.anniversary)}</dd></>)}
                    </>
                  ) : (
                    <>
                      <dt>Birthday</dt><dd>{v.birthday ? fmt(`1900-${v.birthday}`) : "–"}</dd>
                      <dt>Contact</dt><dd className="muted">Pastors, deacons and staff see contact details.</dd>
                    </>
                  )}
                  <dt>Reads messages in</dt><dd>{{ en: "English", es: "Spanish", ko: "Korean" }[p.language]}</dd>
                  {book.fields.filter((f) => v.custom[f.id]).map((f) => (<Fragment key={f.id}><dt>{f.label}</dt><dd>{v.custom[f.id]}</dd></Fragment>))}
                </dl>
              </section>

              {actor.notes && (
                <section className="fin-card pc-notes" aria-labelledby="notes-head">
                  <h2 id="notes-head">Notes</h2>
                  <Notes personId={p.id} notes={notes.map((n) => ({ id: n.id, text: n.text, byName: n.byName, at: n.at, private: n.private, mine: n.byId === leader.leaderId }))} canPrivate={actor.privateNotes} canRemoveAll={actor.privateNotes} />
                </section>
              )}
            </div>

            <div className="stack person-col" style={{ gap: 16 }}>
              <section className="fin-card pc-hh" aria-labelledby="hh-head">
                <h2 id="hh-head">Household</h2>
                {!household ? (
                  <p className="small muted">Not in a household. {actor.edit && <Link href={`/people/${p.id}?edit=1`}>Add one</Link>}</p>
                ) : actor.edit ? (
                  <HouseholdEditor household={{ id: household.id, name: household.name }} members={members.map((m) => ({ personId: m.id, name: displayName(m), role: m.householdRole ?? "other" }))} directory={directory} />
                ) : (
                  <ul className="mini-people">
                    {members.map((m) => (
                      <li key={m.id}>
                        <span className="ppl-avatar" aria-hidden="true">
                          {initials(displayName(m))}
                        </span>
                        <span className="ppl-name">
                          <Link href={`/people/${m.id}`}>{displayName(m)}</Link>
                          <span className="small muted">{m.householdRole ? ROLE_LABELS[m.householdRole] : ""}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="fin-card pc-groups" aria-labelledby="groups-head">
                <h2 id="groups-head">Groups</h2>
                {v.groups.length ? (
                  <ul className="mini-list">
                    {v.groups.map((g) => (
                      <li key={g.id}>
                        <Link href="/people/groups">{g.name}</Link>
                        {g.leader && <span className="status-tag">Leads</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Not in a group yet.</p>
                )}
              </section>

              {roles.length > 0 && (
                <section className="fin-card pc-serve" aria-labelledby="serve-head">
                  <h2 id="serve-head">Serving</h2>
                  {watch && (
                    <div className="serve-watch">
                      <span className={`pill pill-${watch.band}`}>{watch.band === "high" ? TERMS.encourage.One : TERMS.wearinessWatch.One}</span>
                      <span className="small">{watch.drivers.join(" · ")}</span>
                    </div>
                  )}
                  <p className="small">{teams.length ? teams.join(", ") : "On the rosters"}</p>
                  <p className="small muted">
                    {nextServing ? `Next: ${friendlyDate(nextServing.date)}${nextTeam ? `, ${nextTeam}` : ""}${gathering(nextServing.gathering) ? ` (${gathering(nextServing.gathering)!.label})` : ""}.` : "Not on an upcoming roster."}{" "}
                    <Link href="/serve">Rosters</Link>
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </PeopleFrame>
  );
}
