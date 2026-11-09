import { BlockView } from "@/components/site/Blocks";
import { InstallHint, MemberServiceWorker, PushButton } from "@/components/site/MemberApp";
import { vapidPublicKey } from "@/lib/site/push";
import { memberContext } from "./member-context";

export const dynamic = "force-dynamic";

/** Home: the latest announcements and the next gatherings. */
export default async function MemberHome() {
  const { doc, data, render } = await memberContext();
  const next = data.serviceTimes.slice(0, 2);
  return (
    <>
      <MemberServiceWorker />
      {doc.app.welcome && <p className="cs-lead">{doc.app.welcome}</p>}
      <section aria-labelledby="ann-h">
        <h2 id="ann-h">Announcements</h2>
        {data.announcements.length ? (
          <ul className="ma-list">
            {data.announcements.slice(0, 5).map((a) => (
              <li key={a.id} className="cs-announcement" style={{ margin: 0 }}>
                <strong>{a.title}</strong>
                <p>{a.body}</p>
                {a.link && <a href={a.link.href}>{a.link.label}</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cs-muted">No announcements right now. Check back soon.</p>
        )}
        <PushButton vapidKey={vapidPublicKey()} />
      </section>
      <section aria-labelledby="next-h">
        <h2 id="next-h">Next gatherings</h2>
        {next.length ? (
          <ul className="ma-list">
            {next.map((d) => (
              <li key={d.day} className="cs-card">
                <h3>{d.day}</h3>
                <ul className="cs-list">
                  {d.items.map((i) => (
                    <li key={i.time + i.title}>
                      <strong>{i.time}</strong> {i.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cs-muted">Service times will appear here.</p>
        )}
        {doc.theme.footer.address && <p className="cs-muted">{doc.theme.footer.address}</p>}
      </section>
      <BlockView block={{ id: "app-events", type: "events", heading: "Coming up", limit: 3, registrationOnly: false }} ctx={render} />
      <InstallHint />
    </>
  );
}
