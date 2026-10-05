import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { downloadCSV, nf, slugify } from "@/lib/eleicoes";
import { Btn } from "@/components/ui-bits";
import type { BlocoTabela, Celula, Coluna, ValorSit } from "@/lib/relatorios/blocos";
import { ordenarLinhas, textoCelula, valorCSV } from "@/lib/relatorios/blocos";

const NUMERICO = new Set<Coluna["tipo"]>(["int", "pct", "pos", "dif", "corr"]);

const ESTILO_SIT: Record<ValorSit["tipo"], string> = {
  eleito: "bg-primary text-primary-foreground",
  segundo_turno: "border border-primary text-primary",
  suplente: "border border-border bg-muted text-foreground",
  nao_eleito: "text-muted-foreground",
  aguardando: "text-muted-foreground",
};

export function BadgeSituacao({ sit }: { sit: ValorSit }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${ESTILO_SIT[sit.tipo]}`}
      title={
        sit.proj
          ? "Projeção a partir das vagas já distribuídas pelo TSE; aguardando a lista oficial"
          : "Situação informada pelo TSE"
      }
    >
      {sit.texto}
    </span>
  );
}

function CelulaView({ c, col, max }: { c: Celula; col: Coluna; max: number }) {
  if (c != null && typeof c === "object") {
    if ("id" in c) {
      return (
        <div className="min-w-36">
          <Link to="/candidato/$id" params={{ id: c.id }} className="font-medium hover:underline">
            {c.nome}
          </Link>
          <div className="text-[11px] text-muted-foreground">{c.sub}</div>
        </div>
      );
    }
    if ("tse" in c)
      return (
        <Link
          to="/municipio/$codigo"
          params={{ codigo: c.tse }}
          className="font-medium hover:underline"
        >
          {c.nome}
        </Link>
      );
    return <BadgeSituacao sit={c} />;
  }
  const texto = textoCelula(c, col);
  if (col.barra && typeof c === "number" && max > 0) {
    const w = Math.max(0, Math.min(100, (c / max) * 100));
    return (
      <span className="inline-flex items-center justify-end gap-2">
        {texto}
        <span className="inline-block h-1.5 w-14 rounded-sm bg-muted" aria-hidden>
          <span className="block h-1.5 rounded-sm bg-primary/70" style={{ width: `${w}%` }} />
        </span>
      </span>
    );
  }
  return <>{texto}</>;
}

export function TabelaRelatorio({ t }: { t: BlocoTabela }) {
  const [ordem, setOrdem] = useState<[number, boolean] | null>(t.ordem ?? null);
  const [filtro, setFiltro] = useState("");
  const [todas, setTodas] = useState(false);
  const pagina = t.pagina ?? 100;

  const maximos = useMemo(
    () =>
      t.colunas.map((c, i) =>
        c.barra
          ? c.tipo === "corr"
            ? 1
            : Math.max(0, ...t.linhas.map((r) => (typeof r[i] === "number" ? (r[i] as number) : 0)))
          : 0,
      ),
    [t],
  );
  const linhas = useMemo(() => {
    let l = t.linhas;
    const q = slugify(filtro.trim());
    if (q)
      l = l.filter((r) =>
        slugify(r.map((c, i) => textoCelula(c, t.colunas[i] as Coluna)).join(" ")).includes(q),
      );
    return ordem ? ordenarLinhas(l, ordem[0], ordem[1]) : l;
  }, [t, filtro, ordem]);
  const visiveis = todas ? linhas : linhas.slice(0, pagina);

  const ordenarPor = (i: number) =>
    setOrdem((o) =>
      o && o[0] === i ? [i, !o[1]] : [i, NUMERICO.has((t.colunas[i] as Coluna).tipo)],
    );
  const baixar = () =>
    downloadCSV(`${t.arquivo || "relatorio"}.csv`, [
      t.colunas.map((c) => c.titulo),
      ...linhas.map((r) => t.colunas.map((c, i) => valorCSV(r[i] ?? null, c))),
    ]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {t.busca ? (
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar nesta tabela…"
            aria-label="Filtrar nesta tabela"
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {nf(linhas.length)} linha{linhas.length === 1 ? "" : "s"}
          </span>
          <Btn onClick={baixar}>CSV</Btn>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              {t.colunas.map((c, i) => (
                <th
                  key={i}
                  title={c.dica ?? "Clique para ordenar"}
                  onClick={() => ordenarPor(i)}
                  className={`cursor-pointer select-none px-2 py-2 align-bottom hover:text-foreground ${NUMERICO.has(c.tipo) ? "text-right" : ""}`}
                >
                  {c.titulo}
                  {ordem?.[0] === i ? (ordem[1] ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r, k) => (
              <tr key={k} className="border-t border-border">
                {t.colunas.map((c, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 ${NUMERICO.has(c.tipo) ? "whitespace-nowrap text-right font-mono" : ""}`}
                  >
                    <CelulaView c={r[i] ?? null} col={c} max={maximos[i] ?? 0} />
                  </td>
                ))}
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={t.colunas.length} className="py-6 text-center text-muted-foreground">
                  Nenhum resultado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {linhas.length > visiveis.length && (
        <div className="mt-3 text-center">
          <Btn onClick={() => setTodas(true)}>Mostrar todas ({nf(linhas.length)})</Btn>
        </div>
      )}
    </div>
  );
}
