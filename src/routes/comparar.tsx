import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CARGOS, SERIES, useMeta, useMunData, useMunicipios, useIbgeIndex, nf, pf, pct, downloadCSV } from "@/lib/eleicoes";
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

  return (
    <div>
      <PageHead kicker="Comparativo" title="Candidato contra candidato" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={slug} onChange={(v) => { setSlug(v); setIds([]); }}>
          {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
        </Select>
        {[0, 1, 2, 3].map((k) => (k <= sel.length && k < 4) && (
          <div key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIES[k] }} />
            <Select value={sel[k] ?? ""} onChange={(v) => setAt(k, v)} className="max-w-56">
              <option value="">{k < 2 ? "Escolha" : "+ adicionar"}</option>
              {cargo.candidatos.slice(0, 300).map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.partido})</option>)}
            </Select>
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cands.map((c, k) => (
          <div key={c.id} className="rounded-md border-t-4 bg-card p-4" style={{ borderColor: SERIES[k] }}>
            <Link to="/candidato/$id" params={{ id: c.id }} className="font-display text-xl font-bold hover:underline">{c.nome}</Link>
            <p className="text-sm text-muted-foreground">{c.partido} · {c.situacao || "—"}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Votos" value={<span className="text-base">{nf(c.votos)}</span>} />
              <Stat label="%" value={<span className="text-base">{pf(c.pct)}</span>} />
              <Stat label="Vence em" value={<span className="text-base">{wins[k]}</span>} sub="municípios" />
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
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[[...rows].sort((a, b) => b.diff - a.diff), [...rows].sort((a, b) => a.diff - b.diff)].map((l, k) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-semibold" style={{ color: SERIES[k] }}>Vantagem {cands[k].nome}</p>
                  <ol className="space-y-1">{l.slice(0, 15).map((r) => <li key={r.m.tse} className="flex justify-between border-b border-border"><span className="truncate">{r.m.nome}</span><span className="font-mono">{nf(Math.abs(r.diff))}</span></li>)}</ol>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
