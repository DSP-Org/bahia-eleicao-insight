import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { CARGOS, useMeta, useMunicipios, nf, pf, pct, partyColor, type MunData } from "@/lib/eleicoes";
import { PageHead, Stat, Card, Loading, Bar } from "@/components/ui-bits";

export const Route = createFileRoute("/municipio/$codigo")({
  head: () => ({
    meta: [
      { title: "Município — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Resultado de todos os cargos em um município da Bahia nas Eleições 2026." },
      { property: "og:title", content: "Resultado por município — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Comparecimento, votos por cargo e comparação com a média do estado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MunPage,
});

function MunPage() {
  const { codigo } = Route.useParams();
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const qs = useQueries({
    queries: CARGOS.map((c) => ({ queryKey: ["mun", c.slug], queryFn: () => fetch(`/data/mun-${c.slug}.json`).then((r) => r.json() as Promise<MunData>), staleTime: Infinity })),
  });
  const mun = muns?.find((m) => m.tse === codigo);
  if (!meta || !muns) return <Loading />;
  if (!mun) return <p>Município não encontrado.</p>;
  const base = qs[1].data?.[codigo];
  const st = meta.cargos[1].resumo;

  return (
    <div>
      <PageHead kicker={`Região ${mun.ri} · ${mun.rim}`} title={mun.nome} />
      {base && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Eleitores" value={nf(base.el)} sub={`${pf(pct(base.el, st.eleitores))} do estado`} />
          <Stat label="Comparecimento" value={pf(pct(base.co, base.el))} sub={`Bahia: ${pf(pct(st.comp, st.eleitores))}`} />
          <Stat label="Abstenção" value={pf(pct(base.ab, base.el))} sub={nf(base.ab)} />
          <Stat label="Brancos + nulos (gov.)" value={pf(pct(base.vb + base.vn, base.co))} sub={`Bahia: ${pf(pct(st.brancos + st.nulos, st.total))}`} />
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {meta.cargos.map((c, ci) => {
          const r = qs[ci].data?.[codigo];
          if (!r) return <Card key={c.slug} title={c.nome}><Loading /></Card>;
          const top = Object.entries(r.v).sort((a, b) => b[1] - a[1]).slice(0, c.vagas > 2 ? 10 : 6);
          return (
            <Card key={c.slug} title={c.nome}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th>Candidato</th><th className="text-right">Votos</th><th className="text-right">%</th><th className="text-right">Bahia</th></tr></thead>
                <tbody>
                  {top.map(([k, v]) => {
                    const cand = c.candidatos[+k]; const p = pct(v, r.vv);
                    return (
                      <tr key={k} className="border-t border-border">
                        <td className="py-1.5">
                          <Link to="/candidato/$id" params={{ id: cand.id }} className="hover:underline">{cand.nome}</Link> <span className="text-muted-foreground">({cand.partido})</span>
                          <Bar value={p} color={partyColor(cand.partido)} />
                        </td>
                        <td className="text-right font-mono">{nf(v)}</td>
                        <td className="text-right font-mono">{pf(p)}</td>
                        <td className={`text-right font-mono ${p > cand.pct ? "text-primary" : "text-muted-foreground"}`}>{pf(cand.pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
