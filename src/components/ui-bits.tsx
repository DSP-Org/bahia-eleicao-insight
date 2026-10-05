import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CARGOS } from "@/lib/eleicoes";

export function PageHead({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 min-w-0 border-b-2 border-foreground pb-4">
      {kicker && <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{kicker}</p>}
      <h1 className="font-display break-words text-3xl font-black leading-tight sm:text-4xl md:text-5xl">{title}</h1>
      {children && <div className="mt-2 text-muted-foreground">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="@container min-w-0 border-l-2 border-primary bg-card px-3 py-3 sm:px-4">
      <div className="uppercase tracking-[0.06em] text-muted-foreground text-[min(0.75rem,9cqw)] sm:tracking-wider">{label}</div>
      <div className="font-mono font-semibold whitespace-nowrap text-[min(1.25rem,16cqw)] lg:text-[min(1.5rem,16cqw)]">{value}</div>

      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-card p-4 md:p-5">
      {(title || action) && (
        <div className="mb-3 grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          {title && <h2 className="min-w-0 break-words font-display text-xl font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading() {
  return <div className="py-20 text-center font-mono text-sm text-muted-foreground">Carregando dados do TSE…</div>;
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-sm bg-muted">
      <div className="h-2 rounded-sm" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  );
}

export function Select({ value, onChange, children, className = "" }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${className}`}>
      {children}
    </select>
  );
}

export function CargoTabs({ current }: { current: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {CARGOS.map((c) => (
        <Link key={c.slug} to="/cargo/$cargo" params={{ cargo: c.slug }}
          className={`rounded-full border px-3 py-1 text-sm ${current === c.slug ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"}`}>
          {c.nome}
        </Link>
      ))}
    </div>
  );
}

export function Btn({ onClick, children, disabled = false, type = "button" }: { onClick?: () => void; children: ReactNode; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-md border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background disabled:cursor-wait disabled:opacity-50">{children}</button>;
}
