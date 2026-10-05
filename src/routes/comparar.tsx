import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CARGOS, SERIES, useMeta, useMunData, useMunicipios, useIbgeIndex, nf, pf, pct, downloadCSV, slugify } from "@/lib/eleicoes";
import { BuscaItem } from "@/components/relatorios/BuscaItem";
import { MapaBA } from "@/components/MapaBA";
import { PageHead, Card, Loading, Select, Btn, Stat } from "@/components/ui-bits";

export const Route = createFileRoute("/comparar")({
  head: () => ({
    meta: [
      { title: "Comparar candidatos — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Compare até 4 candidatos do mesmo cargo na Bahia: votos, municípios vencidos e regiões." },
      { property: "og:title", content: "Comparar candidatos — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Mapa de confronto direto e diferença de votos por município." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Comparar,
});

function Comparar() {
  const [slug, setSlug] = useState("governador");
  const { data: meta } = useMeta();
  const cargo = meta?.cargos.find((c) => c.slug === slug);
  const [ids, setIds] = useState<string[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { data: md } = useMunData(slug);
  const { data: muns } = useMunicipios();
  const { byIbge } = useIbgeIndex(muns);

  const sel = cargo ? (ids.length ? ids : cargo.candidatos.slice(0, 2).map((c) => c.id)) : [];
  const idxs = cargo ? sel.map((id) => cargo.candidatos.findIndex((c) => c.id === id)).filter((i) => i >= 0) : [];

  const rows = useMemo(() => {
    if (!md || !muns) return [];
    return muns.map((m) => {
      const r = md[m.tse]; const vs = idxs.map((i) => r?.v[i] ?? 0);
      let w = 0; vs.forEach((v, k) => { if (v > vs[w]) w = k; });
      return { m, vs, vv: r?.vv ?? 0, w, diff: vs.length > 1 ? vs[0] - vs[1] : 0 };
    });
  }, [md, muns, idxs.join()]);

  if (!meta || !cargo) return <Loading />;
  const cands = idxs.map((i) => cargo.candidatos[i]);
  const wins = cands.map((_, k) => rows.filter((r) => r.w === k && r.vs[k] > 0).length);
  const setAt = (k: number, id: string) => { const n = [...sel]; n[k] = id; setIds(n.filter(Boolean)); };

  // Vantagem de cada candidato sobre o melhor dos demais, por município.
  const vantagens = cands.map((_, k) =>
    rows
      .map((r) => ({ r, v: r.vs[k] - Math.max(...r.vs.filter((_, j) => j !== k)) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 15),
  );

  const baixarPDF = async () => {
    setPdfBusy(true);
    try {
      const { downloadReportPDF } = await import("@/lib/report-pdf");
      const ordenados = [...rows].sort((a, b) => b.vs[b.w] - a.vs[a.w]);
      await downloadReportPDF({
        title: `Comparativo — ${cargo.nome}`,
        cargo: cargo.nome,
        filter: cands.map((c) => c.nome).join(" × "),
        headers: ["Município", ...cands.map((c) => c.nome), "Vencedor", "Diferença"],
        rows: ordenados.map((r) => [
          r.m.nome,
          ...r.vs,
          r.vs[r.w] > 0 ? cands[r.w].nome : "—",
          r.vs.length > 1 ? r.vs[r.w] - Math.max(...r.vs.filter((_, j) => j !== r.w)) : r.vs[0],
        ]),
        summary: [
          ...cands.slice(0, 3).map((c, k) => ({ label: c.nome, value: nf(c.votos) })),
          { label: "Municípios", value: nf(rows.length) },
        ],
        ranking: cands.map((c, k) => ({
          name: c.nome,
          value: `${nf(wins[k])} municípios`,
          share: rows.length ? wins[k] / rows.length : 0,
        })),
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div>
      <PageHead kicker="Comparativo" title="Candidato contra candidato" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={slug} onChange={(v) => { setSlug(v); setIds([]); }}>
          {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
        </Select>
        {[0, 1, 2, 3].map((k) => (k <= sel.length && k < 4) && (
          <div key={k} className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 md:flex-none">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: SERIES[k] }} />
            <div className="min-w-0 flex-1 sm:w-56">
              <BuscaItem
                itens={cargo.candidatos}
                busca={(c) => slugify(`${c.nome} ${c.partido} ${c.n}`)}
                placeholder={k < 2 ? "Digite para buscar…" : "+ adicionar"}
                rotulo={`Candidato ${k + 1}`}
                render={(c) => <span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span>}
                selecionado={cargo.candidatos.find((c) => c.id === sel[k]) ?? null}
                onLimpar={() => setAt(k, "")}
                rotuloLimpar="Trocar candidato"
                onEscolher={(c) => setAt(k, c.id)}
              />

            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cands.map((c, k) => (
          <div key={c.id} className="rounded-md border-t-4 bg-card p-4" style={{ borderColor: SERIES[k] }}>
            <Link to="/candidato/$id" params={{ id: c.id }} className="font-display text-xl font-bold hover:underline">{c.nome}</Link>
            <p className="text-sm text-muted-foreground">{c.partido} · {c.sit || c.situacao || "—"}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Votos" value={nf(c.votos)} />
              <Stat label="% válidos" value={pf(c.pct)} />
              <Stat label="Vence em" value={nf(wins[k])} sub="municípios" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card title="Quem venceu cada município (entre os escolhidos)">
          {md ? <MapaBA
            fill={(ibge) => { const m = byIbge[ibge]; const r = rows.find((x) => x.m.ibge === ibge); return m && r && r.vs[r.w] > 0 ? SERIES[r.w] : "#ddd"; }}
            tooltip={(ibge) => { const r = rows.find((x) => x.m.ibge === ibge); return r ? `<b>${r.m.nome}</b><br/>` + cands.map((c, k) => `${c.nome}: ${pf(pct(r.vs[k], r.vv))}`).join("<br/>") : ""; }}
            height={500} /> : <Loading />}
        </Card>
        <Card title={cands.length > 1 ? `Maiores diferenças (${cands[0].nome} − ${cands[1].nome})` : "Diferenças"}
          action={<Btn onClick={() => downloadCSV(`comparativo-${slug}.csv`, [["Município", ...cands.map((c) => c.nome)], ...rows.map((r) => [r.m.nome, ...r.vs])])}>CSV</Btn>}>
          {cands.length > 1 && (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              {[[...rows].sort((a, b) => b.diff - a.diff), [...rows].sort((a, b) => a.diff - b.diff)].map((l, k) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-semibold" style={{ color: SERIES[k] }}>Vantagem {cands[k].nome}</p>
                  <ol className="space-y-1">{l.slice(0, 15).map((r) => <li key={r.m.tse} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border"><span className="truncate">{r.m.nome}</span><span className="font-mono">{nf(Math.abs(r.diff))}</span></li>)}</ol>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
