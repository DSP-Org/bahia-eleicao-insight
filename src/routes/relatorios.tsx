import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CARGOS, useMeta, useMunData, useMunicipios, winner, nf, pf, pct, downloadCSV, slugify } from "@/lib/eleicoes";
import { PageHead, Card, Loading, Select, Btn } from "@/components/ui-bits";
import { FileDown, LoaderCircle } from "lucide-react";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Data Analytics | Bahia 2026" },
      { name: "description", content: "Data Analytics: relatórios das Eleições 2026 na Bahia por município, região e concentração de votos, em PDF e CSV." },
      { property: "og:title", content: "Relatórios — Data Analytics | Bahia 2026" },
      { property: "og:description", content: "Relatórios completos com filtro e download em PDF e CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

const TIPOS = [
  { v: "mun", n: "Por município" },
  { v: "reg", n: "Por região (IBGE)" },
  { v: "abst", n: "Comparecimento e abstenção" },
  { v: "conc", n: "Concentração de votos" },
];

function Relatorios() {
  const [tipo, setTipo] = useState("mun");
  const [slug, setSlug] = useState("governador");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const { data: md } = useMunData(slug);
  const cargo = meta?.cargos.find((c) => c.slug === slug);

  const table = useMemo((): { head: string[]; rows: (string | number)[][]; links?: string[] } | null => {
    if (!md || !muns || !cargo) return null;
    const C = cargo.candidatos;
    if (tipo === "mun") {
      const t1 = C[0], t2 = C[1];
      const rows = muns.map((m) => {
        const r = md[m.tse]; if (!r) return [m.nome, "", "", "", "", "", "", ""];
        const w = winner(r);
        return [m.nome, m.ri, r.el, pf(pct(r.co, r.el)), `${C[w]?.nome} (${C[w]?.partido})`, pf(pct(r.v[w] ?? 0, r.vv)), pf(pct(r.v[0] ?? 0, r.vv)), pf(pct(r.v[1] ?? 0, r.vv))];
      });
      return { head: ["Município", "Região", "Eleitores", "Comparec.", "Vencedor", "% venc.", `% ${t1.nome}`, `% ${t2?.nome}`], rows, links: muns.map((m) => m.tse) };
    }
    if (tipo === "reg" || tipo === "abst") {
      const g: Record<string, { el: number; co: number; ab: number; vb: number; vn: number; vv: number; v: Record<number, number>; n: number }> = {};
      muns.forEach((m) => {
        const r = md[m.tse]; if (!r) return;
        const x = (g[m.ri] ??= { el: 0, co: 0, ab: 0, vb: 0, vn: 0, vv: 0, v: {}, n: 0 });
        x.el += r.el; x.co += r.co; x.ab += r.ab; x.vb += r.vb; x.vn += r.vn; x.vv += r.vv; x.n++;
        for (const [k, v] of Object.entries(r.v)) x.v[+k] = (x.v[+k] ?? 0) + v;
      });
      const ent = Object.entries(g);
      if (tipo === "abst") {
        const rows = muns.flatMap((m) => { const r = md[m.tse]; if (!r) return []; return [[m.nome, m.ri, r.el, r.co, pf(pct(r.co, r.el)), pf(pct(r.ab, r.el)), pf(pct(r.vb, r.co)), pf(pct(r.vn, r.co))]]; })
          .sort((a, b) => parseFloat(String(b[5]).replace(",", ".")) - parseFloat(String(a[5]).replace(",", ".")));
        return { head: ["Município", "Região", "Eleitores", "Comparec.", "% comparec.", "% abstenção", "% brancos", "% nulos"], rows };
      }
      const rows = ent.map(([n, x]) => {
        const top = Object.entries(x.v).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return [n, x.n, x.el, pf(pct(x.co, x.el)), ...top.flatMap(([k, v]) => [`${C[+k].nome} (${C[+k].partido})`, pf(pct(v, x.vv))])];
      }).sort((a, b) => Number(b[2]) - Number(a[2]));
      return { head: ["Região", "Municípios", "Eleitores", "Comparec.", "1º", "%", "2º", "%", "3º", "%"], rows };
    }
    // concentração: para cada candidato, % dos votos no maior município e índice HHI
    const acc = C.map(() => ({ top: 0, topMun: "", hhi: 0, n: 0 }));
    muns.forEach((m) => {
      const r = md[m.tse]; if (!r) return;
      for (const [k, v] of Object.entries(r.v)) {
        const a = acc[+k]; const tot = C[+k].votos || 1; const s = v / tot;
        a.hhi += s * s; a.n++; if (v > a.top) { a.top = v; a.topMun = m.nome; }
      }
    });
    const rows = C.slice(0, 400).map((c, i) => [c.nome, c.partido, c.votos, acc[i].n, acc[i].topMun, pf(pct(acc[i].top, c.votos)), (acc[i].hhi * 10000).toFixed(0)]);
    return { head: ["Candidato", "Partido", "Votos", "Municípios c/ voto", "Maior reduto", "% no reduto", "Índice concentração (HHI)"], rows };
  }, [tipo, md, muns, cargo]);

  if (!meta) return <Loading />;
  const rows = table ? table.rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || slugify(r.join(" ")).includes(slugify(q))) : [];
  const exportPDF = async () => {
    if (!table || !cargo || exporting) return;
    setExporting(true); setPdfError("");
    try {
      const { downloadReportPDF } = await import("@/lib/report-pdf");
      await downloadReportPDF({
        title: TIPOS.find((t) => t.v === tipo)?.n ?? "Relatório", cargo: cargo.nome,
        filter: q, headers: table.head, rows: rows.map((x) => x.r),
        summary: [
          { label: "Votos válidos no estado", value: nf(cargo.resumo.validos) },
          { label: "Comparecimento no estado", value: pf(pct(cargo.resumo.comp, cargo.resumo.eleitores)) },
          { label: "Registros selecionados", value: nf(rows.length) },
        ],
        ranking: cargo.candidatos.slice(0, 3).map((c) => ({ name: `${c.nome} (${c.partido})`, value: `${nf(c.votos)} votos · ${pf(c.pct)}`, share: c.pct / 100 })),
      });
    } catch (error) { console.error("Falha ao gerar relatório PDF", error); setPdfError("Não foi possível gerar o PDF. Tente novamente."); }
    finally { setExporting(false); }
  };

  return (
    <div>
      <PageHead kicker="Data Analytics · Relatórios" title="Dados em tabela" />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-1">
          {TIPOS.map((t) => (
            <button key={t.v} onClick={() => setTipo(t.v)} className={`rounded-full border px-3 py-1.5 text-sm ${tipo === t.v ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"}`}>{t.n}</button>
          ))}
        </div>
        <Select value={slug} onChange={setSlug}>{CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}</Select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        {table && <Btn onClick={() => downloadCSV(`relatorio-${tipo}-${slug}.csv`, [table.head, ...rows.map((x) => x.r)])}>Baixar CSV</Btn>}
        {table && <Btn onClick={exportPDF} disabled={exporting}>{exporting ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : <FileDown size={16} />}{exporting ? "Gerando PDF…" : "Baixar PDF"}</Btn>}
      </div>
      {pdfError && <p role="alert" className="mb-3 text-sm text-destructive">{pdfError}</p>}
      {tipo === "conc" && <p className="mb-3 text-sm text-muted-foreground">HHI alto (perto de 10.000) = votos concentrados em poucos municípios; baixo = votação espalhada pelo estado.</p>}
      <Card>
        {!table ? <Loading /> : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr>{table.head.map((h, i) => <th key={i} className="px-2 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ r, i }) => (
                  <tr key={i} className="border-t border-border">
                    {r.map((c, k) => (
                      <td key={k} className={`px-2 py-1.5 ${typeof c === "number" || /^[\d.,%]+$/.test(String(c)) ? "text-right font-mono" : ""}`}>
                        {k === 0 && table.links ? <Link to="/municipio/$codigo" params={{ codigo: table.links[i] }} className="hover:underline">{c}</Link> : typeof c === "number" ? nf(c) : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
