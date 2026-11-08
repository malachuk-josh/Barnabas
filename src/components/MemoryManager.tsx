"use client";

import { useCallback, useEffect, useState } from "react";

type File = { path: string; content: string };
type Conversation = { id: string; title: string; mode: string; updatedAt: number; turns: number; consolidatedAt?: number; consolidationError?: string };

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function label(path: string) {
  if (path === "/memories/core.md") return "About you";
  if (path === "/memories/inbox.md") return "Notes to organize";
  return path.replace("/memories/", "");
}

export function MemoryManager() {
  const [files, setFiles] = useState<File[] | null>(null);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    setMessage(res.ok ? `Deleted ${label(path)}.` : "Couldn't delete that file.");
    await load();
  }

  async function forget(id: string) {
    setBusy(id);
    setMessage("Deleting the conversation and removing what Barnabas learned from it…");
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setBusy(null);
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
      <div className="two-col">
        <section className="stack" aria-labelledby="files-heading">
          <h2 id="files-heading">What Barnabas remembers</h2>
          <p className="muted small">Only you can see this. Edit anything that&apos;s wrong, or delete what you don&apos;t want remembered.</p>
          {files === null && <p className="muted">Loading…</p>}
          {files?.length === 0 && <div className="card muted">Nothing yet. Barnabas saves notes as you talk and organizes them after each conversation.</div>}
          {files?.map((f) => (
            <article key={f.path} className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{label(f.path)}</strong>
                <div className="row">
                  {editing === f.path ? (
                    <>
                      <button className="btn btn-primary" onClick={() => void save(f.path)} disabled={busy === f.path}>
                        Save
                      </button>
                      <button className="btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          setEditing(f.path);
                          setText(f.content);
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => void removeFile(f.path)} disabled={busy === f.path}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing === f.path ? (
                <textarea id={`edit-${f.path}`} aria-label={`Edit ${label(f.path)}`} value={text} onChange={(e) => setText(e.target.value)} rows={12} />
              ) : (
                <pre className="file">{f.content}</pre>
              )}
            </article>
          ))}
        </section>

        <section className="stack" aria-labelledby="conv-heading">
          <h2 id="conv-heading">Conversations</h2>
          <p className="muted small">
            Deleting a conversation erases its transcript and asks Barnabas to remove anything it learned from it. Off-the-record conversations are never kept.
          </p>
          {convs === null && <p className="muted">Loading…</p>}
          {convs?.length === 0 && <div className="card muted">No saved conversations.</div>}
          {convs?.map((c) => (
            <article key={c.id} className="card stack" style={{ gap: 8 }}>
              <strong>{c.title}</strong>
              <span className="small muted">
                {when(c.updatedAt)} · {c.mode === "voice" ? "Voice" : "Text"} · {c.turns} turn{c.turns === 1 ? "" : "s"} ·{" "}
                {c.consolidationError ? c.consolidationError : c.consolidatedAt ? "Memory updated" : "Memory update pending"}
              </span>
              <div>
                <button className="btn btn-danger" onClick={() => void forget(c.id)} disabled={busy === c.id}>
                  {busy === c.id ? "Deleting…" : "Delete and forget"}
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
