import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CARGOS, useMeta, useMunData, useMunicipios, useIbgeIndex, winner, heat, partyColor, nf, pf, pct, slugify } from "@/lib/eleicoes";
import { MapaBA } from "@/components/MapaBA";
import { BuscaItem } from "@/components/relatorios/BuscaItem";
import { PageHead, Card, Loading, Select, Bar } from "@/components/ui-bits";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa por município — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Veja quem venceu em cada um dos 417 municípios da Bahia, por cargo, ou a força de cada candidato." },
      { property: "og:title", content: "Mapa por município — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Vencedor por município e mapa de calor por candidato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  // Modo "evolucao": 2º turno de Presidente comparado ao 1º, cidade a cidade.
  const evo = slug === "evolucao";
  const { data: md } = useMunData(evo ? "presidente-2t" : slug);
  const { data: md1 } = useMunData(evo ? "presidente" : "");
  const { byIbge } = useIbgeIndex(muns);
  const cargo = meta?.cargos.find((c) => c.slug === (evo ? "presidente-2t" : slug));
  const cargo1 = meta?.cargos.find((c) => c.slug === "presidente");
  const candIdx = cargo && !evo ? cargo.candidatos.findIndex((c) => c.id === cand) : -1;
  // Finalistas: índice no 2º turno e no 1º (casados pelo número do candidato).
  const fin = useMemo(() => evo && cargo && cargo1 ? cargo.candidatos.slice(0, 2).map((c, i2) => ({ c, i2, i1: cargo1.candidatos.findIndex((x) => x.n === c.n) })) : [], [evo, cargo, cargo1]);
  const evoMun = (tse: string) => {
    const r2 = md?.[tse]; const r1 = md1?.[tse];
    if (!r1 || !r2 || fin.length < 2) return null;
    const d = fin.map((f) => { const v1 = r1.v[f.i1] ?? 0, v2 = r2.v[f.i2] ?? 0; return { f, v1, v2, p1: pct(v1, r1.vv), p2: pct(v2, r2.vv) }; });
    return { d, saldo: (d[0]!.p2 - d[0]!.p1) - (d[1]!.p2 - d[1]!.p1) };
  };
  const maxSaldo = useMemo(() => {
    if (!evo || !muns) return 1;
    let mx = 0.01; for (const m of muns) { const e = evoMun(m.tse); if (e) mx = Math.max(mx, Math.abs(e.saldo)); }
    return mx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evo, muns, md, md1, fin]);

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
    if (evo) { const e = evoMun(m.tse); if (!e) return "#ddd"; const k = e.saldo >= 0 ? 0 : 1; return heat(Math.abs(e.saldo), maxSaldo, partyColor(fin[k]!.c.partido)); }
    if (candIdx >= 0) return heat(pct(r.v[candIdx] ?? 0, r.vv), stats?.maxP ?? 100, candColor);
    const w = winner(r); return w >= 0 ? partyColor(cargo.candidatos[w].partido) : "#ddd";
  };
  const tip = (ibge: string) => {
    const m = byIbge[ibge]; const r = m && md?.[m.tse];
    if (!m || !r) return m?.nome ?? "";
    if (evo) {
      const e = evoMun(m.tse); if (!e) return m.nome;
      const sg = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
      return `<b>${m.nome}</b><br/>${e.d.map((x) => `${x.f.c.nome}: ${nf(x.v1)} → <b>${nf(x.v2)}</b> (${sg(x.v2 - x.v1)}) · ${pf(x.p1)} → ${pf(x.p2)}`).join("<br/>")}<br/><span style="opacity:.7">Votos válidos: ${nf(md1?.[m.tse]?.vv ?? 0)} → ${nf(r.vv)}</span>`;
    }
    const linha = (k: number) => {
      const c = cargo.candidatos[k]; const v = r.v[k] ?? 0;
      return `${c.nome} (${c.partido}): <b>${nf(v)}</b> votos · ${pf(pct(v, r.vv))}`;
    };
    const rodape = `<span style="opacity:.7">Votos válidos: ${nf(r.vv)}</span>`;
    if (candIdx >= 0) {
      const w = winner(r);
      const extra = w >= 0 && w !== candIdx ? `<br/>Venceu aqui: ${linha(w)}` : "";
      return `<b>${m.nome}</b><br/>${linha(candIdx)}${extra}<br/>${rodape}`;
    }
    const ord = Object.keys(r.v).map(Number).filter((k) => r.v[k] > 0).sort((a, b) => r.v[b] - r.v[a]);
    return `<b>${m.nome}</b><br/>${ord.slice(0, 3).map(linha).join("<br/>")}<br/>${rodape}`;
  };

  return (
    <div>
      <PageHead kicker="Mapa" title="Bahia, município por município" />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={slug} onChange={(v) => { setSlug(v); setCand(""); }}>
          {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          <option value="evolucao">Presidente – evolução 1º → 2º turno</option>
        </Select>
        {!evo && <div className="w-full min-w-0 sm:w-80">
          <BuscaItem
            itens={cargo.candidatos}
            busca={(c) => slugify(`${c.nome} ${c.partido} ${c.n}`)}
            placeholder="Força de um candidato… (padrão: vencedor)"
            rotulo="Buscar candidato para colorir o mapa"
            render={(c) => <span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span>}
            chip={(c) => <>Força de: <b className="font-medium">{c.nome}</b> <span className="text-muted-foreground">({c.partido})</span></>}
            selecionado={candIdx >= 0 ? cargo.candidatos[candIdx] : null}
            onLimpar={() => setCand("")}
            rotuloLimpar="Voltar ao mapa de vencedores"
            onEscolher={(c) => setCand(c.id)}
          />
        </div>}

      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {md ? <MapaBA fill={fill} tooltip={tip} onSelect={setSel} selected={sel} /> : <Loading />}
          <p className="mt-2 text-xs text-muted-foreground">
            {evo && fin.length === 2 ? `Cor de quem mais cresceu em percentual do 1º para o 2º turno (${fin[0]!.c.nome} ou ${fin[1]!.c.nome}); tom mais forte = diferença maior (máx. ${maxSaldo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.).` : candIdx >= 0 ? `Tom mais forte = maior % de votos válidos (máx. ${pf(stats?.maxP ?? 0)}).` : "Cor do partido do candidato mais votado em cada município."} Clique em um município para detalhes.
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
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span><span className="font-mono">{pf(pct(v, selRes.vv))}</span></div>
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
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="flex min-w-0 items-center gap-2"><span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: partyColor(c.partido) }} />{c.nome} ({c.partido})</span>
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
