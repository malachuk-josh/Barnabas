import Link from "next/link";
import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { PersonForm } from "@/components/people/PersonForm";
import { ArchiveButton, HouseholdEditor, Notes } from "@/components/people/PersonPanels";
import { addDays, friendlyDate, today } from "@/lib/dates";
import { formatPhone } from "@/lib/messages/phone";
import { gathering } from "@/lib/ops/gatherings";
import { displayName, isActive } from "@/lib/people/native";
import { peopleFor, personView } from "@/lib/people/service";
import { MEMBER_LABELS, ROLE_LABELS } from "@/lib/people/types";

export const dynamic = "force-dynamic";

/** "March 4, 1980"; a birthday stored without a year (1900) reads "March 4". */
const fmt = (iso?: string) => (!iso ? undefined : new Date(`${iso.startsWith("1900-") ? `2000${iso.slice(4)}` : iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: iso.startsWith("1900-") ? undefined : "numeric", timeZone: "UTC" }));

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
  const since = addDays(today(), -84);
  const attended = book.attendance.filter((a) => a.personId === p.id && a.present && a.date >= since);
  const lastSeen = book.attendance.filter((a) => a.personId === p.id && a.present).sort((a, b) => b.date.localeCompare(a.date))[0];
  const notes = actor.notes ? book.notes.filter((n) => n.personId === p.id && (!n.private || actor.privateNotes)).sort((a, b) => b.at - a.at) : [];
  const directory = book.people.filter(isActive).map((x) => ({ id: x.id, name: displayName(x) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PeopleFrame
      profile={profile}
      edit={actor.edit}
      eyebrow={p.archivedAt ? "People · archived" : "People"}
      title={v.name}
      intro={[MEMBER_LABELS[p.status], p.membershipDate && `member since ${fmt(p.membershipDate)}`, household?.name].filter(Boolean).join(" · ")}
      actions={actor.edit && !editing ? <span className="row"><Link className="btn btn-primary" href={`/people/${p.id}?edit=1`}>Edit</Link><ArchiveButton id={p.id} archived={Boolean(p.archivedAt)} /></span> : undefined}
    >
      {editing ? (
        <PersonForm person={p} households={book.households.filter((h) => !h.archivedAt).map((h) => ({ id: h.id, name: h.name }))} fields={book.fields} />
      ) : (
        <div className="fin-grid-2">
          <div className="stack">
            <section className="fin-card">
              <h2>Details</h2>
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
            <section className="fin-card">
              <h2>Groups and attendance</h2>
              <p className="small">{v.groups.length ? v.groups.map((g) => `${g.name}${g.leader ? " (leads)" : ""}`).join(", ") : "Not in a group yet."}</p>
              <p className="small tabular">
                {attended.length} {attended.length === 1 ? "time" : "times"} in the last twelve weeks{lastSeen ? `; last on ${friendlyDate(lastSeen.date)}${lastSeen.gathering ? ` (${gathering(lastSeen.gathering)?.label})` : ""}` : ""}.
              </p>
            </section>
            {actor.notes && (
              <section className="fin-card">
                <h2>Notes</h2>
                <Notes personId={p.id} notes={notes.map((n) => ({ id: n.id, text: n.text, byName: n.byName, at: n.at, private: n.private, mine: n.byId === leader.leaderId }))} canPrivate={actor.privateNotes} canRemoveAll={actor.privateNotes} />
              </section>
            )}
          </div>
          <section className="fin-card">
            <h2>Household</h2>
            {!household ? (
              <p className="small muted">Not in a household. {actor.edit && <Link href={`/people/${p.id}?edit=1`}>Add one</Link>}</p>
            ) : actor.edit ? (
              <HouseholdEditor household={{ id: household.id, name: household.name }} members={members.map((m) => ({ personId: m.id, name: displayName(m), role: m.householdRole ?? "other" }))} directory={directory} />
            ) : (
              <ul className="list">
                {members.map((m) => (
                  <li key={m.id}>
                    <Link href={`/people/${m.id}`}>{displayName(m)}</Link>
                    <span className="small muted">{m.householdRole ? ROLE_LABELS[m.householdRole] : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PeopleFrame>
  );
}
