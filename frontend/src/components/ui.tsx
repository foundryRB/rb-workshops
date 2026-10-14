import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** The chips, buttons and rules the approved screens carry, as small components over the tokens. */

export function ShelfChip({ state }: { state: "ephemeral" | "draft" | "published" }) {
  if (state === "published")
    return <span className="inline-flex items-center rounded-full border border-transparent bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">Published</span>;
  if (state === "draft")
    return <span className="inline-flex items-center rounded-full border border-input bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">Draft</span>;
  return <span className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Ephemeral</span>;
}

export function Chip({ children, tone = "outline" }: { children: ReactNode; tone?: "outline" | "primary" }) {
  return tone === "primary" ? (
    <span className="inline-flex items-center rounded-full border border-transparent bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{children}</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{children}</span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "destructive" };

export function Button({ variant = "outline", className = "", ...rest }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
  const look = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  }[variant];
  return <button className={`${base} ${look} ${className}`} {...rest} />;
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to ? (
            <Link className="hover:text-foreground" to={it.to}>
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-xs font-semibold uppercase tracking-widest text-muted-foreground ${className}`}>{children}</h2>;
}

export function Alert({ tone = "destructive", title, children }: { tone?: "destructive" | "muted"; title: string; children?: ReactNode }) {
  const cls = tone === "destructive" ? "border-destructive text-destructive" : "border-border bg-card text-card-foreground";
  return (
    <div role={tone === "destructive" ? "alert" : "status"} className={`flex gap-3 rounded-md border p-3 text-sm ${cls}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <div>
        <div className="font-medium">{title}</div>
        {children && <div className={tone === "destructive" ? "mt-0.5" : "text-muted-foreground"}>{children}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground";
export const textareaClass = "flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground";

export function Tabs({ tabs, current }: { tabs: { label: string; to: string; id: string }[]; current: string }) {
  return (
    <div role="tablist" className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
      {tabs.map((t) => (
        <Link
          key={t.id}
          role="tab"
          aria-selected={t.id === current}
          to={t.to}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${t.id === current ? "bg-background text-foreground" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Loading({ columns }: { columns: number }) {
  return (
    <tbody aria-busy="true">
      {[0, 1, 2].map((r) => (
        <tr key={r} className="border-b border-border bg-card">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-3 w-3/4 rounded-sm bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 16);
}

export function shortSha(sha: string | null | undefined, n = 12): string {
  return (sha || "").replace(/^sha256:/, "").slice(0, n);
}
