import { friendlyDate } from "@/lib/dates";
import { WORD_IS_PUBLIC, type SiteData } from "@/lib/site/data";
import { giveTarget } from "@/lib/site/give";
import { stripeConfig } from "@/lib/stripe/config";
import { directionsHref, mapEmbedSrc, parseVideo } from "@/lib/site/media";
import { siteHref } from "@/lib/site/routing";
import { sanitizeHtml } from "@/lib/site/sanitize";
import { wordHref } from "@/lib/services/scripture";
import type { Block, BlockOf, SiteDoc, SiteImage } from "@/lib/site/types";
import { ContactForm, GuestCardForm } from "./PublicForms";
import { GiveForm } from "./GiveForm";

/**
 * Renders website blocks on the server. Rich text is sanitized again here (it was sanitized when saved),
 * and it is the only HTML that is ever injected; everything else is plain React text.
 */

export type RenderCtx = { base: string; suffix: string; data: SiteData; doc: SiteDoc; pageSlug: string };

const link = (href: string, ctx: RenderCtx) => {
  const h = siteHref(href, ctx.base);
  return h.startsWith("/") && !/^\/(m|register|welcome)(\/|$)/.test(h) && ctx.suffix ? `${h}${h.includes("?") ? "&" : "?"}${ctx.suffix.slice(1)}` : h;
};

/** Site links inside rich text get the same base ("/s" on the Barnabas domain). */
function rebase(html: string, ctx: RenderCtx) {
  return html.replace(/href="(\/(?!\/)[^"]*)"/g, (_m, h: string) => `href="${link(h, ctx).replace(/"/g, "&quot;")}"`);
}

function Rich({ html, ctx }: { html: string; ctx: RenderCtx }) {
  return <div className="cs-rich" dangerouslySetInnerHTML={{ __html: rebase(sanitizeHtml(html), ctx) }} />;
}

function Img({ image, className }: { image: SiteImage; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={image.alt} className={className} loading="lazy" decoding="async" />;
}

const shortDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), day: d.getUTCDate() };
};

function Passage({ text }: { text?: string }) {
  if (!text) return null;
  const href = WORD_IS_PUBLIC ? wordHref(text) : null;
  return href ? <a href={href}>{text}</a> : <span className="cs-passage">{text}</span>;
}

function SectionHead({ heading, id }: { heading?: string; id?: string }) {
  return heading ? <h2 id={id}>{heading}</h2> : null;
}

function Hero({ b, ctx }: { b: BlockOf<"hero">; ctx: RenderCtx }) {
  return (
    <section className={`cs-hero${b.image ? " cs-hero-img" : ""}`}>
      <div className="cs-hero-text">
        <h1>{b.heading}</h1>
        {b.text && <p className="cs-lead">{b.text}</p>}
        {b.buttons.length > 0 && (
          <div className="cs-buttons">
            {b.buttons.map((btn, i) => (
              <a key={i} className={`cs-btn ${btn.style === "secondary" ? "cs-btn-secondary" : "cs-btn-primary"}`} href={link(btn.href, ctx)}>
                {btn.label}
              </a>
            ))}
          </div>
        )}
      </div>
      {b.image && <Img image={b.image} className="cs-hero-picture" />}
    </section>
  );
}

function ServiceTimes({ b, ctx }: { b: BlockOf<"service_times">; ctx: RenderCtx }) {
  const times = ctx.data.serviceTimes;
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      {times.length ? (
        <div className="cs-times">
          {times.map((d) => (
            <div key={d.day} className="cs-card">
              <h3>{d.day}</h3>
              <ul className="cs-list">
                {d.items.map((i) => (
                  <li key={i.time + i.title}>
                    <strong>{i.time}</strong> {i.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="cs-muted">Service times will appear here.</p>
      )}
      {b.note && <p className="cs-muted">{b.note}</p>}
    </section>
  );
}

function Events({ b, ctx }: { b: BlockOf<"events">; ctx: RenderCtx }) {
  const events = ctx.data.events.filter((e) => !b.registrationOnly || e.registerHref).slice(0, b.limit);
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      {events.length ? (
        <ul className="cs-events">
          {events.map((e) => {
            const d = shortDay(e.date);
            return (
              <li key={e.key} className="cs-card cs-event">
                <span className="cs-date" aria-hidden="true">
                  <span>{d.month}</span>
                  <strong>{d.day}</strong>
                </span>
                <div>
                  <h3>{e.title}</h3>
                  <p className="cs-muted">
                    {friendlyDate(e.date)}
                    {e.time ? `, ${e.time}${e.endTime ? ` to ${e.endTime}` : ""}` : ""}
                    <br />
                    {e.location}
                  </p>
                  {e.description && <p>{e.description}</p>}
                  {e.registerHref && (
                    <p>
                      {e.full ? (
                        <span className="cs-muted">This event is full.</span>
                      ) : (
                        <a className="cs-btn cs-btn-primary cs-btn-small" href={e.registerHref}>
                          Register<span className="cs-sr"> for {e.title}</span>
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cs-muted">Check back soon for upcoming events.</p>
      )}
    </section>
  );
}

function Leadership({ b, ctx }: { b: BlockOf<"leadership">; ctx: RenderCtx }) {
  const bio = (name: string) => b.bios.find((x) => x.name === name)?.bio;
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      {b.intro && <p className="cs-lead">{b.intro}</p>}
      <ul className="cs-people">
        {ctx.data.leaders.map((l) => (
          <li key={l.name} className="cs-card">
            <h3>{l.name}</h3>
            <p className="cs-role">{l.title}</p>
            {b.showBios && bio(l.name) && <p>{bio(l.name)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sermons({ b, ctx }: { b: BlockOf<"sermons">; ctx: RenderCtx }) {
  const { series, upcoming } = ctx.data.sermons;
  const up = upcoming.slice(0, b.limit);
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      {series.length > 0 && (
        <ul className="cs-series">
          {series.slice(0, b.limit).map((s) => (
            <li key={s.title + s.startDate} className="cs-card">
              {s.current && <span className="cs-tag">Current series</span>}
              <h3>{s.title}</h3>
              <p className="cs-muted">
                <Passage text={s.passage} />
                {s.passage ? " · " : ""}
                {shortRange(s.startDate, s.endDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {up.length > 0 && (
        <>
          <h3 className="cs-subhead">Coming up</h3>
          <ul className="cs-list cs-preaching">
            {up.map((r) => (
              <li key={r.date}>
                <strong>{friendlyDate(r.date)}</strong>: {r.preacher}
                {r.title ? `, “${r.title}”` : ""}
                {r.passage && (
                  <>
                    {" "}
                    (<Passage text={r.passage} />)
                  </>
                )}
                {r.series ? <span className="cs-muted"> · {r.series}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {!series.length && !up.length && <p className="cs-muted">Check back soon for sermon series.</p>}
    </section>
  );
}

const shortRange = (a: string, b: string) => {
  const f = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(a)} to ${f(b)}`;
};

function Visit({ b, ctx }: { b: BlockOf<"visit">; ctx: RenderCtx }) {
  const address = ctx.doc.theme.footer.address;
  const sunday = ctx.data.serviceTimes.find((d) => d.day === "Sunday");
  return (
    <section className="cs-section cs-visit">
      <div>
        <SectionHead heading={b.heading} />
        {b.text && <p className="cs-lead">{b.text}</p>}
        {sunday && (
          <p>
            <strong>Sundays:</strong> {sunday.items.map((i) => `${i.time} ${i.title.toLowerCase()}`).join(", ")}
          </p>
        )}
        {address && (
          <p>
            <strong>Where:</strong> {address} ·{" "}
            <a href={directionsHref(address)} rel="noopener noreferrer">
              Directions
            </a>
          </p>
        )}
      </div>
      {b.showForm && (
        <div className="cs-card">
          <h3>Let us know you&apos;re coming</h3>
          <p className="cs-muted">Fill in a guest card and someone from our shepherding team will say hello.</p>
          <GuestCardForm />
        </div>
      )}
    </section>
  );
}

function Give({ b, ctx }: { b: BlockOf<"give">; ctx: RenderCtx }) {
  const target = giveTarget(ctx.doc);
  return (
    <section className="cs-section cs-give">
      <SectionHead heading={b.heading} />
      {b.text && <p className="cs-lead">{b.text}</p>}
      {target.kind === "checkout" ? (
        <GiveForm href={target.href} funds={ctx.data.giveFunds ?? []} feePercent={stripeConfig()?.feePercent ?? 2.9} feeFixedCents={stripeConfig()?.feeFixedCents ?? 30} portalLoginUrl={stripeConfig()?.portalLoginUrl} buttonLabel={b.buttonLabel === "Give online" ? undefined : b.buttonLabel} />
      ) : target.kind === "link" ? (
        <p>
          <a className="cs-btn cs-btn-primary" href={target.href} rel="noopener noreferrer">
            {b.buttonLabel || "Give online"}
          </a>
        </p>
      ) : (
        <p className="cs-notice">Online giving is coming soon.</p>
      )}
      {target.note && <p className="cs-muted">{target.note}</p>}
    </section>
  );
}

function Announcement({ b, ctx }: { b: BlockOf<"announcement">; ctx: RenderCtx }) {
  const latest = b.source === "latest" ? ctx.data.announcements[0] : undefined;
  if (b.source === "latest" && !latest) return null;
  const text = latest ? latest.body : b.text;
  if (!text) return null;
  const l = latest?.link ?? b.link;
  return (
    <aside className="cs-announcement" aria-label="Announcement">
      {latest && <strong>{latest.title}</strong>}
      <p>{text}</p>
      {l && <a href={link(l.href, ctx)}>{l.label}</a>}
    </aside>
  );
}

function Video({ b }: { b: BlockOf<"video"> }) {
  const v = parseVideo(b.url);
  if (!v) return null;
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      <div className="cs-video">
        <iframe src={v.src} title={b.title} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      </div>
    </section>
  );
}

function MapBlock({ b }: { b: BlockOf<"map"> }) {
  return (
    <section className="cs-section">
      <SectionHead heading={b.heading} />
      <div className="cs-map">
        <iframe src={mapEmbedSrc(b.address)} title={`Map of ${b.address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
      <p>
        {b.address} ·{" "}
        <a href={directionsHref(b.address)} rel="noopener noreferrer">
          Get directions
        </a>
      </p>
    </section>
  );
}

export function BlockView({ block, ctx }: { block: Block; ctx: RenderCtx }) {
  switch (block.type) {
    case "hero":
      return <Hero b={block} ctx={ctx} />;
    case "richtext":
      return (
        <section className="cs-section">
          <Rich html={block.html} ctx={ctx} />
        </section>
      );
    case "image":
      return (
        <figure className={`cs-section cs-figure${block.wide ? " cs-wide" : ""}`}>
          <Img image={block.image} />
          {block.caption && <figcaption className="cs-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "columns":
      return (
        <section className="cs-section cs-columns">
          {block.columns.map((c, i) => (
            <div key={i}>
              {c.image && <Img image={c.image} className="cs-col-img" />}
              {c.heading && <h2>{c.heading}</h2>}
              <Rich html={c.html} ctx={ctx} />
            </div>
          ))}
        </section>
      );
    case "service_times":
      return <ServiceTimes b={block} ctx={ctx} />;
    case "events":
      return <Events b={block} ctx={ctx} />;
    case "leadership":
      return <Leadership b={block} ctx={ctx} />;
    case "sermons":
      return <Sermons b={block} ctx={ctx} />;
    case "visit":
      return <Visit b={block} ctx={ctx} />;
    case "give":
      return <Give b={block} ctx={ctx} />;
    case "contact":
      return (
        <section className="cs-section cs-contact">
          <SectionHead heading={block.heading} />
          {block.text && <p className="cs-lead">{block.text}</p>}
          <ContactForm blockId={block.id} page={ctx.pageSlug} />
        </section>
      );
    case "map":
      return <MapBlock b={block} />;
    case "video":
      return <Video b={block} />;
    case "announcement":
      return <Announcement b={block} ctx={ctx} />;
  }
}

export function Blocks({ blocks, ctx }: { blocks: Block[]; ctx: RenderCtx }) {
  return (
    <>
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} ctx={ctx} />
      ))}
    </>
  );
}
