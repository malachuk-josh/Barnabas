"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sanitizeHtml } from "@/lib/site/sanitize";

/** Small form pieces shared by the website editor. */

export function TextField({ label, value, onChange, hint, max = 200, type = "text", placeholder, required }: { label: string; value: string | undefined; onChange: (v: string) => void; hint?: string; max?: number; type?: string; placeholder?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input id={id} type={type} value={value ?? ""} maxLength={max} placeholder={placeholder} required={required} aria-describedby={hint ? `${id}-h` : undefined} onChange={(e) => onChange(e.target.value)} />
      {hint && (
        <span id={`${id}-h`} className="small muted">
          {hint}
        </span>
      )}
    </div>
  );
}

export function AreaField({ label, value, onChange, max = 600, rows = 3, hint }: { label: string; value: string | undefined; onChange: (v: string) => void; max?: number; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="se-text" rows={rows} value={value ?? ""} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const id = useId();
  return (
    <div className="field se-num">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
    </div>
  );
}

export type Img = { url: string; alt: string };

/** An image: upload (when Vercel Blob is set up) or an https address, and alt text, which is required. */
export function ImageField({ label, value, onChange, uploads, optional, decorative }: { label: string; value: Img | undefined; onChange: (v: Img | undefined) => void; uploads: boolean; optional?: boolean; /** an icon with no alt text of its own */ decorative?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = value ?? { url: "", alt: "" };
  const set = (n: Img) => onChange(optional && !n.url.trim() && !n.alt.trim() ? undefined : n);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/site/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "The upload didn't work.");
    set({ ...v, url: json.url });
  }
  return (
    <fieldset className="se-image">
      <legend>{label}</legend>
      {v.url && /^https:\/\/|^\//.test(v.url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.url} alt="" className="se-thumb" />
      ) : null}
      <TextField label="Image address" type="url" value={v.url} max={800} placeholder="https://…" onChange={(url) => set({ ...v, url })} />
      {uploads ? (
        <label className="btn se-upload">
          {busy ? "Uploading…" : "Upload an image"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="se-file" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      ) : (
        <p className="small muted">Uploads aren&apos;t set up (Vercel Blob). Paste the address of an image that&apos;s already online.</p>
      )}
      {!decorative && <TextField label="Alt text (describe the image)" value={v.alt} max={200} required={Boolean(v.url)} hint="Required: what someone who can't see the picture should know." onChange={(alt) => set({ ...v, alt })} />}
      {optional && v.url && (
        <button type="button" className="btn se-small" onClick={() => onChange(undefined)}>
          Remove image
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Rich text: bold, italic, headings, lists and links in an editable box. What it produces is sanitized
 * here as you type, and again on the server when saved, so only the safe subset is ever stored.
 */
export function RichTextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = sanitizeHtml(value);
      last.current = value;
    }
  }, [value]);
  const emit = () => {
    if (!ref.current) return;
    const clean = sanitizeHtml(ref.current.innerHTML);
    last.current = clean;
    onChange(clean);
  };
  const cmd = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    emit();
  };
  return (
    <div className="field">
      <span className="se-label" id={`${id}-l`}>
        {label}
      </span>
      <div className="se-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")} aria-label="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")} aria-label="Italic">
          <em>I</em>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("formatBlock", "<h2>")}>
          Heading
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("formatBlock", "<h3>")}>
          Subheading
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("formatBlock", "<p>")}>
          Paragraph
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertUnorderedList")}>
          List
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("formatBlock", "<blockquote>")}>
          Quote
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Link to (https://…, or a page like /visit):");
            if (url) cmd("createLink", url.trim());
          }}
        >
          Link
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("unlink")}>
          Unlink
        </button>
      </div>
      <div
        ref={ref}
        className="se-rich"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${id}-l`}
        data-no-pull
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Paste as plain text so nothing from another site's markup comes along.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
