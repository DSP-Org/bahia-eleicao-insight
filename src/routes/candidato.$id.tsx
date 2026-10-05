import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMeta, useMunData, useMunicipios, useIbgeIndex, heat, partyColor, nf, pf, pct, downloadCSV } from "@/lib/eleicoes";
import { MapaBA } from "@/components/MapaBA";
import { PageHead, Stat, Card, Loading, Btn, Bar } from "@/components/ui-bits";

export const Route = createFileRoute("/candidato/$id")({
  head: () => ({
    meta: [
      { title: "Candidato — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Desempenho do candidato em cada município e região da Bahia nas Eleições 2026." },
      { property: "og:title", content: "Desempenho de candidato — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Mapa de votos, melhores e piores municípios e resultado por região." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CandPage,
});

function CandPage() {
  const { id } = Route.useParams();
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const cargo = meta?.cargos.find((c) => c.candidatos.some((k) => k.id === id));
  const idx = cargo?.candidatos.findIndex((k) => k.id === id) ?? -1;
  const cand = cargo?.candidatos[idx];
  const { data: md } = useMunData(cargo?.slug ?? "");
  const { byIbge } = useIbgeIndex(muns);

  const rows = useMemo(() => {
    if (!md || !muns) return [];
    return muns.map((m) => { const r = md[m.tse]; const v = r?.v[idx] ?? 0; return { m, v, p: pct(v, r?.vv ?? 0) }; });
  }, [md, muns, idx]);
  const regioes = useMemo(() => {
    const g: Record<string, { v: number; vv: number }> = {};
    rows.forEach(({ m, v }) => { const r = md?.[m.tse]; const x = (g[m.ri] ??= { v: 0, vv: 0 }); x.v += v; x.vv += r?.vv ?? 0; });
    return Object.entries(g).map(([n, x]) => ({ n, ...x, p: pct(x.v, x.vv) })).sort((a, b) => b.p - a.p);
  }, [rows, md]);

  if (!meta) return <Loading />;
  if (!cargo || !cand) return <p>Candidato não encontrado.</p>;
  const color = partyColor(cand.partido);
  const maxP = Math.max(0.01, ...rows.map((r) => r.p));
  const byPct = [...rows].sort((a, b) => b.p - a.p);
  const byVotes = [...rows].sort((a, b) => b.v - a.v);
  const zeros = rows.filter((r) => r.v === 0).length;
  const top10share = pct(byVotes.slice(0, 10).reduce((s, r) => s + r.v, 0), cand.votos);
  const pos = idx + 1;

  const List = ({ items }: { items: typeof rows }) => (
    <ol className="space-y-1 text-sm">
      {items.map(({ m, v, p }) => (
        <li key={m.tse} className="flex justify-between gap-2 border-b border-border py-1">
          <Link to="/municipio/$codigo" params={{ codigo: m.tse }} className="hover:underline">{m.nome}</Link>
          <span className="font-mono">{pf(p)} · {nf(v)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div>
      <PageHead kicker={`${cargo.nome} · ${cand.partido} · nº ${cand.n}`} title={cand.nome}>
        {cand.nomeCompleto} · {cand.agr}{cand.vice.length ? ` · Vice/suplentes: ${cand.vice.join(", ")}` : ""}
        {" · "}<Link to="/relatorios" search={{ r: "dossie", cand: cand.id }} className="text-primary underline">Dossiê completo (PDF)</Link>
      </PageHead>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Votos" value={nf(cand.votos)} />
        <Stat label="% válidos" value={pf(cand.pct)} />
        <Stat label="Posição" value={`${pos}º`} sub={`de ${cargo.candidatos.length}`} />
        <Stat label="Situação" value={<span className="text-lg">{cand.sit || cand.situacao || "—"}</span>}
          {...(cand.faltou != null ? { sub: `faltaram ${nf(cand.faltou)} votos` } : cand.margem != null ? { sub: `margem de ${nf(cand.margem)} votos` } : {})} />
        <Stat label="Concentração" value={pf(top10share, 1)} sub="dos votos vêm dos 10 maiores municípios" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card title="Força por município">
          {md ? <MapaBA
            fill={(ibge) => { const m = byIbge[ibge]; const r = m && md[m.tse]; return r ? heat(pct(r.v[idx] ?? 0, r.vv), maxP, color) : "#ddd"; }}
            tooltip={(ibge) => { const m = byIbge[ibge]; const r = m && md[m.tse]; return m && r ? `<b>${m.nome}</b><br/>${pf(pct(r.v[idx] ?? 0, r.vv))} · ${nf(r.v[idx] ?? 0)} votos` : ""; }}
            height={480} /> : <Loading />}
          <p className="mt-2 text-xs text-muted-foreground">Recebeu votos em {417 - zeros} de 417 municípios. Máximo: {pf(maxP)}.</p>
        </Card>
        <Card title="Por região intermediária (IBGE)">
          <ul className="space-y-2 text-sm">
            {regioes.map((r) => (
              <li key={r.n}><div className="flex justify-between"><span>{r.n}</span><span className="font-mono">{pf(r.p)}</span></div><Bar value={(r.p / (regioes[0]?.p || 1)) * 100} color={color} /></li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card title="Melhores (% válidos)"><List items={byPct.slice(0, 20)} /></Card>
        <Card title="Mais votos absolutos"><List items={byVotes.slice(0, 20)} /></Card>
        <Card title="Piores (% válidos)" action={<Btn onClick={() => downloadCSV(`${cand.nome}.csv`, [["Município", "Votos", "% válidos"], ...byPct.map((r) => [r.m.nome, r.v, r.p.toFixed(2)])])}>CSV</Btn>}>
          <List items={byPct.slice(-20).reverse()} />
        </Card>
      </div>
    </div>
  );
}
