import type { BlocoTabela, Celula } from "@/lib/relatorios/blocos";
import { textoCelula } from "@/lib/relatorios/blocos";

export function BancadasResumo({ t, linhas }: { t: BlocoTabela; linhas: Celula[][] }) {
  const formato = t.apresentacao;
  if (!formato) return null;
  const rotulo = formato.projecao ? "Eleitos projetados" : "Eleitos";
  return (
    <div className="space-y-4">
      {linhas.map((r, k) => {
        const texto = (i: number) => {
          const col = t.colunas[i];
          return col ? textoCelula(r[i] ?? null, col) : "";
        };
        const vagas = typeof r[2] === "number" ? r[2] : 0;
        const nomes = texto(9).split(",").map((n) => n.trim()).filter(Boolean);
        return (
          <article key={k} className="min-w-0 rounded-lg border border-border bg-card p-4 md:p-5" aria-label={texto(0)}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase text-primary">{texto(1)}</p>
                <h3 className="mt-1 break-words font-display text-lg font-bold leading-snug">{texto(0)}</h3>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-3xl font-bold tabular-nums">{texto(2)}</p>
                <p className="text-xs uppercase text-muted-foreground">{vagas === 1 ? "Vaga" : "Vagas"}</p>
              </div>
            </div>
            <progress value={vagas} max={Math.max(1, formato.totalVagas)} aria-label={`${texto(2)} de ${formato.totalVagas} vagas`} className="my-4 block h-1.5 w-full overflow-hidden rounded-sm bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {[6, 7, 3, 4, 5].map((i) => (
                <div key={i} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{t.colunas[i]?.titulo}</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{texto(i)}</dd>
                </div>
              ))}
            </dl>
            {nomes.length > 0 ? (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">{rotulo} · {nomes.length}</h4>
                  <p className="text-xs font-medium text-primary">{texto(8)}</p>
                </div>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {nomes.map((nome, i) => <li key={`${nome}-${i}`} className="min-w-0 break-words leading-snug">{nome}</li>)}
                </ul>
              </div>
            ) : <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Sem vagas conquistadas.</p>}
          </article>
        );
      })}
      {!linhas.length && <p className="py-6 text-center text-muted-foreground">Nenhum resultado.</p>}
    </div>
  );
}