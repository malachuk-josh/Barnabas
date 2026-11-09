import Link from "next/link";

export type EmptyAction = { label: string; href: string; primary?: boolean };

/**
 * A warm empty list: what will be here, why it's empty, and the first thing to do. Used everywhere a list
 * starts empty (the demo church has no made-up congregation, so most lists do).
 */
export function EmptyState({ title, children, actions = [], compact = false }: { title: string; children?: React.ReactNode; actions?: EmptyAction[]; compact?: boolean }) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`} role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="empty-mark">
        <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
      <div className="empty-body">
        <strong>{title}</strong>
        {children && <p className="muted small">{children}</p>}
        {actions.length > 0 && (
          <div className="row">
            {actions.map((a) => (
              <Link key={a.href + a.label} href={a.href} className={`btn${a.primary ? " btn-primary" : ""}`}>
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
