import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMeta, useMunicipios, nf, pf, partyColor, slugify, pct } from "@/lib/eleicoes";
import { PageHead, Stat, Card, Loading, Bar } from "@/components/ui-bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eleições 2026 na Bahia — Resultados oficiais" },
      { name: "description", content: "Painel com os resultados do TSE das Eleições 2026 na Bahia: presidente, governador, senado e deputados." },
      { property: "og:title", content: "Eleições 2026 na Bahia — Resultados oficiais" },
      { property: "og:description", content: "Mapas por município, relatórios e comparativos de candidatos na Bahia." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const [q, setQ] = useState("");
  if (!meta) return <Loading />;
  const r = meta.cargos[1].resumo;
  const found = q.length > 1 && muns ? muns.filter((m) => slugify(m.nome).includes(slugify(q))).slice(0, 8) : [];

  return (
    <div>
      <PageHead kicker="Resultado final · 1º turno · análise pós-eleição" title="Eleições 2026 na Bahia">
        Resultado oficial do 1º turno (04/10/2026) para todos os cargos, com dados de cada um dos 417 municípios.
      </PageHead>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Eleitores" value={nf(r.eleitores)} />
        <Stat label="Comparecimento" value={pf(pct(r.comp, r.eleitores))} sub={nf(r.comp)} />
        <Stat label="Abstenção" value={pf(pct(r.abst, r.eleitores))} sub={nf(r.abst)} />
        <Stat label="Brancos (gov.)" value={pf(pct(r.brancos, r.total))} sub={nf(r.brancos)} />
        <Stat label="Nulos (gov.)" value={pf(pct(r.nulos, r.total))} sub={nf(r.nulos)} />
      </div>

      <div className="mb-8">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar município (ex.: Feira de Santana)"
          className="w-full rounded-md border border-input bg-card px-4 py-3" />
        {found.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {found.map((m) => (
              <Link key={m.tse} to="/municipio/$codigo" params={{ codigo: m.tse }} className="rounded-full border border-border bg-card px-3 py-1 text-sm hover:bg-accent">{m.nome}</Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {meta.cargos.map((c) => {
          const top = c.candidatos.slice(0, c.vagas > 2 ? 5 : Math.max(3, c.vagas + 1));
          return (
            <Card key={c.slug} title={c.nome} action={<Link to="/cargo/$cargo" params={{ cargo: c.slug }} className="text-sm text-primary underline">ver tudo</Link>}>
              {c.vagas > 2 && <p className="mb-3 text-sm text-muted-foreground">{c.vagas} vagas · {c.candidatos.length} candidatos · mais votados:</p>}
              <ul className="space-y-3">
                {top.map((k) => (
                  <li key={k.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <Link to="/candidato/$id" params={{ id: k.id }} className="font-semibold hover:underline">
                        {k.nome} <span className="font-normal text-muted-foreground">({k.partido})</span>
                        {k.eleito && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] uppercase text-primary-foreground">eleito</span>}
                      </Link>
                      <span className="font-mono">{pf(k.pct)} <span className="text-muted-foreground">· {nf(k.votos)}</span></span>
                    </div>
                    <Bar value={c.vagas > 2 ? (k.votos / top[0].votos) * 100 : k.pct} color={partyColor(k.partido)} />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
        <Card title="Explore">
          <div className="grid gap-2 text-sm">
            <Link to="/mapa" className="rounded-md border border-border p-3 hover:bg-accent"><b>Mapa por município</b> — quem venceu em cada cidade</Link>
            <Link to="/comparar" className="rounded-md border border-border p-3 hover:bg-accent"><b>Comparar candidatos</b> — até 4 lado a lado</Link>
            <Link to="/relatorios" className="rounded-md border border-border p-3 hover:bg-accent"><b>Relatórios</b> — tabelas e exportação CSV</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
