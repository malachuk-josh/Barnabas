"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type File = { path: string; content: string };
type Conversation = { id: string; title: string; mode: string; updatedAt: number; turns: number; consolidatedAt?: number; consolidationError?: string };

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** What each memory file is, in words a leader reads. Other files are named after their file. */
const KNOWN: Record<string, { title: string; about: string }> = {
  "/memories/core.md": { title: "About you", about: "Who you are, your ministry and how you like to work." },
  "/memories/inbox.md": { title: "Notes to organize", about: "Things Barnabas noted during a conversation. They're sorted into the right place after it ends." },
  "/memories/getting-to-know-you.md": { title: "Getting to know you", about: "What you've told Barnabas in answer to its getting-to-know-you questions." },
  "/memories/thorn-in-the-flesh.md": { title: "Thorn in the flesh", about: "Your own health, kept only because you said Barnabas could." },
};

function label(path: string) {
  if (KNOWN[path]) return KNOWN[path].title;
  const name = path.replace("/memories/", "").replace(/\.md$/, "").replace(/[-_/]+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Inline **bold**, as plain React (no HTML from the file is ever injected). */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** A memory file's markdown, read as notes: headings, bullet lists and paragraphs. */
function MemoryText({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`}>
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]!);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) blocks.push(<h4 key={`h${blocks.length}`}>{inline(heading[1]!)}</h4>);
    else blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className="memory-text">{blocks.length ? blocks : <p className="muted">Empty.</p>}</div>;
}

export function MemoryManager() {
  const [files, setFiles] = useState<File[] | null>(null);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Deleting a file or forgetting a conversation can't be undone, so each asks once more.
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([fetch("/api/memory").then((r) => r.json()), fetch("/api/conversations").then((r) => r.json())]);
    setFiles(f.files ?? []);
    setConvs(c.conversations ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(path: string) {
    setBusy(path);
    const res = await fetch("/api/memory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content: text }) });
    setBusy(null);
    if (res.ok) {
      setEditing(null);
      setMessage("Saved.");
      await load();
    } else {
      setMessage((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
    }
  }

  async function removeFile(path: string) {
    setBusy(path);
    const res = await fetch(`/api/memory?path=${encodeURIComponent(path)}`, { method: "DELETE" });
    setBusy(null);
    setConfirming(null);
    setMessage(res.ok ? `Deleted ${label(path)}.` : "Couldn't delete that file.");
    await load();
  }

  async function forget(id: string) {
    setBusy(id);
    setMessage("Deleting the conversation and removing what Barnabas learned from it…");
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setBusy(null);
    setConfirming(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(body.error ?? "Couldn't delete that conversation.");
    else if (body.error) setMessage(`Conversation deleted. ${body.error}`);
    else setMessage(`Conversation deleted.${body.summary ? ` ${body.summary}` : ""}`);
    await load();
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="memory-layout">
        <section className="stack memory-files" aria-labelledby="files-heading">
          <div className="section-head">
            <h2 id="files-heading">What Barnabas remembers</h2>
            {files && files.length > 0 && (
              <span className="small muted">
                {files.length} {files.length === 1 ? "note" : "notes"}
              </span>
            )}
          </div>
          <p className="muted small">Edit anything that&apos;s wrong, or delete what you don&apos;t want remembered.</p>
          {files === null && <p className="muted">Loading…</p>}
          {files?.length === 0 && <div className="card muted">Nothing yet. Barnabas saves notes as you talk and organizes them after each conversation.</div>}
          {files?.map((f) => (
            <article key={f.path} className="memory-card">
              <header className="memory-card-head">
                <div className="memory-card-title">
                  <h3>{label(f.path)}</h3>
                  {KNOWN[f.path] && <span className="small muted">{KNOWN[f.path]!.about}</span>}
                </div>
                {editing !== f.path && confirming !== f.path && (
                  <div className="memory-card-actions">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => {
                        setEditing(f.path);
                        setText(f.content);
                        setConfirming(null);
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn btn-sm btn-quiet" type="button" onClick={() => setConfirming(f.path)} disabled={busy === f.path}>
                      Delete
                    </button>
                  </div>
                )}
              </header>
              {confirming === f.path && (
                <div className="memory-confirm" role="group" aria-label={`Delete ${label(f.path)}`}>
                  <span className="small">Delete {label(f.path)}? Barnabas will forget everything in it.</span>
                  <span className="row">
                    <button className="btn btn-sm" type="button" onClick={() => setConfirming(null)}>
                      Keep it
                    </button>
                    <button className="btn btn-sm btn-danger-solid" type="button" onClick={() => void removeFile(f.path)} disabled={busy === f.path}>
                      {busy === f.path ? "Deleting…" : "Yes, delete"}
                    </button>
                  </span>
                </div>
              )}
              {editing === f.path ? (
                <div className="stack" style={{ gap: 10 }}>
                  <textarea id={`edit-${f.path}`} aria-label={`Edit ${label(f.path)}`} value={text} onChange={(e) => setText(e.target.value)} rows={12} />
                  <span className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="btn" type="button" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" type="button" onClick={() => void save(f.path)} disabled={busy === f.path}>
                      Save
                    </button>
                  </span>
                </div>
              ) : (
                <MemoryText content={f.content} />
              )}
            </article>
          ))}
        </section>

        <section className="stack memory-convs" aria-labelledby="conv-heading">
          <div className="section-head">
            <h2 id="conv-heading">Conversations</h2>
            {convs && convs.length > 0 && <span className="small muted">{convs.length}</span>}
          </div>
          <p className="muted small">
            Deleting a conversation erases its transcript and asks Barnabas to remove anything it learned from it. Off-the-record conversations are never kept.
          </p>
          {convs === null && <p className="muted">Loading…</p>}
          {convs?.length === 0 && <div className="card muted">No saved conversations.</div>}
          {convs && convs.length > 0 && (
            <div className="list-card">
              {convs.map((c) => (
                <div key={c.id} className="conv-row">
                  <div className="conv-main">
                    <strong>{c.title}</strong>
                    <span className="small muted">
                      {when(c.updatedAt)} · {c.mode === "voice" ? "Voice" : "Text"} · {c.turns} turn{c.turns === 1 ? "" : "s"}
                    </span>
                    <span className={`status-tag ${c.consolidationError ? "conv-error" : c.consolidatedAt ? "conv-done" : ""}`}>
                      {c.consolidationError ? "Memory update failed" : c.consolidatedAt ? "Memory updated" : "Memory update pending"}
                    </span>
                    {c.consolidationError && <span className="small muted">{c.consolidationError}</span>}
                  </div>
                  {confirming === c.id ? (
                    <span className="conv-confirm" role="group" aria-label={`Delete ${c.title}`}>
                      <button className="btn btn-sm" type="button" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                      <button className="btn btn-sm btn-danger-solid" type="button" onClick={() => void forget(c.id)} disabled={busy === c.id}>
                        {busy === c.id ? "Deleting…" : "Yes, forget it"}
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-sm btn-quiet" type="button" onClick={() => setConfirming(c.id)} disabled={busy === c.id}>
                      Delete and forget
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
