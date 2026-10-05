import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CARGOS } from "@/lib/eleicoes";

export function PageHead({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 border-b-2 border-foreground pb-4">
      {kicker && <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{kicker}</p>}
      <h1 className="font-display text-4xl font-black leading-tight md:text-5xl">{title}</h1>
      {children && <div className="mt-2 text-muted-foreground">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-l-2 border-primary bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-4 md:p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-xl font-bold">{title}</h2>}
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
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${className}`}>
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

export function Btn({ onClick, children, disabled = false }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="inline-flex items-center justify-center gap-2 rounded-md border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background disabled:cursor-wait disabled:opacity-50">{children}</button>;
}
