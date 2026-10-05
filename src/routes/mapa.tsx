import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CARGOS, useMeta, useMunData, useMunicipios, useIbgeIndex, winner, heat, partyColor, nf, pf, pct } from "@/lib/eleicoes";
import { MapaBA } from "@/components/MapaBA";
import { PageHead, Card, Loading, Select, Bar } from "@/components/ui-bits";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa das Eleições 2026 na Bahia por município" },
      { name: "description", content: "Veja quem venceu em cada um dos 417 municípios da Bahia, por cargo, ou a força de cada candidato." },
      { property: "og:title", content: "Mapa das Eleições 2026 na Bahia" },
      { property: "og:description", content: "Vencedor por município e mapa de calor por candidato." },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  const [slug, setSlug] = useState("governador");
  const [cand, setCand] = useState("");
  const [sel, setSel] = useState<string>();
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const { data: md } = useMunData(slug);
  const { byIbge } = useIbgeIndex(muns);
  const cargo = meta?.cargos.find((c) => c.slug === slug);
  const candIdx = cargo ? cargo.candidatos.findIndex((c) => c.id === cand) : -1;

  const stats = useMemo(() => {
    if (!md || !cargo) return null;
    const wins: Record<number, number> = {};
    let maxP = 0;
    for (const m of Object.values(md)) {
      const w = winner(m); if (w >= 0) wins[w] = (wins[w] ?? 0) + 1;
      if (m && candIdx >= 0) maxP = Math.max(maxP, pct(m.v[candIdx] ?? 0, m.vv));
    }
    return { wins: Object.entries(wins).map(([k, v]) => ({ c: cargo.candidatos[+k], n: v })).sort((a, b) => b.n - a.n), maxP };
  }, [md, cargo, candIdx]);

  if (!meta || !cargo || !muns) return <Loading />;
  const selMun = sel ? byIbge[sel] : undefined;
  const selRes = selMun && md ? md[selMun.tse] : null;
  const candColor = candIdx >= 0 ? partyColor(cargo.candidatos[candIdx].partido) : "";

  const fill = (ibge: string) => {
    const m = byIbge[ibge]; const r = m && md?.[m.tse];
    if (!r) return "#ddd";
    if (candIdx >= 0) return heat(pct(r.v[candIdx] ?? 0, r.vv), stats?.maxP ?? 100, candColor);
    const w = winner(r); return w >= 0 ? partyColor(cargo.candidatos[w].partido) : "#ddd";
  };
  const tip = (ibge: string) => {
    const m = byIbge[ibge]; const r = m && md?.[m.tse];
    if (!m || !r) return m?.nome ?? "";
    if (candIdx >= 0) return `<b>${m.nome}</b><br/>${cargo.candidatos[candIdx].nome}: ${pf(pct(r.v[candIdx] ?? 0, r.vv))}`;
    const w = winner(r); const c = cargo.candidatos[w];
    return `<b>${m.nome}</b><br/>${c?.nome} (${c?.partido}) ${pf(pct(r.v[w] ?? 0, r.vv))}`;
  };

  return (
    <div>
      <PageHead kicker="Mapa" title="Bahia, município por município" />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={slug} onChange={(v) => { setSlug(v); setCand(""); }}>
          {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
        </Select>
        <Select value={cand} onChange={setCand} className="min-w-64">
          <option value="">Colorir pelo vencedor</option>
          {cargo.candidatos.slice(0, 200).map((c) => <option key={c.id} value={c.id}>Força de: {c.nome} ({c.partido})</option>)}
        </Select>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {md ? <MapaBA fill={fill} tooltip={tip} onSelect={setSel} selected={sel} /> : <Loading />}
          <p className="mt-2 text-xs text-muted-foreground">
            {candIdx >= 0 ? `Tom mais forte = maior % de votos válidos (máx. ${pf(stats?.maxP ?? 0)}).` : "Cor do partido do candidato mais votado em cada município."} Clique em um município para detalhes.
          </p>
        </div>
        <div className="space-y-5">
          {selMun && selRes && (
            <Card title={selMun.nome} action={<Link to="/municipio/$codigo" params={{ codigo: selMun.tse }} className="text-sm text-primary underline">abrir</Link>}>
              <p className="mb-3 text-xs text-muted-foreground">{nf(selRes.el)} eleitores · comparecimento {pf(pct(selRes.co, selRes.el))}</p>
              <ul className="space-y-2">
                {Object.entries(selRes.v).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => {
                  const c = cargo.candidatos[+k];
                  return (
                    <li key={k} className="text-sm">
                      <div className="flex justify-between"><span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span><span className="font-mono">{pf(pct(v, selRes.vv))}</span></div>
                      <Bar value={pct(v, selRes.vv)} color={partyColor(c.partido)} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title="Municípios vencidos">
            <ul className="space-y-1.5 text-sm">
              {stats?.wins.slice(0, 15).map(({ c, n }) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: partyColor(c.partido) }} />{c.nome} ({c.partido})</span>
                  <span className="font-mono">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
