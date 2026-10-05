import { Link } from "@tanstack/react-router";
import { Card, Stat } from "@/components/ui-bits";
import type { Bloco } from "@/lib/relatorios/blocos";
import { BadgeSituacao, TabelaRelatorio } from "./TabelaRelatorio";

// Desenha os blocos de um relatório. `chave` muda quando os filtros mudam, para as tabelas
// voltarem à ordem e ao filtro iniciais.
export function Blocos({
  blocos,
  chave,
  onBaixar,
}: {
  blocos: Bloco[];
  chave: string;
  onBaixar: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {blocos.map((b, i) => {
        const k = `${chave}-${i}`;
        switch (b.tipo) {
          case "numeros":
            return (
              <div key={k} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {b.itens.map((it, j) => (
                  <Stat
                    key={j}
                    label={it.rotulo}
                    value={<span className="text-xl">{it.valor}</span>}
                    {...(it.sub ? { sub: it.sub } : {})}
                  />
                ))}
              </div>
            );
          case "aviso":
            return (
              <p
                key={k}
                role="note"
                className="rounded-md border-l-4 border-primary bg-card px-4 py-3 text-sm"
              >
                {b.texto}
              </p>
            );
          case "nota":
            return (
              <p key={k} className="text-sm text-muted-foreground">
                {b.texto}
              </p>
            );
          case "destaque":
            return (
              <section key={k} className="rounded-md border border-border bg-card p-4 md:p-5">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                  {b.kicker}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-3xl font-black">{b.titulo}</h2>
                  {b.sit && <BadgeSituacao sit={b.sit} />}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{b.sub}</p>
                {b.candidato && (
                  <Link
                    to="/candidato/$id"
                    params={{ id: b.candidato }}
                    className="mt-2 inline-block text-sm text-primary underline"
                  >
                    Ver página do candidato (mapa e municípios)
                  </Link>
                )}
              </section>
            );
          case "downloads":
            return (
              <div key={k} className="grid gap-2 md:grid-cols-2">
                {b.itens.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onBaixar(it.id)}
                    className="rounded-md border border-border bg-card p-3 text-left hover:border-foreground"
                  >
                    <div className="font-medium">⬇ {it.titulo}</div>
                    <div className="text-xs text-muted-foreground">{it.desc}</div>
                  </button>
                ))}
              </div>
            );
          case "tabela":
            return (
              <Card key={k} title={b.titulo}>
                <TabelaRelatorio t={b} />
              </Card>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
