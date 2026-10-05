import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CARGOS, useMeta, nf, pf, partyColor, slugify, pct, downloadCSV } from "@/lib/eleicoes";
import { PageHead, Stat, Card, Loading, CargoTabs, Btn } from "@/components/ui-bits";

export const Route = createFileRoute("/cargo/$cargo")({
  beforeLoad: ({ params }) => { if (!CARGOS.some((c) => c.slug === params.cargo)) throw notFound(); },
  head: ({ params }) => {
    const n = CARGOS.find((c) => c.slug === params.cargo)?.nome ?? "Cargo";
    return {
      meta: [
        { title: `${n} — Data5 Analytics | Eleições 2026 - BA` },
        { name: "description", content: `Resultado completo para ${n} na Bahia em 2026: ranking, partidos e eleitos.` },
        { property: "og:title", content: `${n} — Data5 Analytics | Eleições 2026 - BA` },
        { property: "og:description", content: `Ranking de candidatos e votos por partido para ${n}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CargoPage,
});

function CargoPage() {
  const { cargo: slug } = Route.useParams();
  const { data: meta } = useMeta();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"votos" | "nome">("votos");
  const cargo = meta?.cargos.find((c) => c.slug === slug);

  const partidos = useMemo(() => {
    if (!cargo) return [];
    const m: Record<string, { sg: string; votos: number; eleitos: number; cands: number }> = {};
    for (const c of cargo.candidatos) {
      const p = (m[c.partido] ??= { sg: c.partido, votos: 0, eleitos: 0, cands: 0 });
      p.votos += c.votos; p.cands++; if (c.eleito || c.sitTipo === "eleito") p.eleitos++;
    }
    for (const p of cargo.partidos) if (m[p.sg] && p.votosTot > m[p.sg].votos) m[p.sg].votos = p.votosTot;
    return Object.values(m).sort((a, b) => b.votos - a.votos);
  }, [cargo]);

  if (!meta || !cargo) return <Loading />;
  const r = cargo.resumo;
  const multi = cargo.vagas > 2;
  const list = cargo.candidatos
    .filter((c) => !q || slugify(c.nome + c.partido + c.n).includes(slugify(q)))
    .sort((a, b) => (sort === "votos" ? b.votos - a.votos : a.nome.localeCompare(b.nome)));
  const chart = cargo.candidatos.slice(0, 15).map((c) => ({ nome: c.nome, votos: c.votos, partido: c.partido }));
  const eleitos = cargo.candidatos.filter((c) => c.eleito || c.sitTipo === "eleito").length;
  const projecao = cargo.candidatos.some((c) => c.proj);

  return (
    <div>
      <CargoTabs current={slug} />
      <PageHead kicker={`${cargo.vagas} vaga${cargo.vagas > 1 ? "s" : ""} · resultado final`} title={cargo.nome} />
      {projecao && (
        <p role="note" className="mb-6 rounded-md border-l-4 border-primary bg-card px-4 py-3 text-sm">
          A situação de cada candidato (eleito ou suplente) é uma projeção: o TSE já distribuiu as vagas por partido e federação, mas ainda não publicou a lista de eleitos.{" "}
          <Link to="/relatorios" search={{ r: "faltou", cargo: slug }} className="text-primary underline">Ver eleitos, suplentes e quanto faltou</Link>
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Votos válidos" value={nf(r.validos)} />
        <Stat label="Brancos" value={pf(pct(r.brancos, r.total))} sub={nf(r.brancos)} />
        <Stat label="Nulos" value={pf(pct(r.nulos, r.total))} sub={nf(r.nulos)} />
        <Stat label="Candidatos" value={cargo.candidatos.length} />
        {cargo.qe ? <Stat label="Quociente eleitoral" value={nf(cargo.qe)} /> : <Stat label="Eleitos" value={eleitos || "—"} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={multi ? "15 mais votados" : "Votação"}>
          <div style={{ height: Math.max(220, chart.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tickFormatter={(v) => nf(v)} fontSize={11} />
                <YAxis type="category" dataKey="nome" width={150} fontSize={11} />
                <Tooltip formatter={(v: number) => nf(v)} />
                <RBar dataKey="votos">{chart.map((c, i) => <Cell key={i} fill={partyColor(c.partido)} />)}</RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Por partido" action={<Btn onClick={() => downloadCSV(`partidos-${slug}.csv`, [["Partido", "Votos", "Candidatos", "Eleitos"], ...partidos.map((p) => [p.sg, p.votos, p.cands, p.eleitos])])}>CSV</Btn>}>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-1">Partido</th><th className="text-right">Votos</th><th className="text-right">%</th><th className="text-right">Cands.</th><th className="text-right">Eleitos</th></tr>
              </thead>
              <tbody>
                {partidos.map((p) => (
                  <tr key={p.sg} className="border-t border-border">
                    <td className="py-1.5"><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: partyColor(p.sg) }} />{p.sg}</td>
                    <td className="text-right font-mono">{nf(p.votos)}</td>
                    <td className="text-right font-mono">{pf(pct(p.votos, r.validos))}</td>
                    <td className="text-right font-mono">{p.cands}</td>
                    <td className="text-right font-mono font-semibold">{p.eleitos || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Todos os candidatos" action={
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, partido, número" className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            <Btn onClick={() => setSort(sort === "votos" ? "nome" : "votos")}>Ordenar: {sort}</Btn>
            <Btn onClick={() => downloadCSV(`candidatos-${slug}.csv`, [["Nome", "Número", "Partido", "Coligação", "Votos", "%", "Situação"], ...cargo.candidatos.map((c) => [c.nome, c.n, c.partido, c.agr, c.votos, c.pct, c.sit || c.situacao])])}>CSV</Btn>
          </div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-1">#</th><th>Candidato</th><th>Nº</th><th>Partido</th><th className="hidden md:table-cell">Coligação/Federação</th><th className="text-right">Votos</th><th className="text-right">%</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {list.slice(0, 300).map((c, i) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                    <td><Link to="/candidato/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.nome}</Link></td>
                    <td className="font-mono">{c.n}</td>
                    <td>{c.partido}</td>
                    <td className="hidden max-w-xs truncate text-muted-foreground md:table-cell">{c.agr}</td>
                    <td className="text-right font-mono">{nf(c.votos)}</td>
                    <td className="text-right font-mono">{pf(c.pct)}</td>
                    <td className={c.eleito || c.sitTipo === "eleito" ? "font-semibold text-primary" : "text-muted-foreground"}>{c.sit || c.situacao || (c.valido !== "Válido" ? c.valido : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Mostrando 300 de {list.length}. Use a busca ou baixe o CSV.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
