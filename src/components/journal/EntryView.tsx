import { GATHERINGS } from "@/lib/ops/gatherings";
import { KIND_LABELS, SERMON_STATUS_LABELS, type JournalEntry } from "@/lib/journal/types";
import { Markdown, Prose, RefLink } from "./Rich";

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const refs = (list: string[]) =>
  list.filter(Boolean).map((r, i) => (
    <span key={i}>
      {i > 0 && "; "}
      <RefLink refText={r} />
    </span>
  ));

/** An entry, read-only: what other leaders see when it's shared, and the print view for setlists and devotionals. */
export function EntryView({ entry: e, print = false }: { entry: JournalEntry; print?: boolean }) {
  const s = e.sermon;
  const d = e.devotional;
  const l = e.setlist;
  return (
    <article className={`jr-view${print ? " jr-view-print" : ""}`}>
      <header className="jr-view-head">
        <span className="eyebrow">{KIND_LABELS[e.kind]}</span>
        <h1>{e.title}</h1>
        {l && (
          <p className="small">
            {[l.serviceDate && longDate(l.serviceDate), l.gathering && GATHERINGS.find((g) => g.key === l.gathering)?.label, l.theme && `Theme: ${l.theme}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {s && (
          <p className="small">
            {SERMON_STATUS_LABELS[s.status]}
            {s.passages.length > 0 && <> · {refs(s.passages)}</>}
            {s.preachDate && ` · ${longDate(s.preachDate)}`}
          </p>
        )}
        {d && d.passages.length > 0 && <p className="small">{refs(d.passages)}</p>}
        {!print && e.tags.length > 0 && <p className="small muted">{e.tags.map((t) => `#${t}`).join(" ")}</p>}
      </header>

      {s && (
        <>
          {s.bigIdea && (
            <section>
              <h2>Big idea</h2>
              <Prose text={s.bigIdea} />
            </section>
          )}
          {s.outline.length > 0 && (
            <section>
              <h2>Outline</h2>
              <ol className="jr-view-outline">
                {s.outline.map((p) => (
                  <li key={p.id}>
                    <strong>{p.text}</strong> {p.scripture && <RefLink refText={p.scripture} />}
                    {p.quote && <blockquote className="jr-quote">{p.quote}</blockquote>}
                    {p.subpoints.filter(Boolean).length > 0 && (
                      <ul>
                        {p.subpoints.filter(Boolean).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {(["illustrations", "application", "closing"] as const).map((k) =>
            s[k] ? (
              <section key={k}>
                <h2>{k[0].toUpperCase() + k.slice(1)}</h2>
                <Prose text={s[k]} />
              </section>
            ) : null,
          )}
        </>
      )}

      {d &&
        d.days.map((x, i) => (
          <section key={x.id} className="jr-view-day">
            <h2>
              Day {i + 1}
              {x.title ? `: ${x.title}` : ""}
            </h2>
            {x.passage && (
              <p className="small">
                <RefLink refText={x.passage} />
              </p>
            )}
            {x.passageText && <blockquote className="jr-quote">{x.passageText}</blockquote>}
            <Prose text={x.reflection} />
            {x.questions.filter(Boolean).length > 0 && (
              <ol className="jr-view-questions">
                {x.questions.filter(Boolean).map((q, j) => (
                  <li key={j}>{q}</li>
                ))}
              </ol>
            )}
            {x.prayer && (
              <p className="jr-view-prayer">
                <em>Pray: </em>
                {x.prayer}
              </p>
            )}
          </section>
        ))}

      {l && l.songs.length > 0 && (
        <section>
          <ol className="jr-view-songs">
            {l.songs.map((x, i) => (
              <li key={x.id}>
                <div className="jr-view-song">
                  <span className="jr-view-song-n">{i + 1}</span>
                  <div>
                    <strong>{x.title || "Untitled song"}</strong>
                    {x.artist && <span className="muted"> · {x.artist}</span>}
                    <div className="jr-view-song-meta">
                      {[x.key && `Key ${x.key}`, x.bpm && `${x.bpm} BPM`, x.timeSignature, x.ccli && `CCLI ${x.ccli}`, x.leader && `Leads: ${x.leader}`].filter(Boolean).join(" · ")}
                      {x.scripture && (
                        <>
                          {" · "}
                          <RefLink refText={x.scripture} />
                        </>
                      )}
                    </div>
                    {x.arrangement && <div className="jr-view-song-arr">{x.arrangement}</div>}
                  </div>
                </div>
                {x.transition && i < l.songs.length - 1 && <p className="jr-view-transition">↳ {x.transition}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {e.body.trim() && (
        <section>
          {e.kind !== "note" && <h2>Notes</h2>}
          <Markdown text={e.body} />
        </section>
      )}
    </article>
  );
}
