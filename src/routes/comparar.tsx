import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CARGOS,
  SERIES,
  downloadCSV,
  nf,
  pct,
  pf,
  slugify,
  useIbgeIndex,
  useMeta,
  useMunData,
  useMunicipios,
  type Candidato,
  type Cargo,
  type MunData,
} from "@/lib/eleicoes";
import { BuscaItem } from "@/components/relatorios/BuscaItem";
import { MapaBA } from "@/components/MapaBA";
import { Btn, Card, Loading, PageHead, Select } from "@/components/ui-bits";

export const Route = createFileRoute("/comparar")({
  head: () => ({
    meta: [
      { title: "Comparar candidatos e cargos — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Compare candidatos do mesmo cargo ou de cargos diferentes na Bahia, por votos, percentual e desempenho municipal." },
      { property: "og:title", content: "Comparar candidatos e cargos — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Confronte votos absolutos, desempenho relativo e força territorial dos candidatos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Comparar,
});

type Mode = "mesmo" | "diferentes";
type Escolha = { cargoSlug: string; candidatoId: string };
type CandidatoComCargo = { candidato: Candidato; cargo: Cargo; indice: number };

function Comparar() {
  const [modo, setModo] = useState<Mode>("mesmo");
  const [slug, setSlug] = useState("governador");
  const [ids, setIds] = useState<string[]>([]);
  const [escolhas, setEscolhas] = useState<Escolha[]>([
    { cargoSlug: "governador", candidatoId: "" },
    { cargoSlug: "senador", candidatoId: "" },
  ]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const presidente = useMunData("presidente");
  const governador = useMunData("governador");
  const senador = useMunData("senador");
  const federal = useMunData("deputado-federal");
  const estadual = useMunData("deputado-estadual");
  const { byIbge } = useIbgeIndex(muns);

  const dadosPorCargo: Record<string, MunData | undefined> = {
    presidente: presidente.data,
    governador: governador.data,
    senador: senador.data,
    "deputado-federal": federal.data,
    "deputado-estadual": estadual.data,
  };

  const cargo = meta?.cargos.find((c) => c.slug === slug);
  const sel = cargo ? (ids.length ? ids : cargo.candidatos.slice(0, 2).map((c) => c.id)) : [];
  const idxs = cargo ? sel.map((id) => cargo.candidatos.findIndex((c) => c.id === id)).filter((i) => i >= 0) : [];
  const cands = cargo ? idxs.map((i) => cargo.candidatos[i]) : [];

  const candidatosDiferentes = useMemo<CandidatoComCargo[]>(() => {
    if (!meta) return [];
    return escolhas.flatMap((escolha) => {
      const cargoEscolhido = meta.cargos.find((item) => item.slug === escolha.cargoSlug);
      if (!cargoEscolhido) return [];
      const indice = cargoEscolhido.candidatos.findIndex((item) => item.id === escolha.candidatoId);
      const indiceFinal = indice >= 0 ? indice : 0;
      const candidato = cargoEscolhido.candidatos[indiceFinal];
      return candidato ? [{ candidato, cargo: cargoEscolhido, indice: indiceFinal }] : [];
    });
  }, [escolhas, meta]);

  const linhasMesmo = useMemo(() => {
    const md = dadosPorCargo[slug];
    if (!md || !muns) return [];
    return muns.map((m) => {
      const r = md[m.tse];
      const votos = idxs.map((i) => r?.v[i] ?? 0);
      let vencedor = 0;
      votos.forEach((v, k) => { if (v > votos[vencedor]) vencedor = k; });
      return { m, votos, validos: r?.vv ?? 0, vencedor };
    });
  }, [dadosPorCargo[slug], muns, idxs.join(), slug]);

  const linhasDiferentes = useMemo(() => {
    if (!muns) return [];
    return muns.map((m) => {
      const resultados = candidatosDiferentes.map(({ cargo: cargoItem, indice }) => {
        const resultado = dadosPorCargo[cargoItem.slug]?.[m.tse];
        const votos = resultado?.v[indice] ?? 0;
        const validos = resultado?.vv ?? 0;
        return { votos, validos, percentual: pct(votos, validos) };
      });
      let vencedorRelativo = 0;
      resultados.forEach((r, k) => { if (r.percentual > resultados[vencedorRelativo].percentual) vencedorRelativo = k; });
      return { m, resultados, vencedorRelativo };
    });
  }, [candidatosDiferentes, muns, presidente.data, governador.data, senador.data, federal.data, estadual.data]);

  if (!meta || !cargo) return <Loading />;

  const wins = cands.map((_, k) => linhasMesmo.filter((r) => r.vencedor === k && r.votos[k] > 0).length);
  const liderancasRelativas = candidatosDiferentes.map((_, k) => linhasDiferentes.filter((r) => r.vencedorRelativo === k && r.resultados[k]?.votos > 0).length);
  const setAt = (k: number, id: string) => {
    const novos = [...sel];
    novos[k] = id;
    setIds(novos.filter(Boolean));
  };
  const setEscolha = (k: number, patch: Partial<Escolha>) => {
    setEscolhas((atuais) => atuais.map((item, i) => i === k ? { ...item, ...patch } : item));
  };

  const vantagens = cands.map((_, k) =>
    linhasMesmo
      .map((r) => ({ r, valor: r.votos[k] - Math.max(...r.votos.filter((_, j) => j !== k)) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15),
  );
  const destaquesRelativos = candidatosDiferentes.map((_, k) =>
    linhasDiferentes
      .map((r) => ({ r, valor: r.resultados[k]?.percentual ?? 0 }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10),
  );

  const baixarPDF = async () => {
    setPdfBusy(true);
    try {
      const { downloadReportPDF } = await import("@/lib/report-pdf");
      if (modo === "mesmo") {
        await downloadReportPDF({
          title: `Comparativo — ${cargo.nome}`,
          cargo: cargo.nome,
          filter: cands.map((c) => c.nome).join(" × "),
          headers: ["Município", ...cands.map((c) => c.nome), "Vencedor", "Diferença"],
          rows: linhasMesmo.map((r) => [r.m.nome, ...r.votos, r.votos[r.vencedor] > 0 ? cands[r.vencedor].nome : "—", r.votos[r.vencedor] - Math.max(0, ...r.votos.filter((_, j) => j !== r.vencedor))]),
          summary: [...cands.slice(0, 3).map((c) => ({ label: c.nome, value: nf(c.votos) })), { label: "Municípios", value: nf(linhasMesmo.length) }],
          ranking: cands.map((c, k) => ({ name: c.nome, value: `${nf(wins[k])} municípios`, share: linhasMesmo.length ? wins[k] / linhasMesmo.length : 0 })),
        });
      } else {
        await downloadReportPDF({
          title: "Comparativo entre cargos",
          cargo: candidatosDiferentes.map((item) => item.cargo.nome).join(" × "),
          filter: candidatosDiferentes.map((item) => `${item.candidato.nome} (${item.cargo.nome})`).join(" × "),
          headers: ["Município", ...candidatosDiferentes.flatMap((item) => [`${item.candidato.nome} votos`, `${item.candidato.nome} %`])],
          rows: linhasDiferentes.map((r) => [r.m.nome, ...r.resultados.flatMap((item) => [item.votos, pf(item.percentual)])]),
          summary: candidatosDiferentes.map((item) => ({ label: `${item.candidato.nome} · ${item.cargo.nome}`, value: nf(item.candidato.votos) })),
          ranking: candidatosDiferentes.map((item, k) => ({ name: item.candidato.nome, value: pf(item.candidato.pct), share: item.candidato.pct / 100 })),
        });
      }
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div>
      <PageHead kicker="Comparativo" title="Candidato contra candidato">
        Compare resultados dentro da mesma disputa ou avalie o desempenho de candidatos a cargos diferentes.
      </PageHead>

      <div className="mb-5 grid grid-cols-2 rounded-md bg-muted p-1" role="tablist" aria-label="Tipo de comparação">
        <button type="button" role="tab" aria-selected={modo === "mesmo"} onClick={() => setModo("mesmo")} className={`min-h-10 rounded-sm px-3 text-sm font-semibold transition-colors ${modo === "mesmo" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Mesmo cargo</button>
        <button type="button" role="tab" aria-selected={modo === "diferentes"} onClick={() => setModo("diferentes")} className={`min-h-10 rounded-sm px-3 text-sm font-semibold transition-colors ${modo === "diferentes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Cargos diferentes</button>
      </div>

      {modo === "mesmo" ? (
        <>
          <div className="mb-5 grid gap-3 lg:grid-cols-[180px_1fr] lg:items-start">
            <Select value={slug} onChange={(v) => { setSlug(v); setIds([]); }} className="w-full">
              {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
            </Select>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((k) => (k <= sel.length && k < 4) && (
                <BuscaCandidato key={k} cor={SERIES[k]} cargo={cargo} candidatoId={sel[k]} indice={k} onEscolher={(id) => setAt(k, id)} />
              ))}
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cands.map((c, k) => <CandidateCard key={c.id} candidato={c} cargo={cargo} cor={SERIES[k]} posicao={idxs[k] + 1} destaqueLabel="Vence em" destaqueValor={`${nf(wins[k])} municípios`} />)}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Card title="Quem venceu cada município" action={<span className="text-xs text-muted-foreground">Entre os escolhidos</span>}>
              <MapaBA
                fill={(ibge) => { const m = byIbge[ibge]; const r = linhasMesmo.find((x) => x.m.ibge === ibge); return m && r && r.votos[r.vencedor] > 0 ? SERIES[r.vencedor] : "#ddd"; }}
                tooltip={(ibge) => { const r = linhasMesmo.find((x) => x.m.ibge === ibge); return r ? `<b>${r.m.nome}</b><br/>` + cands.map((c, k) => `${c.nome}: <b>${nf(r.votos[k])}</b> votos · ${pf(pct(r.votos[k], r.validos))}`).join("<br/>") + `<br/><span style="opacity:.7">Votos válidos: ${nf(r.validos)}</span>` : ""; }}
                height={500}
              />
            </Card>
            <RankingPanel title="Maiores vantagens" grupos={vantagens.map((lista, k) => ({ nome: cands[k].nome, cor: SERIES[k], itens: lista.map(({ r, valor }) => ({ nome: r.m.nome, valor: nf(valor) })) }))} onCsv={() => downloadCSV(`comparativo-${slug}.csv`, [["Município", ...cands.map((c) => c.nome)], ...linhasMesmo.map((r) => [r.m.nome, ...r.votos])])} onPdf={baixarPDF} pdfBusy={pdfBusy} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            {escolhas.map((escolha, k) => {
              const cargoEscolhido = meta.cargos.find((item) => item.slug === escolha.cargoSlug) ?? meta.cargos[0];
              const candidatoAtual = candidatosDiferentes[k]?.candidato;
              return (
                <div key={k} className="grid gap-2 border-l-2 bg-card p-3" style={{ borderColor: SERIES[k] }}>
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Candidato {k + 1}</span>
                  <Select value={cargoEscolhido.slug} onChange={(novoCargo) => setEscolha(k, { cargoSlug: novoCargo, candidatoId: "" })} className="w-full">
                    {CARGOS.map((item) => <option key={item.slug} value={item.slug}>{item.nome}</option>)}
                  </Select>
                  <BuscaItem
                    itens={cargoEscolhido.candidatos}
                    busca={(c) => slugify(`${c.nome} ${c.partido} ${c.n}`)}
                    placeholder="Digite nome, partido ou número…"
                    rotulo={`Candidato ${k + 1}`}
                    render={(c) => <span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span>}
                    selecionado={candidatoAtual ?? null}
                    chip={(c) => <span>{c.nome} <span className="text-muted-foreground">· {cargoEscolhido.nome}</span></span>}
                    onEscolher={(c) => setEscolha(k, { candidatoId: c.id })}
                  />
                </div>
              );
            })}
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {candidatosDiferentes.map((item, k) => <CandidateCard key={`${item.cargo.slug}-${item.candidato.id}`} candidato={item.candidato} cargo={item.cargo} cor={SERIES[k]} posicao={item.indice + 1} destaqueLabel="Maior percentual" destaqueValor={`${nf(liderancasRelativas[k])} municípios`} />)}
          </div>

          <div className="mb-5 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
            <ComparativeCallout label="Mais votos absolutos" candidato={candidatosDiferentes.reduce((melhor, atual) => atual.candidato.votos > melhor.candidato.votos ? atual : melhor, candidatosDiferentes[0])} value={(item) => nf(item.candidato.votos)} />
            <ComparativeCallout label="Maior percentual no próprio cargo" candidato={candidatosDiferentes.reduce((melhor, atual) => atual.candidato.pct > melhor.candidato.pct ? atual : melhor, candidatosDiferentes[0])} value={(item) => pf(item.candidato.pct)} />
          </div>
          <p className="mb-5 border-l-2 border-primary pl-3 text-sm text-muted-foreground">Votos absolutos mostram o tamanho total da votação. Percentuais permitem comparar o desempenho em disputas com quantidades diferentes de votos válidos.</p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Card title="Maior força relativa por município" action={<span className="text-xs text-muted-foreground">Percentual no próprio cargo</span>}>
              <MapaBA
                fill={(ibge) => { const r = linhasDiferentes.find((x) => x.m.ibge === ibge); return r && r.resultados[r.vencedorRelativo]?.votos > 0 ? SERIES[r.vencedorRelativo] : "#ddd"; }}
                tooltip={(ibge) => { const r = linhasDiferentes.find((x) => x.m.ibge === ibge); return r ? `<b>${r.m.nome}</b><br/>` + candidatosDiferentes.map((item, k) => `${item.candidato.nome} (${item.cargo.nome}): <b>${nf(r.resultados[k]?.votos ?? 0)}</b> votos · ${pf(r.resultados[k]?.percentual ?? 0)}`).join("<br/>") : ""; }}
                height={500}
              />
            </Card>
            <RankingPanel title="Melhores desempenhos locais" grupos={destaquesRelativos.map((lista, k) => ({ nome: candidatosDiferentes[k].candidato.nome, cor: SERIES[k], itens: lista.map(({ r, valor }) => ({ nome: r.m.nome, valor: pf(valor) })) }))} onCsv={() => downloadCSV("comparativo-entre-cargos.csv", [["Município", ...candidatosDiferentes.flatMap((item) => [`${item.candidato.nome} votos`, `${item.candidato.nome} %`])], ...linhasDiferentes.map((r) => [r.m.nome, ...r.resultados.flatMap((item) => [item.votos, pf(item.percentual)])])])} onPdf={baixarPDF} pdfBusy={pdfBusy} />
          </div>
        </>
      )}
    </div>
  );
}

function BuscaCandidato({ cor, cargo, candidatoId, indice, onEscolher }: { cor: string; cargo: Cargo; candidatoId?: string; indice: number; onEscolher: (id: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: cor }} />
      <div className="min-w-0 flex-1">
        <BuscaItem itens={cargo.candidatos} busca={(c) => slugify(`${c.nome} ${c.partido} ${c.n}`)} placeholder={indice < 2 ? "Digite para buscar…" : "+ adicionar"} rotulo={`Candidato ${indice + 1}`} render={(c) => <span>{c.nome} <span className="text-muted-foreground">({c.partido})</span></span>} selecionado={cargo.candidatos.find((c) => c.id === candidatoId) ?? null} onLimpar={() => onEscolher("")} rotuloLimpar="Trocar candidato" onEscolher={(c) => onEscolher(c.id)} />
      </div>
    </div>
  );
}

function CandidateCard({ candidato, cargo, cor, posicao, destaqueLabel, destaqueValor }: { candidato: Candidato; cargo: Cargo; cor: string; posicao: number; destaqueLabel: string; destaqueValor: string }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-sm" style={{ borderTopColor: cor, borderTopWidth: 4 }}>
      <div className="p-4">
        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{cargo.nome} · {candidato.partido}</p>
        <Link to="/candidato/$id" params={{ id: candidato.id }} className="font-display block break-words text-xl font-bold leading-tight hover:underline">{candidato.nome}</Link>
        <p className="mt-1 text-xs text-muted-foreground">{candidato.sit || candidato.situacao || "Situação não informada"}</p>
      </div>
      <dl className="grid grid-cols-2 border-t border-border">
        <Metric label="Votos" value={nf(candidato.votos)} />
        <Metric label="% dos válidos" value={pf(candidato.pct)} bordered />
        <Metric label="Posição" value={`${posicao}º`} />
        <Metric label={destaqueLabel} value={destaqueValor} bordered />
      </dl>
    </article>
  );
}

function Metric({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return <div className={`min-w-0 p-3 ${bordered ? "border-l border-border" : ""}`}><dt className="text-[0.68rem] font-semibold uppercase text-muted-foreground">{label}</dt><dd className="font-mono mt-1 break-words text-sm font-semibold sm:text-base">{value}</dd></div>;
}

function ComparativeCallout({ label, candidato, value }: { label: string; candidato?: CandidatoComCargo; value: (item: CandidatoComCargo) => string }) {
  if (!candidato) return null;
  return <div className="bg-card p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p className="font-display mt-1 text-lg font-bold">{candidato.candidato.nome}</p><p className="font-mono text-sm">{value(candidato)} · {candidato.cargo.nome}</p></div>;
}

function RankingPanel({ title, grupos, onCsv, onPdf, pdfBusy }: { title: string; grupos: { nome: string; cor: string; itens: { nome: string; valor: string }[] }[]; onCsv: () => void; onPdf: () => void; pdfBusy: boolean }) {
  return (
    <Card title={title} action={<div className="flex flex-wrap gap-2"><Btn onClick={onCsv}>CSV</Btn><Btn onClick={onPdf} disabled={pdfBusy}>{pdfBusy ? "Gerando…" : "Baixar PDF"}</Btn></div>}>
      <div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {grupos.map((grupo) => (
          <div key={grupo.nome} className="min-w-0">
            <p className="mb-2 border-l-2 pl-2 text-xs font-semibold uppercase" style={{ borderColor: grupo.cor, color: grupo.cor }}>{grupo.nome}</p>
            <ol>{grupo.itens.map((item) => <li key={item.nome} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border py-1"><span className="truncate">{item.nome}</span><span className="font-mono">{item.valor}</span></li>)}</ol>
            {!grupo.itens.length && <p className="text-xs text-muted-foreground">Sem destaque municipal.</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}